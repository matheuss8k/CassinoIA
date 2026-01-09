
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

// --- LOCK MANAGER (IN-MEMORY HIGH PERFORMANCE) ---
// Substitui o MongoLockManager para evitar escritas no banco a cada clique (Mines/Slots).
// Reduz latência de ~100ms para <1ms.
class MemoryLockManager {
    constructor() {
        this.locks = new Map();
        
        // Garbage Collector: Remove travas órfãs a cada 30 segundos
        // Previne deadlock se o servidor reiniciar ou uma requisição falhar drasticamente
        setInterval(() => {
            const now = Date.now();
            for (const [userId, timestamp] of this.locks.entries()) {
                if (now - timestamp > 10000) { // Max lock time: 10s
                    this.locks.delete(userId);
                }
            }
        }, 30000);
    }

    async acquire(userId) {
        const uid = userId.toString();
        if (this.locks.has(uid)) return false;
        this.locks.set(uid, Date.now());
        return true;
    }

    async release(userId) {
        this.locks.delete(userId.toString());
    }
}

const lockManager = new MemoryLockManager();

module.exports = { connectDB, lockManager, IS_PRODUCTION };
