const express = require('express');
const { askAI, askAIStream } = require('../services/aiService');

const router = express.Router();

// ─── Standard (non-streaming) AI endpoint ───
router.post('/ai', async (req, res) => {
    try {
        const result = await askAI({
            action: req.body.action,
            code: req.body.code,
            language: req.body.language,
            prompt: req.body.prompt,
            conversationHistory: req.body.conversationHistory,
            roomId: req.body.roomId,
            imageBase64: req.body.imageBase64,
        });

        // Phase 5: Save chat history
        try {
            const ChatHistory = require('../models/ChatHistory');
            const { isDBConnected } = require('../db');

            if (isDBConnected() && req.body.roomId) {
                await ChatHistory.create([
                    {
                        roomId: req.body.roomId,
                        role: 'user',
                        content: req.body.prompt || req.body.code || '[image]',
                        action: req.body.action || 'chat',
                    },
                    {
                        roomId: req.body.roomId,
                        role: 'assistant',
                        content: result.response,
                        action: result.action,
                        model: result.model,
                        fixes: result.fixes || [],
                    },
                ]);
            }
        } catch (historyError) {
            console.warn('Failed to save chat history:', historyError.message);
        }

        return res.json(result);
    } catch (error) {
        console.error('AI API call failed:', error);
        return res.status(error.statusCode || 502).json({
            error: error.message || 'Failed to reach AI API.',
        });
    }
});

// ─── Phase 2: Streaming SSE endpoint ───
router.post('/ai/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullResponse = '';

    try {
        const stream = askAIStream({
            action: req.body.action,
            code: req.body.code,
            language: req.body.language,
            prompt: req.body.prompt,
            conversationHistory: req.body.conversationHistory,
            roomId: req.body.roomId,
            imageBase64: req.body.imageBase64,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'token') {
                fullResponse += chunk.content;
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'done') {
                res.write(`data: ${JSON.stringify({ type: 'done', model: chunk.model })}\n\n`);
            }
        }

        // Phase 5: Save streamed chat history
        try {
            const ChatHistory = require('../models/ChatHistory');
            const { isDBConnected } = require('../db');

            if (isDBConnected() && req.body.roomId && fullResponse) {
                await ChatHistory.create([
                    {
                        roomId: req.body.roomId,
                        role: 'user',
                        content: req.body.prompt || req.body.code || '[image]',
                        action: req.body.action || 'chat',
                    },
                    {
                        roomId: req.body.roomId,
                        role: 'assistant',
                        content: fullResponse,
                        action: req.body.action || 'chat',
                    },
                ]);
            }
        } catch (historyError) {
            console.warn('Failed to save streamed chat history:', historyError.message);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('AI streaming failed:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

module.exports = router;
