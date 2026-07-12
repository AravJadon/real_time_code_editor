const ACTIONS = require('../Actions');
const fileService = require('../services/fileService');

const userSocketMap = {};
const callParticipantsByRoom = new Map();

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
                const file = await fileService.createFile({
                    roomId,
                    name,
                    type,
                    parentId: parentId || null,
                });

                io.in(roomId).emit(ACTIONS.FILE_CREATE, { file });
            } catch (error) {
                console.error('Error creating file:', error);
            }
        });

        socket.on(ACTIONS.FILE_RENAME, async ({ roomId, fileId, name }) => {
            try {
                const file = await fileService.renameFile(fileId, name);
                io.in(roomId).emit(ACTIONS.FILE_RENAME, { file });
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
