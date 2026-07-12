const https = require('https');

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

function buildAIMessages(action, code, language, prompt, conversationHistory) {
    const systemPrompt = AI_SYSTEM_PROMPTS[action] || AI_SYSTEM_PROMPTS.chat;
    const messages = [{ role: 'system', content: systemPrompt }];

    if (action === 'chat' && Array.isArray(conversationHistory)) {
        conversationHistory.forEach((message) => {
            if (message.role === 'user' || message.role === 'assistant') {
                messages.push({
                    role: message.role,
                    content: message.content,
                });
            }
        });
    }

    let userContent = '';

    if (code) {
        userContent += `**Language:** ${language || 'Unknown'}\n\n`;
        userContent += `\`\`\`${language || ''}\n${code}\n\`\`\`\n\n`;
    }

    if (prompt) {
        userContent += prompt;
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

        request.setTimeout(60000, () => {
            request.destroy(new Error('AI API request timed out (60s).'));
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
    });
}

function readAIError(response) {
    if (response.data && response.data.error && response.data.error.message) {
        return response.data.error.message;
    }

    if (response.data && response.data.error) {
        return response.data.error;
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

    const response = await requestAI({
        model: 'gemini-3.5-flash',
        messages,
        temperature: action === 'suggest' ? 0.3 : 0.7,
        max_tokens: action === 'suggest' ? 512 : 2048,
        stream: false,
    });

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
        model: response.data.model || 'gemini-3.5-flash',
        usage: response.data.usage || null,
    };
}

module.exports = {
    askAI,
};
