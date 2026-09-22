const express = require('express');
const { runAgent } = require('../services/agentService');

const router = express.Router();

// Store io instance for socket broadcasting from agent tools
let ioInstance = null;

function setIO(io) {
    ioInstance = io;
}

// ─── POST /api/agent — Run the AI agent ───
router.post('/agent', async (req, res) => {
    try {
        const { prompt, roomId } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'A prompt is required.' });
        }

        if (!roomId) {
            return res.status(400).json({ error: 'A roomId is required for agent mode.' });
        }

        const result = await runAgent({
            prompt,
            roomId,
            io: ioInstance,
        });

        return res.json(result);
    } catch (error) {
        console.error('Agent execution failed:', error);
        return res.status(error.statusCode || 502).json({
            error: error.message || 'Agent execution failed.',
        });
    }
});

module.exports = { router, setIO };
