
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

// --- LOCK MANAGER (CLUSTER SAFE) ---
class LockManager {
    constructor() {
        this.redis = null;
        this.memoryLocks = new Map(); 
        this.useRedis = false; 
        
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

            this.redis = new Redis(process.env.REDIS_URI, redisOptions);
            
            this.redis.on('connect', () => {
                this.useRedis = true;
                if (!IS_PRODUCTION) console.log(`✅ Redis Connected`);
            });

            this.redis.on('ready', () => { this.useRedis = true; });

            this.redis.on('error', (err) => {
                if (err.code === 'ECONNRESET') return;
                console.warn(`[REDIS] Connection issue: ${err.message}`);
                
                // CRITICAL SECURITY FOR CLUSTER
                if (IS_PRODUCTION) {
                    console.error("🔥 FATAL: Redis connection lost in PRODUCTION. Stopping to prevent double-spending.");
                    this.useRedis = false; 
                    // In a real cluster orchestrator, we might want to crash the pod to restart
                    // process.exit(1); 
                } else {
                    this.useRedis = false;
                }
            });
        } else {
            if (IS_PRODUCTION) {
                console.error('🔥 FATAL: REDIS_URI missing in PRODUCTION. System cannot guarantee concurrency safety.');
                process.exit(1); // Force crash if misconfigured in prod
            } else {
                console.warn('⚠️  Running in MEMORY MODE (Dev Only).');
            }
        }

        // Garbage Collector (Memory Fallback)
        setInterval(() => {
            const now = Date.now();
            for (const [userId, timestamp] of this.memoryLocks.entries()) {
                if (now - timestamp > 10000) this.memoryLocks.delete(userId); 
            }
        }, 5000);
    }

    async acquire(userId) {
        const lockKey = `lock:u:${userId}`;
        
        // Priority 1: Redis (Distributed Atomic Lock)
        if (this.useRedis && this.redis && this.redis.status === 'ready') {
            try {
                const lockPromise = this.redis.set(lockKey, '1', 'NX', 'PX', 5000);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Redis Timeout")), 2000));
                const result = await Promise.race([lockPromise, timeoutPromise]);
                return result === 'OK';
            } catch (e) { 
                if (IS_PRODUCTION) return false; // Fail safe in prod
                return false; 
            }
        }

        // Priority 2: Memory (Dev Only or Emergency Fallback if allowed)
        if (IS_PRODUCTION && !this.useRedis) {
             // If we reached here in production, it means Redis failed and we didn't crash yet.
             // We must deny lock to be safe.
             return false; 
        }

        if (this.memoryLocks.has(userId)) return false;
        this.memoryLocks.set(userId, Date.now());
        return true;
    }

    async release(userId) {
        if (this.useRedis && this.redis && this.redis.status === 'ready') {
            try { this.redis.del(`lock:u:${userId}`).catch(() => {}); } catch(e) {}
        }
        this.memoryLocks.delete(userId);
    }
}

const lockManager = new LockManager();

module.exports = { connectDB, lockManager, IS_PRODUCTION };
