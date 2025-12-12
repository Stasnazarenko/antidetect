import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as manage from './scr/manage.js';
import * as db from './scr/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Отримати список профілів
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await db.get_Profiles();
        const profilesData = [];

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
            profilesData.push({
                name: profile,
                open: isOpen,
                proxy: pdata.get('proxy') || false,
                proxyType: pdata.get('proxyType') || 'http',
                fingerprint: pdata.get('fingerprint') || false
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
        const { proxy } = req.body;

        await manage.set_ProfileProxy(name, proxy);
        io.emit('profile_updated', { name, field: 'proxy' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Видалити проксі
app.delete('/api/profiles/:name/proxy', async (req, res) => {
    try {
        const { name } = req.params;
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

// Helper для тестування проксі
async function testProxy(proxyString) {
    try {
        const axios = require('axios');
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        const [host, port, username, password, type = 'http'] = proxyString.split(':');

        let agent;
        let proxyUrl;

        if (type === 'socks5') {
            proxyUrl = username && password
                ? `socks5://${username}:${password}@${host}:${port}`
                : `socks5://${host}:${port}`;
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            proxyUrl = username && password
                ? `http://${username}:${password}@${host}:${port}`
                : `http://${host}:${port}`;
            agent = new HttpsProxyAgent(proxyUrl);
        }

        const startTime = Date.now();

        // Тестуємо з'єднання
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 10000
        });

        const responseTime = Date.now() - startTime;

        // Отримуємо геолокацію IP
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
            error: error.message,
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
