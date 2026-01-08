
const crypto = require('crypto');
const { z } = require('zod');
const { IS_PRODUCTION } = require('../config');

// --- LOGGER ---
const logEvent = (type, message) => {
    if (process.env.SILENT_LOGS === 'true' || process.env.SILENT_LOGS === '1') return;
    
    // SECURITY: Prevent metric/debug leaks in production unless explicitly overridden.
    // This hides "Engine Optimization" logs from production stdout.
    if (IS_PRODUCTION && (type === 'METRIC' || type === 'DEBUG')) return;
    
    // Async Logging: Unblock Event Loop
    setImmediate(() => {
        const ts = new Date().toISOString();
        if (type === 'METRIC') { 
            if (!IS_PRODUCTION) console.log(`\x1b[33m[${ts}] [METRIC] ${message}\x1b[0m`);
        } else if (type === 'AUDIT') {
            console.log(`\x1b[36m[${ts}] [AUDIT] ${message}\x1b[0m`);
        } else if (type === 'ERROR') {
            console.error(`\x1b[31m[${ts}] [ERR] ${message}\x1b[0m`);
        } else {
            console.log(`[${ts}] [${type}] ${message}`);
        }
    });
};

const logGameResult = (gameName, username, resultAmount, currentSessionNet, riskLevel, adjustmentTag) => {
    try {
        const isWin = resultAmount > 0;
        const sign = isWin ? '+' : '';
        const msg = `GAME: ${gameName} | User: ${username} | Result: ${sign}${resultAmount.toFixed(2)} | Risk: ${riskLevel}`;
        logEvent('AUDIT', msg);
        
        // SECURITY: Never log adjustment tags in production to hide engine logic (e.g. DYNAMIC_GRID)
        if (adjustmentTag && !IS_PRODUCTION) {
            logEvent('METRIC', `Engine Optimization: ${adjustmentTag} applied for ${username}`);
        }
    } catch (e) { console.error("Log Error:", e.message); }
};

// --- MATH & CRYPTO ---
const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;
const secureRandomInt = (min, max) => crypto.randomInt(min, max);
const secureRandomFloat = () => crypto.randomInt(0, 100000000) / 100000000;

const secureShuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const generateSeed = () => crypto.randomBytes(32).toString('hex');
const generateHash = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

const hashPassword = (password) => {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err); resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
};

const verifyPassword = (password, hash) => {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            const keyBuffer = Buffer.from(key, 'hex');
            const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
            resolve(keyBuffer.length === derivedBuffer.length && crypto.timingSafeEqual(keyBuffer, derivedBuffer));
        });
    });
};

// --- SCHEMAS ---
const LoginSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });
const RegisterSchema = z.object({ fullName: z.string().min(2), username: z.string().min(4), email: z.string().email(), cpf: z.string().min(11), birthDate: z.string().min(8), password: z.string().min(6) });
const BetSchema = z.object({ amount: z.number().positive().max(5000), sideBets: z.object({ perfectPairs: z.number().min(0), dealerBust: z.number().min(0) }).optional() });
const MinesStartSchema = z.object({ amount: z.number().positive().max(5000), minesCount: z.number().int().min(1).max(24) });

module.exports = {
    logEvent,
    logGameResult,
    toCents,
    fromCents,
    secureRandomInt,
    secureRandomFloat,
    secureShuffle,
    generateSeed,
    generateHash,
    hashPassword,
    verifyPassword,
    LoginSchema,
    RegisterSchema,
    BetSchema,
    MinesStartSchema
};
