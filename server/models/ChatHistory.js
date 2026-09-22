const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        action: {
            type: String,
            default: 'chat',
        },
        model: {
            type: String,
            default: null,
        },
        fixes: {
            type: Array,
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

// Auto-cleanup: limit to 100 messages per room
chatHistorySchema.index({ roomId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
