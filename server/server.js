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

// TURN credentials endpoint — provides ICE server config for WebRTC
app.get('/api/turn-credentials', async (req, res) => {
    const apiKey = process.env.METERED_TURN_API_KEY;

    // Always include free STUN servers
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (apiKey) {
        try {
            const response = await fetch(
                `https://synccode.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
            );

            if (response.ok) {
                const turnServers = await response.json();
                iceServers.push(...turnServers);
            }
        } catch (err) {
            console.warn('Failed to fetch TURN credentials:', err.message);
        }
    }

    res.json({ iceServers });
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
