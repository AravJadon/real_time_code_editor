const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['file', 'folder'],
            required: true,
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File',
            default: null,
        },
        code: {
            type: String,
            default: '',
        },
        language: {
            type: String,
            default: 'javascript',
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                // Convert ObjectId fields to plain strings for the client
                ret._id = ret._id.toString();
                ret.parentId = ret.parentId ? ret.parentId.toString() : null;
                return ret;
            },
        },
    }
);

fileSchema.index({ roomId: 1, parentId: 1 });

module.exports = mongoose.model('File', fileSchema);
