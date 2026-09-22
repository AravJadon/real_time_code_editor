const express = require('express');
const { askAI, askAIStream } = require('../services/aiService');
const chatHistoryService = require('../services/chatHistoryService');

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
            fileName: req.body.fileName,
            imageBase64: req.body.imageBase64,
        });

        // Phase 5: Save chat history (falls back to memory when Mongo is down)
        await chatHistoryService.appendMessages(req.body.roomId, [
            {
                role: 'user',
                content: req.body.prompt || req.body.code || '[image]',
                action: req.body.action || 'chat',
            },
            {
                role: 'assistant',
                content: result.response,
                action: result.action,
                model: result.model,
                fixes: result.fixes || [],
            },
        ]);

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
    let streamModel = null;

    try {
        const stream = askAIStream({
            action: req.body.action,
            code: req.body.code,
            language: req.body.language,
            prompt: req.body.prompt,
            conversationHistory: req.body.conversationHistory,
            roomId: req.body.roomId,
            fileName: req.body.fileName,
            imageBase64: req.body.imageBase64,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'token') {
                fullResponse += chunk.content;
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'done') {
                streamModel = chunk.model || null;
                res.write(`data: ${JSON.stringify({ type: 'done', model: chunk.model, ragSources: chunk.ragSources || [] })}\n\n`);
            }
        }

        // Phase 5: Save streamed chat history
        if (fullResponse) {
            await chatHistoryService.appendMessages(req.body.roomId, [
                {
                    role: 'user',
                    content: req.body.prompt || req.body.code || '[image]',
                    action: req.body.action || 'chat',
                },
                {
                    role: 'assistant',
                    content: fullResponse,
                    action: req.body.action || 'chat',
                    model: streamModel,
                },
            ]);
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
