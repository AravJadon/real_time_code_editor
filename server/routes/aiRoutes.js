const express = require('express');
const { askAI } = require('../services/aiService');

const router = express.Router();

router.post('/ai', async (req, res) => {
    try {
        const result = await askAI({
            action: req.body.action,
            code: req.body.code,
            language: req.body.language,
            prompt: req.body.prompt,
            conversationHistory: req.body.conversationHistory,
        });

        return res.json(result);
    } catch (error) {
        console.error('AI API call failed:', error);
        return res.status(error.statusCode || 502).json({
            error: error.message || 'Failed to reach AI API.',
        });
    }
});

module.exports = router;
