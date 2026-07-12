const { isDBConnected } = require('../db');
const Room = require('../models/Room');
const File = require('../models/File');

const memoryRooms = new Map();
const memoryFiles = new Map();
let memoryFileIdCounter = 1;

function generateMemoryId() {
    const id = `mem_${Date.now()}_${memoryFileIdCounter}`;
    memoryFileIdCounter += 1;
    return id;
}

function createDefaultFile(roomId, fileId) {
    const file = {
        roomId,
        name: 'index.js',
        type: 'file',
        code: '// Start coding here!\nconsole.log("Hello, world!");\n',
        language: 'javascript',
        parentId: null,
    };

    if (fileId) {
        file._id = fileId;
    }

    return file;
}

async function findOrCreateRoom(roomId) {
    if (isDBConnected()) {
        let room = await Room.findOne({ roomId });

        if (!room) {
            room = new Room({ roomId });
            await room.save();

            const mainFile = new File(createDefaultFile(roomId, null));
            await mainFile.save();

            room.mainFileId = mainFile._id;
            await room.save();
        }

        return room.toJSON();
    }

    if (!memoryRooms.has(roomId)) {
        const fileId = generateMemoryId();
        const mainFile = createDefaultFile(roomId, fileId);

        memoryFiles.set(fileId, mainFile);
        memoryRooms.set(roomId, {
            roomId,
            mainFileId: fileId,
        });
    }

    return memoryRooms.get(roomId);
}

async function findFilesByRoom(roomId) {
    if (isDBConnected()) {
        const files = await File.find({ roomId });
        return files.map((file) => file.toJSON());
    }

    return Array.from(memoryFiles.values()).filter((file) => file.roomId === roomId);
}

async function createFile(data) {
    const fileData = {
        ...data,
        parentId: data.parentId || null,
    };

    if (isDBConnected()) {
        const file = new File(fileData);
        await file.save();
        return file.toJSON();
    }

    const fileId = generateMemoryId();
    const file = {
        _id: fileId,
        ...fileData,
    };

    memoryFiles.set(fileId, file);
    return file;
}

async function renameFile(fileId, name) {
    if (isDBConnected()) {
        const file = await File.findByIdAndUpdate(fileId, { name }, { new: true });
        return file ? file.toJSON() : null;
    }

    const file = memoryFiles.get(fileId);

    if (file) {
        file.name = name;
    }

    return file;
}

async function deleteFileRecursive(fileId) {
    if (isDBConnected()) {
        const children = await File.find({ parentId: fileId });

        for (const child of children) {
            await deleteFileRecursive(child._id);
        }

        await File.findByIdAndDelete(fileId);
        return;
    }

    const toDelete = [fileId];
    let index = 0;

    while (index < toDelete.length) {
        const currentId = toDelete[index];

        for (const [id, file] of memoryFiles) {
            if (file.parentId === currentId) {
                toDelete.push(id);
            }
        }

        index += 1;
    }

    toDelete.forEach((id) => {
        memoryFiles.delete(id);
    });
}

async function collectDescendantIds(fileId) {
    const ids = [];

    if (isDBConnected()) {
        const children = await File.find({ parentId: fileId });

        for (const child of children) {
            ids.push(child._id.toString());

            const childIds = await collectDescendantIds(child._id);
            ids.push(...childIds);
        }

        return ids;
    }

    for (const [id, file] of memoryFiles) {
        if (file.parentId === fileId) {
            ids.push(id);

            const childIds = await collectDescendantIds(id);
            ids.push(...childIds);
        }
    }

    return ids;
}

async function setMainFile(roomId, fileId) {
    if (isDBConnected()) {
        await Room.findOneAndUpdate({ roomId }, { mainFileId: fileId });
        return;
    }

    const room = memoryRooms.get(roomId);

    if (room) {
        room.mainFileId = fileId;
    }
}

async function updateFileCode(fileId, code) {
    if (isDBConnected()) {
        await File.findByIdAndUpdate(fileId, { code });
        return;
    }

    const file = memoryFiles.get(fileId);

    if (file) {
        file.code = code;
    }
}

async function updateFileLanguage(fileId, language) {
    if (isDBConnected()) {
        await File.findByIdAndUpdate(fileId, { language });
        return;
    }

    const file = memoryFiles.get(fileId);

    if (file) {
        file.language = language;
    }
}

module.exports = {
    findOrCreateRoom,
    findFilesByRoom,
    createFile,
    renameFile,
    deleteFileRecursive,
    collectDescendantIds,
    setMainFile,
    updateFileCode,
    updateFileLanguage,
};
