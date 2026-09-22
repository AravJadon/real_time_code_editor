const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');

// ─── Configuration ───
// The chain is walked in order on failure. It matters that the entries are
// *different* models: the free tier meters quota per model per day, so a fallback
// to another snapshot of the same model buys nothing. `gemini-2.0-flash` used to
// sit here and has since been retired — it 404s, which turned the fallback into a
// guaranteed second failure.
const AI_MODELS = (process.env.AI_MODELS || process.env.AI_MODEL || 'gemini-3.6-flash,gemini-2.5-flash,gemini-3.5-flash,gemini-2.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-latest')
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

// Retrieval gives the model a partial view by design. Without this the model
// reads "here is a chunk of index.js" as "index.js is the only file that exists"
// and tells the user so.
const CONTEXT_GUIDANCE = [
    '',
    'Context rules:',
    '- A list of every file in the project may be provided below. It is authoritative and complete: never claim you can only see one file, and never say a file is missing if it appears in that list.',
    '- Retrieved code excerpts are the most relevant snippets found, not the whole project. Their absence does not mean code does not exist.',
    '- If you need a file that was not included, say which one and ask for it, rather than guessing at its contents.',
    '- Cite files by name when you refer to them.',
].join('\n');

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

/**
 * Pull the human-readable text out of a LangChain message's `content`.
 *
 * `content` is only a plain string in the simplest case. As soon as the model
 * emits a function call, an inline thought, or any multi-part answer it becomes an
 * array of content parts. Stringifying that array dumps raw JSON (or a row of
 * "[object Object]") straight into the chat window, which is exactly what the
 * Bug Fix and Review actions were doing.
 */
function extractText(content) {
    if (typeof content === 'string') return content;
    if (content === null || content === undefined) return '';

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (!part || typeof part !== 'object') return '';
                // Skip function calls and surfaced reasoning — neither is an answer.
                if (part.functionCall || part.type === 'functionCall') return '';
                if (part.thought === true || part.type === 'thinking') return '';
                if (typeof part.text === 'string') return part.text;
                return '';
            })
            .join('');
    }

    if (typeof content === 'object' && typeof content.text === 'string') {
        return content.text;
    }

    return '';
}

// ─── Per-model rate-limit cooldown ───
//
// The free tier caps requests per model per day. Once a model answers 429 there
// is no point paying a network round-trip for it on the next request too — with a
// six-model chain that turns every call into a minute of dead waiting before the
// user sees anything. Remember when each model is worth trying again.
const modelCooldowns = new Map(); // modelName -> epoch ms when it may be retried

const DEFAULT_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 10 * 60 * 1000;

function isRateLimit(error) {
    const message = String((error && error.message) || '');
    const status = error && (error.status || error.statusCode);
    return status === 429 || /429|too many requests|quota|rate limit/i.test(message);
}

function noteModelFailure(modelName, error) {
    if (!isRateLimit(error)) return;

    const match = String(error.message || '').match(/retry in ([\d.]+)s/i);
    const delayMs = match
        ? Math.min(MAX_COOLDOWN_MS, Math.ceil(Number(match[1]) * 1000) + 1000)
        : DEFAULT_COOLDOWN_MS;

    modelCooldowns.set(modelName, Date.now() + delayMs);
}

function isModelCoolingDown(modelName) {
    const until = modelCooldowns.get(modelName);
    if (!until) return false;

    if (Date.now() >= until) {
        modelCooldowns.delete(modelName);
        return false;
    }

    return true;
}

/**
 * The chain to actually try, cheapest-to-succeed first. If every model is cooling
 * down we still try them all rather than failing without an attempt — a cooldown
 * is a guess, not a guarantee.
 */
function availableModels() {
    const ready = AI_MODELS.filter((m) => !isModelCoolingDown(m));
    return ready.length > 0 ? ready : AI_MODELS;
}

/**
 * Turn a provider error into something worth showing a user. The raw Google error
 * is a wall of JSON quota metadata.
 */
function friendlyError(error) {
    const message = String((error && error.message) || 'The AI request failed.');

    if (/429|quota|rate limit/i.test(message)) {
        const retry = message.match(/retry in ([\d.]+)s/i);
        return `The AI provider's rate limit or daily free-tier quota has been reached for every configured model.${
            retry ? ` Try again in about ${Math.ceil(Number(retry[1]))}s.` : ''
        } You can add more models to AI_MODELS in .env, or use a key with billing enabled.`;
    }

    if (/404|no longer available|not found/i.test(message)) {
        return 'The configured AI model is not available for this API key (it may have been retired). Update AI_MODELS in .env.';
    }

    if (/api key|permission|401|403/i.test(message)) {
        return 'The AI API key was rejected. Check API_KEY in .env.';
    }

    return message;
}

// ─── Trim helper ───
function trimText(value, maxLength) {
    if (typeof value !== 'string') return '';
    if (value.length <= maxLength) return value;
    return value.slice(value.length - maxLength);
}

// ─── Build LangChain messages ───
function buildMessages(action, code, language, prompt, conversationHistory, retrieval, imageBase64, fileName) {
    const { ragContext = [], manifest = '', digest = '' } = retrieval || {};

    const basePrompt = AI_SYSTEM_PROMPTS[action] || AI_SYSTEM_PROMPTS.chat;
    // `suggest` must emit bare code, so it gets no prose guidance appended.
    const systemPrompt = action === 'suggest' ? basePrompt : basePrompt + CONTEXT_GUIDANCE;

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

    // Project inventory — always present so "what files exist" is answerable
    // without depending on what similarity search happened to return.
    if (manifest) {
        userContent += `${manifest}\n\n---\n\n`;
    }

    // Full contents, only for project-wide questions where excerpts cannot do the job.
    if (digest) {
        userContent += `${digest}\n\n---\n\n`;
    }

    // Add RAG context if available (Phase 4)
    if (ragContext.length > 0) {
        userContent += '### Relevant code excerpts retrieved from this project:\n\n';
        ragContext.forEach((chunk) => {
            const location = chunk.filePath || chunk.fileName;
            const lines = chunk.startLine ? ` (lines ${chunk.startLine}-${chunk.endLine})` : '';
            userContent += `**${location}**${lines}:\n\`\`\`${chunk.language || ''}\n${chunk.text}\n\`\`\`\n\n`;
        });
        userContent += '---\n\n';
    }

    if (code) {
        userContent += `### File currently open in the editor${fileName ? `: ${fileName}` : ''}\n\n`;
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
async function getRAGContext(roomId, query, topK) {
    if (!roomId || !query) return [];

    try {
        const { searchSimilar } = require('./vectorStoreService');
        return await searchSimilar(roomId, query, topK);
    } catch (error) {
        // Vector store may not be initialized yet — fail silently
        console.warn('RAG retrieval skipped:', error.message);
        return [];
    }
}

/**
 * Build the text actually used as the retrieval query.
 *
 * Embedding a whole file as the query (what the quick actions used to do) produces
 * a vector that averages out to nothing in particular and matches everything
 * equally badly. Distinctive identifiers make a far sharper query.
 */
function buildRagQuery(options) {
    const parts = [];

    if (options.fileName) parts.push(options.fileName);
    if (options.prompt) parts.push(options.prompt);

    if (!options.prompt && options.code) {
        // No explicit question (a quick action) — distil the code into its
        // declared names and imports instead of using the raw body.
        const identifiers = [...options.code.matchAll(
            /(?:function|class|const|let|var|def|func|interface|type)\s+([A-Za-z_$][\w$]*)/g
        )].map((match) => match[1]);

        const imports = [...options.code.matchAll(
            /(?:require\(|from\s+)['"]([^'"]+)['"]/g
        )].map((match) => match[1]);

        const distinctive = [...new Set([...identifiers, ...imports])].slice(0, 30);

        parts.push(distinctive.length > 0 ? distinctive.join(' ') : options.code.slice(0, 600));
    }

    return parts.join(' ').trim();
}

/**
 * Assemble everything the model gets to see about the project.
 */
async function buildRetrievalContext(options) {
    const { isProjectWideQuery, buildProjectManifest, buildProjectDigest } =
        require('./projectContextService');

    if (!options.roomId) {
        return { ragContext: [], manifest: '', digest: '' };
    }

    const question = options.prompt || '';
    const projectWide = isProjectWideQuery(question);
    const ragQuery = buildRagQuery(options);

    const [manifest, digest, ragContext] = await Promise.all([
        buildProjectManifest(options.roomId),
        projectWide ? buildProjectDigest(options.roomId) : Promise.resolve(''),
        // A project-wide question already gets full contents; retrieval would
        // only duplicate it, so skip the embedding round-trip.
        projectWide
            ? Promise.resolve([])
            : getRAGContext(options.roomId, ragQuery, options.action === 'suggest' ? 4 : 8),
    ]);

    return { ragContext, manifest, digest, projectWide };
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
    const retrieval = await buildRetrievalContext({ ...options, action });
    const { ragContext } = retrieval;

    if (retrieval.projectWide) {
        console.log('[RAG] 📚 Project-wide question — sent full manifest and file contents');
    } else if (ragContext.length > 0) {
        console.log(`[RAG] ✅ Retrieved ${ragContext.length} chunks from: ${[...new Set(ragContext.map(c => c.fileName))].join(', ')} (scores: ${ragContext.map(c => c.score?.toFixed(3)).join(', ')})`);
    } else {
        console.log('[RAG] ⚠️ No relevant context found (no files indexed or low similarity)');
    }

    const messages = buildMessages(
        action,
        options.code,
        options.language,
        options.prompt,
        options.conversationHistory,
        retrieval,
        options.imageBase64,
        options.fileName
    );

    let response = null;
    const chain = availableModels();
    let selectedModel = chain[0] || 'gemini-2.5-flash';
    let toolCalls = [];
    let lastError = null;

    for (const modelName of chain) {
        selectedModel = modelName;

        try {
            const model = createModel(modelName, {
                temperature: action === 'suggest' ? 0.3 : 0.7,
                // Gemini 3 models spend part of the output budget on internal
                // reasoning. A 512-token cap left nothing for the actual answer and
                // came back empty, so `suggest` gets real headroom too.
                maxTokens: action === 'suggest' ? 1536 : 2048,
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
            lastError = err;
            noteModelFailure(modelName, err);
            console.error(`Model ${modelName} failed:`, err.message);
            response = null;
            // try next model
        }
    }

    if (!response) {
        const error = new Error(friendlyError(lastError));
        error.statusCode = 502;
        throw error;
    }

    const text = extractText(response.content);

    // A tool-call-only reply carries no prose. That is a valid answer for bugfix
    // and review — rejecting it as "empty" threw away the fix the user asked for.
    if (!text && toolCalls.length === 0) {
        const error = new Error('AI returned an empty response.');
        error.statusCode = 502;
        throw error;
    }

    const fixes = toolCalls
        .filter((tc) => tc.name === 'apply_code_fix')
        .map((tc) => tc.args);

    // Some models answer a bugfix request purely as a function call, with no prose
    // at all. Rendering an empty bubble next to an "Apply Fix" button reads as a
    // failure, so describe the fixes instead.
    const summarised = fixes.length > 0
        ? [
            `Found ${fixes.length} issue${fixes.length === 1 ? '' : 's'}:`,
            '',
            ...fixes.map((fix, i) => [
                `**${i + 1}. ${fix.description}** — \`${fix.fileName}\``,
                '',
                '```diff',
                ...String(fix.oldCode || '').split('\n').map((l) => `- ${l}`),
                ...String(fix.newCode || '').split('\n').map((l) => `+ ${l}`),
                '```',
            ].join('\n')),
        ].join('\n')
        : '';

    const result = {
        response: text || summarised,
        action,
        model: selectedModel,
        usage: response.usage_metadata || null,
        ragSources: ragContext.map((c) => ({
            fileName: c.filePath || c.fileName,
            startLine: c.startLine,
            endLine: c.endLine,
            score: parseFloat((c.score || 0).toFixed(3)),
        })),
    };

    // Phase 6: Include tool calls (fixes) in response
    if (fixes.length > 0) {
        result.fixes = fixes;
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
    const retrieval = await buildRetrievalContext({ ...options, action });
    const { ragContext } = retrieval;

    if (retrieval.projectWide) {
        console.log('[RAG-Stream] 📚 Project-wide question — sent full manifest and file contents');
    } else if (ragContext.length > 0) {
        console.log(`[RAG-Stream] ✅ Retrieved ${ragContext.length} chunks from: ${[...new Set(ragContext.map(c => c.fileName))].join(', ')}`);
    }

    const messages = buildMessages(
        action,
        options.code,
        options.language,
        options.prompt,
        options.conversationHistory,
        retrieval,
        options.imageBase64,
        options.fileName
    );

    // The streaming path used to pin AI_MODELS[0] with no fallback, so a single
    // 429 on the primary model killed the assistant outright — and streaming is
    // what the UI uses by default.
    let usedModel = null;
    let lastError = null;

    for (const modelName of availableModels()) {
        const model = createModel(modelName, {
            temperature: action === 'suggest' ? 0.3 : 0.7,
            maxTokens: action === 'suggest' ? 1536 : 2048,
            streaming: true,
        });

        let emittedAnything = false;

        try {
            const stream = await model.stream(messages);

            for await (const chunk of stream) {
                const text = extractText(chunk.content);
                if (!text) continue;

                emittedAnything = true;
                yield { type: 'token', content: text };
            }

            usedModel = modelName;
            break;
        } catch (err) {
            lastError = err;
            noteModelFailure(modelName, err);
            console.error(`Streaming model ${modelName} failed:`, err.message);

            // Once tokens are on the wire we cannot silently restart on another
            // model — the user would see two different answers spliced together.
            if (emittedAnything) {
                throw new Error(friendlyError(err));
            }
            // Nothing emitted yet: safe to try the next model.
        }
    }

    if (!usedModel) {
        throw new Error(friendlyError(lastError));
    }

    yield {
        type: 'done',
        model: usedModel,
        ragSources: ragContext.map((c) => ({
            fileName: c.filePath || c.fileName,
            startLine: c.startLine,
            endLine: c.endLine,
            score: parseFloat((c.score || 0).toFixed(3)),
        })),
    };
}

module.exports = {
    askAI,
    askAIStream,
    extractText,
    friendlyError,
    availableModels,
    noteModelFailure,
};
