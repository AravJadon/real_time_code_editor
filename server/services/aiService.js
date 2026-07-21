const https = require('https');

const AI_MODELS = (process.env.AI_MODELS || process.env.AI_MODEL || 'gemini-2.5-flash,gemini-3.5-flash')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120000);
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 2);
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const AI_SYSTEM_PROMPTS = {
    suggest:
        'You are an expert code completion assistant. Given the code context, provide a natural continuation of the code. Return only the code that should come next. No explanations, markdown fences, or extra comments.',
    explain:
        'You are an expert programming tutor. Explain the given code clearly and concisely. Break down what each part does, mention patterns, and note potential issues. Format your response in markdown.',
    review:
        'You are a senior code reviewer. Review code quality, performance, security, best practices, and give concrete suggestions. Format your response in markdown.',
    bugfix:
        'You are an expert debugger. Find bugs, explain why they are problems, and provide corrected code. If no bugs are found, mention that and suggest preventive improvements.',
    chat:
        'You are an expert AI coding assistant embedded in SyncCode. Help developers write better code. Be concise, helpful, and format responses in markdown.',
};

const VALID_ACTIONS = ['suggest', 'explain', 'review', 'bugfix', 'chat'];

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function trimText(value, maxLength) {
    if (typeof value !== 'string') return '';
    if (value.length <= maxLength) return value;
    return value.slice(value.length - maxLength);
}

function buildAIMessages(action, code, language, prompt, conversationHistory) {
    const systemPrompt = AI_SYSTEM_PROMPTS[action] || AI_SYSTEM_PROMPTS.chat;
    const messages = [{ role: 'system', content: systemPrompt }];

    if (action === 'chat' && Array.isArray(conversationHistory)) {
        conversationHistory.slice(-8).forEach((message) => {
            if (message.role === 'user' || message.role === 'assistant') {
                messages.push({
                    role: message.role,
                    content: trimText(message.content, 2000),
                });
            }
        });
    }

    let userContent = '';

    if (code) {
        userContent += `**Language:** ${language || 'Unknown'}\n\n`;
        userContent += `\`\`\`${language || ''}\n${trimText(code, 10000)}\n\`\`\`\n\n`;
    }

    if (prompt) {
        userContent += trimText(prompt, 4000);
    }

    if (!userContent) {
        userContent = 'Please analyze the code above.';
    }

    messages.push({ role: 'user', content: userContent });
    return messages;
}

function requestAI(body) {
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
        const request = https.request(
            url,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.API_KEY}`,
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (response) => {
                let rawData = '';

                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    rawData += chunk;
                });
                response.on('end', () => {
                    try {
                        resolve({
                            ok: response.statusCode >= 200 && response.statusCode < 300,
                            statusCode: response.statusCode,
                            data: JSON.parse(rawData),
                        });
                    } catch (parseError) {
                        resolve({
                            ok: false,
                            statusCode: response.statusCode,
                            data: {
                                error:
                                    rawData ||
                                    `AI API returned non-JSON (${parseError.message})`,
                            },
                        });
                    }
                });
            }
        );

        request.setTimeout(AI_TIMEOUT_MS, () => {
            request.destroy(new Error(`AI API request timed out (${Math.round(AI_TIMEOUT_MS / 1000)}s).`));
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
    });
}

async function requestAIWithRetry(body) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await requestAI(body);

            if (response.ok || !RETRYABLE_STATUS_CODES.has(response.statusCode) || attempt === MAX_RETRIES) {
                return response;
            }

            lastError = new Error(readAIError(response));
        } catch (error) {
            lastError = error;

            if (attempt === MAX_RETRIES) {
                throw error;
            }
        }

        await wait(750 * (attempt + 1));
    }

    throw lastError || new Error('AI API request failed.');
}

function readAIError(response) {
    if (response.data && response.data.error && response.data.error.message) {
        return response.data.error.message;
    }

    if (response.data && response.data.error) {
        return typeof response.data.error === 'string'
            ? response.data.error
            : JSON.stringify(response.data.error);
    }

    return `AI API request failed with status ${response.statusCode}`;
}

async function askAI(options) {
    const action = options.action || 'chat';

    if (!process.env.API_KEY) {
        const error = new Error('AI API key is not configured. Add API_KEY to .env file.');
        error.statusCode = 500;
        throw error;
    }

    if (!options.code && !options.prompt) {
        const error = new Error('Either code or prompt is required.');
        error.statusCode = 400;
        throw error;
    }

    if (!VALID_ACTIONS.includes(action)) {
        const error = new Error(`Invalid action. Use one of: ${VALID_ACTIONS.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    const messages = buildAIMessages(
        action,
        options.code,
        options.language,
        options.prompt,
        options.conversationHistory
    );

    let response = null;
    let selectedModel = AI_MODELS[0] || 'gemini-2.5-flash';

    for (const model of AI_MODELS) {
        selectedModel = model;
        response = await requestAIWithRetry({
            model,
            messages,
            reasoning_effort: 'low',
            temperature: action === 'suggest' ? 0.3 : 0.7,
            max_tokens: action === 'suggest' ? 512 : 1024,
            stream: false,
        });

        if (response.ok || !RETRYABLE_STATUS_CODES.has(response.statusCode)) {
            break;
        }
    }

    if (!response) {
        const error = new Error('No AI model is configured.');
        error.statusCode = 500;
        throw error;
    }

    if (!response.ok) {
        const error = new Error(readAIError(response));
        error.statusCode = response.statusCode || 502;
        throw error;
    }

    const responseContent =
        response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        response.data.choices[0].message.content;

    if (!responseContent) {
        const error = new Error('AI returned an empty response.');
        error.statusCode = 502;
        throw error;
    }

    return {
        response: responseContent,
        action,
        model: response.data.model || selectedModel,
        usage: response.data.usage || null,
    };
}

module.exports = {
    askAI,
};
