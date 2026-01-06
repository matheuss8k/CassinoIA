
const mongoose = require('mongoose');
require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI missing");
    
    // Banking Grade & Performance: Connection Pooling
    await mongoose.connect(uri, { 
        dbName: 'casino_ai_db', 
        serverSelectionTimeoutMS: 5000,
        w: 'majority', 
        retryWrites: true,
        // PERFORMANCE: Keep a pool of connections ready
        maxPoolSize: 10, // Maintain up to 10 open sockets
        minPoolSize: 2,  // Keep at least 2 sockets open/warm
        socketTimeoutMS: 45000, // Close socket after 45s of inactivity
    });
    console.log(`✅ MongoDB Connected (Pool Mode)`);
  } catch (error) {
    console.error(`❌ DB Error: ${error.message}`);
    process.exit(1);
  }
};

// --- LOCK MANAGER (MONGODB BACKED) ---
class MongoLockManager {
    async acquire(userId) {
        try {
            const ActionLock = mongoose.model('ActionLock');
            await ActionLock.create({ _id: userId });
            return true;
        } catch (e) {
            if (e.code === 11000) return false;
            console.error(`[LOCK_ERR] ${e.message}`);
            return false;
        }
    }

    async release(userId) {
        try {
            const ActionLock = mongoose.model('ActionLock');
            await ActionLock.deleteOne({ _id: userId });
        } catch(e) {
            console.warn(`[LOCK_RELEASE_FAIL] ${e.message}`);
        }
    }
}

const lockManager = new MongoLockManager();

module.exports = { connectDB, lockManager, IS_PRODUCTION };
