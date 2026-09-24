const ACTIONS = require('../Actions');
const fileService = require('../services/fileService');
const vectorStore = require('../services/vectorStoreService');

const userSocketMap = {};
const callParticipantsByRoom = new Map();

function toFileId(value) {
    if (value === null || value === undefined) return null;
    return value.toString ? value.toString() : String(value);
}

function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('socket connected', socket.id);

        socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
            try {
                userSocketMap[socket.id] = username;
                socket.join(roomId);

                const room = await fileService.findOrCreateRoom(roomId);
                const clients = getAllConnectedClients(io, roomId);

                clients.forEach((client) => {
                    io.to(client.socketId).emit(ACTIONS.JOINED, {
                        clients,
                        username,
                        socketId: socket.id,
                    });
                });

                const files = await fileService.findFilesByRoom(roomId);
                io.to(socket.id).emit(ACTIONS.SYNC_FILES, {
                    files,
                    mainFileId: room.mainFileId,
                });

                // Phase 3: Index all files for RAG on room join
                vectorStore.indexAllFiles(roomId, files).catch((err) => {
                    console.warn('Background indexing on join failed:', err.message);
                });

                sendCallRoomInfoToSocket(io, socket, roomId);
            } catch (error) {
                console.error('Error in JOIN handler:', error);
                socket.emit('error_message', {
                    message: 'Failed to join room. Please try again.',
                });
            }
        });

        socket.on(ACTIONS.FILE_CREATE, async ({ roomId, name, type, parentId }) => {
            try {
                // Strip any directory separators — nesting is handled by parentId.
                // Without this, a user typing "folder1/file.py" into the prompt
                // gets a file literally named "folder1/file.py" instead of "file.py"
                // nested inside the folder.
                const safeName = name.replace(/\\/g, '/').split('/').filter(Boolean).pop() || name;

                const file = await fileService.createFile({
                    roomId,
                    name: safeName,
                    type,
                    parentId: parentId || null,
                });

                io.in(roomId).emit(ACTIONS.FILE_CREATE, { file });

                // Index immediately if the new file already has content, so it is
                // retrievable without waiting for someone to edit it.
                if (file.type === 'file' && file.code) {
                    // Resolve the nested path so the embedding carries
                    // "components/Editor.jsx", not a bare "Editor.jsx".
                    const roomFiles = await fileService.findFilesByRoom(roomId);
                    const { buildPathMap } = require('../services/projectContextService');
                    const filePath = buildPathMap(roomFiles).get(toFileId(file._id));

                    vectorStore
                        .indexFile(roomId, toFileId(file._id), file.name, file.code, file.language, { filePath })
                        .catch(() => {});
                }
            } catch (error) {
                console.error('Error creating file:', error);
            }
        });

        socket.on(ACTIONS.FILE_RENAME, async ({ roomId, fileId, name }) => {
            try {
                const file = await fileService.renameFile(fileId, name);
                io.in(roomId).emit(ACTIONS.FILE_RENAME, { file });

                // The file name is part of what gets embedded, so a rename makes
                // the stored vectors stale — force a rebuild.
                if (file && file.type === 'file' && file.code) {
                    const roomFiles = await fileService.findFilesByRoom(roomId);
                    const { buildPathMap } = require('../services/projectContextService');
                    const filePath = buildPathMap(roomFiles).get(toFileId(file._id));

                    vectorStore
                        .indexFile(roomId, toFileId(file._id), name, file.code, file.language, { force: true, filePath })
                        .catch(() => {});
                }
            } catch (error) {
                console.error('Error renaming file:', error);
            }
        });

        socket.on(ACTIONS.FILE_DELETE, async ({ roomId, fileId }) => {
            try {
                const allDeletedIds = await fileService.collectDescendantIds(fileId);
                allDeletedIds.push(fileId);

                await fileService.deleteFileRecursive(fileId);
                io.in(roomId).emit(ACTIONS.FILE_DELETE, { fileId, allDeletedIds });

                // Phase 3: Remove embeddings for deleted files
                for (const deletedId of allDeletedIds) {
                    vectorStore.removeFileEmbeddings(roomId, deletedId).catch(() => {});
                }
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        });

        socket.on(ACTIONS.SET_MAIN_FILE, async ({ roomId, fileId }) => {
            try {
                await fileService.setMainFile(roomId, fileId);
                io.in(roomId).emit(ACTIONS.SET_MAIN_FILE, { fileId });
            } catch (error) {
                console.error('Error setting main file:', error);
            }
        });

        socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, fileId, code }) => {
            socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { fileId, code });

            if (!fileId) return;

            try {
                await fileService.updateFileCode(fileId, code);

                // Phase 3: Debounced re-index for RAG. The file lookup runs inside
                // the debounce so it happens once per pause, not once per keystroke.
                vectorStore.indexFileDebounced(roomId, fileId, null, code, null, {
                    resolveMeta: async () => {
                        const files = await fileService.findFilesByRoom(roomId);
                        const file = files.find((f) => toFileId(f._id) === fileId);
                        if (!file) return null;

                        const { buildPathMap } = require('../services/projectContextService');
                        const filePath = buildPathMap(files).get(fileId);

                        return { fileName: file.name, language: file.language, filePath };
                    },
                });
            } catch (error) {
                console.error('Error saving code change:', error);
            }
        });

        socket.on(ACTIONS.LANGUAGE_CHANGE, async ({ roomId, fileId, language }) => {
            socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, {
                fileId,
                language,
            });

            if (!fileId) return;

            try {
                await fileService.updateFileLanguage(fileId, language);
            } catch (error) {
                console.error('Error saving language change:', error);
            }
        });

        socket.on(ACTIONS.GET_VIDEO_CALL_ROOM_INFO, ({ roomId }) => {
            sendCallRoomInfoToSocket(io, socket, roomId);
        });

        socket.on('user_joined_call', ({ roomId }) => {
            const existingParticipants = addCallParticipant(roomId, socket.id);

            socket.emit(ACTIONS.VIDEO_CALL_PARTICIPANTS, {
                participants: existingParticipants.map((socketId) => ({
                    socketId,
                    username: userSocketMap[socketId] || 'Unknown',
                })),
            });

            existingParticipants.forEach((socketId) => {
                io.to(socketId).emit('user_joined_call', {
                    socketId: socket.id,
                    username: userSocketMap[socket.id] || 'Unknown',
                });
            });

            broadcastCallRoomInfo(io, roomId);
        });

        socket.on(ACTIONS.VIDEO_CALL_OFFER, ({ signal, targetSocketId }) => {
            if (!signal || !targetSocketId) return;

            io.to(targetSocketId).emit(ACTIONS.VIDEO_CALL_OFFER, {
                signal,
                callerSocketId: socket.id,
            });
        });

        socket.on(ACTIONS.VIDEO_CALL_ANSWER, ({ signal, targetSocketId }) => {
            if (!signal || !targetSocketId) return;

            io.to(targetSocketId).emit(ACTIONS.VIDEO_CALL_ANSWER, {
                signal,
                answererSocketId: socket.id,
            });
        });

        socket.on(ACTIONS.ICE_CANDIDATE, ({ candidate, targetSocketId }) => {
            if (!candidate || !targetSocketId) return;

            io.to(targetSocketId).emit(ACTIONS.ICE_CANDIDATE, {
                candidate,
                senderSocketId: socket.id,
            });
        });

        socket.on(ACTIONS.VIDEO_CALL_END, ({ roomId }) => {
            if (removeCallParticipant(roomId, socket.id)) {
                socket.in(roomId).emit(ACTIONS.VIDEO_CALL_END, {
                    socketId: socket.id,
                });
                broadcastCallRoomInfo(io, roomId);
            }
        });

        socket.on('disconnecting', () => {
            const rooms = Array.from(socket.rooms);

            rooms.forEach((roomId) => {
                if (removeCallParticipant(roomId, socket.id)) {
                    socket.in(roomId).emit(ACTIONS.VIDEO_CALL_END, {
                        socketId: socket.id,
                    });
                    broadcastCallRoomInfo(io, roomId);
                }

                socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id],
                });
            });

            delete userSocketMap[socket.id];
        });
    });
}

function getAllConnectedClients(io, roomId) {
    const room = io.sockets.adapter.rooms.get(roomId) || [];

    return Array.from(room).map((socketId) => ({
        socketId,
        username: userSocketMap[socketId],
    }));
}

function getCallParticipants(io, roomId) {
    const participants = callParticipantsByRoom.get(roomId);

    if (!participants) {
        return [];
    }

    return Array.from(participants).filter((socketId) => io.sockets.sockets.has(socketId));
}

function addCallParticipant(roomId, socketId) {
    if (!roomId) {
        return [];
    }

    const participants = callParticipantsByRoom.get(roomId) || new Set();
    const existingParticipants = Array.from(participants).filter((id) => id !== socketId);

    participants.add(socketId);
    callParticipantsByRoom.set(roomId, participants);

    return existingParticipants;
}

function removeCallParticipant(roomId, socketId) {
    const participants = callParticipantsByRoom.get(roomId);

    if (!participants) {
        return false;
    }

    const wasInCall = participants.delete(socketId);

    if (participants.size === 0) {
        callParticipantsByRoom.delete(roomId);
    }

    return wasInCall;
}

function broadcastCallRoomInfo(io, roomId) {
    const info = getCallRoomInfo(io, roomId);

    io.in(roomId).emit(ACTIONS.VIDEO_CALL_ROOM_INFO, info);
}

function sendCallRoomInfoToSocket(io, socket, roomId) {
    const info = getCallRoomInfo(io, roomId);

    socket.emit(ACTIONS.VIDEO_CALL_ROOM_INFO, info);
}

function getCallRoomInfo(io, roomId) {
    const participants = getCallParticipants(io, roomId);
    const info = participants.map((socketId) => ({
        socketId,
        username: userSocketMap[socketId] || 'Unknown',
    }));

    return {
        isActive: participants.length > 0,
        participants: info,
    };
}

module.exports = registerSocketHandlers;
