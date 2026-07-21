const mongoose = require('mongoose');

const MONGODB_URI =
    process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/synccode';

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/[^@]+@/, '//***@'));
        return true;
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        console.error('Continuing with in-memory room storage for this server session.');
        return false;
    }
}

function isDBConnected() {
    return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDBConnected, mongoose };
