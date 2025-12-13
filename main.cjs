const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;
let serverReady = false;

// Запускаємо Node.js сервер ТІЛЬКИ один раз при старті app
function startServer() {
    return new Promise((resolve, reject) => {
        // Якщо сервер уже запущений - не запускаємо ще раз
        if (serverProcess && !serverProcess.killed) {
            resolve();
            return;
        }

        console.log('[Main] Starting backend server...');

        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin, pipe stdout/stderr
            detached: false,
            windowsHide: true
        });

        let ready = false;

        serverProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            console.log(`[Server] ${msg}`);

            if (msg.includes('Server running') && !ready) {
                ready = true;
                serverReady = true;
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server Error] ${data.toString().trim()}`);
        });

        serverProcess.on('error', (err) => {
            console.error('[Server] Failed to start:', err);
            reject(err);
        });

        // Timeout
        setTimeout(() => {
            if (!ready) {
                serverReady = true;
                resolve(); // Continue anyway
            }
        }, 5000);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1000,
        minHeight: 700,
        show: false, // Don't show until ready
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: true
        },
        icon: process.platform === 'darwin' ? undefined : path.join(__dirname, 'assets', 'icon.png')
    });

    // Завантажуємо ЛОКАЛЬНИЙ файл (не веб-сервер!)
    mainWindow.loadFile('electron.html').catch(err => {
        console.error('[Main] Failed to load electron.html:', err);
        // Fallback на веб-версію якщо локальна не працює
        mainWindow.loadURL('http://localhost:3000');
    });

    // Показуємо вікно як тільки контент завантажився
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // DevTools
    if (process.env.DEBUG_ELECTRON) {
        mainWindow.webDevTools.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Proxy storage file
const proxyStorePath = path.join(__dirname, 'storage', 'proxies.json');

function getProxies() {
    if (!fs.existsSync(proxyStorePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(proxyStorePath, 'utf-8'));
    } catch (e) {
        return [];
    }
}
function saveProxies(proxies) {
    fs.writeFileSync(proxyStorePath, JSON.stringify(proxies, null, 2));
}

function createProxyManagerWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        title: 'Proxy Manager',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: true
        }
    });
    win.loadFile('proxy-manager.html');
}

// Electron lifecycle
app.on('ready', async () => {
    console.log('[Main] App ready, starting...');

    try {
        // Запускаємо сервер один раз
        await startServer();
        console.log('[Main] Server ready');

        // Створюємо вікно
        createWindow();
    } catch (err) {
        console.error('[Main] Fatal error:', err);
        dialog.showErrorBox('Error', 'Failed to start app: ' + err.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Graceful shutdown
app.on('before-quit', () => {
    console.log('[Main] Shutting down...');

    if (serverProcess && !serverProcess.killed) {
        console.log('[Main] Killing server process...');
        serverProcess.kill('SIGTERM');

        // Force kill after 3 seconds
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill('SIGKILL');
            }
        }, 3000);
    }
});

// IPC обробники
ipcMain.handle('api-call', async (event, method, endpoint, body) => {
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        // Спробуємо підключитись до сервера
        const response = await fetch(`http://localhost:3000${endpoint}`, {
            ...options,
            timeout: 10000
        });

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-profiles', async () => {
    try {
        const response = await fetch('http://localhost:3000/api/profiles', {
            timeout: 10000
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-profile', async (event, name) => {
    try {
        const response = await fetch(`http://localhost:3000/api/profiles/${name}/open`, {
            method: 'POST',
            timeout: 30000
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('close-profile', async (event, name) => {
    try {
        const response = await fetch(`http://localhost:3000/api/profiles/${name}/close`, {
            method: 'POST',
            timeout: 30000
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('create-profile', async (event, name, os, proxy) => {
    try {
        // Створити профіль
        const response = await fetch(`http://localhost:3000/api/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, os }),
            timeout: 10000
        });
        const data = await response.json();
        if (!data.success) return data;
        // Якщо проксі задано, одразу зберігаємо його
        if (proxy && proxy.host && proxy.port) {
            const proxyString = `${proxy.host}:${proxy.port}:${proxy.username || ''}:${proxy.password || ''}:${proxy.type || 'http'}`;
            await fetch(`http://localhost:3000/api/profiles/${name}/proxy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proxy: proxyString }),
                timeout: 10000
            });
        }
        return data;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-proxy-manager', () => {
    createProxyManagerWindow();
});
ipcMain.handle('get-proxies', () => {
    return getProxies();
});
ipcMain.handle('add-proxy', (event, proxy) => {
    const proxies = getProxies();
    proxies.push(proxy);
    saveProxies(proxies);
    return { success: true };
});
ipcMain.handle('delete-proxy', (event, id) => {
    let proxies = getProxies();
    proxies = proxies.filter(p => p.id !== id);
    saveProxies(proxies);
    return { success: true };
});

// Меню
const template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'Exit',
                accelerator: 'CmdOrCtrl+Q',
                click: () => app.quit()
            }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            {
                label: 'Dev Tools',
                accelerator: 'CmdOrCtrl+Shift+I',
                click: () => {
                    if (mainWindow) mainWindow.webDevTools.openDevTools();
                }
            }
        ]
    }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
