
const mongoose = require('mongoose');
require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI missing");
    
    // Banking Grade: Ensure write concern is Majority for safety
    await mongoose.connect(uri, { 
        dbName: 'casino_ai_db', 
        serverSelectionTimeoutMS: 5000,
        w: 'majority', // Write Concern: Ensure data is on majority of replicas
        retryWrites: true
    });
    console.log(`✅ MongoDB Connected (Banking Mode)`);
  } catch (error) {
    console.error(`❌ DB Error: ${error.message}`);
    process.exit(1);
  }
};

// --- LOCK MANAGER (MONGODB BACKED) ---
// We lazily load the model to avoid circular dependencies during init, 
// or access it via mongoose.models
class MongoLockManager {
    async acquire(userId) {
        try {
            const ActionLock = mongoose.model('ActionLock');
            // Try to create a lock. If it exists, this throws code 11000
            await ActionLock.create({ _id: userId });
            return true;
        } catch (e) {
            // Duplicate key error = Locked
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
