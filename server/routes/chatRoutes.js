const express = require('express');
const chatHistoryService = require('../services/chatHistoryService');

const router = express.Router();

// ─── GET /api/chat/:roomId — Load chat history ───
router.get('/chat/:roomId', async (req, res) => {
    try {
        const messages = await chatHistoryService.getMessages(req.params.roomId);
        return res.json({ messages });
    } catch (error) {
        console.error('Failed to load chat history:', error);
        return res.status(500).json({ error: 'Failed to load chat history.' });
    }
});

// ─── DELETE /api/chat/:roomId — Clear chat history ───
router.delete('/chat/:roomId', async (req, res) => {
    try {
        await chatHistoryService.clearMessages(req.params.roomId);
        return res.json({ success: true });
    } catch (error) {
        console.error('Failed to clear chat history:', error);
        return res.status(500).json({ error: 'Failed to clear chat history.' });
    }
});

module.exports = router;
