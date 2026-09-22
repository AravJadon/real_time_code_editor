const { isDBConnected } = require('../db');
const CodeEmbedding = require('../models/CodeEmbedding');
const {
    embedText,
    embedDocuments,
    chunkCode,
    hashContent,
    buildEmbeddingText,
} = require('./embeddingService');

// ─── In-memory fallback for local dev without MongoDB ───
const memoryStore = new Map(); // roomId -> [{ fileId, fileName, ..., embedding }]

// ─── Debounce map to avoid re-indexing on every keystroke ───
const indexTimers = new Map();
const INDEX_DEBOUNCE_MS = 3000;

// ─── Retrieval tuning ───
// Lexical matching catches what embeddings miss: exact identifiers, file names,
// and rare tokens. Vector search stays the primary signal.
const VECTOR_WEIGHT = 0.75;
const LEXICAL_WEIGHT = 0.25;

// An absolute cosine floor throws away good hits whenever a room's content sits
// in a lower score band. A relative floor adapts to whatever the best hit scored.
const ABSOLUTE_SCORE_FLOOR = 0.15;
const RELATIVE_SCORE_FLOOR = 0.6;
const MIN_RESULTS = 3;

const INDEX_CONCURRENCY = 3;

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it', 'this',
    'that', 'these', 'those', 'i', 'you', 'me', 'my', 'we', 'do', 'does', 'did',
    'what', 'how', 'why', 'when', 'where', 'which', 'who', 'can', 'could', 'would',
    'should', 'please', 'tell', 'show', 'give', 'explain', 'about', 'all', 'any',
]);

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Split a query into meaningful search terms.
 * Also splits camelCase/snake_case so "useWebRTC" matches "use", "web", "rtc".
 */
function tokenize(text) {
    if (!text) return [];

    const raw = String(text)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

    return [...new Set(raw)];
}

/**
 * Lexical overlap score in [0, 1]. File name matches count double because a
 * query naming a file is almost always asking about that file.
 */
function lexicalScore(terms, doc) {
    if (terms.length === 0) return 0;

    const haystack = `${doc.filePath || ''} ${doc.fileName || ''}`.toLowerCase();
    const body = (doc.chunk || doc.text || '').toLowerCase();

    let matched = 0;

    for (const term of terms) {
        const inName = haystack.includes(term);
        const inBody = body.includes(term);

        if (inName && inBody) matched += 1;
        else if (inName) matched += 0.8;
        else if (inBody) matched += 0.5;
    }

    return Math.min(1, matched / terms.length);
}

/**
 * Run async work over a list with bounded concurrency.
 * Indexing a whole room serially is slow; doing it all at once hits rate limits.
 */
async function mapWithConcurrency(items, limit, worker) {
    const results = [];
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}

function toId(value) {
    if (value === null || value === undefined) return null;
    return value.toString ? value.toString() : String(value);
}

/**
 * Has this exact file content already been indexed?
 */
async function isAlreadyIndexed(roomId, fileId, contentHash) {
    if (isDBConnected()) {
        const existing = await CodeEmbedding.findOne({ roomId, fileId, contentHash }).select('_id').lean();
        return Boolean(existing);
    }

    const roomDocs = memoryStore.get(roomId) || [];
    return roomDocs.some((doc) => doc.fileId === fileId && doc.contentHash === contentHash);
}

/**
 * Index a single file's code into the vector store.
 * Skips work entirely when the file content is unchanged since the last pass.
 */
async function indexFile(roomId, fileId, fileName, code, language, options = {}) {
    if (!code || code.trim().length < 10) return;

    const contentHash = hashContent(code);

    if (!options.force && (await isAlreadyIndexed(roomId, fileId, contentHash))) {
        return;
    }

    const chunks = chunkCode(code);
    if (chunks.length === 0) return;

    const filePath = options.filePath || fileName;

    // Embed the chunk together with its file identity, store the chunk raw.
    const embeddingInputs = chunks.map((chunk) =>
        buildEmbeddingText(chunk, fileName, language, filePath)
    );

    let vectors;
    try {
        vectors = await embedDocuments(embeddingInputs);
    } catch (error) {
        console.warn(`Embedding failed for ${fileName}:`, error.message);
        return;
    }

    if (vectors.length !== chunks.length) {
        console.warn(`Embedding count mismatch for ${fileName}, skipping index.`);
        return;
    }

    const docs = chunks.map((chunk, i) => ({
        roomId,
        fileId,
        fileName,
        filePath,
        language: language || 'javascript',
        chunk: chunk.text,
        chunkIndex: i,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        contentHash,
        embedding: vectors[i],
    }));

    if (isDBConnected()) {
        await CodeEmbedding.deleteMany({ roomId, fileId });
        await CodeEmbedding.insertMany(docs);
    } else {
        const roomDocs = memoryStore.get(roomId) || [];
        const filtered = roomDocs.filter((doc) => doc.fileId !== fileId);
        filtered.push(...docs);
        memoryStore.set(roomId, filtered);
    }

    console.log(`Indexed ${chunks.length} chunks for ${filePath} in room ${roomId}`);
}

/**
 * Debounced version of indexFile — waits for user to stop typing.
 *
 * `options.resolveMeta` defers the file-name/language lookup until the debounce
 * actually fires, so a keystroke does not cost a database round-trip.
 */
function indexFileDebounced(roomId, fileId, fileName, code, language, options = {}) {
    const key = `${roomId}:${fileId}`;
    const existingTimer = indexTimers.get(key);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
        indexTimers.delete(key);

        try {
            let name = fileName;
            let lang = language;
            let resolvedOptions = options;

            if (options.resolveMeta) {
                const meta = await options.resolveMeta();
                if (!meta) return;
                name = meta.fileName || name;
                lang = meta.language || lang;
                resolvedOptions = { ...options, filePath: meta.filePath || options.filePath };
            }

            if (!name) return;

            await indexFile(roomId, fileId, name, code, lang, resolvedOptions);
        } catch (err) {
            console.warn('Background indexing failed:', err.message);
        }
    }, INDEX_DEBOUNCE_MS);

    indexTimers.set(key, timer);
}

/**
 * Remove all embeddings for a file.
 */
async function removeFileEmbeddings(roomId, fileId) {
    if (isDBConnected()) {
        await CodeEmbedding.deleteMany({ roomId, fileId });
    } else {
        const roomDocs = memoryStore.get(roomId) || [];
        memoryStore.set(roomId, roomDocs.filter((doc) => doc.fileId !== fileId));
    }
}

/**
 * Index all files in a room (called on room creation/join).
 *
 * Runs on every join, so the content-hash check in indexFile matters: without it
 * each joining user re-embeds the entire room, which trips the embedding API's
 * rate limit and leaves the store partially or completely empty.
 */
async function indexAllFiles(roomId, files) {
    const { buildPathMap } = require('./projectContextService');
    const paths = buildPathMap(files);

    const textFiles = files.filter(
        (f) => f.type === 'file' && f.code && f.code.trim().length > 10
    );

    if (textFiles.length === 0) return;

    await mapWithConcurrency(textFiles, INDEX_CONCURRENCY, async (file) => {
        const fileId = toId(file._id);
        try {
            await indexFile(roomId, fileId, file.name, file.code, file.language, {
                filePath: paths.get(fileId) || file.name,
            });
        } catch (error) {
            console.warn(`Indexing ${file.name} failed:`, error.message);
        }
    });
}

/**
 * Pick the top-K results while guaranteeing every file gets a shot.
 *
 * Plain global sorting lets one file's chunks occupy every slot, which is why a
 * room with several files could still answer as if only the first file existed.
 * Round-robin takes each file's best chunk first, then second-best, and so on.
 */
function diversify(results, topK, maxPerFile) {
    const byFile = new Map();

    for (const result of results) {
        const key = result.fileId || result.fileName;
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key).push(result);
    }

    // Order files by their single best chunk.
    const buckets = [...byFile.values()].sort((a, b) => b[0].score - a[0].score);

    const cap = maxPerFile || Math.max(2, Math.ceil(topK / Math.max(1, buckets.length)));
    const picked = [];

    for (let round = 0; round < cap && picked.length < topK; round++) {
        for (const bucket of buckets) {
            if (picked.length >= topK) break;
            if (bucket[round]) picked.push(bucket[round]);
        }
    }

    return picked.sort((a, b) => b.score - a.score);
}

/**
 * Search for code chunks relevant to the query.
 *
 * Hybrid: cosine similarity blended with lexical overlap, then diversified across
 * files, then filtered against a floor relative to the best hit.
 */
async function searchSimilar(roomId, query, topK = 8, options = {}) {
    if (!roomId || !query || query.trim().length < 3) return [];

    let queryVector;
    try {
        queryVector = await embedText(query);
    } catch (error) {
        console.warn('Query embedding failed:', error.message);
        queryVector = null;
    }

    let docs;
    if (isDBConnected()) {
        docs = await CodeEmbedding.find({ roomId }).lean();
    } else {
        docs = memoryStore.get(roomId) || [];
    }

    if (!docs || docs.length === 0) return [];

    const terms = tokenize(query);

    let results = docs.map((doc) => {
        const vectorScore = queryVector ? cosineSimilarity(queryVector, doc.embedding) : 0;
        const lexical = lexicalScore(terms, doc);

        // If embedding the query failed, fall back to pure lexical rather than
        // returning nothing at all.
        const score = queryVector
            ? VECTOR_WEIGHT * vectorScore + LEXICAL_WEIGHT * lexical
            : lexical;

        return {
            fileId: doc.fileId,
            fileName: doc.fileName,
            filePath: doc.filePath || doc.fileName,
            language: doc.language,
            text: doc.chunk,
            chunkIndex: doc.chunkIndex,
            startLine: doc.startLine,
            endLine: doc.endLine,
            vectorScore,
            lexicalScore: lexical,
            score,
        };
    });

    results.sort((a, b) => b.score - a.score);

    const best = results[0].score;
    const floor = Math.max(ABSOLUTE_SCORE_FLOOR, best * RELATIVE_SCORE_FLOOR);

    const above = results.filter((r) => r.score >= floor);

    // Never hand the model an empty context when the room does have content —
    // a weak hit is more useful than the assistant inventing an answer.
    const candidates = above.length >= MIN_RESULTS
        ? above
        : results.slice(0, Math.min(MIN_RESULTS, results.length));

    return diversify(candidates, topK, options.maxPerFile);
}

module.exports = {
    indexFile,
    indexFileDebounced,
    removeFileEmbeddings,
    indexAllFiles,
    searchSimilar,
};
