const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        mainFileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File',
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                ret._id = ret._id.toString();
                ret.mainFileId = ret.mainFileId ? ret.mainFileId.toString() : null;
                return ret;
            },
        },
    }
);

module.exports = mongoose.model('Room', roomSchema);
