const { isDBConnected } = require('../db');
const ChatHistory = require('../models/ChatHistory');

// Same in-memory fallback the file and vector stores use. Without it the whole
// "persistent chat history" feature silently does nothing whenever MongoDB is
// unreachable — the UI just shows an empty panel with no explanation.
const memoryHistory = new Map(); // roomId -> [message]

const MAX_MESSAGES_PER_ROOM = 100;

function nowIso() {
    return new Date().toISOString();
}

/**
 * Append messages to a room's history. Never throws: a chat reply must still
 * reach the user even if persistence fails.
 */
async function appendMessages(roomId, messages) {
    if (!roomId || !Array.isArray(messages) || messages.length === 0) return;

    const entries = messages
        .filter((msg) => msg && msg.content)
        .map((msg) => ({
            roomId,
            role: msg.role,
            content: msg.content,
            action: msg.action || 'chat',
            model: msg.model || null,
            fixes: msg.fixes || [],
        }));

    if (entries.length === 0) return;

    try {
        if (isDBConnected()) {
            await ChatHistory.create(entries);
            return;
        }

        const existing = memoryHistory.get(roomId) || [];
        const stamped = entries.map((entry) => ({ ...entry, createdAt: nowIso() }));
        const combined = [...existing, ...stamped];

        // Keep the tail, matching the 100-message cap the route reads with.
        memoryHistory.set(roomId, combined.slice(-MAX_MESSAGES_PER_ROOM));
    } catch (error) {
        console.warn('Failed to save chat history:', error.message);
    }
}

async function getMessages(roomId) {
    if (!roomId) return [];

    try {
        if (isDBConnected()) {
            return await ChatHistory.find({ roomId })
                .sort({ createdAt: 1 })
                .limit(MAX_MESSAGES_PER_ROOM)
                .lean();
        }

        return memoryHistory.get(roomId) || [];
    } catch (error) {
        console.warn('Failed to load chat history:', error.message);
        return [];
    }
}

async function clearMessages(roomId) {
    if (!roomId) return;

    if (isDBConnected()) {
        await ChatHistory.deleteMany({ roomId });
    }

    memoryHistory.delete(roomId);
}

module.exports = {
    appendMessages,
    getMessages,
    clearMessages,
};
