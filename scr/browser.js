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


let proxyChecker = async function (type, proxy, auth){
  let host = proxy.split(':')[0];
  let port = proxy.split(':')[1]
  let username = auth.split(':')[0];
  let password = auth.split(':')[1];
  let check;
  if (type == 'https'){
    try {
      check = await axios.get('http://ip.bablosoft.com/', {
      proxy: {
        protocol: 'http',
        host: host,
        port: port,
        auth: {
          username,
          password,
        },
      },
    });
    } catch (err){
      check = false;
    }
   };
  if (type == 'socks5'){
    const proxyAgent  = new SocksProxyAgent(`socks5://${username}:${password}@${host}:${port}`);
    const axiosInstance = axios.create({
      httpsAgent: proxyAgent, 
      httpAgent: proxyAgent 
    });
    try {
      check = await axiosInstance.get('http://ip.bablosoft.com/');
    check = check.status;
    } catch (err){
      check = false;
    }
  };
  if (check)
    return true;
  else 
    return false;
};

/**
 * Launch Camoufox browser via Python bridge
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
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Try to parse connection info
      try {
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            const result = JSON.parse(line);
            if (result.success && result.wsEndpoint) {
              resolve({
                wsEndpoint: result.wsEndpoint,
                process: pythonProcess
              });
              return;
            }
          }
        }
      } catch (e) {
        // Continue accumulating output
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python bridge failed: ${stderr || stdout}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Camoufox launch timeout'));
    }, 30000);
  });
}

let launch = async function (name, profile){
  let browser;
  let pythonProcess;
  await lock.acquire('key', async () => {
    let dir;
    let storageType = await state.storageType;
    switch(storageType){
      case 'Cloud':
        dir = config.cloudDir + `profiles/${name}`;
        break;
      case 'Local':
        dir = config.storageDir + `profiles/${name}`;
        break;
    };
    if (!fs.existsSync(dir))
      fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(dir + '/fp.json')){
      let fp = await fingerprint();
      let data = JSON.parse(fp);
      fs.writeFileSync(dir +'/fp.json', JSON.stringify(data));
    };

    // Build launch configuration
    let launchConfig = {
      profileDir: dir,
      fingerprint: {}
    };
    
    // Load fingerprint configuration
    if (await profile.get('fingerprint') > false){
      let fpConfig = JSON.parse(fs.readFileSync(dir + '/fp.json'));
      launchConfig.fingerprint = fpConfig;
    }

    // Configure proxy
    let proxyType = await profile.get('proxyType');
    if (!proxyType == false){
      let proxy = await profile.get('proxy');
      let login = proxy.split(':', -2);
      proxy = proxy.split(':', 2);
      login = login[2] + ':' + login[3];
      let check = await proxyChecker(proxyType, proxy.join(":"), login);
      if (check == false){
        console.log(timeLog() + ' Bad proxy at ' + name);
        browser =  false;
        return false;
      }

      let [username, password] = login.split(':');
      launchConfig.proxy = {
        server: `${proxyType}://${proxy.join(":")}`,
        username: username,
        password: password
      };
    }

    // Launch Camoufox via Python bridge
    try {
      console.log(timeLog() + ` Launching Camoufox for profile ${name}...`);
      const result = await launchCamoufox(launchConfig);
      pythonProcess = result.process;
      
      // Connect to browser via Playwright
      browser = await chromium.connectOverCDP(result.wsEndpoint);
      
      console.log(timeLog() + ` Camoufox connected for profile ${name}`);
    } catch (error) {
      console.log(timeLog() + ' Error launching Camoufox: ' + error.message);
      browser = false;
      return false;
    }

    browser.name = name;
    browser._pythonProcess = pythonProcess;
    
    browser.on('disconnected', async () => {
      console.log(timeLog() + `Profile ${name} closed`);
      
      // Kill Python process
      if (pythonProcess && !pythonProcess.killed) {
        pythonProcess.kill();
      }
      
      delete manage.active[name];
      switch(storageType){
        case 'Cloud':
          setTimeout(db.close_Profile, 5000, name);
          break;
        case 'Local':
          setTimeout(db.close_Profile, 3000, name);
          break;
      };
    });  
  });
  
  if (browser == false)
    return false;
  
  const contexts = browser.contexts();
  const page = await contexts[0].newPage();
  
  try{
    if (name.includes('Grass')){
      try {
        await page.goto('https://app.getgrass.io/dashboard');
      }
      catch (err){
        console.log(timeLog() + ' Bad proxy at ' + name);
        await browser.close();
        return false;
      }
    }
    else {
      await page.goto('https://abrahamjuliot.github.io/creepjs/');
    }
  }
  catch(err){
    await page.goto('https://google.com/');
  }
  
  const pages = await contexts[0].pages();
  for (let i = 0; i < pages.length; i++){
    let url = pages[i].url();
    if (url === 'about:blank')
      await pages[i].close();
  }
  
  return page;
};

export { launch };





  



