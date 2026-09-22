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
