import { spawn } from 'child_process';
import { timeLog } from '../utils.js';
import * as db from './db.js';
import get_Fingerprint from './fingerprint.js';
import { fileURLToPath } from 'url';
import path from 'path';


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


// Launch profile using Python bridge
async function launch_Profile(name) {
    console.log(timeLog() + `Launching Camoufox for profile ${name}...`);

    const bridge = await ensureBridge();
    const profile = await db.get_Profile(name);

    // Отримуємо fingerprint з профілю
    const fingerprint = profile.get('fingerprint');
    const proxy = profile.get('proxy');
    const proxyType = profile.get('proxyType');

    console.log(timeLog() + ` Profile ${name} fingerprint:`, fingerprint ? 'custom' : 'auto-generate');

    const command = {
        action: 'launch',
        profile: name,
        config: {
            fingerprint: fingerprint || false,
            proxy: proxy || null,
            proxyType: proxyType || null
        }
    };

    // Send command to bridge
    bridge.stdin.write(JSON.stringify(command) + '\n');

    // Wait for response
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Launch timeout'));
        }, 10000);

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
    try {
        const fpString = await get_Fingerprint();
        fingerprintData = JSON.parse(fpString);
        console.log(timeLog() + ` Generated fingerprint for ${name}`);
    } catch (error) {
        console.log(timeLog() + ` Error generating fingerprint: ${error.message}`);
        fingerprintData = null;
    }

    // Створення даних профілю
    const profileData = {
        name: name,
        fingerprint: fingerprintData,
        proxy: options.proxy || false,
        proxyType: options.proxyType || 'http',
        open: false,
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
        await db.open_Profile(name);
        active[name] = true; // <--- Додаємо профіль у active
        console.log(timeLog() + ` Profile ${name} opened successfully`);
    } catch (error) {
        console.error(timeLog() + ` Error opening ${name}:`, error.message);
        // Все одно позначаємо як відкритий - браузер МОЖЕ откритися потім
        await db.open_Profile(name);
        active[name] = true; // <--- Додаємо профіль у active навіть при помилці
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

    const [host, port, username, password, type] = proxy.split(':');
    await profile.assign({
        proxy: `${host}:${port}:${username}:${password}`,
        proxyType: type || 'http'
    });
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

export { create_Profile, open_Profile, close_Profile, active };
