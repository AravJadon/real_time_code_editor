const { isDBConnected } = require('../db');
const CodeEmbedding = require('../models/CodeEmbedding');
const { embedText, embedDocuments, chunkCode } = require('./embeddingService');

// ─── In-memory fallback for local dev without MongoDB ───
const memoryStore = new Map(); // roomId -> [{ fileId, fileName, language, chunk, chunkIndex, embedding }]

// ─── Debounce map to avoid re-indexing on every keystroke ───
const indexTimers = new Map();
const INDEX_DEBOUNCE_MS = 3000;

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
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
 * Index a single file's code into the vector store.
 * Deletes existing embeddings for the file, chunks the code, embeds, and stores.
 */
async function indexFile(roomId, fileId, fileName, code, language) {
    if (!code || code.trim().length < 10) return;

    const chunks = chunkCode(code);
    if (chunks.length === 0) return;

    let vectors;
    try {
        vectors = await embedDocuments(chunks);
    } catch (error) {
        console.warn(`Embedding failed for ${fileName}:`, error.message);
        return;
    }

    if (isDBConnected()) {
        // Remove old embeddings for this file
        await CodeEmbedding.deleteMany({ roomId, fileId });

        // Insert new embeddings
        const docs = chunks.map((chunk, i) => ({
            roomId,
            fileId,
            fileName,
            language: language || 'javascript',
            chunk,
            chunkIndex: i,
            embedding: vectors[i],
        }));

        await CodeEmbedding.insertMany(docs);
    } else {
        // In-memory fallback
        const roomDocs = memoryStore.get(roomId) || [];
        // Remove old entries for this file
        const filtered = roomDocs.filter((doc) => doc.fileId !== fileId);

        chunks.forEach((chunk, i) => {
            filtered.push({
                fileId,
                fileName,
                language: language || 'javascript',
                chunk,
                chunkIndex: i,
                embedding: vectors[i],
            });
        });

        memoryStore.set(roomId, filtered);
    }

    console.log(`Indexed ${chunks.length} chunks for ${fileName} in room ${roomId}`);
}

/**
 * Debounced version of indexFile — waits for user to stop typing.
 */
function indexFileDebounced(roomId, fileId, fileName, code, language) {
    const key = `${roomId}:${fileId}`;
    const existingTimer = indexTimers.get(key);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        indexTimers.delete(key);
        indexFile(roomId, fileId, fileName, code, language).catch((err) => {
            console.warn('Background indexing failed:', err.message);
        });
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
 */
async function indexAllFiles(roomId, files) {
    const textFiles = files.filter((f) => f.type === 'file' && f.code && f.code.trim().length > 10);

    for (const file of textFiles) {
        await indexFile(roomId, file._id.toString ? file._id.toString() : file._id, file.name, file.code, file.language);
    }
}

/**
 * Search for code chunks similar to the query.
 * Returns top-K results with similarity scores.
 */
async function searchSimilar(roomId, query, topK = 5) {
    if (!query || query.trim().length < 3) return [];

    let queryVector;
    try {
        queryVector = await embedText(query);
    } catch (error) {
        console.warn('Query embedding failed:', error.message);
        return [];
    }

    let results = [];

    if (isDBConnected()) {
        const allDocs = await CodeEmbedding.find({ roomId }).lean();

        results = allDocs.map((doc) => ({
            fileId: doc.fileId,
            fileName: doc.fileName,
            language: doc.language,
            text: doc.chunk,
            chunkIndex: doc.chunkIndex,
            score: cosineSimilarity(queryVector, doc.embedding),
        }));
    } else {
        const roomDocs = memoryStore.get(roomId) || [];

        results = roomDocs.map((doc) => ({
            fileId: doc.fileId,
            fileName: doc.fileName,
            language: doc.language,
            text: doc.chunk,
            chunkIndex: doc.chunkIndex,
            score: cosineSimilarity(queryVector, doc.embedding),
        }));
    }

    // Sort by similarity score descending, return top-K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK).filter((r) => r.score > 0.3);
}

module.exports = {
    indexFile,
    indexFileDebounced,
    removeFileEmbeddings,
    indexAllFiles,
    searchSimilar,
};
