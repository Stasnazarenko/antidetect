// javascript
import * as config from '../config.js';
import { timeLog, state } from '../utils.js';
import * as db from './db.js';
import fs from 'fs';
import * as manage from './manage.js';
import fingerprint from './fingerprint.js';
import AsyncLock from 'async-lock';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import path from 'path';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const lock = new AsyncLock();

/**
 * Safely parse a proxy string into components.
 * Supported forms:
 *  - username:password@host:port
 *  - host:port
 *  - socks5://username:password@host:port
 *  - http://host:port
 */
function parseProxy(proxy) {
  const s = (proxy ?? '').toString().trim();
  if (!s) return { protocol: '', host: '', port: '', username: '', password: '', hasAuth: false };

  let proto = '';
  let rest = s;

  const protoMatch = rest.match(/^([a-z0-9.+-]+):\/\/(.*)$/i);
  if (protoMatch) {
    proto = protoMatch[1].toLowerCase();
    rest = protoMatch[2];
  }

  let username = '';
  let password = '';
  let host = '';
  let port = '';

  const atIndex = rest.indexOf('@');
  if (atIndex !== -1) {
    const auth = rest.slice(0, atIndex);
    rest = rest.slice(atIndex + 1);
    const authParts = auth.split(':');
    username = (authParts[0] ?? '').trim();
    password = (authParts[1] ?? '').trim();
  }

  const hostParts = rest.split(':');
  host = (hostParts[0] ?? '').trim();
  port = (hostParts[1] ?? '').trim();

  return {
    protocol: proto,
    host,
    port,
    username,
    password,
    hasAuth: Boolean(username || password)
  };
}

/**
 * Check proxy reachability and auth by making a simple request.
 * type: 'http' | 'https' | 'socks5' | 'socks'
 * proxyObj: { host, port, username, password }
 * Returns boolean
 */
async function proxyChecker(type, proxyObj) {
  if (!proxyObj || !proxyObj.host || !proxyObj.port) return false;

  try {
    if (type === 'http' || type === 'https') {
      const axiosConfig = {
        proxy: {
          protocol: type === 'https' ? 'https' : 'http',
          host: proxyObj.host,
          port: Number(proxyObj.port)
        },
        timeout: 8000
      };
      if (proxyObj.username) {
        axiosConfig.proxy.auth = {
          username: proxyObj.username,
          password: proxyObj.password ?? ''
        };
      }
      const res = await axios.get('http://ip.bablosoft.com/', axiosConfig);
      return Boolean(res && (res.status === 200 || res.status === 201));
    }

    if (type === 'socks5' || type === 'socks') {
      const authSegment = proxyObj.username ? `${encodeURIComponent(proxyObj.username)}:${encodeURIComponent(proxyObj.password ?? '')}@` : '';
      const agent = new SocksProxyAgent(`socks5://${authSegment}${proxyObj.host}:${proxyObj.port}`);
      const axiosInstance = axios.create({
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 8000
      });
      const res = await axiosInstance.get('http://ip.bablosoft.com/');
      return Boolean(res && (res.status === 200 || res.status === 201));
    }
  } catch (e) {
    // ignore and treat as failure
  }

  return false;
}

/**
 * Launch Camoufox via the Python bridge script and resolve with { wsEndpoint, process }.
 */
async function launchCamoufox(launchConfig) {
  return new Promise((resolve, reject) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pythonScript = path.join(__dirname, 'camoufox_bridge.py');
    const configJson = JSON.stringify(launchConfig);

    const pythonProcess = spawn('python3', [pythonScript, configJson], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      // try parse lines for JSON object with wsEndpoint
      try {
        const lines = stdout.split('\n');
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          if (t.startsWith('{')) {
            const parsed = JSON.parse(t);
            if (parsed && parsed.success && parsed.wsEndpoint) {
              resolved = true;
              return resolve({ wsEndpoint: parsed.wsEndpoint, process: pythonProcess });
            }
          }
        }
      } catch (e) {
        // keep accumulating
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (!resolved) {
        const msg = stderr || stdout || `Python bridge exited with code ${code}`;
        return reject(new Error(msg));
      }
    });

    // safety timeout
    setTimeout(() => {
      if (!resolved) {
        try { pythonProcess.kill(); } catch (e) { /* ignore */ }
        return reject(new Error('Camoufox launch timeout'));
      }
    }, 30000);
  });
}

/**
 * Launch a profile (main entry). Returns Playwright Page or false on failure.
 */
let launch = async function (name, profile) {
  let browser = null;
  let pythonProcess = null;

  await lock.acquire('key', async () => {
    let dir;
    const storageType = await state.storageType;
    switch (storageType) {
      case 'Cloud':
        dir = config.cloudDir + `profiles/${name}`;
        break;
      case 'Local':
      default:
        dir = config.storageDir + `profiles/${name}`;
        break;
    }

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(path.join(dir, 'fp.json'))) {
      const fpRaw = await fingerprint();
      try {
        const data = JSON.parse(fpRaw);
        fs.writeFileSync(path.join(dir, 'fp.json'), JSON.stringify(data));
      } catch (e) {
        // if fingerprint generation failed, continue with empty fp
        fs.writeFileSync(path.join(dir, 'fp.json'), JSON.stringify({}));
      }
    }

    const launchConfig = {
      profileDir: dir,
      fingerprint: {}
    };

    try {
      const fpEnabled = await profile.get('fingerprint');
      if (fpEnabled) {
        const fpConfig = JSON.parse(fs.readFileSync(path.join(dir, 'fp.json'), 'utf8'));
        launchConfig.fingerprint = fpConfig;
      }
    } catch (e) {
      // ignore fingerprint load errors
    }

    // Proxy handling - only enable when proxyType is truthy and not string "false"
    let proxyType = await profile.get('proxyType');
    if (proxyType && proxyType !== 'false') {
      const proxyString = (await profile.get('proxy')) ?? '';
      console.log(timeLog() + ` Proxy raw for ${name}: ${proxyString}`);

      const parsed = parseProxy(proxyString);
      console.log(timeLog() + ` Parsed proxy for ${name}: ${JSON.stringify(parsed)}`);

      if (!parsed.host || !parsed.port) {
        console.log(timeLog() + ' Bad proxy at ' + name + ' (missing host/port)');
        browser = false;
        return false;
      }

      const ok = await proxyChecker(proxyType, parsed);
      if (!ok) {
        console.log(timeLog() + ' Bad proxy at ' + name + ' (checker failed)');
        browser = false;
        return false;
      }

      launchConfig.proxy = {
        server: `${proxyType}://${parsed.host}:${parsed.port}`,
        username: parsed.username,
        password: parsed.password
      };
    }

    // Launch Camoufox and connect browser via Playwright CDP
    try {
      console.log(timeLog() + ` Launching Camoufox for profile ${name}...`);
      const result = await launchCamoufox(launchConfig);
      pythonProcess = result.process;
      browser = await chromium.connectOverCDP(result.wsEndpoint);
      console.log(timeLog() + ` Camoufox connected for profile ${name}`);
    } catch (err) {
      console.log(timeLog() + ' Error launching Camoufox: ' + (err?.message ?? err));
      browser = false;
      return false;
    }

    // attach metadata and cleanup handler
    browser.name = name;
    browser._pythonProcess = pythonProcess;

    browser.on('disconnected', async () => {
      console.log(timeLog() + `Profile ${name} closed`);
      if (pythonProcess && !pythonProcess.killed) {
        try { pythonProcess.kill(); } catch (e) { /* ignore */ }
      }
      delete manage.active[name];
      switch (storageType) {
        case 'Cloud':
          setTimeout(db.close_Profile, 5000, name);
          break;
        case 'Local':
        default:
          setTimeout(db.close_Profile, 3000, name);
          break;
      }
    });
  });

  if (browser === false || !browser) return false;

  const contexts = browser.contexts();
  const context = contexts && contexts[0];
  if (!context) {
    try { await browser.close(); } catch (e) { /* ignore */ }
    return false;
  }

  const page = await context.newPage();

  try {
    if (name.includes('Grass')) {
      try {
        await page.goto('https://app.getgrass.io/dashboard', { timeout: 15000 });
      } catch (err) {
        console.log(timeLog() + ' Bad proxy at ' + name);
        try { await browser.close(); } catch (e) { /* ignore */ }
        return false;
      }
    } else {
      await page.goto('https://abrahamjuliot.github.io/creepjs/', { timeout: 15000 });
    }
  } catch (err) {
    try {
      await page.goto('https://google.com/', { timeout: 10000 });
    } catch (e) {
      // ignore
    }
  }

  // close default about:blank pages
  const pages = await context.pages();
  for (let i = 0; i < pages.length; i++) {
    const url = pages[i].url();
    if (url === 'about:blank') {
      try { await pages[i].close(); } catch (e) { /* ignore */ }
    }
  }

  return page;
};

export { launch };
