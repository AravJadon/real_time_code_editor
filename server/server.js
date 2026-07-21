const path = require('path');
const loadEnvFile = require('./utils/loadEnv');

// Load environment variables first
loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '.env'));

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { connectDB } = require('./db');
const runRoutes = require('./routes/runRoutes');
const aiRoutes = require('./routes/aiRoutes');
const registerSocketHandlers = require('./socket/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
    },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', runRoutes);
app.use('/api', aiRoutes);

// TURN credentials endpoint — fetches from Xirsys API
let cachedIceServers = null;
let cacheExpiry = 0;

app.get('/api/turn-credentials', async (req, res) => {
    // Always include free STUN servers
    const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Return cached result if still valid (cache for 5 minutes)
    if (cachedIceServers && Date.now() < cacheExpiry) {
        return res.json({ iceServers: cachedIceServers });
    }

    const ident = process.env.XIRSYS_IDENT;
    const secret = process.env.XIRSYS_SECRET;
    const channel = process.env.XIRSYS_CHANNEL;

    if (!ident || !secret || !channel) {
        return res.json({ iceServers: fallback });
    }

    try {
        const auth = Buffer.from(`${ident}:${secret}`).toString('base64');
        const response = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ format: 'urls' }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data.v && data.v.iceServers) {
                cachedIceServers = [...fallback, ...data.v.iceServers];
                cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 min cache
                return res.json({ iceServers: cachedIceServers });
            }
        }
    } catch (err) {
        console.warn('Failed to fetch Xirsys TURN credentials:', err.message);
    }

    res.json({ iceServers: fallback });
});

const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildPath));
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }

    return res.sendFile(path.join(clientBuildPath, 'index.html'));
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Listening on port ${PORT}`);
    });
});
