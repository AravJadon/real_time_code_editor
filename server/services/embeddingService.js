const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const crypto = require('crypto');

// ─── Configuration ───
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-004';
const EMBED_BATCH_SIZE = 40;
const EMBED_MAX_RETRIES = 3;
const EMBED_RETRY_BASE_MS = 600;

// Gemini embeddings are asymmetric: a document and a question about that document
// must be embedded with different task types, otherwise every cosine score collapses
// into the same narrow band and ranking becomes close to random.
const TASK_DOCUMENT = 'RETRIEVAL_DOCUMENT';
const TASK_QUERY = 'RETRIEVAL_QUERY';

const modelCache = new Map();
let taskTypeSupported = true;

function getEmbeddingsModel(taskType) {
    const cacheKey = taskTypeSupported ? taskType : 'default';

    if (modelCache.has(cacheKey)) {
        return modelCache.get(cacheKey);
    }

    if (!process.env.API_KEY) {
        throw new Error('API_KEY is required for embeddings.');
    }

    const model = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.API_KEY,
        model: EMBEDDING_MODEL,
        ...(taskTypeSupported ? { taskType } : {}),
    });

    modelCache.set(cacheKey, model);
    return model;
}

/**
 * If the installed SDK rejects taskType, fall back to plain embeddings once
 * instead of losing retrieval entirely.
 */
function disableTaskType(reason) {
    if (!taskTypeSupported) return;
    taskTypeSupported = false;
    modelCache.clear();
    console.warn(`Embeddings: taskType unsupported, falling back to default (${reason})`);
}

function isTaskTypeError(error) {
    const message = String(error && error.message).toLowerCase();
    return message.includes('tasktype') || message.includes('task_type');
}

function isRetryableError(error) {
    const message = String(error && error.message).toLowerCase();
    const status = error && (error.status || error.statusCode);

    if (status === 429 || (status >= 500 && status < 600)) return true;

    return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('quota') ||
        message.includes('overloaded') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('etimedout')
    );
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff. Rate limiting is the single most common reason
 * indexing silently produces an empty vector store.
 */
async function withRetry(fn, label) {
    let lastError;

    for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (taskTypeSupported && isTaskTypeError(error)) {
                disableTaskType(error.message);
                continue;
            }

            if (!isRetryableError(error) || attempt === EMBED_MAX_RETRIES) {
                throw error;
            }

            const delay = EMBED_RETRY_BASE_MS * Math.pow(2, attempt);
            console.warn(`Embeddings: ${label} rate limited, retrying in ${delay}ms`);
            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Embed a single text string into a vector. Used for search queries.
 */
async function embedText(text) {
    return withRetry(
        () => getEmbeddingsModel(TASK_QUERY).embedQuery(text),
        'embedQuery'
    );
}

/**
 * Embed multiple text strings into vectors. Used for indexing documents.
 * Batched so a large file does not blow the per-request payload limit.
 */
async function embedDocuments(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const vectors = [];

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
        const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
        const batchVectors = await withRetry(
            () => getEmbeddingsModel(TASK_DOCUMENT).embedDocuments(batch),
            `embedDocuments[${i}]`
        );
        vectors.push(...batchVectors);
    }

    return vectors;
}

/**
 * Stable hash of file content, used to skip re-embedding unchanged files.
 */
function hashContent(text) {
    return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

/**
 * Split code into meaningful chunks.
 * Strategy: split on function/class boundaries, then by size, carrying a few
 * lines of overlap so a definition split across a boundary stays retrievable.
 *
 * Returns [{ text, startLine, endLine }] with 1-based inclusive line numbers.
 */
function chunkCode(code, options = {}) {
    if (!code || code.trim() === '') return [];

    const opts = typeof options === 'number' ? { maxChunkSize: options } : options;
    const maxChunkSize = opts.maxChunkSize || 900;
    const overlapLines = opts.overlapLines ?? 3;
    const minChunkChars = opts.minChunkChars ?? 10;

    const lines = code.split('\n');
    const chunks = [];

    let currentLines = [];
    let currentSize = 0;
    let startLine = 1;

    // Patterns that indicate a new logical block
    const blockPatterns = [
        /^(export\s+)?(async\s+)?function\s/,
        /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
        /^(export\s+)?class\s/,
        /^(export\s+)?module\.exports/,
        /^(export\s+default)/,
        /^(app|router)\.(get|post|put|delete|patch|use)\(/,
        /^describe\(|^it\(|^test\(/,
        /^(public|private|protected)?\s*(static\s+)?\w+\s*\([^)]*\)\s*\{/,
        /^def\s|^class\s/,
        /^func\s/,
    ];

    const flush = (endLine, carryOverlap) => {
        const text = currentLines.join('\n');

        if (text.trim().length >= minChunkChars) {
            chunks.push({ text, startLine, endLine });
        }

        if (carryOverlap && overlapLines > 0) {
            const carried = currentLines.slice(-overlapLines);
            currentLines = carried;
            currentSize = carried.reduce((sum, line) => sum + line.length + 1, 0);
            startLine = Math.max(1, endLine - carried.length + 1);
        } else {
            currentLines = [];
            currentSize = 0;
            startLine = endLine + 1;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        const isBlockBoundary = blockPatterns.some((p) => p.test(line.trim()));

        // Start a fresh chunk at a block boundary — no overlap, the boundary is clean.
        if (isBlockBoundary && currentLines.length > 0 && currentSize > 50) {
            flush(lineNumber - 1, false);
        }

        currentLines.push(line);
        currentSize += line.length + 1;

        // Size-forced split — overlap so we do not cut a statement in half.
        if (currentSize >= maxChunkSize) {
            flush(lineNumber, true);
        }
    }

    if (currentLines.length > 0) {
        const text = currentLines.join('\n');
        if (text.trim().length >= minChunkChars) {
            chunks.push({ text, startLine, endLine: lines.length });
        }
    }

    return chunks;
}

/**
 * Prefix a chunk with its file identity before embedding.
 *
 * Without this the vector only describes the code body, so "what does Editor.jsx do"
 * has nothing to match against — the filename never appears in the embedded text.
 * The prefix is embedded but never shown to the user; `chunk.text` stays raw.
 */
function buildEmbeddingText(chunk, fileName, language, filePath) {
    const location = filePath || fileName;
    const header = `// File: ${location}${language ? ` (${language})` : ''}`;
    const lineInfo = chunk.startLine ? ` lines ${chunk.startLine}-${chunk.endLine}` : '';
    return `${header}${lineInfo}\n${chunk.text}`;
}

module.exports = {
    embedText,
    embedDocuments,
    chunkCode,
    hashContent,
    buildEmbeddingText,
};
