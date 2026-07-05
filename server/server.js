const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { Server } = require('socket.io');
const cors = require('cors');
const ACTIONS = require('./Actions');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('build'));
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ===========================
// Code Execution Endpoint
// ===========================

app.post('/api/run', (req, res) => {
    const { code, language } = req.body;

    if (!code || !language) {
        return res.status(400).json({ error: 'Code and language are required.' });
    }

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const timestamp = Date.now();
    let filename, command, args;

    if (language === 'javascript') {
        filename = path.join(tempDir, `code_${timestamp}.js`);
        command = 'node';
        args = [filename];
    } else if (language === 'python') {
        filename = path.join(tempDir, `code_${timestamp}.py`);
        command = 'python';
        args = [filename];
    } else {
        return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Write code to temp file
    fs.writeFileSync(filename, code);

    // Execute with 10 second timeout
    execFile(command, args, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        // Cleanup temp file
        try { fs.unlinkSync(filename); } catch (e) { /* ignore */ }

        if (error) {
            if (error.killed) {
                return res.json({
                    output: '',
                    error: '⏱ Execution timed out (10 second limit).',
                });
            }
            return res.json({
                output: stdout || '',
                error: stderr || error.message,
            });
        }

        return res.json({
            output: stdout,
            error: stderr || '',
        });
    });
});

// ===========================
// Socket.IO
// ===========================

const userSocketMap = {};

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code, language }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
        if (language) {
            io.to(socketId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
        }
    });

    // Sync language change to all others in the room
    socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));