const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');

let embeddingsModel = null;

function getEmbeddingsModel() {
    if (!embeddingsModel) {
        if (!process.env.API_KEY) {
            throw new Error('API_KEY is required for embeddings.');
        }
        embeddingsModel = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.API_KEY,
            model: 'text-embedding-004',
        });
    }
    return embeddingsModel;
}

/**
 * Embed a single text string into a vector.
 */
async function embedText(text) {
    const model = getEmbeddingsModel();
    const vector = await model.embedQuery(text);
    return vector;
}

/**
 * Embed multiple text strings into vectors.
 */
async function embedDocuments(texts) {
    const model = getEmbeddingsModel();
    const vectors = await model.embedDocuments(texts);
    return vectors;
}

/**
 * Split code into meaningful chunks.
 * Strategy: split by function/class boundaries, then by line groups.
 */
function chunkCode(code, maxChunkSize = 500) {
    if (!code || code.trim() === '') return [];

    const lines = code.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    // Patterns that indicate a new logical block
    const blockPatterns = [
        /^(export\s+)?(async\s+)?function\s/,
        /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
        /^(export\s+)?class\s/,
        /^(export\s+)?module\.exports/,
        /^(export\s+default)/,
        /^(app|router)\.(get|post|put|delete|patch|use)\(/,
        /^describe\(|^it\(|^test\(/,
    ];

    for (const line of lines) {
        const isBlockBoundary = blockPatterns.some((p) => p.test(line.trim()));

        if (isBlockBoundary && currentChunk.length > 0 && currentSize > 50) {
            chunks.push(currentChunk.join('\n'));
            currentChunk = [];
            currentSize = 0;
        }

        currentChunk.push(line);
        currentSize += line.length + 1;

        if (currentSize >= maxChunkSize) {
            chunks.push(currentChunk.join('\n'));
            currentChunk = [];
            currentSize = 0;
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    return chunks.filter((c) => c.trim().length > 10);
}

module.exports = {
    embedText,
    embedDocuments,
    chunkCode,
};
