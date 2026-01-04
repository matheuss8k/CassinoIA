
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const zlib = require('zlib');
const { z } = require('zod'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BET_LIMIT = 5000; 
const VERSION = '4.2.3-SECURE-AUDIT'; 

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || true; 

// --- USER LOCKS (MUTEX) ---
const userLocks = new Map();
const acquireLock = (userId) => {
    if (userLocks.has(userId)) return false;
    userLocks.set(userId, Date.now());
    return true;
};
const releaseLock = (userId) => {
    userLocks.delete(userId);
};
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of userLocks.entries()) {
        if (now - timestamp > 5000) userLocks.delete(userId); 
    }
}, 1000);

// --- CACHE DE ARQUIVOS ESTÁTICOS ---
let cachedIndexHtml = null;
const indexPath = path.join(__dirname, 'dist', 'index.html');
try {
    if (fs.existsSync(indexPath)) {
        cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
        console.log("⚡ Static Assets: index.html cached in memory.");
    }
} catch (e) { console.error("Static Cache Error:", e); }

// --- SEGREDOS JWT ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS ---
const logEvent = (type, message) => {
    const timestamp = new Date().toISOString();
    if (type === 'SESSION') {
        process.stdout.write(`\x1b[35m[${timestamp}] ${message}\x1b[0m\n`);
    } else if (type === 'ADAPTIVE-QOS') {
        // Log de Ajuste de Qualidade de Serviço (Engine Interna)
        process.stdout.write(`\x1b[33m[${timestamp}] [ADAPTIVE] ${message}\x1b[0m\n`);
    } else {
        const color = type === 'ERROR' ? '\x1b[31m' : type === 'RISK-ENGINE' ? '\x1b[33m' : type === 'BANK' ? '\x1b[32m' : '\x1b[36m';
        process.stdout.write(`${color}[${timestamp}] [${type}]\x1b[0m ${message}\n`);
    }
};

const logGameResult = (gameName, username, resultAmount, currentSessionNet, riskLevel, adjustmentTag) => {
    const isWin = resultAmount > 0;
    const isPush = resultAmount === 0;
    const icon = isWin ? '🟢' : isPush ? '⚪' : '🔴';
    const amountStr = Math.abs(resultAmount).toFixed(2);
    const sign = isWin ? '+' : isPush ? '' : '-';
    const msg = `📊 ${gameName}: ${username} | ${icon} ${sign}${amountStr} | Risk: ${riskLevel}`;
    logEvent('SESSION', msg);
    if (adjustmentTag) {
        logEvent('ADAPTIVE-QOS', `Optimization Triggered (${gameName}): ${adjustmentTag} | Target: ${username}`);
    }
};

// --- SECURE RNG UTILS ---
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

// --- UTILS ---
const hashPassword = (password) => {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
};

const verifyPassword = (password, hash) => {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
};

const sanitizeUser = (user) => {
    const u = user.toObject ? user.toObject() : user;
    delete u.password;
    delete u.refreshToken;
    delete u.__v;
    u.id = u._id;
    delete u._id;
    return u;
};

// --- MIDDLEWARES ---
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
                        res.set('Content-Type', 'application/json');
                        send.call(res, buffer);
                    } else { send.call(res, body); }
                });
            } else { send.call(res, body); }
        } else { send.call(res, body); }
    };
    next();
};

const dbCheck = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ message: 'Sistema iniciando. Tente novamente em 5 segundos.' });
    }
    next();
};

// --- MONGOOSE SCHEMAS ---
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'REFUND'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    game: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'WALLET', 'BLACKJACK_INSURANCE'], default: 'WALLET' },
    referenceId: { type: String }, 
    integrityHash: { type: String }, 
}, { timestamps: true });

const gameLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    game: { type: String, required: true },
    bet: { type: Number, required: true },
    payout: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    serverSeed: { type: String }, 
    clientSeed: { type: String },
    resultSnapshot: { type: mongoose.Schema.Types.Mixed }, 
    riskLevel: { type: String },
    engineAdjustment: { type: String } // Renamed from cheatApplied
}, { timestamps: true });

const activeGameSchema = new mongoose.Schema({
    type: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'NONE'], default: 'NONE' },
    bet: { type: Number, default: 0 },
    sideBets: {
        perfectPairs: { type: Number, default: 0 },
        dealerBust: { type: Number, default: 0 }
    },
    insuranceBet: { type: Number, default: 0 },
    bjDeck: { type: Array, default: [], select: false }, 
    bjPlayerHand: { type: Array, default: [] },
    bjDealerHand: { type: Array, default: [] },
    bjStatus: String,
    minesList: { type: Array, default: [], select: false },
    minesCount: { type: Number, default: 0 },
    minesRevealed: { type: Array, default: [] },
    minesMultiplier: { type: Number, default: 1.0 },
    minesGameOver: { type: Boolean, default: false },
    riskLevel: { type: String, default: 'NORMAL' },
    serverSeed: { type: String }, 
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true, select: false },
  refreshToken: { type: String, select: false },
  tokenVersion: { type: Number, default: 0, select: true },
  balance: { type: Number, default: 0, min: 0 },
  
  // STATS FOR RISK ENGINE (PERSISTENT)
  totalDeposits: { type: Number, default: 0 },
  sessionProfit: { type: Number, default: 0 }, 
  sessionTotalBets: { type: Number, default: 0 }, 
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  lastBetResult: { type: String, enum: ['WIN', 'LOSS', 'NONE'], default: 'NONE' }, 
  previousBet: { type: Number, default: 0 }, 
  
  lastGamePlayed: { type: String, default: 'NONE' }, 
  avatarId: { type: String, default: '1' },
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  missions: { type: Array, default: [] },
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  activeGame: { type: activeGameSchema, default: () => ({}) }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema);
const GameLog = mongoose.model('GameLog', gameLogSchema);
const User = mongoose.model('User', userSchema);

// --- AUTH MIDDLEWARE ---
const authenticateToken = async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {}
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.sendStatus(401);

    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decoded) => {
        if (err) return res.sendStatus(403);

        try {
            const user = await User.findById(decoded.id).select('tokenVersion');
            
            if (!user) return res.sendStatus(403); 
            
            if (decoded.tokenVersion !== user.tokenVersion) {
                return res.status(403).json({ code: 'SESSION_KICKED', message: 'Sessão encerrada.' });
            }

            req.user = { id: decoded.id, username: decoded.username };
            next();
        } catch (e) {
            console.error("Auth Middleware DB Error:", e.message);
            res.status(503).json({ message: 'Serviço indisponível temporariamente.' });
        }
    });
};

// --- TRANSACTION PROCESSOR ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null) => {
    const safeAmount = Math.floor(Math.abs(amount) * 100) / 100;
    const balanceChange = (type === 'BET' || type === 'WITHDRAW') ? -safeAmount : safeAmount;
    
    const profitChange = (type === 'WIN') ? safeAmount : (type === 'BET') ? -safeAmount : 0;
    const betsChange = (type === 'BET') ? safeAmount : 0;

    let session = null;
    let updatedUser = null;

    try {
        try { session = await mongoose.startSession(); } catch(e) {}

        const executeLogic = async (sess) => {
            const opts = sess ? { session: sess } : {};
            const currentUser = await User.findById(userId, null, opts);
            if (!currentUser) throw new Error("Usuário não encontrado.");

            let shouldResetStats = false;
            if (type === 'DEPOSIT' || type === 'WITHDRAW') {
                shouldResetStats = true;
                logEvent('BANK', `RESET STATS: User ${currentUser.username} due to ${type}`);
            }

            const query = { _id: userId };
            if (balanceChange < 0) query.balance = { $gte: Math.abs(balanceChange) };

            const update = { $inc: { balance: balanceChange } };

            if (shouldResetStats) {
                update.$set = { 
                    sessionProfit: 0, 
                    sessionTotalBets: 0, 
                    consecutiveWins: 0, 
                    consecutiveLosses: 0,
                    lastBetResult: 'NONE',
                    previousBet: 0
                };
                if (type === 'DEPOSIT') {
                    update.$inc = { ...update.$inc, totalDeposits: safeAmount };
                }
            } else {
                update.$inc.sessionProfit = profitChange;
                update.$inc.sessionTotalBets = betsChange;
                if (game !== 'WALLET') update.$set = { lastGamePlayed: game };
            }

            const u = await User.findOneAndUpdate(query, update, { new: true, ...opts });
            if (!u) throw new Error('Saldo insuficiente ou erro de transação.');
            
            const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(sess);
            const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
            const txData = { userId, type, amount: safeAmount, balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
            const integrityHash = generateHash({ ...txData, prevHash }); 
            
            await Transaction.create([ { ...txData, integrityHash } ], opts);
            return u;
        };

        if (session) {
            session.startTransaction();
            try { updatedUser = await executeLogic(session); await session.commitTransaction(); } 
            catch (err) { await session.abortTransaction(); throw err; } 
            finally { session.endSession(); }
        } else { updatedUser = await executeLogic(null); }

        return updatedUser;
    } catch (e) {
        logEvent('ERROR', `Transaction Failed: ${e.message}`);
        throw e;
    }
};

const saveGameLog = async (userId, game, bet, payout, resultSnapshot, riskLevel, engineAdjustment) => {
    try {
        await GameLog.create({ userId, game, bet, payout, profit: payout - bet, resultSnapshot, riskLevel, engineAdjustment, timestamp: new Date() });
    } catch(e) { console.error("Log Error:", e.message); }
};

// ------------------------------------------------------------------------------------------------
// 🛡️ MOTOR CENTRAL DE RISCO (RISK ENGINE V4.1)
// ------------------------------------------------------------------------------------------------
const calculateRisk = (user, currentBet) => {
    const balance = user.balance;
    const isWhale = balance > 10000 && (currentBet / balance) < 0.05; 
    
    // Default
    let risk = 'NORMAL';
    let triggers = [];

    // 1. ALL-IN PROTECTION 
    const betRatio = currentBet / (user.balance + currentBet);
    if (betRatio >= 0.90) {
        return { level: 'EXTREME', triggers: ['MAX_EXPOSURE_LIMIT'] };
    }

    // 2. ROI GUARD (> 15% de lucro sobre depósitos)
    const baseCapital = user.totalDeposits > 0 ? user.totalDeposits : 100;
    const currentProfit = user.sessionProfit;
    if (currentProfit > (baseCapital * 0.15)) {
        risk = 'EXTREME';
        triggers.push('ROI_LIMIT');
    }

    // 3. WIN STREAK ANALYZER
    if (user.consecutiveWins >= 3) {
        risk = 'EXTREME';
        triggers.push('STREAK_CAP');
    }

    // 4. PATTERN DETECTION (Anti-Martingale)
    if (user.lastBetResult === 'LOSS' && currentBet >= (user.previousBet * 1.9)) {
        risk = risk === 'EXTREME' ? 'EXTREME' : 'HIGH';
        triggers.push('PATTERN_A');
    }

    // 5. PATTERN DETECTION (Anti-Paroli)
    if (user.lastBetResult === 'WIN' && currentBet >= (user.previousBet * 1.9)) {
        risk = risk === 'EXTREME' ? 'EXTREME' : 'HIGH';
        triggers.push('PATTERN_B');
    }

    // 6. VOLATILITY SPIKE
    if (user.previousBet > 0 && currentBet >= (user.previousBet * 5)) {
        risk = 'EXTREME';
        triggers.push('VOLATILITY_SPIKE');
    }

    // VIP Handling
    if (isWhale && risk === 'HIGH') {
        const isRepeatedOffense = (triggers.includes('PATTERN_A') && user.consecutiveLosses >= 2) ||
                                  (triggers.includes('PATTERN_B') && user.consecutiveWins >= 2);

        if (isRepeatedOffense) {
            risk = 'EXTREME'; 
            triggers.push('VIP_ADJUSTMENT_HARD');
        } else {
            risk = 'NORMAL'; 
            triggers.push('(VIP_BYPASS)');
        }
    }

    if (triggers.length > 0) {
        logEvent('RISK-ENGINE', `User: ${user.username} | Level: ${risk} | Triggers: [${triggers.join(', ')}]`);
    }

    return { level: risk, triggers };
};

// --- MIDDLEWARE ---
const lockUserAction = (req, res, next) => {
    if (req.user && req.user.id) {
        if (!acquireLock(req.user.id)) return res.status(429).json({ message: 'Aguarde.' });
        const originalSend = res.send;
        res.send = function (...args) { releaseLock(req.user.id); originalSend.apply(res, args); };
    }
    next();
};

const createRateLimiter = ({ windowMs, max }) => {
    const requests = new Map();
    setInterval(() => { const now = Date.now(); for (const [k, d] of requests) if (now > d.expiry) requests.delete(k); }, 60000);
    return (req, res, next) => {
        let key = req.ip; if (req.user) key = `USER:${req.user.id}`;
        if (req.ip === '127.0.0.1') return next();
        const now = Date.now();
        if (!requests.has(key)) requests.set(key, { count: 1, expiry: now + windowMs });
        else { const d = requests.get(key); d.count++; if (d.count > max) return res.status(429).json({ message: 'Calma!' }); }
        next();
    };
};

const validateRequest = (schema) => (req, res, next) => { try { schema.parse(req.body); next(); } catch (e) { res.status(400).json({ message: 'Dados inválidos' }); } };

app.set('trust proxy', 1);
app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    res.removeHeader('X-Powered-By'); 
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.transparenttextures.com; connect-src 'self'`);
    next();
});

app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'x-client-version'] }));
app.use(createRateLimiter({ windowMs: 60000, max: 300 })); 
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 
app.use(mongoSanitize); 
app.use(compressionMiddleware);

// --- DB CONNECTION ---
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error("❌ MONGODB_URI missing in .env"); return; }
    await mongoose.connect(uri, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB Conectado (${VERSION})`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}. Retrying in 5s...`);
    setTimeout(connectDB, 5000);
  }
};

// --- ROUTES ---
const LoginSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });
const RegisterSchema = z.object({ fullName: z.string().min(2), username: z.string().min(4), email: z.string().email(), cpf: z.string().min(11), birthDate: z.string().min(8), password: z.string().min(6) });
const BetSchema = z.object({ amount: z.number().positive().max(MAX_BET_LIMIT), sideBets: z.object({ perfectPairs: z.number().min(0), dealerBust: z.number().min(0) }).optional() });
const MinesStartSchema = z.object({ amount: z.number().positive().max(MAX_BET_LIMIT), minesCount: z.number().int().min(1).max(24) });

app.get('/api/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState }));

app.post('/api/login', dbCheck, validateRequest(LoginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [ { username: new RegExp(`^${username}$`, 'i') }, { email: new RegExp(`^${username}$`, 'i') } ] }).select('+password');
    if (user && await verifyPassword(password, user.password)) {
        const v = (user.tokenVersion || 0) + 1;
        // SECURITY AUDIT FIX: Removed `$set: { sessionProfit: 0 }` to maintain risk profile across logins
        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, tokenVersion: v } });
        const at = jwt.sign({ id: user._id, username: user.username, tokenVersion: v }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        const rt = jwt.sign({ id: user._id, tokenVersion: v }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        await User.updateOne({ _id: user._id }, { refreshToken: rt });
        res.cookie('jwt', rt, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.json({ accessToken: at, ...sanitizeUser(await User.findById(user._id)) });
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', dbCheck, async (req, res) => {
    const c = req.cookies; if (!c?.jwt) return res.json({ accessToken: null });
    const u = await User.findOne({ refreshToken: c.jwt });
    if (!u) { res.clearCookie('jwt'); return res.json({ accessToken: null }); }
    jwt.verify(c.jwt, REFRESH_TOKEN_SECRET, (err, dec) => {
        if (err || u.id !== dec.id || u.tokenVersion !== dec.tokenVersion) { res.clearCookie('jwt'); return res.json({ accessToken: null }); }
        res.json({ accessToken: jwt.sign({ id: u._id, username: u.username, tokenVersion: u.tokenVersion }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }) });
    });
});

app.post('/api/logout', dbCheck, async (req, res) => {
    if (req.cookies?.jwt) await User.updateOne({ refreshToken: req.cookies.jwt }, { refreshToken: '', $inc: { tokenVersion: 1 } });
    res.clearCookie('jwt'); res.sendStatus(204);
});

app.post('/api/register', dbCheck, validateRequest(RegisterSchema), async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (await User.findOne({ $or: [{ username }, { email }] })) return res.status(400).json({ message: 'Usuário já existe.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), missions: [], tokenVersion: 1 });
    const at = jwt.sign({ id: user._id, username: user.username, tokenVersion: 1 }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const rt = jwt.sign({ id: user._id, tokenVersion: 1 }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    user.refreshToken = rt; await user.save();
    res.cookie('jwt', rt, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax' });
    res.status(201).json({ accessToken: at, ...sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

app.post('/api/balance', authenticateToken, lockUserAction, async (req, res) => {
    const { newBalance } = req.body; 
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    const diff = newBalance - user.balance;
    if (diff === 0) return res.json({ success: true });
    try {
        await processTransaction(user._id, diff, diff > 0 ? 'DEPOSIT' : 'WITHDRAW', 'WALLET', `MANUAL_${Date.now()}`);
        res.json({ success: true });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/user/sync', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    if (user.activeGame && user.activeGame.type !== 'NONE') {
        // Session recovery logic
    }
    res.json(sanitizeUser(await User.findById(req.user.id)));
});

app.post('/api/user/avatar', authenticateToken, validateRequest(z.object({ avatarId: z.string() })), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (req.body.avatarId.startsWith('avatar_') && !user.ownedItems.includes(req.body.avatarId)) return res.status(403).json({ message: 'Bloqueado' });
        user.avatarId = req.body.avatarId; await user.save();
        res.json({ success: true, avatarId: user.avatarId });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user/verify', authenticateToken, async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { documentsStatus: 'PENDING' });
    res.json({ success: true });
});

app.post('/api/store/purchase', authenticateToken, lockUserAction, validateRequest(z.object({ itemId: z.string(), cost: z.number().int().positive() })), async (req, res) => {
    try {
        const { itemId, cost } = req.body;
        const user = await User.findById(req.user.id);
        if (user.loyaltyPoints < cost) return res.status(400).json({ message: 'Pontos insuficientes.' });
        if (user.ownedItems.includes(itemId)) return res.status(400).json({ message: 'Item já adquirido.' });
        user.loyaltyPoints -= cost; user.ownedItems.push(itemId);
        if (itemId.startsWith('avatar_')) user.avatarId = itemId;
        await user.save();
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/game/forfeit', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            const bet = user.activeGame.bet;
            await saveGameLog(user._id, user.activeGame.type, bet, 0, { result: 'FORFEIT' }, user.activeGame.riskLevel, 'PLAYER_ABANDONED');
            
            await User.updateOne({ _id: user._id }, { 
                $set: { activeGame: { type: 'NONE' }, lastBetResult: 'LOSS', consecutiveWins: 0 },
                $inc: { consecutiveLosses: 1 }
            });
            
            logGameResult(user.activeGame.type, user.username, -bet, user.sessionProfit, 'NORMAL', 'PLAYER_ABANDONED');
        }
        
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.status(500).json({ message: e.message }); }
});

// =====================================================================================
// 🃏 BLACKJACK IA V4.1
// =====================================================================================
app.post('/api/blackjack/deal', authenticateToken, lockUserAction, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount, sideBets } = req.body;
        const totalBet = amount + (sideBets?.perfectPairs || 0) + (sideBets?.dealerBust || 0);
        const user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK');
        
        const risk = calculateRisk(user, totalBet);
        let engineAdjustment = null;

        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
        secureShuffle(deck);
        
        let pHand=[deck.pop(),deck.pop()]; 
        let dHand=[deck.pop(),deck.pop()];

        // --- ADAPTIVE DEAL LOGIC ---
        // Engine optimization: adjust hands based on current RTP targets
        if ((risk.level === 'HIGH' || risk.level === 'EXTREME')) {
            if (dHand[0].value <= 6) {
                const tenOrAceIndex = deck.findIndex(c => c.value === 10 || c.value === 11);
                if (tenOrAceIndex !== -1) {
                    const swapCard = deck.splice(tenOrAceIndex, 1)[0];
                    deck.push(dHand[1]);
                    dHand[1] = swapCard;
                    engineAdjustment = 'DEAL_OPTIMIZATION_A';
                }
            }
            else if (dHand[0].value >= 10) {
                const tenIndex = deck.findIndex(c => c.value === 10);
                if (tenIndex !== -1) {
                    const ten = deck.splice(tenIndex, 1)[0];
                    deck.push(dHand[1]);
                    dHand[1] = ten;
                    engineAdjustment = 'DEAL_OPTIMIZATION_B';
                }
            }
        }

        // --- SIDE BET BALANCING ---
        if (sideBets?.perfectPairs > 0) {
            if (pHand[0].rank === pHand[1].rank) {
                const diffCardIndex = deck.findIndex(c => c.rank !== pHand[0].rank);
                if (diffCardIndex !== -1) {
                    const diffCard = deck.splice(diffCardIndex, 1)[0];
                    deck.push(pHand[1]);
                    pHand[1] = diffCard;
                    engineAdjustment = engineAdjustment ? engineAdjustment + ', PAIR_NORM' : 'PAIR_NORM';
                }
            }
        }

        if (risk.triggers.includes('MAX_EXPOSURE_LIMIT')) {
             engineAdjustment = engineAdjustment ? engineAdjustment + ', LIMITER_ACTIVE' : 'LIMITER_ACTIVE';
        }

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand); const dScore = calc(dHand);
        let status = 'PLAYING', result = 'NONE', payout = 0;
        
        if (dHand[0].rank === 'A' && pScore !== 21) status = 'INSURANCE';
        if (pScore === 21) { status = 'GAME_OVER'; if (dScore === 21) { result = 'PUSH'; payout = amount; } else { result = 'BLACKJACK'; payout = amount * 2.5; } }
        
        const serverSeed = generateSeed();
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');

        if (status === 'GAME_OVER') {
            if (payout > 0) await processTransaction(user._id, payout, 'WIN', 'BLACKJACK');
            else {
                await User.updateOne({ _id: user._id }, { $set: { lastBetResult: 'LOSS', previousBet: amount, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            }
            logGameResult('BLACKJACK', user.username, payout - totalBet, user.sessionProfit, risk.level, engineAdjustment);
            await saveGameLog(user._id, 'BLACKJACK', totalBet, payout, { pScore, dScore, result }, risk.level, engineAdjustment);
        } else {
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'BLACKJACK', bet: amount, sideBets, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: status, riskLevel: risk.level, serverSeed: serverSeed } } });
        }
        
        res.json({ playerHand: pHand, dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: (await User.findById(user._id)).balance, sideBetWin: 0, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/blackjack/insurance', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const { buyInsurance } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.bjDeck');
        if (!user || user.activeGame.type !== 'BLACKJACK') return res.status(400).json({ message: 'Jogo inválido' });
        
        const g = user.activeGame;
        if (g.bjStatus !== 'INSURANCE') return res.status(400).json({ message: 'Ação inválida' });

        const dealerHand = g.bjDealerHand;
        const playerHand = g.bjPlayerHand;
        
        const holeCard = dealerHand[1];
        const dealerHasBJ = holeCard.value === 10; 

        let insuranceWin = 0;
        let mainPayout = 0;
        let result = 'NONE';
        let status = 'PLAYING';

        if (buyInsurance) {
            const cost = g.bet / 2;
            await processTransaction(user._id, -cost, 'BET', 'BLACKJACK_INSURANCE');
            
            if (dealerHasBJ) {
                insuranceWin = cost * 3;
                await processTransaction(user._id, insuranceWin, 'WIN', 'BLACKJACK_INSURANCE');
            }
        }

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};

        if (dealerHasBJ) {
            status = 'GAME_OVER';
            dealerHand[1].isHidden = false;
            
            const playerScore = calc(playerHand); 
            const playerHasBJ = playerScore === 21 && playerHand.length === 2;

            if (playerHasBJ) {
                result = 'PUSH';
                mainPayout = g.bet;
                await processTransaction(user._id, mainPayout, 'REFUND', 'BLACKJACK');
            } else {
                result = 'LOSE'; 
                await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0, lastBetResult: 'LOSS' } });
            }
            
            await saveGameLog(user._id, 'BLACKJACK', g.bet, mainPayout + insuranceWin, { result, dealerHasBJ: true }, g.riskLevel, null);
        } else {
            status = 'PLAYING';
        }

        const update = {
            'activeGame.bjStatus': status,
            'activeGame.bjDealerHand': dealerHand, 
            'activeGame.insuranceBet': buyInsurance ? (g.bet/2) : 0
        };
        
        if (status === 'GAME_OVER') update['activeGame.type'] = 'NONE';

        await User.updateOne({ _id: user._id }, { $set: update });
        const finalUser = await User.findById(user._id);
        
        res.json({
            status,
            result,
            dealerHand: status === 'GAME_OVER' ? dealerHand : [dealerHand[0], { ...dealerHand[1], isHidden: true }],
            newBalance: finalUser.balance,
            insuranceWin
        });

    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/blackjack/hit', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let nextCard = deck.pop();
        let engineAdjustment = null;

        // --- DRAW OPTIMIZATION ---
        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            const currentScore = calc(g.bjPlayerHand);
            if (currentScore >= 12) {
                const neededToBust = 22 - currentScore; 
                const bustCardIndex = deck.findIndex(c => c.value >= neededToBust);
                
                if (bustCardIndex !== -1) {
                    deck.push(nextCard);
                    nextCard = deck.splice(bustCardIndex, 1)[0];
                    engineAdjustment = `DRAW_OPTIMIZATION (SC:${currentScore})`;
                }
            }
        }

        g.bjPlayerHand.push(nextCard);
        let status = 'PLAYING', result = 'NONE';
        
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: user._id }, { $set: { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, g.riskLevel, engineAdjustment);
            await saveGameLog(user._id, 'BLACKJACK', g.bet, 0, { result: 'BUST' }, g.riskLevel, engineAdjustment);
        } else {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.bjPlayerHand': g.bjPlayerHand, 'activeGame.bjDeck': deck } });
        }
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: (await User.findById(user._id)).balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        let engineAdjustment = null;

        // --- DEALER AI ---
        if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && pScore <= 21) {
            const lowCards = [];
            const otherCards = [];
            
            while(deck.length > 0) {
                const c = deck.pop();
                if (c.value >= 2 && c.value <= 5) lowCards.push(c);
                else otherCards.push(c);
            }
            const optimizedDeck = [...otherCards, ...lowCards];
            engineAdjustment = 'DEALER_STRATEGY_ADJUST';
            
            while (dScore < 17) { 
                const card = optimizedDeck.pop();
                if(!card) break; 
                g.bjDealerHand.push(card); 
                dScore = calc(g.bjDealerHand); 
            }
        } else {
            while (dScore < 17) { g.bjDealerHand.push(deck.pop()); dScore = calc(g.bjDealerHand); }
        }

        let result = 'LOSE', payout = 0;
        if (dScore > 21) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

        if (payout > 0) {
            await processTransaction(user._id, payout, 'WIN', 'BLACKJACK');
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
        }
        
        logGameResult('BLACKJACK', user.username, payout - g.bet, user.sessionProfit, g.riskLevel, engineAdjustment);
        await saveGameLog(user._id, 'BLACKJACK', g.bet, payout, { dScore, pScore, result }, g.riskLevel, engineAdjustment);
        
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: (await User.findById(user._id)).balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

// =====================================================================================
// 💣 MINES IA V4.1
// =====================================================================================
app.post('/api/mines/start', authenticateToken, lockUserAction, validateRequest(MinesStartSchema), async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES');
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(user, amount); 
        
        const serverSeed = generateSeed();
        await User.updateOne({ _id: req.user.id }, { $set: { previousBet: amount, activeGame: { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed } } });
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
        
        if (risk.level !== 'NORMAL') {
            logEvent('RISK-ENGINE', `MINES Started | User: ${user.username} | Risk: ${risk.level} | Triggers: ${risk.triggers.join(',')}`);
        }

        res.json({ success: true, newBalance: user.balance, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/mines/reveal', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; if (g.minesGameOver) return res.status(400).json({ message: 'Finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', newBalance: user.balance});
        
        let cM = [...g.minesList]; 
        let optimizationProb = 0;
        let adjustmentLog = null;

        // --- GAMEPLAY BALANCING ---
        if (g.minesCount <= 4) {
            const wins = user.consecutiveWins;
            if (wins >= 2) optimizationProb = 0.30;
            if (wins >= 3) optimizationProb = 0.40;
            if (wins >= 4) { optimizationProb = 0.90; adjustmentLog = 'ANTI_FARM_PROTOCOL'; }
            
            if (g.minesRevealed.length === 0 && user.consecutiveWins >= 2) {
                optimizationProb = Math.max(optimizationProb, 0.50);
            }
        }

        // --- DYNAMIC RECALIBRATION ---
        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            optimizationProb = g.riskLevel === 'EXTREME' ? 0.95 : 0.80;
            adjustmentLog = `GRID_RECALIBRATION_${g.riskLevel}`;
        }

        if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
            const safeIndex = cM.findIndex(m => !g.minesRevealed.includes(m)); 
            if (safeIndex !== -1) { 
                cM.splice(safeIndex, 1); 
                cM.push(tileId);
                if(!adjustmentLog) adjustmentLog = 'GAME_BALANCING';
            } 
        }

        if (cM.includes(tileId)) {
            // --- VISUAL CONSISTENCY ---
            const neighbors = [tileId-1, tileId+1, tileId-5, tileId+5, tileId-6, tileId-4, tileId+6, tileId+4].filter(n => n >= 0 && n < 25 && n !== tileId);
            let minesToMove = cM.filter(m => m !== tileId); 
            let visualMines = [tileId]; 

            for (let m of minesToMove) {
                if (neighbors.length > 0 && Math.random() > 0.3) { 
                    const n = neighbors.pop();
                    visualMines.push(n);
                } else {
                    visualMines.push(m);
                }
            }
            cM = visualMines;

            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 });
            logGameResult('MINES', user.username, -g.bet, user.sessionProfit, g.riskLevel, adjustmentLog);
            await saveGameLog(user._id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog);
            
            return res.json({ outcome: 'BOMB', mines: cM, status: 'GAME_OVER', newBalance: user.balance });
        }
        
        g.minesRevealed.push(tileId); 
        const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.minesRevealed': g.minesRevealed, 'activeGame.minesMultiplier': mult, 'activeGame.minesList': cM } });
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: user.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        await processTransaction(user._id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveWins: user.consecutiveWins + 1, consecutiveLosses: 0 });
        await saveGameLog(user._id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null);
        res.json({ success: true, profit, newBalance: (await User.findById(user._id)).balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
});

// =====================================================================================
// 🐯 TIGRINHO IA V4.2.3
// =====================================================================================
app.post('/api/tiger/spin', authenticateToken, lockUserAction, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        let outcome = 'LOSS'; 
        const r = secureRandomFloat();
        let engineAdjustment = null;
        
        // 1. RTP Adjustment (~85%)
        // VOLATILITY ADJUSTMENT: Reduced Small Win Freq to 0.15 (High Volatility)
        let chanceBigWin = 0.04; 
        let chanceSmallWin = 0.15; 

        // --- RTP DYNAMIC ADJUSTMENT ---
        if (risk.level === 'HIGH' || risk.level === 'EXTREME') {
            chanceBigWin = 0.0; 
            chanceSmallWin = 0.12; 
            engineAdjustment = 'RTP_ADJUSTMENT';
        }

        // 2. Max Profit Guard (ROI Check)
        // Prevent Big Win if ROI is already positive
        const currentNet = user.balance - user.totalDeposits;
        if (currentNet > 0 && r < chanceBigWin) {
            outcome = 'SMALL_WIN';
            engineAdjustment = 'YIELD_OPTIMIZATION';
        } else if (r < chanceBigWin) {
            outcome = 'BIG_WIN';
        } else if (r < (chanceBigWin + chanceSmallWin)) {
            outcome = 'SMALL_WIN';
        }
        
        // 3. LDW / Engagement Logic (Maximize small returns < bet)
        if (outcome === 'LOSS') {
           // Reduced LDW rate from 0.60 to 0.50 to increase ACTUAL LOSS frequency (0x return)
           const engagementRoll = secureRandomFloat();
           if (engagementRoll < 0.50) {
               outcome = 'PARTIAL_RETURN'; // Returns 0.5x bet
               engineAdjustment = 'ENGAGEMENT_SUSTAIN';
           } else {
               // The remaining 50% are Near Misses (Zero Return)
               engineAdjustment = 'VISUAL_TENSION';
           }
        }

        if (risk.triggers.includes('MAX_EXPOSURE_LIMIT')) {
            outcome = 'LOSS';
            engineAdjustment = 'SAFETY_CUTOFF';
        }

        let win = 0, grid = [], lines = [], fs = false;
        
        if (outcome === 'BIG_WIN') { 
            const m = secureRandomFloat() < 0.1 ? 10 : 5; 
            win = amount * m; 
            lines = [1]; 
            grid = ['orange', 'bag', 'statue', 'orange', 'wild', 'orange', 'jewel', 'firecracker', 'envelope']; 
            if (m === 10) { grid = Array(9).fill('wild'); lines = [0,1,2,3,4]; fs = true; } 
        }
        else if (outcome === 'SMALL_WIN') { 
            const m = (secureRandomInt(11, 20) / 10); 
            win = amount * m; 
            lines = [1]; 
            grid = ['bag', 'firecracker', 'jewel', 'orange', 'orange', 'orange', 'envelope', 'statue', 'bag']; 
        }
        else if (outcome === 'PARTIAL_RETURN') {
            const m = 0.5;
            win = amount * m;
            lines = [1];
            grid = ['statue', 'bag', 'orange', 'envelope', 'envelope', 'envelope', 'firecracker', 'wild', 'jewel'];
        }
        else { 
            // LOSS (Only hits here if SAFETY_CUTOFF or the 50% fall-through from LDW logic)
            win = 0; 
            const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; 
            grid = []; 
            for(let i=0; i<9; i++) grid.push(s[secureRandomInt(0, s.length)]); 
            
            // --- TENSION BUILDER ---
            grid[0] = 'wild'; grid[1] = 'wild'; grid[2] = 'orange'; 
            engineAdjustment = engineAdjustment ? engineAdjustment + ', TENSION_BUILD' : 'TENSION_BUILD';
        }
        
        if (win > 0) { 
            await processTransaction(user._id, win, 'WIN', 'TIGER'); 
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: amount, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }); 
        } else { 
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: amount, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } }); 
        }
        
        logGameResult('TIGER', user.username, win - amount, user.sessionProfit, risk.level, engineAdjustment);
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, lines, isFullScreen: fs, outcome }, risk.level, engineAdjustment);
        
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: (await User.findById(user._id)).balance, publicSeed: crypto.createHash('sha256').update(generateSeed()).digest('hex') });
    } catch(e) { res.status(400).json({message: e.message}); }
});

app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => { 
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Endpoint não encontrado.' });
    if (cachedIndexHtml) {
        res.setHeader('Cache-Control', 'no-store'); 
        res.send(cachedIndexHtml.replace(/__NONCE__/g, res.locals.nonce));
    } else res.status(500).send("System initializing...");
});

const startServer = async () => { 
    await connectDB(); 
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server (${VERSION}) running on port ${PORT}`);
        console.log(`👉 Local: http://localhost:${PORT}`);
    });
    server.on('error', (e) => { 
        if (e.code === 'EADDRINUSE') { 
            console.error(`❌ Port ${PORT} in use. Please kill the existing process.`); 
            process.exit(1); 
        } else {
            console.error("❌ Server Error:", e);
            throw e; 
        }
    });
};
startServer();
