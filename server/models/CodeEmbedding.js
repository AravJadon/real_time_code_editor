const mongoose = require('mongoose');

const codeEmbeddingSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            index: true,
        },
        fileId: {
            type: String,
            required: true,
            index: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        filePath: {
            type: String,
            default: '',
        },
        language: {
            type: String,
            default: 'javascript',
        },
        chunk: {
            type: String,
            required: true,
        },
        chunkIndex: {
            type: Number,
            default: 0,
        },
        startLine: {
            type: Number,
            default: 0,
        },
        endLine: {
            type: Number,
            default: 0,
        },
        // Hash of the whole file the chunk came from — lets indexing skip
        // files whose content has not changed since the last pass.
        contentHash: {
            type: String,
            default: '',
            index: true,
        },
        embedding: {
            type: [Number],
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

codeEmbeddingSchema.index({ roomId: 1, fileId: 1 });

module.exports = mongoose.model('CodeEmbedding', codeEmbeddingSchema);
