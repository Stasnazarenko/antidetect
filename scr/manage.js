import { spawn } from 'child_process';
import { timeLog } from '../utils.js';
import * as db from './db.js';
import get_Fingerprint from './fingerprint.js';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';


let pythonBridge = null;
let active = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureBridge() {
    if (pythonBridge && !pythonBridge.killed) {
        return pythonBridge;
    }

    console.log(timeLog() + ' Starting Camoufox bridge...');

    const projectRoot = path.resolve(__dirname, '..');
    const bridgePath = path.join(projectRoot, 'scr', 'camoufox_bridge.py');

    // Використовуємо системний python3
    pythonBridge = spawn('python3', [bridgePath], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for bridge to be ready
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Bridge startup timeout'));
        }, 10000);

        pythonBridge.stdout.once('data', (data) => {
            clearTimeout(timeout);
            console.log(timeLog() + ' Bridge ready:', data.toString().trim());
            resolve();
        });

        pythonBridge.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to start Python bridge: ${err.message}`));
        });
    });

    pythonBridge.stderr.on('data', (data) => {
        console.error(timeLog() + ' Bridge error:', data.toString());
    });

    pythonBridge.on('close', (code) => {
        console.log(timeLog() + ` Bridge exited (${code})`);
        pythonBridge = null;
    });

    return pythonBridge;
}


// Тестує проксі локально перед запуском браузера
async function testProxyLocal(proxyObj) {
    if (!proxyObj) return true;
    try {
        let proxyUrl = null;
        if (typeof proxyObj === 'string') {
            let s = proxyObj.trim();
            if (!/^[a-z]+:\/\//i.test(s)) {
                s = 'http://' + s;
            }
            proxyUrl = s;
        } else if (typeof proxyObj === 'object') {
            // proxyObj: { server: 'host:port' or with scheme, username?, password?, type }
            let server = (proxyObj.server || '') + '';
            let type = (proxyObj.type || 'http') + '';
            const user = proxyObj.username || proxyObj.user || '';
            const pass = proxyObj.password || proxyObj.pass || '';

            // remove scheme if present
            server = server.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');

            if (!server) return false;

            if (type.startsWith('socks')) {
                proxyUrl = user && pass ? `socks5://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${server}` : `socks5://${server}`;
            } else {
                proxyUrl = user && pass ? `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${server}` : `http://${server}`;
            }
        } else {
            return false;
        }

        let agent;
        if (/^socks/i.test(proxyUrl)) {
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            agent = new HttpsProxyAgent(proxyUrl);
        }

        const resp = await axios.get('https://api.ipify.org?format=json', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 12000
        });
        return resp && resp.data && resp.data.ip;
    } catch (err) {
        // докладний стек для дебагу
        const msg = err && err.message ? err.message : String(err);
        const stack = err && err.stack ? '\n' + err.stack : '';
        throw new Error('Proxy test failed: ' + msg + stack);
    }
}

// Normalize fingerprint object into flat Camoufox launch config
function normalizeFingerprintForCamoufox(fp) {
    if (!fp || typeof fp !== 'object') return {};

    const cfg = {};

    // Screen -> window sizes
    try {
        if (fp.screen) {
            // screen can be object with preferred array or min/max
            if (Array.isArray(fp.screen.preferred) && fp.screen.preferred.length > 0) {
                const pref = fp.screen.preferred[0];
                if (Array.isArray(pref) && pref.length >= 2) {
                    cfg['window.innerWidth'] = pref[0];
                    cfg['window.innerHeight'] = pref[1];
                    cfg['window.outerWidth'] = Math.round(pref[0] * 1.02);
                    cfg['window.outerHeight'] = Math.round(pref[1] * 1.02);
                } else if (typeof pref === 'string' && pref.includes(',')) {
                    const parts = pref.split(',').map(x=>parseInt(x,10));
                    if (parts.length>=2 && parts[0] && parts[1]) {
                        cfg['window.innerWidth'] = parts[0];
                        cfg['window.innerHeight'] = parts[1];
                        cfg['window.outerWidth'] = Math.round(parts[0] * 1.02);
                        cfg['window.outerHeight'] = Math.round(parts[1] * 1.02);
                    }
                } else if (typeof pref === 'object' && pref[0] && pref[1]) {
                    cfg['window.innerWidth'] = pref[0];
                    cfg['window.innerHeight'] = pref[1];
                    cfg['window.outerWidth'] = Math.round(pref[0] * 1.02);
                    cfg['window.outerHeight'] = Math.round(pref[1] * 1.02);
                }
            } else if (fp.screen.minWidth && fp.screen.minHeight) {
                cfg['window.innerWidth'] = fp.screen.minWidth;
                cfg['window.innerHeight'] = fp.screen.minHeight;
                cfg['window.outerWidth'] = fp.screen.maxWidth || Math.round(fp.screen.minWidth * 1.02);
                cfg['window.outerHeight'] = fp.screen.maxHeight || Math.round(fp.screen.minHeight * 1.02);
            }
        }
    } catch (e) {
        // ignore
    }

    // history length
    if (fp['window'] && typeof fp.window === 'object') {
        if (fp.window.history && typeof fp.window.history.length === 'number') cfg['window.history.length'] = fp.window.history.length;
    }
    if (fp['window.history.length']) cfg['window.history.length'] = fp['window.history.length'];

    // Navigator fields
    try {
        if (fp.navigator) {
            if (fp.navigator.userAgent) cfg['navigator.userAgent'] = fp.navigator.userAgent;
            if (fp.navigator.appCodeName) cfg['navigator.appCodeName'] = fp.navigator.appCodeName;
            if (fp.navigator.appName) cfg['navigator.appName'] = fp.navigator.appName;
            if (fp.navigator.appVersion) cfg['navigator.appVersion'] = fp.navigator.appVersion;
            if (fp.navigator.oscpu) cfg['navigator.oscpu'] = fp.navigator.oscpu;
            if (fp.navigator.language) cfg['navigator.language'] = fp.navigator.language;
            if (fp.navigator.languages) cfg['navigator.languages'] = fp.navigator.languages;
            if (fp.navigator.platform) cfg['navigator.platform'] = fp.navigator.platform;
            if (fp.navigator.hardwareConcurrency && typeof fp.navigator.hardwareConcurrency === 'number') cfg['navigator.hardwareConcurrency'] = fp.navigator.hardwareConcurrency;
            if (fp.navigator.maxTouchPoints !== undefined) cfg['navigator.maxTouchPoints'] = fp.navigator.maxTouchPoints;
            if (fp.navigator.product) cfg['navigator.product'] = fp.navigator.product;
            if (fp.navigator.productSub) cfg['navigator.productSub'] = fp.navigator.productSub;
        } else {
            if (fp['navigator.userAgent']) cfg['navigator.userAgent'] = fp['navigator.userAgent'];
            if (fp['navigator.language']) cfg['navigator.language'] = fp['navigator.language'];
            if (fp['navigator.platform']) cfg['navigator.platform'] = fp['navigator.platform'];
            if (fp['navigator.hardwareConcurrency'] && typeof fp['navigator.hardwareConcurrency'] === 'number') cfg['navigator.hardwareConcurrency'] = fp['navigator.hardwareConcurrency'];
        }
    } catch (e) {}

    // top-level shortcuts
    if (!cfg['navigator.userAgent'] && fp['userAgent']) cfg['navigator.userAgent'] = fp['userAgent'];

    // headless/humanize flags
    if (fp.headless) cfg['headless'] = fp.headless;
    if (fp.block_images !== undefined) cfg['block_images'] = fp.block_images;
    if (fp.block_media !== undefined) cfg['block_media'] = fp.block_media;

    // os -> pass through as top-level os if present
    if (fp.os) cfg['os'] = fp.os;

    // Convert hardwareConcurrency object to a number if provided
    try {
        const hc = fp.hardwareConcurrency || (fp.navigator && fp.navigator.hardwareConcurrency);
        if (hc && typeof hc === 'object') {
            // prefer 'min', fall back to avg of min/max
            if (hc.min && typeof hc.min === 'number') cfg['navigator.hardwareConcurrency'] = hc.min;
            else if (hc.min && typeof hc.min === 'string' && !isNaN(parseInt(hc.min,10))) cfg['navigator.hardwareConcurrency'] = parseInt(hc.min,10);
            else if (hc.max && typeof hc.max === 'number') cfg['navigator.hardwareConcurrency'] = Math.min(8, hc.max);
        }
    } catch (e) {}

    // Ensure we do NOT pass nested/unsupported fields which Camoufox will reject
    // Remove any obvious problematic props
    delete cfg['osVersion'];
    delete cfg['screen'];
    delete cfg['hardwareConcurrency'];

    // Finally, return only whitelisted keys for safety (small whitelist)
    const allowed = [
        'window.innerWidth','window.innerHeight','window.outerWidth','window.outerHeight','window.history.length',
        'navigator.userAgent','navigator.appCodeName','navigator.appName','navigator.appVersion','navigator.oscpu',
        'navigator.language','navigator.languages','navigator.platform','navigator.hardwareConcurrency','navigator.maxTouchPoints',
        'navigator.product','navigator.productSub','headless','block_images','block_media','os'
    ];

    const out = {};
    for (const k of Object.keys(cfg)) {
        if (allowed.includes(k)) out[k] = cfg[k];
    }

    return out;
}

// Launch profile using Python bridge
async function launch_Profile(name) {
    console.log(timeLog() + `Launching Camoufox for profile ${name}...`);

    const bridge = await ensureBridge();
    const profile = await db.get_Profile(name);

    // Отримуємо fingerprintData з профілю (а не просто true/false)
    let fingerprint = profile.get('fingerprintData');
    if (!fingerprint) {
        fingerprint = false;
    } else if (typeof fingerprint === 'string') {
        try {
            fingerprint = JSON.parse(fingerprint);
        } catch {
            fingerprint = false;
        }
    } else if (typeof fingerprint !== 'object') {
        fingerprint = false;
    }
    const proxy = profile.get('proxy');
    const proxyType = profile.get('proxyType');

    console.log(timeLog() + ` Profile ${name} fingerprint:`, fingerprint ? 'custom' : 'auto-generate');

    const command = {
        action: 'launch',
        profile: name,
        config: {
            fingerprint: fingerprint
        }
    };

    // Додаємо проксі у конфіг лише якщо воно задане
    if (proxy && typeof proxy === 'object' && proxy.server) {
        command.config.proxy = proxy;
        command.config.proxyType = proxyType || proxy.type || null;
    }

                // before sending command to bridge: тестуємо проксі локально
                if (command.config && command.config.proxy) {
                    try {
                        await testProxyLocal(command.config.proxy);
                        console.log(timeLog() + ` Proxy for ${name} passed local test`);
                    } catch (err) {
                        console.error(timeLog() + ` Proxy test failed for ${name}: ${err.message}`);
                        throw err;
                    }
                }

    // Normalize fingerprint for Camoufox
    command.config.fingerprint = normalizeFingerprintForCamoufox(command.config.fingerprint);

    // Send command to bridge
    bridge.stdin.write(JSON.stringify(command) + '\n');

    // Wait for response
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Launch timeout'));
        }, 30000); // increased from 10000 to 30000

        bridge.stdout.once('data', (data) => {
            clearTimeout(timeout);
            try {
                const response = JSON.parse(data.toString());
                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.error || 'Launch failed'));
                }
            } catch (e) {
                reject(new Error('Invalid response: ' + data.toString()));
            }
        });
    });
}

async function create_Profile(name, options = {}) {
    console.log(timeLog() + ` Creating profile ${name}...`);

    // Перевірка чи профіль вже існує
    const exists = await db.check_Profile(name);
    if (exists) {
        console.log(timeLog() + ` Profile ${name} already exists`);
        return false;
    }

    // Завжди генеруємо fingerprint для нових профілів
    let fingerprintData = null;
    let fingerprintBool = false;
    try {
        const fpString = await get_Fingerprint();
        fingerprintData = JSON.parse(fpString);
        fingerprintBool = true;
        console.log(timeLog() + ` Generated fingerprint for ${name}`);
    } catch (error) {
        console.log(timeLog() + ` Error generating fingerprint: ${error.message}`);
        fingerprintData = null;
        fingerprintBool = false;
    }

    // Створення даних профілю
    const profileData = {
        name: name,
        fingerprint: fingerprintBool, // тільки true/false для логіки
        fingerprintData: fingerprintData, // окремо зберігаємо сам fingerprint
        proxy: options.proxy || false,
        proxyType: options.proxyType || 'http',
        open: false, // завжди boolean
        select: ' '
    };

    // Збереження профілю
    await db.update_Profile(name, profileData);

    console.log(timeLog() + ` Profile ${name} created successfully`);
    return name;
}


let open_Profile = async function (name) {
    let check = await db.check_Profile(name);
    if (!check)
        return console.log(timeLog() + ` Profile ${name} does not exist`);

    let profile = await db.get_Profile(name);
    let isOpen = profile.get('open');

    if (isOpen === true || isOpen === 1) {
        return console.log(timeLog() + ` Profile ${name} already open`);
    }

    console.log(timeLog() + ` Opening profile ${name}...`);

    try {
        await launch_Profile(name);
        // Лише якщо launch_Profile пройшов успішно — міняємо статус у БД та в active
        await db.open_Profile(name);
        active[name] = true; // <--- Додаємо профіль у active
        console.log(timeLog() + ` Profile ${name} opened successfully`);
        return true;
    } catch (error) {
        // Логуємо помилку і НЕ позначаємо профіль як відкритий
        console.error(timeLog() + ` Error opening ${name}:`, error && error.message ? error.message : error);
        // Пробрасываем ошибку дальше, чтобы сервер/клієнт отримали 500 і не показували opened
        throw error;
    }
};

async function close_Profile(name) {
    console.log(timeLog() + ` Closing profile ${name}...`);

    const bridge = await ensureBridge();

    const command = {
        action: 'close',
        profile: name
    };

    bridge.stdin.write(JSON.stringify(command) + '\n');

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Close timeout'));
        }, 5000);

        bridge.stdout.once('data', (data) => {
            clearTimeout(timeout);
            try {
                const response = JSON.parse(data.toString());
                if (response.success) {
                    db.close_Profile(name).then(() => {
                        delete active[name]; // <--- Видаляємо профіль з active
                        console.log(timeLog() + ` Profile ${name} closed successfully`);
                        resolve(response);
                    });
                } else {
                    // Якщо профіль не відкритий - все одно оновлюємо БД
                    db.close_Profile(name).then(() => {
                        delete active[name]; // <--- Видаляємо профіль з active
                        resolve(response);
                    });
                }
            } catch (e) {
                reject(new Error('Invalid response: ' + data.toString()));
            }
        });
    });
}

async function cleanup_DeadBrowsers() {
    console.log(timeLog() + ' Cleaning up dead browsers...');

    const bridge = await ensureBridge();

    const command = {
        action: 'cleanup'
    };

    bridge.stdin.write(JSON.stringify(command) + '\n');

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Cleanup timeout'));
        }, 5000);

        bridge.stdout.once('data', (data) => {
            clearTimeout(timeout);
            try {
                const response = JSON.parse(data.toString());
                if (response.success) {
                    console.log(timeLog() + ` Cleaned ${response.cleaned} dead browsers`);
                    resolve(response);
                } else {
                    reject(new Error(response.error || 'Cleanup failed'));
                }
            } catch (e) {
                reject(new Error('Invalid response: ' + data.toString()));
            }
        });
    });
}

// Скидання статусу всіх профілів на "закрито"
async function resetAllProfilesStatus() {
    const profiles = await db.get_Profiles();
    for (const profile of profiles) {
        if (profile && profile.get) {
            await profile.assign({ open: false });
            await profile.save();
        }
    }
    console.log(timeLog() + ' All profiles status set to closed');
}

// Викликати resetAllProfilesStatus на старті
resetAllProfilesStatus().catch(e => {
    console.error(timeLog() + ' Error resetting all profiles status:', e);
});

// Cleanup on exit
process.on('exit', () => {
    if (pythonBridge) {
        pythonBridge.stdin.write(JSON.stringify({ action: 'shutdown' }) + '\n');
        pythonBridge.kill();
    }
});

// Wrapper functions for API
async function set_ProfileProxy(name, proxy) {
    const profile = await db.get_Profile(name);
    if (!profile) throw new Error('Profile not found');
    if (!proxy) throw new Error('Proxy string is empty');

    // Normalize input to string if it's object
    let proxyStr = proxy;
    if (typeof proxy === 'object') {
        // If already normalized object, ensure server has no scheme
        const obj = { ...proxy };
        // If object has host/port fields but no server, build server
        if (!obj.server && obj.host && obj.port) {
            obj.server = `${obj.host}:${obj.port}`;
        }
        if (obj.server && typeof obj.server === 'string') {
            obj.server = obj.server.replace(/^(https?:\/\/|socks5?:\/\/)*/i, '');
        }
        await profile.assign({ proxy: obj, proxyType: obj.type || 'http' });
        await profile.save();
        return;
    }

    proxyStr = String(proxy).trim();

    // Remove repeated schemes like http://http://
    proxyStr = proxyStr.replace(/^(https?:\/\/|socks5?:\/\/)*/i, '');

    // Try parse JSON first
    try {
        const parsed = JSON.parse(proxyStr);
        if (parsed && (parsed.server || parsed.host)) {
            let obj = { ...parsed };
            if (obj.server && typeof obj.server === 'string') {
                obj.server = obj.server.replace(/^(https?:\/\/|socks5?:\/\/)*/i, '');
            }
            await profile.assign({ proxy: obj, proxyType: obj.type || 'http' });
            await profile.save();
            return;
        }
    } catch (e) {
        // not JSON — continue
    }

    // If contains '@', parse user:pass@host:port or user@host:port
    if (proxyStr.includes('@')) {
        const [authPart, hostPart] = proxyStr.split('@');
        const authSplit = authPart.split(':');
        const username = authSplit[0] || '';
        const password = authSplit[1] || '';
        // hostPart may still have scheme removed; ensure no scheme
        const hostClean = hostPart.replace(/^(https?:\/\/|socks5?:\/\/)*/i, '');
        // hostClean should be host:port
        const hostParts = hostClean.split(':');
        const host = hostParts[0];
        const port = hostParts[1] || '';
        const server = port ? `${host}:${port}` : host;
        const obj = { server, type: 'http' };
        if (username) obj.username = username;
        if (password) obj.password = password;
        await profile.assign({ proxy: obj, proxyType: obj.type });
        await profile.save();
        return;
    }

    // Split by ':' and analyze
    const parts = proxyStr.split(':');
    // host:port:username:password:type  (>=4)
    if (parts.length >= 4) {
        const host = parts[0];
        const port = parts[1];
        const username = parts[2] || '';
        const password = parts[3] || '';
        const type = parts[4] || 'http';
        const server = `${host}:${port}`;
        const obj = { server, type };
        if (username) obj.username = username;
        if (password) obj.password = password;
        await profile.assign({ proxy: obj, proxyType: type });
        await profile.save();
        return;
    }

    // host:port:username  (3 parts) - treat as host:port with username only
    if (parts.length === 3) {
        const host = parts[0];
        const port = parts[1];
        const username = parts[2] || '';
        const server = `${host}:${port}`;
        const obj = { server, type: 'http' };
        if (username) obj.username = username;
        await profile.assign({ proxy: obj, proxyType: obj.type });
        await profile.save();
        return;
    }

    // host:port (2 parts)
    if (parts.length === 2) {
        const [host, port] = parts;
        const server = `${host}:${port}`;
        const obj = { server, type: 'http' };
        await profile.assign({ proxy: obj, proxyType: obj.type });
        await profile.save();
        return;
    }

    // fallback: raw string as server
    const obj = { server: proxyStr, type: 'http' };
    await profile.assign({ proxy: obj, proxyType: obj.type });
    await profile.save();
}

async function delete_Profile(name) {
    return await db.delete_Profile(name);
}

async function delete_ProfileProxy(name) {
    const profile = await db.get_Profile(name);
    if (!profile) throw new Error('Profile not found');

    await profile.assign({ proxy: false, proxyType: 'http' });
    await profile.save();
}

async function change_ProfileFP(name) {
    const profile = await db.get_Profile(name);
    if (!profile) throw new Error('Profile not found');

    await profile.assign({ fingerprint: true });
    await profile.save();
}

async function delete_ProfileFP(name) {
    const profile = await db.get_Profile(name);
    if (!profile) throw new Error('Profile not found');

    await profile.assign({ fingerprint: false });
    await profile.save();
}

async function rename_Profile(name, newName) {
    const profile = await db.get_Profile(name);
    if (!profile) throw new Error('Profile not found');

    await profile.assign({ name: newName });
    await profile.save();
    return newName;
}

// Launch an ephemeral profile (not saved in DB) with optional fingerprint and proxy
async function launch_Ephemeral(options = {}) {
    console.log(timeLog() + `Launching ephemeral profile...`);

    const bridge = await ensureBridge();

    // Build fingerprint: if provided use it, otherwise generate
    let fingerprintData = options.fingerprintData || null;
    if (!fingerprintData) {
        try {
            const fpString = await get_Fingerprint();
            fingerprintData = JSON.parse(fpString);
        } catch (e) {
            fingerprintData = false;
        }
    }

    // Normalize proxy object if provided
    let proxy = options.proxy || null;
    if (proxy && typeof proxy === 'object' && proxy.host && proxy.port) {
        proxy = { server: `${proxy.host}:${proxy.port}`, username: proxy.username || proxy.user || proxy.login, password: proxy.password || proxy.pass, type: proxy.type || 'http' };
    }

    const ephemeralName = `_ephemeral_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

    const command = {
        action: 'launch',
        profile: ephemeralName,
        config: {
            fingerprint: fingerprintData || false
        }
    };

    if (proxy) {
        command.config.proxy = proxy;
        command.config.proxyType = proxy.type || 'http';
    }

    // If proxy is set, test it locally first
    if (command.config && command.config.proxy) {
        try {
            await testProxyLocal(command.config.proxy);
            console.log(timeLog() + ` Ephemeral proxy passed local test`);
        } catch (err) {
            console.error(timeLog() + ` Ephemeral proxy test failed: ${err.message}`);
            throw err;
        }
    }

    // Normalize fingerprint for Camoufox
    command.config.fingerprint = normalizeFingerprintForCamoufox(command.config.fingerprint);

    // Send command to bridge
    bridge.stdin.write(JSON.stringify(command) + '\n');

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Ephemeral launch timeout'));
        }, 30000);

        bridge.stdout.once('data', (data) => {
            clearTimeout(timeout);
            try {
                const response = JSON.parse(data.toString());
                if (response.success) {
                    // Do NOT persist anything in DB for ephemeral
                    resolve({ success: true, name: ephemeralName, bridge: response });
                } else {
                    reject(new Error(response.error || 'Ephemeral launch failed'));
                }
            } catch (e) {
                reject(new Error('Invalid response: ' + data.toString()));
            }
        });
    });
}

export { create_Profile, open_Profile, close_Profile, active, set_ProfileProxy, launch_Ephemeral, delete_Profile, delete_ProfileProxy, change_ProfileFP, delete_ProfileFP, rename_Profile, cleanup_DeadBrowsers };
