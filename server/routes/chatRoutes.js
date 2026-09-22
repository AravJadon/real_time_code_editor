const express = require('express');
const { isDBConnected } = require('../db');
const ChatHistory = require('../models/ChatHistory');

const router = express.Router();

// ─── GET /api/chat/:roomId — Load chat history ───
router.get('/chat/:roomId', async (req, res) => {
    try {
        if (!isDBConnected()) {
            return res.json({ messages: [] });
        }

        const messages = await ChatHistory.find({ roomId: req.params.roomId })
            .sort({ createdAt: 1 })
            .limit(100)
            .lean();

        return res.json({ messages });
    } catch (error) {
        console.error('Failed to load chat history:', error);
        return res.status(500).json({ error: 'Failed to load chat history.' });
    }
});

// ─── DELETE /api/chat/:roomId — Clear chat history ───
router.delete('/chat/:roomId', async (req, res) => {
    try {
        if (isDBConnected()) {
            await ChatHistory.deleteMany({ roomId: req.params.roomId });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Failed to clear chat history:', error);
        return res.status(500).json({ error: 'Failed to clear chat history.' });
    }
});

module.exports = router;
