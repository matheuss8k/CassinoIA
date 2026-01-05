
const mongoose = require('mongoose');
const Redis = require('ioredis');
require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI missing");
    await mongoose.connect(uri, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB Connected`);
  } catch (error) {
    console.error(`❌ DB Error: ${error.message}`);
    process.exit(1);
  }
};

// --- REDIS CLIENT (SINGLETON) ---
let redisClient = null;

if (process.env.REDIS_URI) {
    const redisOptions = {
        maxRetriesPerRequest: null, 
        enableReadyCheck: true, 
        enableOfflineQueue: true,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        reconnectOnError: (err) => err.message.includes("READONLY"),
        connectTimeout: 10000, 
        keepAlive: 10000, 
        family: 0 
    };

    if (process.env.REDIS_URI.startsWith('rediss://')) {
        redisOptions.tls = { rejectUnauthorized: false };
    }

    redisClient = new Redis(process.env.REDIS_URI, redisOptions);
    
    redisClient.on('connect', () => {
        if (!IS_PRODUCTION) console.log(`✅ Redis Connected (State Engine Ready)`);
    });

    redisClient.on('error', (err) => {
        if (err.code === 'ECONNRESET') return;
        console.warn(`[REDIS] Connection issue: ${err.message}`);
        // In Production Banking Systems: If Redis dies, we must stop accepting bets to prevent state loss.
        if (IS_PRODUCTION) {
            console.error("🔥 FATAL: Redis lost. System entering Fail-Safe mode.");
        }
    });
} else {
    if (IS_PRODUCTION) {
        console.error('🔥 FATAL: REDIS_URI missing in PRODUCTION. Performance mode disabled.');
        process.exit(1);
    } else {
        console.warn('⚠️  Redis missing. Running in Dev Mode (No Locks).');
    }
}

// --- LOCK MANAGER ---
class LockManager {
    constructor() {
        // Architecture Decision: No memory fallback for Production.
        // Memory locks are not shared across processes/pods, leading to race conditions.
    }

    /**
     * Acquires a distributed lock for a user.
     * Strategy: Redis SET NX (Atomic).
     * Fail-safe: If Redis is down in Production -> REJECT (Kill Switch).
     */
    async acquire(userId) {
        const lockKey = `lock:u:${userId}`;
        
        // 1. Primary: Distributed Redis Lock
        if (redisClient && redisClient.status === 'ready') {
            try {
                // NX = Only set if not exists
                // PX = Expire in 5000ms (Auto-release if process crashes)
                const result = await redisClient.set(lockKey, '1', 'NX', 'PX', 5000); 
                return result === 'OK';
            } catch (e) {
                console.error(`[LOCK_SYS] Redis Error: ${e.message}`);
                // If Redis errors during operation, assume unsafe state.
                return false;
            }
        }

        // 2. Fail-Safe: Production Kill Switch
        // If Redis is offline in Production, we cannot guarantee atomic transactions.
        // We MUST halt processing to prevent Double Spending / Race Conditions.
        if (IS_PRODUCTION) {
            console.warn(`[LOCK_SYS] Redis Unavailable. Engaging Kill Switch for User ${userId}.`);
            return false; // Deny service to protect funds
        }

        // 3. Dev Fallback: Allow without lock (High Risk, Dev Only)
        // WARNING: This allows race conditions in Dev.
        return true; 
    }

    async release(userId) {
        if (redisClient && redisClient.status === 'ready') {
            try { await redisClient.del(`lock:u:${userId}`); } catch(e) {
                console.warn(`[LOCK_RELEASE_FAIL] ${e.message}`);
            }
        }
    }
}

const lockManager = new LockManager();

module.exports = { connectDB, lockManager, redisClient, IS_PRODUCTION };
