
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const zlib = require('zlib'); // Performance: Compressão Nativa
const { z } = require('zod'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BET_LIMIT = 100; 
const VERSION = 'v3.0.0-RC1'; // Release Candidate 1

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || true; 

// --- USER LOCKS (MUTEX) ---
// Previne Race Conditions de requisições paralelas do mesmo usuário
const userLocks = new Map();
const acquireLock = (userId) => {
    if (userLocks.has(userId)) return false;
    userLocks.set(userId, Date.now());
    return true;
};
const releaseLock = (userId) => {
    userLocks.delete(userId);
};
// Limpeza automática de locks travados (segurança contra deadlocks)
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of userLocks.entries()) {
        if (now - timestamp > 5000) userLocks.delete(userId); // 5s timeout
    }
}, 1000);

// --- CACHE DE ARQUIVOS ESTÁTICOS (PERFORMANCE CRÍTICA) ---
let cachedIndexHtml = null;
const indexPath = path.join(__dirname, 'dist', 'index.html');

// Pré-carrega o HTML para memória ao iniciar
try {
    if (fs.existsSync(indexPath)) {
        cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
        console.log("⚡ Static Assets: index.html cached in memory.");
    } else {
        console.warn("⚠️ Warning: dist/index.html not found. Build the frontend first.");
    }
} catch (e) { console.error("Static Cache Error:", e); }

// --- SEGREDOS JWT ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS (Async Non-Blocking) ---
const logEvent = (type, message) => {
    const timestamp = new Date().toISOString();
    // Uso de process.stdout para evitar bloqueio excessivo em high-load
    if (type === 'SESSION') {
        process.stdout.write(`\x1b[35m[${timestamp}] ${message}\x1b[0m\n`);
    } else {
        const color = type === 'ERROR' ? '\x1b[31m' : type === 'CHEAT' ? '\x1b[41m\x1b[37m' : type === 'BANK' ? '\x1b[32m' : type === 'AUTH' ? '\x1b[33m' : '\x1b[36m';
        process.stdout.write(`${color}[${timestamp}] [${type}]\x1b[0m ${message}\n`);
    }
};

const logGameResult = (gameName, username, resultAmount, currentSessionNet, totalBets) => {
    const isWin = resultAmount > 0;
    const isPush = resultAmount === 0;
    const icon = isWin ? '🟢' : isPush ? '⚪' : '🔴';
    const amountStr = Math.abs(resultAmount).toFixed(2);
    const sign = isWin ? '+' : isPush ? '' : '-';
    const roi = totalBets > 0 ? ((currentSessionNet / totalBets) * 100).toFixed(1) : '0.0';
    const msg = `📊 SESSION: [${gameName}] ${username} | Result: ${icon} ${sign}${amountStr} | Net: R$ ${currentSessionNet.toFixed(2)} (ROI: ${roi}%)`;
    logEvent('SESSION', msg);
};

// --- SECURE RNG UTILS (CSPRNG) ---
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

// --- MIDDLEWARES DE SEGURANÇA & PERFORMANCE ---

// 1. Sanitização contra NoSQL Injection (Remove chaves com $)
const mongoSanitize = (req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (const key in obj) {
                if (key.startsWith('$')) {
                    delete obj[key];
                } else {
                    sanitize(obj[key]);
                }
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
};

// 2. Compressão GZIP Nativa para JSON
const compressionMiddleware = (req, res, next) => {
    const send = res.send;
    res.send = (body) => {
        if (typeof body === 'string' || Buffer.isBuffer(body) || typeof body === 'object') {
            const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;
            // Apenas comprime se for maior que 1KB
            if (bodyString.length > 1024) {
                zlib.gzip(bodyString, (err, buffer) => {
                    if (!err) {
                        res.set('Content-Encoding', 'gzip');
                        res.set('Content-Type', 'application/json');
                        send.call(res, buffer);
                    } else {
                        send.call(res, body);
                    }
                });
            } else {
                send.call(res, body);
            }
        } else {
            send.call(res, body);
        }
    };
    next();
};

// --- MONGOOSE SCHEMAS ---
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'REFUND'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    game: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'WALLET'], default: 'WALLET' },
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
  
  // NEW: Token Versioning for Session Invalidation
  tokenVersion: { type: Number, default: 0, select: true },

  balance: { type: Number, default: 0, min: 0 },
  totalDeposits: { type: Number, default: 0 },
  sessionProfit: { type: Number, default: 0 }, 
  sessionTotalBets: { type: Number, default: 0 }, 
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  previousBet: { type: Number, default: 0 }, 
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

// --- HELPER: SAVE GAME LOG ---
const saveGameLog = async (userId, game, bet, payout, resultSnapshot, riskLevel) => {
    try {
        await GameLog.create({
            userId,
            game,
            bet,
            payout,
            profit: payout - bet,
            resultSnapshot,
            riskLevel,
            timestamp: new Date()
        });
    } catch(e) { console.error("Log Error:", e.message); }
};

// --- BANK GRADE TRANSACTION PROCESSOR (ACID + PRECISION FIX) ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null) => {
    // FIX: Round to 2 decimals properly to avoid IEEE 754 float errors
    // Converte para centavos (int), opera e volta para float
    const safeAmount = Math.floor(Math.abs(amount) * 100) / 100;
    
    const balanceChange = (type === 'BET' || type === 'WITHDRAW') ? -safeAmount : safeAmount;
    const profitChange = (type === 'WIN') ? safeAmount : (type === 'BET') ? -safeAmount : 0;
    const betsChange = (type === 'BET') ? safeAmount : 0;

    let session = null;
    let updatedUser = null;

    try {
        // Tenta iniciar uma sessão para transação ACID (Requer Replica Set no Mongo)
        try { session = await mongoose.startSession(); } catch(e) {}

        if (session) {
            session.startTransaction();
            try {
                // 1. Verifica saldo e atualiza atomicamente dentro da transação
                const query = { _id: userId };
                if (balanceChange < 0) {
                    query.balance = { $gte: Math.abs(balanceChange) }; // Previne saldo negativo
                }

                updatedUser = await User.findOneAndUpdate(
                    query,
                    { $inc: { balance: balanceChange, sessionProfit: profitChange, sessionTotalBets: betsChange } }, 
                    { new: true, session }
                );

                if (!updatedUser) throw new Error('Saldo insuficiente ou erro de transação.');

                // 2. Cria registro de auditoria imutável
                const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session);
                const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
                const txData = { userId, type, amount: safeAmount, balanceAfter: updatedUser.balance, game, referenceId, timestamp: new Date().toISOString() };
                const integrityHash = generateHash({ ...txData, prevHash }); 
                
                await Transaction.create([{ ...txData, integrityHash }], { session });

                await session.commitTransaction();
            } catch (err) {
                await session.abortTransaction();
                throw err;
            } finally {
                session.endSession();
            }
        } else {
            // Fallback para ambientes sem Replica Set (Dev Mode)
            const query = { _id: userId };
            if (balanceChange < 0) query.balance = { $gte: Math.abs(balanceChange) };
            
            updatedUser = await User.findOneAndUpdate(
                query,
                { $inc: { balance: balanceChange, sessionProfit: profitChange, sessionTotalBets: betsChange } }, 
                { new: true }
            );
            if (!updatedUser) throw new Error('Saldo insuficiente.');
            
            // Log Best Effort
            try {
                const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 });
                const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
                const txData = { userId, type, amount: safeAmount, balanceAfter: updatedUser.balance, game, referenceId, timestamp: new Date().toISOString() };
                const integrityHash = generateHash({ ...txData, prevHash });
                await Transaction.create({ ...txData, integrityHash });
            } catch(e) { console.error("Audit log failed", e); }
        }

        // Logging Visual
        if (type === 'WIN') {
            logGameResult(game, updatedUser.username, safeAmount, updatedUser.sessionProfit, updatedUser.sessionTotalBets);
        } else if (type !== 'BET') {
            logEvent('BANK', `${type}: User ${updatedUser.username} | ${balanceChange}`);
        }

        return updatedUser;

    } catch (e) {
        logEvent('ERROR', `Transaction Failed: ${e.message}`);
        throw e;
    }
};

const isProfitCapped = (user) => {
    if (user.sessionTotalBets === 0) return false;
    const allowedProfit = user.sessionTotalBets * 0.15;
    return user.sessionProfit > allowedProfit;
};

const calculateRisk = (user, currentBet) => {
    let isRigged = false, reason = '', level = 'NORMAL';
    if (isProfitCapped(user)) return { isRigged: true, level: 'EXTREME', reason: 'Profit Cap' };
    try {
        if (user.consecutiveLosses >= 3 && user.previousBet > 0 && currentBet >= user.previousBet * 1.8) {
             isRigged = true; level = 'HIGH'; reason = 'Martingale Defense';
        } else if (user.consecutiveWins >= 1 && user.previousBet > 0 && currentBet >= user.previousBet * 1.8) {
             isRigged = true; level = 'HIGH'; reason = 'Paroli Defense';
        } else if (user.balance > 0 && currentBet >= (user.balance * 0.5)) { isRigged = true; reason = 'All-In Trap'; }
        if (isRigged && level === 'NORMAL') level = 'HIGH';
    } catch (err) { }
    return { isRigged, level, reason };
};

// --- MIDDLEWARE: LOCK USER ACTION ---
const lockUserAction = (req, res, next) => {
    if (req.user && req.user.id) {
        if (!acquireLock(req.user.id)) {
            return res.status(429).json({ message: 'Aguarde a ação anterior terminar.' });
        }
        // Hook into res.json/send/end to release lock
        const originalSend = res.send;
        res.send = function (...args) {
            releaseLock(req.user.id);
            originalSend.apply(res, args);
        };
    }
    next();
};

const createRateLimiter = ({ windowMs, max }) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of requests.entries()) if (now > data.expiry) requests.delete(key);
    }, 60000); 
    return (req, res, next) => {
        let key = req.ip || req.headers['x-forwarded-for'];
        if (req.user && req.user.id) key = `USER:${req.user.id}`;
        if (req.ip === '127.0.0.1') return next();
        const now = Date.now();
        if (!requests.has(key)) requests.set(key, { count: 1, expiry: now + windowMs });
        else {
            const data = requests.get(key);
            if (now > data.expiry) requests.set(key, { count: 1, expiry: now + windowMs });
            else { 
                data.count++; 
                if (data.count > max) {
                    res.setHeader('Retry-After', Math.ceil((data.expiry - now) / 1000));
                    return res.status(429).json({ message: 'Muitas requisições. Aguarde.' }); 
                }
            }
        }
        next();
    };
};

const validateRequest = (schema) => (req, res, next) => {
    try { schema.parse(req.body); next(); } catch (error) { return res.status(400).json({ message: 'Dados inválidos' }); }
};

app.set('trust proxy', 1);

// --- HARDENED SECURITY HEADERS WITH NONCE (BANK GRADE) ---
app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;

    res.removeHeader('X-Powered-By'); 
    res.setHeader('X-Content-Type-Options', 'nosniff'); 
    res.setHeader('X-Frame-Options', 'DENY'); 
    res.setHeader('X-XSS-Protection', '1; mode=block'); 
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    res.setHeader('Content-Security-Policy', 
        `default-src 'self'; ` + 
        `script-src 'self' 'nonce-${nonce}' https://esm.sh; ` + 
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` + 
        `font-src 'self' https://fonts.gstatic.com; ` +
        `img-src 'self' data: https://www.transparenttextures.com; ` +
        `connect-src 'self'`
    );
    
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(cors({ 
    origin: ALLOWED_ORIGIN, 
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-version']
}));

app.use(createRateLimiter({ windowMs: 60000, max: 300 })); 
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 
app.use(mongoSanitize); // Sanitização NoSQL
app.use(compressionMiddleware); // Compressão GZIP

// --- AUTH MIDDLEWARE (SESSION ENFORCEMENT) ---
const authenticateToken = async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Iniciando...' }); }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, ACCESS_TOKEN_SECRET, async (err, decoded) => {
        if (err) return res.sendStatus(403);
        
        // Single Session Check:
        try {
            const user = await User.findById(decoded.id).select('tokenVersion');
            
            if (!user) return res.sendStatus(403);
            
            if (decoded.tokenVersion !== user.tokenVersion) {
                return res.status(403).json({ 
                    code: 'SESSION_KICKED', 
                    message: 'Sua conta foi acessada em outro dispositivo.' 
                });
            }
            
            req.user = { id: decoded.id, username: decoded.username };
            next();
        } catch(e) {
            return res.sendStatus(500);
        }
    });
};

let isConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1 || isConnecting) return;
  isConnecting = true;
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI missing");
    await mongoose.connect(uri, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 15000 });
    
    // Check Replica Set status for ACID transactions
    const isReplicaSet = !!mongoose.connection.client.topology.s.options.replicaSet;
    if (IS_PRODUCTION && !isReplicaSet) {
        console.warn("⚠️ WARNING: MongoDB is NOT in Replica Set mode. Transactions will not be ACID compliant. Enable Replica Set for Production.");
    }
    
    console.log(`✅ MongoDB Conectado (Replica Set: ${isReplicaSet ? 'YES' : 'NO'})`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ DB Error: ${error.message}`);
    isConnecting = false;
    setTimeout(connectDB, 2000); 
  }
};

// --- PROVABLY FAIR HELPER ---
const sanitizeUser = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    if (!userObj.id && userObj._id) {
        userObj.id = userObj._id.toString();
    }
    if (userObj.activeGame && userObj.activeGame.serverSeed) {
        userObj.activeGame.publicSeed = crypto.createHash('sha256').update(userObj.activeGame.serverSeed).digest('hex');
    }
    delete userObj.password; 
    delete userObj.refreshToken; 
    delete userObj._id; 
    delete userObj.tokenVersion;
    if (userObj.activeGame) { 
        delete userObj.activeGame.bjDeck; 
        delete userObj.activeGame.minesList; 
        delete userObj.activeGame.serverSeed; 
    }
    return userObj;
};

// --- VALIDATION SCHEMAS ---
const LoginSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });
const RegisterSchema = z.object({ fullName: z.string().min(2), username: z.string().min(4), email: z.string().email(), cpf: z.string().min(11), birthDate: z.string().min(8), password: z.string().min(6) });
const BetSchema = z.object({ 
    amount: z.number().positive().max(MAX_BET_LIMIT),
    sideBets: z.object({ perfectPairs: z.number().min(0), dealerBust: z.number().min(0) }).optional() 
});
const MinesStartSchema = z.object({ amount: z.number().positive().max(MAX_BET_LIMIT), minesCount: z.number().int().min(1).max(24) });

// --- ROUTES ---
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', secure: true }));

app.post('/api/login', validateRequest(LoginSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Aguarde...' }); }
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [ { username: new RegExp(`^${username}$`, 'i') }, { email: new RegExp(`^${username}$`, 'i') } ] }).select('+password');
    if (user && await verifyPassword(password, user.password)) {
        const newTokenVersion = (user.tokenVersion || 0) + 1;
        await User.updateOne({ _id: user._id }, { 
            $set: { sessionProfit: 0, sessionTotalBets: 0, consecutiveLosses: 0, activeGame: { type: 'NONE' }, tokenVersion: newTokenVersion } 
        });
        logEvent('AUTH', `User logged in: ${user.username} (v${newTokenVersion})`);
        const accessToken = jwt.sign({ id: user._id, username: user.username, tokenVersion: newTokenVersion }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ id: user._id, tokenVersion: newTokenVersion }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        await User.updateOne({ _id: user._id }, { refreshToken });
        res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        const freshUser = await User.findById(user._id);
        return res.json({ accessToken, ...sanitizeUser(freshUser) });
    }
    logEvent('AUTH', `Failed login attempt: ${username}`);
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.json({ accessToken: null });
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.sendStatus(503); }
    const user = await User.findOne({ refreshToken: cookies.jwt });
    if (!user) { res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION }); return res.json({ accessToken: null }); }
    jwt.verify(cookies.jwt, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err || user._id.toString() !== decoded.id || user.tokenVersion !== decoded.tokenVersion) { res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION }); return res.json({ accessToken: null }); }
        const accessToken = jwt.sign({ id: user._id, username: user.username, tokenVersion: user.tokenVersion }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        res.json({ accessToken });
    });
});

app.post('/api/logout', async (req, res) => {
    if (req.cookies?.jwt) {
        const user = await User.findOne({ refreshToken: req.cookies.jwt });
        if (user) await User.updateOne({ _id: user._id }, { refreshToken: '', $inc: { tokenVersion: 1 } });
    }
    res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION });
    res.sendStatus(204);
});

app.post('/api/register', validateRequest(RegisterSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Aguarde...' }); }
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (await User.findOne({ $or: [{ username }, { email }] })) return res.status(400).json({ message: 'Usuário já existe.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), missions: [], tokenVersion: 1 });
    logEvent('AUTH', `New user registered: ${user.username}`);
    const accessToken = jwt.sign({ id: user._id, username: user.username, tokenVersion: 1 }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id, tokenVersion: 1 }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    user.refreshToken = refreshToken; await user.save();
    res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ accessToken, ...sanitizeUser(user) });
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
        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1 } });
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

// --- BLACKJACK GAMES ROUTES ---
app.post('/api/blackjack/deal', authenticateToken, lockUserAction, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount, sideBets } = req.body;
        const ppBet = sideBets?.perfectPairs || 0;
        const dbBet = sideBets?.dealerBust || 0;
        const totalBet = amount + ppBet + dbBet;

        const user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK');
        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
        secureShuffle(deck);
        
        let pHand=[deck.pop(),deck.pop()]; 
        let dHand=[deck.pop(),deck.pop()];

        // --- CHEAT: PERFECT PAIRS AVOIDANCE ---
        if (ppBet > 0) {
            let attempts = 0;
            while (pHand[0].rank === pHand[1].rank && attempts < 10) {
                deck.unshift(pHand.pop());
                pHand.push(deck.pop());
                attempts++;
                logEvent('CHEAT', `BLACKJACK: ❌ Perfect Pair Avoided | User: ${user.username} | Bet: R$ ${ppBet}`);
            }
        }

        const risk = calculateRisk(user, amount);
        
        if (risk.isRigged) {
             try {
                 const tenIdx = deck.findIndex(c => c.value === 10);
                 const aceIdx = deck.findIndex(c => c.rank === 'A');
                 
                 if (risk.level === 'EXTREME' && tenIdx !== -1 && aceIdx !== -1) {
                     dHand[1] = deck.splice(secureRandomFloat() > 0.3 ? tenIdx : aceIdx, 1)[0];
                     logEvent('CHEAT', `BLACKJACK: 🃏 Deck Rigged | User: ${user.username} | Reason: ${risk.reason} | Detail: Loaded Dealer Hole Card with High Value`);
                 }
                 else if (dHand[1].value < 7 && tenIdx !== -1) {
                     dHand[1] = deck.splice(tenIdx, 1)[0]; 
                     logEvent('CHEAT', `BLACKJACK: 🃏 Deck Rigged | User: ${user.username} | Reason: ${risk.reason} | Detail: Swapped Weak Hole Card for 10`);
                 }
             } catch(e){}
        }
        
        let ppPayout = 0;
        if (ppBet > 0 && pHand[0].rank === pHand[1].rank) {
            let mult = 6; 
            const isRed = (s) => s === '♥' || s === '♦';
            if (isRed(pHand[0].suit) === isRed(pHand[1].suit)) mult = 11;
            if (pHand[0].suit === pHand[1].suit) mult = 31;
            ppPayout = ppBet * mult;
            await processTransaction(user._id, ppPayout, 'WIN', 'BLACKJACK', `PP_${Date.now()}`);
        }

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand); const dScore = calc(dHand);
        let status = 'PLAYING', result = 'NONE', payout = 0;
        
        if (dHand[0].rank === 'A' && pScore !== 21) {
            status = 'INSURANCE';
        }

        if (pScore === 21) { status = 'GAME_OVER'; if (dScore === 21) { result = 'PUSH'; payout = amount; } else { result = 'BLACKJACK'; payout = amount * 2.5; } }
        
        if (status === 'GAME_OVER') {
            if (payout > 0) await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
            else if (result !== 'PUSH') logGameResult('BLACKJACK', user.username, -amount, user.sessionProfit, user.sessionTotalBets);
            
            await saveGameLog(user._id, 'BLACKJACK', amount, payout, { result, pScore, dScore }, risk.level);
            await User.updateOne({ _id: req.user.id }, { $set: { activeGame: { type: 'NONE' }, previousBet: amount } });
        } else {
            await User.updateOne({ _id: req.user.id }, { $set: { 
                previousBet: amount, 
                activeGame: { 
                    type: 'BLACKJACK', 
                    bet: amount, 
                    sideBets: { perfectPairs: ppBet, dealerBust: dbBet },
                    bjDeck: deck, 
                    bjPlayerHand: pHand, 
                    bjDealerHand: dHand, 
                    bjStatus: status, 
                    riskLevel: risk.level, 
                    serverSeed: generateSeed() 
                } 
            } });
        }
        const fU = await User.findById(req.user.id);
        const responseData = { 
            playerHand: pHand, 
            dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, 
            status, 
            result, 
            newBalance: fU.balance, 
            publicSeed: null,
            sideBetWin: ppPayout 
        };
        if (fU.activeGame && fU.activeGame.serverSeed) {
            responseData.publicSeed = crypto.createHash('sha256').update(fU.activeGame.serverSeed).digest('hex');
        }
        res.json(responseData);
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/blackjack/insurance', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const { buyInsurance } = req.body;
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        
        if(!user || user.activeGame.bjStatus !== 'INSURANCE') {
            return res.status(400).json({ code: 'INVALID_STATE', message: 'Ação inválida.' });
        }
        
        const g = user.activeGame;
        let deck = g.bjDeck;
        const dealerHand = g.bjDealerHand;
        
        if (dealerHand[0].rank !== 'A') return res.status(500).json({ message: "Erro de integridade." });

        let insuranceCost = 0;
        let insuranceWin = 0;
        let status = 'PLAYING';
        let result = 'NONE';
        
        if (buyInsurance) {
            insuranceCost = g.bet * 0.5;
            await processTransaction(user._id, -insuranceCost, 'BET', 'BLACKJACK', 'INSURANCE_FEE');

            if (dealerHand[1].value === 10) {
                let swapIndex = deck.findIndex(c => c.value === 8 || c.value === 9);
                if (swapIndex === -1) swapIndex = deck.findIndex(c => c.value !== 10);

                if (swapIndex !== -1) {
                    const originalHoleCard = dealerHand[1];
                    const safeCard = deck.splice(swapIndex, 1)[0]; 
                    dealerHand[1] = safeCard;
                    deck.push(originalHoleCard);
                    logEvent('ALGORITHM', `🛡️ Insurance SCAM: User ${user.username} bought insurance. Swapped.`);
                }
            }
        } else {
            if (dealerHand[1].value !== 10) {
                const RIG_CHANCE = 0.60;
                const roll = secureRandomFloat(); 
                if (roll < RIG_CHANCE) {
                    const tenIndex = deck.findIndex(c => c.value === 10);
                    if (tenIndex !== -1) {
                        const originalHoleCard = dealerHand[1];
                        dealerHand[1] = deck.splice(tenIndex, 1)[0]; 
                        deck.push(originalHoleCard); 
                        logEvent('ALGORITHM', `💀 Punishment Rig: User ${user.username} declined insurance. Forced BJ.`);
                    }
                }
            }
        }

        const calcScore = (hand) => {
            let s = 0, a = 0;
            hand.forEach(c => { s += c.value; if(c.rank === 'A') a++; });
            while(s > 21 && a > 0) { s -= 10; a--; }
            return s;
        };
        const dScore = calcScore(dealerHand);

        if (dScore === 21 && dealerHand.length === 2) {
            status = 'GAME_OVER';
            result = 'LOSE';
            if (buyInsurance) {
                const payout = insuranceCost * 3;
                insuranceWin = payout;
                await processTransaction(user._id, payout, 'WIN', 'BLACKJACK', 'INSURANCE_PAYOUT');
            }
            await saveGameLog(user._id, 'BLACKJACK', g.bet, 0, { result: 'DEALER_BJ', dScore: 21 }, g.riskLevel);
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' } }, $inc: { sessionProfit: -g.bet } });
        } else {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.bjStatus': 'PLAYING', 'activeGame.bjDeck': deck, 'activeGame.bjDealerHand': dealerHand, 'activeGame.insuranceBet': insuranceCost } });
        }

        const updatedUser = await User.findById(user._id);
        res.json({ playerHand: g.bjPlayerHand, dealerHand: status === 'GAME_OVER' ? dealerHand : [dealerHand[0], { ...dealerHand[1], isHidden: true }], status, result, newBalance: updatedUser.balance, insuranceWin });
    } catch(e) { res.status(500).json({ message: "Erro no seguro." }); }
});

app.post('/api/blackjack/hit', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        if (g.riskLevel === 'EXTREME' && calc(g.bjPlayerHand) >= 12) { 
            const bust = deck.findIndex(c => calc(g.bjPlayerHand) + c.value > 21); 
            if (bust !== -1) {
                deck.push(deck.splice(bust, 1)[0]); 
                logEvent('CHEAT', `BLACKJACK: 💥 Forced BUST on Hit | User: ${user.username}`);
            }
        }
        
        g.bjPlayerHand.push(deck.pop());
        let status = 'PLAYING', result = 'NONE';
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
            await saveGameLog(user._id, 'BLACKJACK', g.bet, 0, { result, hand: g.bjPlayerHand }, g.riskLevel);
        } else await User.updateOne({ _id: user._id }, { $set: { 'activeGame.bjPlayerHand': g.bjPlayerHand, 'activeGame.bjDeck': deck } });
        const fU = await User.findById(user._id);
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: fU.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, lockUserAction, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        const dbBet = g.sideBets?.dealerBust || 0;

        while (dScore < 17) {
            const nextCard = deck[deck.length - 1]; 
            if (dbBet > 0 && dScore + nextCard.value > 21) {
                const safeCardIdx = deck.findIndex(c => dScore + c.value <= 21);
                if (safeCardIdx !== -1) {
                    const safeCard = deck.splice(safeCardIdx, 1)[0];
                    deck.push(deck.pop()); 
                    deck.push(safeCard);
                    logEvent('CHEAT', `BLACKJACK: 🛡️ Dealer Bust Avoided`);
                }
            }
            if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && dScore + nextCard.value > 21 && dbBet === 0) { 
                const k = deck.findIndex(c => { const v = dScore + c.value; return v <= 21 && v >= pScore; }); 
                if (k !== -1) deck.push(deck.splice(k, 1)[0]); 
            }
            g.bjDealerHand.push(deck.pop()); dScore = calc(g.bjDealerHand);
        }

        let result = 'LOSE', payout = 0, dbPayout = 0;
        if (dScore > 21) { 
            result = 'WIN'; payout = g.bet * 2;
            if (dbBet > 0) { dbPayout = dbBet * 3; await processTransaction(user._id, dbPayout, 'WIN', 'BLACKJACK', 'DEALER_BUST'); }
        } 
        else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; } 
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }
        
        if (payout > 0) { await processTransaction(user._id, payout, 'WIN', 'BLACKJACK'); if (result === 'WIN') await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }); }
        else { await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } }); logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets); }
        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' } } });
        await saveGameLog(user._id, 'BLACKJACK', g.bet, payout, { result, pScore, dScore }, g.riskLevel);

        const fU = await User.findById(user._id);
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: fU.balance, sideBetWin: dbPayout });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/start', authenticateToken, lockUserAction, validateRequest(MinesStartSchema), async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES');
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(user, amount);
        const serverSeed = generateSeed();
        await User.updateOne({ _id: req.user.id }, { $set: { previousBet: amount, activeGame: { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed } } });
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
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
        let rigProb = 0; let activeCheats = [];
        const revealedCount = g.minesRevealed.length;
        const safeTilesTotal = 25 - g.minesCount;
        const progress = revealedCount / safeTilesTotal; 
        if (progress > 0.4) { rigProb += 0.20; if(progress > 0.4 && secureRandomFloat() < 0.2) activeCheats.push('Progressive Resistance'); }
        if (progress > 0.6) { rigProb += 0.40; if(progress > 0.6 && secureRandomFloat() < 0.4) activeCheats.push('Greed Trap (Med)'); }
        if (progress > 0.8) { rigProb += 0.90; activeCheats.push('Greed Trap (High)'); }
        if (g.minesCount <= 3) {
            if (user.consecutiveWins >= 3) {
               let farmingSeverity = 0;
               if (user.consecutiveWins >= 6) farmingSeverity = 1.0; 
               else if (user.consecutiveWins >= 5) farmingSeverity = 0.85; 
               else if (user.consecutiveWins >= 4) farmingSeverity = 0.50; 
               else farmingSeverity = 0.25; 
               rigProb = Math.max(rigProb, farmingSeverity);
               activeCheats.push(`ANTI-FARMING: Low Mines (${g.minesCount})`);
            }
            if (revealedCount >= 5 && user.consecutiveWins >= 2) { rigProb += 0.30; activeCheats.push(`ANTI-FARMING: Deep Dive`); }
        } else if (user.consecutiveWins >= 3) { rigProb += 0.15; activeCheats.push(`Standard Win Streak Suppression`); }
        if (g.riskLevel === 'HIGH') { rigProb += 0.40; activeCheats.push('Risk Profile: HIGH'); }
        if (g.riskLevel === 'EXTREME') { rigProb = 1.0; activeCheats.push('Risk Profile: EXTREME'); }
        const nextMult = 1.0 + ((revealedCount + 1) * 0.1 * g.minesCount); 
        const potentialWin = g.bet * nextMult;
        if (potentialWin > 50 || nextMult > 5.0) { rigProb += 0.50; activeCheats.push(`Multiplier Defense`); }
        rigProb = Math.min(rigProb, 1.0);
        if (!cM.includes(tileId) && secureRandomFloat() < rigProb) { 
            const safeIndex = cM.findIndex(m => !g.minesRevealed.includes(m)); 
            if (safeIndex !== -1) { 
                logEvent('CHEAT', `MINES: 💣 Q-SWAP | User: ${user.username}`);
                cM.splice(safeIndex, 1); cM.push(tileId); 
            } 
        }
        if (cM.includes(tileId)) {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            logGameResult('MINES', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
            await saveGameLog(user._id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount, revealedCount: g.minesRevealed.length }, g.riskLevel);
            return res.json({ outcome: 'BOMB', mines: cM, status: 'GAME_OVER', newBalance: user.balance });
        }
        g.minesRevealed.push(tileId); const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
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
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveWins: user.consecutiveWins + 1, consecutiveLosses: 0 } });
        await saveGameLog(user._id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier, revealedCount: g.minesRevealed.length }, g.riskLevel);
        const fU = await User.findById(user._id);
        res.json({ success: true, profit, newBalance: fU.balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/tiger/spin', authenticateToken, lockUserAction, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        let outcome = 'LOSS'; const r = secureRandomFloat();
        let bigWin = 0.08; let ldw = 0.35;    
        const potentialMaxWin = amount * 10;
        const allowedProfitCap = Math.max(10, user.sessionTotalBets * 0.10); 
        const projectedProfit = user.sessionProfit + potentialMaxWin;
        if (projectedProfit > allowedProfitCap) { bigWin = 0.0; ldw = 0.40; logEvent('CHEAT', `TIGER: 📉 Profit Cap | User: ${user.username}`); }
        if (risk.level === 'HIGH') { bigWin = 0.01; ldw = 0.25; logEvent('CHEAT', `TIGER: 📉 Odds Smashed`); } 
        else if (risk.level === 'EXTREME') { bigWin = 0.0; ldw = 0.15; logEvent('CHEAT', `TIGER: 🛑 EXTREME Nerf`); }
        if (r < bigWin) outcome = 'BIG_WIN'; else if (r < (bigWin + ldw)) outcome = 'SMALL_WIN';
        let win = 0, grid = [], lines = [], fs = false;
        if (outcome === 'BIG_WIN') { const m = secureRandomFloat() < 0.1 ? 10 : 2; win = amount * m; lines = [1]; grid = ['orange', 'bag', 'statue', 'orange', 'wild', 'orange', 'jewel', 'firecracker', 'envelope']; if (m === 10) { grid = Array(9).fill('wild'); lines = [0,1,2,3,4]; fs = true; } }
        else if (outcome === 'SMALL_WIN') { const m = (secureRandomInt(2, 8) / 10); win = amount * m; lines = [1]; grid = ['bag', 'firecracker', 'jewel', 'orange', 'orange', 'orange', 'envelope', 'statue', 'bag']; const top = ['bag', 'firecracker', 'jewel', 'statue', 'envelope']; secureShuffle(top); grid[0]=top[0]; grid[1]=top[1]; grid[2]=top[2]; grid[6]=top[3]; grid[7]=top[4]; grid[8]=top[0]; }
        else { win = 0; lines = []; const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; grid = []; for(let i=0; i<9; i++) grid.push(s[secureRandomInt(0, s.length)]); }
        if (win > 0) { await processTransaction(user._id, win, 'WIN', 'TIGER'); if (outcome === 'BIG_WIN') await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, previousBet: amount }); else await User.updateOne({ _id: user._id }, { $set: { consecutiveWins: 0 }, previousBet: amount }); }
        else { await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, previousBet: amount }); logGameResult('TIGER', user.username, -amount, user.sessionProfit, user.sessionTotalBets); }
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, lines, isFullScreen: fs, outcome }, risk.level);
        const serverSeed = generateSeed(); const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
        const fU = await User.findById(user._id);
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: fU.balance, publicSeed });
    } catch(e) { res.status(400).json({message: e.message}); }
});

app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => { 
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Endpoint não encontrado.' });
    
    // SERVER SIDE CACHING - CRÍTICO PARA PERFORMANCE
    if (cachedIndexHtml) {
        const finalHtml = cachedIndexHtml.replace(/__NONCE__/g, res.locals.nonce);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); 
        res.setHeader('Pragma', 'no-cache'); 
        res.setHeader('Expires', '0'); 
        res.setHeader('Surrogate-Control', 'no-store');
        res.send(finalHtml);
    } else {
        res.status(500).send("System initializing...");
    }
});

const startServer = async () => { 
    await connectDB(); 
    const server = app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server (${VERSION}) running on port ${PORT}`));
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') { console.error(`\n❌ FATAL ERROR: Port ${PORT} is already in use.`); process.exit(1); } else { throw error; }
    });
};
startServer();
