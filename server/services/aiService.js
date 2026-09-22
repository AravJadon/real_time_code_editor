const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');

// ─── Configuration ───
const AI_MODELS = (process.env.AI_MODELS || process.env.AI_MODEL || 'gemini-2.5-flash,gemini-2.0-flash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

const VALID_ACTIONS = ['suggest', 'explain', 'review', 'bugfix', 'chat'];

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
        'You are an expert AI coding assistant embedded in SyncCode, a real-time collaborative code editor. Help developers write better code. Be concise, helpful, and format responses in markdown.',
};

// ─── Function calling schema for Apply Fix (Phase 6) ───
const APPLY_FIX_TOOL = {
    type: 'function',
    function: {
        name: 'apply_code_fix',
        description: 'Propose a concrete code fix that the user can apply with one click. Use this when you find a bug or have a specific code improvement. You can call this multiple times for multiple fixes.',
        parameters: {
            type: 'object',
            properties: {
                fileName: {
                    type: 'string',
                    description: 'The name of the file to apply the fix to',
                },
                description: {
                    type: 'string',
                    description: 'Short description of what this fix does',
                },
                oldCode: {
                    type: 'string',
                    description: 'The original code snippet that should be replaced (exact match)',
                },
                newCode: {
                    type: 'string',
                    description: 'The corrected/improved code to replace the old code with',
                },
            },
            required: ['fileName', 'description', 'oldCode', 'newCode'],
        },
    },
};

// ─── Model Factory ───
function createModel(modelName, options = {}) {
    return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: process.env.API_KEY,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024,
        streaming: options.streaming ?? false,
    });
}

// ─── Trim helper ───
function trimText(value, maxLength) {
    if (typeof value !== 'string') return '';
    if (value.length <= maxLength) return value;
    return value.slice(value.length - maxLength);
}

// ─── Build LangChain messages ───
function buildMessages(action, code, language, prompt, conversationHistory, ragContext, imageBase64) {
    const systemPrompt = AI_SYSTEM_PROMPTS[action] || AI_SYSTEM_PROMPTS.chat;
    const messages = [new SystemMessage(systemPrompt)];

    // Add conversation history for chat mode
    if (action === 'chat' && Array.isArray(conversationHistory)) {
        conversationHistory.slice(-8).forEach((msg) => {
            if (msg.role === 'user') {
                messages.push(new HumanMessage(trimText(msg.content, 2000)));
            } else if (msg.role === 'assistant') {
                messages.push(new AIMessage(trimText(msg.content, 2000)));
            }
        });
    }

    // Build user content
    let userContent = '';

    // Add RAG context if available (Phase 4)
    if (ragContext && ragContext.length > 0) {
        userContent += '### Relevant code from other files in this project:\n\n';
        ragContext.forEach((chunk) => {
            userContent += `**${chunk.fileName}:**\n\`\`\`${chunk.language || ''}\n${chunk.text}\n\`\`\`\n\n`;
        });
        userContent += '---\n\n';
    }

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

    // Phase 8: Multi-modal support — if image is provided, use content array
    if (imageBase64) {
        const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

        messages.push(new HumanMessage({
            content: [
                {
                    type: 'text',
                    text: userContent || 'Analyze this image and generate the corresponding code.',
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${mimeType};base64,${base64Data}`,
                    },
                },
            ],
        }));
    } else {
        messages.push(new HumanMessage(userContent));
    }

    return messages;
}

// ─── RAG retrieval helper (Phase 4) ───
async function getRAGContext(roomId, query) {
    if (!roomId || !query) return [];

    try {
        const { searchSimilar } = require('./vectorStoreService');
        const results = await searchSimilar(roomId, query, 5);
        return results;
    } catch (error) {
        // Vector store may not be initialized yet — fail silently
        console.warn('RAG retrieval skipped:', error.message);
        return [];
    }
}

// ─── Main askAI function ───
async function askAI(options) {
    const action = options.action || 'chat';

    if (!process.env.API_KEY) {
        const error = new Error('AI API key is not configured. Add API_KEY to .env file.');
        error.statusCode = 500;
        throw error;
    }

    if (!options.code && !options.prompt && !options.imageBase64) {
        const error = new Error('Either code, prompt, or image is required.');
        error.statusCode = 400;
        throw error;
    }

    if (!VALID_ACTIONS.includes(action)) {
        const error = new Error(`Invalid action. Use one of: ${VALID_ACTIONS.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    // Phase 4: RAG — retrieve relevant code context
    const ragQuery = options.prompt || options.code || '';
    const ragContext = await getRAGContext(options.roomId, ragQuery);

    const messages = buildMessages(
        action,
        options.code,
        options.language,
        options.prompt,
        options.conversationHistory,
        ragContext,
        options.imageBase64
    );

    let response = null;
    let selectedModel = AI_MODELS[0] || 'gemini-2.5-flash';
    let toolCalls = [];

    for (const modelName of AI_MODELS) {
        selectedModel = modelName;

        try {
            const model = createModel(modelName, {
                temperature: action === 'suggest' ? 0.3 : 0.7,
                maxTokens: action === 'suggest' ? 512 : 2048,
            });

            // Phase 6: Bind function calling tools for bugfix/review
            const useTools = (action === 'bugfix' || action === 'review');
            const boundModel = useTools
                ? model.bindTools([APPLY_FIX_TOOL])
                : model;

            response = await boundModel.invoke(messages);

            // Extract tool calls if present (Phase 6)
            if (response.tool_calls && response.tool_calls.length > 0) {
                toolCalls = response.tool_calls.map((tc) => ({
                    name: tc.name,
                    args: tc.args,
                }));
            }

            break; // success — stop trying models
        } catch (err) {
            console.error(`Model ${modelName} failed:`, err.message);
            if (modelName === AI_MODELS[AI_MODELS.length - 1]) {
                throw err;
            }
            // try next model
        }
    }

    if (!response || !response.content) {
        const error = new Error('AI returned an empty response.');
        error.statusCode = 502;
        throw error;
    }

    const result = {
        response: typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content),
        action,
        model: selectedModel,
        usage: response.usage_metadata || null,
    };

    // Phase 6: Include tool calls (fixes) in response
    if (toolCalls.length > 0) {
        result.fixes = toolCalls
            .filter((tc) => tc.name === 'apply_code_fix')
            .map((tc) => tc.args);
    }

    return result;
}

// ─── Phase 2: Streaming function ───
async function* askAIStream(options) {
    const action = options.action || 'chat';

    if (!process.env.API_KEY) {
        throw new Error('AI API key is not configured. Add API_KEY to .env file.');
    }

    if (!options.code && !options.prompt && !options.imageBase64) {
        throw new Error('Either code, prompt, or image is required.');
    }

    // Phase 4: RAG context
    const ragQuery = options.prompt || options.code || '';
    const ragContext = await getRAGContext(options.roomId, ragQuery);

    const messages = buildMessages(
        action,
        options.code,
        options.language,
        options.prompt,
        options.conversationHistory,
        ragContext,
        options.imageBase64
    );

    const modelName = AI_MODELS[0] || 'gemini-2.5-flash';
    const model = createModel(modelName, {
        temperature: action === 'suggest' ? 0.3 : 0.7,
        maxTokens: action === 'suggest' ? 512 : 2048,
        streaming: true,
    });

    const stream = await model.stream(messages);

    for await (const chunk of stream) {
        if (chunk.content) {
            yield {
                type: 'token',
                content: typeof chunk.content === 'string'
                    ? chunk.content
                    : JSON.stringify(chunk.content),
            };
        }
    }

    yield { type: 'done', model: modelName };
}

module.exports = {
    askAI,
    askAIStream,
};
