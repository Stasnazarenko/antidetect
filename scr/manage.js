import { spawn } from 'child_process';
import { timeLog } from '../utils.js';
import * as db from './db.js';
import get_Fingerprint from './fingerprint.js';
import { fileURLToPath } from 'url';
import path from 'path';


let pythonBridge = null;

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

    const command = {
        action: 'launch',
        profile: name,
        config: {
            fingerprint: profile.get('fingerprint') || false,
            proxy: profile.get('proxy') || null,
            proxyType: profile.get('proxyType') || null
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

    // Генерація fingerprint якщо потрібно
    let fingerprintData = null;
    if (options.fingerprint) {
        fingerprintData = JSON.parse(await get_Fingerprint());
        console.log(timeLog() + ` Generated fingerprint for ${name}`);
    }

    // Створення даних профілю
    const profileData = {
        name: name,
        fingerprint: fingerprintData,
        proxy: options.proxy || null,
        proxyType: options.proxyType || null,
        open: ' ',
        select: ' '
    };

    // Збереження профілю
    await db.update_Profile(name, profileData);

    console.log(timeLog() + ` Profile ${name} created successfully`);
    return true;
}


let open_Profile = async function (name) {
    let check = await db.check_Profile(name);
    if (!check)
        return console.log(timeLog() + ` Profile ${name} does not exist`);

    let profile = await db.get_Profile(name);
    let isOpen = await profile.get('open');

    if (isOpen === 1 || isOpen === true) {
        return console.log(timeLog() + ` Profile ${name} already open`);
    }

    console.log(timeLog() + ` Opening profile ${name}...`);

    try {
        await launch_Profile(name);
        await db.open_Profile(name);
        console.log(timeLog() + ` Profile ${name} opened successfully`);
    } catch (error) {
        console.error(timeLog() + ' Error:', error.message);
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
                        console.log(timeLog() + ` Profile ${name} closed successfully`);
                        resolve(response);
                    });
                } else {
                    // Якщо профіль не відкритий - все одно оновлюємо БД
                    if (response.error === 'Profile not open') {
                        db.close_Profile(name).then(() => {
                            console.log(timeLog() + ` Profile ${name} status reset to closed`);
                            resolve(response);
                        });
                    } else {
                        reject(new Error(response.error || 'Close failed'));
                    }
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

// Cleanup on exit
process.on('exit', () => {
    if (pythonBridge) {
        pythonBridge.stdin.write(JSON.stringify({ action: 'shutdown' }) + '\n');
        pythonBridge.kill();
    }
});

export {
    open_Profile,
    launch_Profile,
    create_Profile,
    close_Profile,
    cleanup_DeadBrowsers
};
