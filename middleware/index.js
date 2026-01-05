
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { IS_PRODUCTION, lockManager, redisClient } = require('../config');

// --- SECRETS ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || (IS_PRODUCTION ? crypto.randomBytes(64).toString('hex') : 'dev_secret_key_123');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || (IS_PRODUCTION ? crypto.randomBytes(64).toString('hex') : 'dev_refresh_key_123');

if (IS_PRODUCTION && !process.env.ACCESS_TOKEN_SECRET) {
    console.warn("\x1b[31m[SECURITY] WARNING: Random JWT secrets generated. Set ACCESS_TOKEN_SECRET in .env\x1b[0m");
}

const mongoSanitize = (req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (const key in obj) {
                if (key.startsWith('$')) delete obj[key];
                else sanitize(obj[key]);
            }
        }
    };
    if (req.body) sanitize(req.body);
    next();
};

const compressionMiddleware = (req, res, next) => {
    const send = res.send;
    res.send = (body) => {
        if (typeof body === 'string' || Buffer.isBuffer(body) || typeof body === 'object') {
            const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;
            if (bodyString.length > 1024) {
                zlib.gzip(bodyString, (err, buffer) => {
                    if (!err) {
                        res.set('Content-Encoding', 'gzip');
                        if (!res.get('Content-Type')) res.set('Content-Type', 'application/json');
                        send.call(res, buffer);
                    } else { send.call(res, body); }
                });
            } else { send.call(res, body); }
        } else { send.call(res, body); }
    };
    next();
};

const dbCheck = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Service initializing. Retry shortly.' });
    next();
};

const validateRequest = (schema) => (req, res, next) => {
    try { schema.parse(req.body); next(); } 
    catch (e) { return res.status(400).json({ message: "Invalid payload parameters." }); }
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.status(403).json({ code: 'SESSION_KICKED', message: 'Session invalid.' });
        req.user = user;
        next();
    });
};

const lockUserAction = async (req, res, next) => {
    if (req.user && req.user.id) {
        const locked = await lockManager.acquire(req.user.id);
        if (!locked) return res.status(429).json({ message: 'Action pending. Please wait.' });
        
        const originalSend = res.send;
        res.send = function (...args) {
            lockManager.release(req.user.id).catch(err => console.error("Lock release error:", err));
            originalSend.apply(res, args);
        };
        res.on('finish', () => { lockManager.release(req.user.id).catch(() => {}); });
    }
    next();
};

const createRateLimiter = ({ windowMs, max }) => {
    // Memory fallback for Dev/No-Redis environments
    const requests = new Map();
    const cleanupInterval = setInterval(() => { 
        const now = Date.now(); 
        for (const [k, d] of requests) if (now > d.expiry) requests.delete(k); 
    }, 60000);

    return async (req, res, next) => {
        if (req.ip === '127.0.0.1') return next();
        let key = req.ip; 
        if (req.user) key = `U:${req.user.id}`;

        // 1. Redis Strategy (Production/Scaled)
        if (redisClient && redisClient.status === 'ready') {
            const redisKey = `rl:${key}`;
            try {
                const count = await redisClient.incr(redisKey);
                if (count === 1) await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));
                if (count > max) return res.status(429).json({ message: 'Rate limit exceeded.' });
                return next();
            } catch (e) {
                // If Redis fails, fallback to memory or log error. Proceeding safe.
                console.error("RateLimit Redis Error:", e.message);
            }
        }

        // 2. Memory Strategy (Fallback)
        const now = Date.now();
        if (!requests.has(key)) requests.set(key, { count: 1, expiry: now + windowMs });
        else { 
            const d = requests.get(key); 
            d.count++; 
            if (d.count > max) return res.status(429).json({ message: 'Rate limit exceeded.' }); 
        }
        next();
    };
};

module.exports = {
    mongoSanitize,
    compressionMiddleware,
    dbCheck,
    validateRequest,
    authenticateToken,
    lockUserAction,
    createRateLimiter,
    ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET
};
