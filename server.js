import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as db from './scr/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== API ENDPOINTS ====================
// Динамічно імпортуємо manage для ESM
let manage;
(async () => { manage = await import('./scr/manage.js'); })();

// Отримати список профілів
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await db.get_Profiles();
        const profilesData = [];
        const proxiesList = readProxiesFile();

        for (const profile of profiles) {
            const pdata = await db.get_Profile(profile);
            // Перевірка: якщо профіль неактивний у manage.active, скидаємо open
            let isOpen = pdata.get('open') === true || pdata.get('open') === 1;
            if (isOpen) {
                if (!manage.active || !manage.active[profile]) {
                    await db.update_Profile(profile, { open: false });
                    isOpen = false;
                }
            }

            // Resolve proxy info from global proxies list if possible
            let rawProxy = pdata.get('proxy') || false;
            let proxyInfo = null;
            try {
                if (rawProxy) {
                    if (typeof rawProxy === 'object' && rawProxy.id) {
                        const found = proxiesList.find(p => p.id === rawProxy.id);
                        if (found) proxyInfo = { id: found.id, host: found.host, port: found.port, tags: found.tags || [] };
                    } else if (typeof rawProxy === 'object' && rawProxy.server) {
                        const server = String(rawProxy.server).replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
                        const found = proxiesList.find(p => `${p.host}:${p.port}` === server || p.server === server);
                        if (found) proxyInfo = { id: found.id, host: found.host, port: found.port, tags: found.tags || [] };
                    } else if (typeof rawProxy === 'string') {
                        // normalize string to host:port
                        let s = rawProxy.trim();
                        s = s.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
                        // remove possible username@
                        if (s.includes('@')) s = s.split('@').pop();
                        const parts = s.split(':');
                        const host = parts[0];
                        const port = parts[1] || '';
                        const found = proxiesList.find(p => p.host === host && String(p.port) === String(port));
                        if (found) proxyInfo = { id: found.id, host: found.host, port: found.port, tags: found.tags || [] };
                    }
                }
            } catch (e) {
                // ignore
            }

            profilesData.push({
                name: profile,
                open: isOpen,
                proxy: rawProxy || false,
                proxyType: pdata.get('proxyType') || 'http',
                fingerprint: pdata.get('fingerprint') || false,
                proxyInfo
            });
        }

        res.json({ success: true, profiles: profilesData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Створити профіль
app.post('/api/profiles', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Profile name required' });
        }

        await manage.create_Profile(name);
        io.emit('profile_created', { name });

        res.json({ success: true, profile: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Відкрити профіль
app.post('/api/profiles/:name/open', async (req, res) => {
    try {
        const { name } = req.params;
        console.log(`[API] Opening profile: ${name}`);

        await manage.open_Profile(name);

        // Затримка щоб БД встигла оновитись
        await new Promise(resolve => setTimeout(resolve, 200));

        io.emit('profile_opened', { name });

        res.json({ success: true });
    } catch (error) {
        console.error(`[API] Error opening profile:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Закрити профіль
app.post('/api/profiles/:name/close', async (req, res) => {
    try {
        const { name } = req.params;
        console.log(`[API] Closing profile: ${name}`);

        await manage.close_Profile(name);

        // Затримка щоб БД встигла оновитись
        await new Promise(resolve => setTimeout(resolve, 200));

        io.emit('profile_closed', { name });

        res.json({ success: true });
    } catch (error) {
        console.error(`[API] Error closing profile:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Видалити профіль
app.delete('/api/profiles/:name', async (req, res) => {
    try {
        const { name } = req.params;
        await manage.delete_Profile(name);
        io.emit('profile_deleted', { name });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Оновити проксі
app.post('/api/profiles/:name/proxy', async (req, res) => {
    try {
        const { name } = req.params;
        const { proxy, proxyId } = req.body;

        console.log(`[API] set proxy for profile ${name} ->`, proxy || proxyId);

        // If profile missing: only auto-create for temporary test profiles
        const exists = await db.check_Profile(name);
        if (!exists) {
            if (String(name).startsWith('_test_proxy_')) {
                console.log(`[API] Profile ${name} not found in DB - creating automatically (temp)`);
                await manage.create_Profile(name);
            } else {
                return res.status(404).json({ success: false, error: 'Profile not found' });
            }
        }

        // Get current profile object to know previous proxy (for unassigning)
        const profileObj = await db.get_Profile(name);
        const prevProxy = profileObj ? profileObj.get('proxy') : null;

        // If proxyId provided - find proxy in global proxies and assign
        if (proxyId) {
            const list = readProxiesFile();
            const found = list.find(p => p.id === proxyId);
            if (!found) return res.status(404).json({ success: false, error: 'Proxy not found' });

            // First unassign previous proxy if present
            if (prevProxy) {
                try {
                    let prevMatchIndex = -1;
                    if (prevProxy && typeof prevProxy === 'object' && prevProxy.id) {
                        prevMatchIndex = list.findIndex(p => p.id === prevProxy.id);
                    }
                    if (prevMatchIndex === -1 && prevProxy && typeof prevProxy === 'object' && prevProxy.server) {
                        prevMatchIndex = list.findIndex(p => p.server === prevProxy.server || `${p.host}:${p.port}` === prevProxy.server);
                    }
                    if (prevMatchIndex !== -1) {
                        const prevItem = list[prevMatchIndex];
                        if (Array.isArray(prevItem.assignedTo)) {
                            prevItem.assignedTo = prevItem.assignedTo.filter(n => n !== name);
                            list[prevMatchIndex] = prevItem;
                        }
                    }
                } catch (e) {
                    console.error('Error unassigning previous proxy:', e.message);
                }
            }

            // Assign profile to found proxy (add to assignedTo array)
            found.assignedTo = Array.isArray(found.assignedTo) ? found.assignedTo : [];
            if (!found.assignedTo.includes(name)) found.assignedTo.push(name);

            // Save proxies file
            writeProxiesFile(list);

            // Set profile proxy using manage helper (it accepts object)
            await manage.set_ProfileProxy(name, Object.assign({}, found));

            io.emit('profile_updated', { name, field: 'proxy' });
            res.json({ success: true });
            return;
        }

        // Old behavior: accept proxy string or object
        await manage.set_ProfileProxy(name, proxy);

        // If proxy is an object with id and comes from global list, update assignedTo as well
        try {
            if (proxy && typeof proxy === 'object' && proxy.id) {
                const list = readProxiesFile();
                const found = list.find(p => p.id === proxy.id);
                if (found) {
                    found.assignedTo = Array.isArray(found.assignedTo) ? found.assignedTo : [];
                    if (!found.assignedTo.includes(name)) found.assignedTo.push(name);
                    writeProxiesFile(list);
                }
            }
        } catch (e) {
            console.error('Error updating proxies assignedTo:', e.message);
        }

        io.emit('profile_updated', { name, field: 'proxy' });
        res.json({ success: true });
    } catch (error) {
        console.error(`[API] Error setting proxy for profile ${req.params.name}:`, error && error.message ? error.message : error);
        res.status(500).json({ success: false, error: String(error.message || error), stack: (error.stack || '').split('\n').slice(0,5) });
    }
});

// Видалити проксі
app.delete('/api/profiles/:name/proxy', async (req, res) => {
    try {
        const { name } = req.params;
        // Find profile and its proxy to unassign from global list
        const profile = await db.get_Profile(name);
        const proxyVal = profile ? profile.get('proxy') : null;

        if (proxyVal && typeof proxyVal === 'object') {
            try {
                const list = readProxiesFile();
                // try match by id or server
                let idx = -1;
                if (proxyVal.id) idx = list.findIndex(p => p.id === proxyVal.id);
                if (idx === -1 && proxyVal.server) idx = list.findIndex(p => p.server === proxyVal.server);
                if (idx !== -1) {
                    const item = list[idx];
                    if (Array.isArray(item.assignedTo)) {
                        item.assignedTo = item.assignedTo.filter(n => n !== name);
                        list[idx] = item;
                        writeProxiesFile(list);
                    }
                }
            } catch (e) {
                console.error('Error while unassigning proxy from list:', e.message);
            }
        }

        await manage.delete_ProfileProxy(name);
        io.emit('profile_updated', { name, field: 'proxy' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Тестувати проксі
app.post('/api/profiles/:name/proxy/test', async (req, res) => {
    try {
        const { name } = req.params;
        const profile = await db.get_Profile(name);
        const proxyString = await profile.get('proxy');

        if (!proxyString) {
            return res.status(400).json({ success: false, error: 'No proxy configured' });
        }

        // Тестуємо проксі
        const result = await testProxy(proxyString);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST test global proxy by id
app.post('/api/proxies/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const list = readProxiesFile();
        const proxy = list.find(p => p.id === id);
        if (!proxy) return res.status(404).json({ success: false, error: 'Proxy not found' });
        // Use stored proxy object or build server string
        const proxyObj = Object.assign({}, proxy);
        console.log(`[API] Testing proxy id=${id} rawObject=`, proxyObj);
        const result = await testProxy(proxyObj);
        // save test result and status back to proxies.json
        try {
            proxy.testResult = result.success ? result : { error: result.error };
            proxy.status = result.success ? 'active' : 'failed';
            writeProxiesFile(list);
            io.emit('proxies_updated');
        } catch (e) {
            console.error('Failed to persist proxy test result', e.message);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST test proxy by payload (proxy string or object)
app.post('/api/proxies/test', async (req, res) => {
    try {
        const { proxy } = req.body;
        if (!proxy) return res.status(400).json({ success: false, error: 'Proxy required in body' });
        const result = await testProxy(proxy);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper для тестування проксі
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

async function testProxy(proxyStringOrObj) {
    try {
        // Normalize proxy input to object with server, username, password, type
        let proxyObj = null;

        if (!proxyStringOrObj) throw new Error('Empty proxy');

        if (typeof proxyStringOrObj === 'object') {
            // Clone to avoid mutating original
            proxyObj = Object.assign({}, proxyStringOrObj);
            // If stored proxies use host/port fields, build server field
            if (!proxyObj.server && proxyObj.host && proxyObj.port) {
                proxyObj.server = `${proxyObj.host}:${proxyObj.port}`;
            }
            // Ensure username/password fields are present under expected keys
            if (!proxyObj.username && (proxyObj.user || proxyObj.login)) proxyObj.username = proxyObj.user || proxyObj.login;
            if (!proxyObj.password && proxyObj.pass) proxyObj.password = proxyObj.pass;
            if (!proxyObj.type) proxyObj.type = proxyObj.proxyType || 'http';
        } else if (typeof proxyStringOrObj === 'string') {
            let s = proxyStringOrObj.trim();
            // remove surrounding quotes if any
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                s = s.slice(1, -1);
            }

            // if looks like URL with scheme
            try {
                const parsed = new URL(s.startsWith('http') || s.startsWith('socks') ? s : `http://${s}`);
                const host = parsed.hostname;
                const port = parsed.port;
                const user = parsed.username || '';
                const pass = parsed.password || '';
                const scheme = parsed.protocol ? parsed.protocol.replace(':', '') : 'http';
                if (host && port) {
                    proxyObj = { server: `${host}:${port}`, username: user || undefined, password: pass || undefined, type: scheme || 'http' };
                }
            } catch (e) {
                // fallback parsing: user:pass@host:port or host:port:username:password:type or host:port
                // Try user:pass@host:port
                if (s.includes('@')) {
                    const [authPart, hostPart] = s.split('@');
                    const [user, pass] = authPart.split(':');
                    const hostClean = hostPart.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
                    const hostParts = hostClean.split(':');
                    const host = hostParts[0];
                    const port = hostParts[1] || '';
                    if (host && port) proxyObj = { server: `${host}:${port}`, username: user || undefined, password: pass || undefined, type: 'http' };
                }
                if (!proxyObj) {
                    const parts = s.split(':');
                    if (parts.length >= 2) {
                        // host:port[:username[:password[:type]]]
                        const host = parts[0];
                        const port = parts[1];
                        const username = parts[2] || undefined;
                        const password = parts[3] || undefined;
                        const type = parts[4] || 'http';
                        proxyObj = { server: `${host}:${port}`, username, password, type };
                    }
                }
            }
        } else {
            throw new Error('Unsupported proxy format');
        }

        // After normalization ensure proxyObj has server
        if (!proxyObj || !proxyObj.server) {
            throw new Error('Invalid proxy format');
        }

        // Build proxy URL for agent
        const server = String(proxyObj.server).replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
        const [hostOnly, portOnly] = server.split(':');
        const type = (proxyObj.type || 'http').toLowerCase();
        const username = proxyObj.username || proxyObj.user || '';
        const password = proxyObj.password || proxyObj.pass || '';

        let proxyUrl;
        let agent;
        if (type.startsWith('socks')) {
            proxyUrl = username && password ? `socks5://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostOnly}:${portOnly}` : `socks5://${hostOnly}:${portOnly}`;
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            proxyUrl = username && password ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostOnly}:${portOnly}` : `http://${hostOnly}:${portOnly}`;
            agent = new HttpsProxyAgent(proxyUrl);
        }

        const startTime = Date.now();
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 10000
        });
        const responseTime = Date.now() - startTime;
        const geoResponse = await axios.get(`http://ip-api.com/json/${response.data.ip}`);
        return {
            success: true,
            ip: response.data.ip,
            responseTime: `${responseTime}ms`,
            location: {
                country: geoResponse.data.country,
                city: geoResponse.data.city,
                region: geoResponse.data.regionName
            },
            status: 'working'
        };
    } catch (error) {
        return {
            success: false,
            error: error && error.message ? error.message : String(error),
            status: 'failed'
        };
    }
}

// Оновити fingerprint
app.post('/api/profiles/:name/fingerprint', async (req, res) => {
    try {
        const { name } = req.params;
        await manage.change_ProfileFP(name);
        io.emit('profile_updated', { name, field: 'fingerprint' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Видалити fingerprint
app.delete('/api/profiles/:name/fingerprint', async (req, res) => {
    try {
        const { name } = req.params;
        await manage.delete_ProfileFP(name);
        io.emit('profile_updated', { name, field: 'fingerprint' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Перейменувати профіль
app.post('/api/profiles/:name/rename', async (req, res) => {
    try {
        const { name } = req.params;
        const { newName } = req.body;

        if (!newName) {
            return res.status(400).json({ success: false, error: 'New name required' });
        }

        await manage.rename_Profile(name, newName);
        io.emit('profile_renamed', { oldName: name, newName });

        res.json({ success: true, newName });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Очистити мертві браузери
app.post('/api/cleanup', async (req, res) => {
    try {
        const result = await manage.cleanup_DeadBrowsers();
        res.json({ success: true, cleaned: result.cleaned || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Глобальний список проксі
const proxiesPath = path.join(__dirname, 'storage', 'proxies.json');

function readProxiesFile() {
    if (!fs.existsSync(proxiesPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(proxiesPath, 'utf8')) || [];
    } catch (e) {
        return [];
    }
}
function writeProxiesFile(list) {
    fs.writeFileSync(proxiesPath, JSON.stringify(list, null, 2));
}

// GET all proxies (global)
app.get('/api/proxies', async (req, res) => {
    try {
        const list = readProxiesFile();
        res.json({ success: true, proxies: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST add global proxy
app.post('/api/proxies', async (req, res) => {
    try {
        const proxy = req.body;
        if (!proxy) return res.status(400).json({ success: false, error: 'Proxy required' });
        // normalize defaults
        if (!proxy.tags || !Array.isArray(proxy.tags)) proxy.tags = proxy.tags ? [proxy.tags] : [];
        if (!proxy.status) proxy.status = 'inactive';
        if (typeof proxy.testResult === 'undefined') proxy.testResult = null;
        if (!proxy.createdAt) proxy.createdAt = new Date().toISOString();
        const list = readProxiesFile();
        // ensure id
        if (!proxy.id) proxy.id = Date.now().toString() + '_' + Math.random().toString(36).slice(2,8);
        list.push(proxy);
        writeProxiesFile(list);
        io.emit('proxies_updated');
        res.json({ success: true, proxy });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT update proxy by id
app.put('/api/proxies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const newProxy = req.body;
        if (!newProxy) return res.status(400).json({ success: false, error: 'Proxy body required' });
        let list = readProxiesFile();
        let found = false;
        list = list.map(p => {
            if (p.id === id) {
                found = true;
                return Object.assign({}, p, newProxy, { id });
            }
            return p;
        });
        if (!found) return res.status(404).json({ success: false, error: 'Proxy not found' });
        writeProxiesFile(list);
        io.emit('proxies_updated');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE proxy by id
app.delete('/api/proxies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let list = readProxiesFile();
        const before = list.length;
        list = list.filter(p => p.id !== id);
        writeProxiesFile(list);
        io.emit('proxies_updated');
        res.json({ success: true, deleted: before - list.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Launch ephemeral profile (one-shot, not saved)
app.post('/api/profiles/ephemeral', async (req, res) => {
    try {
        const { proxyId, proxy } = req.body || {};
        let proxyObj = null;
        if (proxyId) {
            const list = readProxiesFile();
            const found = list.find(p => p.id === proxyId);
            if (!found) return res.status(404).json({ success: false, error: 'Proxy not found' });
            proxyObj = found;
        } else if (proxy) {
            proxyObj = proxy;
        }

        const result = await manage.launch_Ephemeral({ proxy: proxyObj });
        res.json({ success: true, ephemeral: result.name });
    } catch (error) {
        console.error('[API] Ephemeral launch error:', error && error.message ? error.message : error);
        res.status(500).json({ success: false, error: error && error.message ? error.message : String(error) });
    }
});

// WebSocket з'єднання
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Antidetect Browser Manager UI       ║
║                                        ║
║   Server running on:                  ║
║   http://localhost:${PORT}             ║
║                                        ║
║   API Documentation:                  ║
║   http://localhost:${PORT}/api/profiles║
╚════════════════════════════════════════╝
    `);
});
