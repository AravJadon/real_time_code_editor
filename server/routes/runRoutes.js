const express = require('express');
const { runCode } = require('../services/judge0Service');

const router = express.Router();

router.post('/run', async (req, res) => {
    const code = req.body.code;
    const language = req.body.language;
    const stdin = req.body.stdin || '';

    if (typeof code !== 'string' || code.trim() === '' || !language) {
        return res.status(400).json({ error: 'Code and language are required.' });
    }

    try {
        const result = await runCode(code, language, stdin);
        return res.json(result);
    } catch (error) {
        console.error('Judge0 execution failed:', error);
        return res.status(error.statusCode || 502).json({
            output: '',
            error: error.message || 'Judge0 execution failed.',
        });
    }
});

module.exports = router;
