
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { z } = require('zod'); // Validação Rigorosa
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BET_LIMIT = 100; 
const VERSION = 'v2.1.0-RELEASE'; // VERSÃO DE PRODUÇÃO (HARD ROI CAP)

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- SEGREDOS JWT ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS ---
const logEvent = (type, message) => {
    const timestamp = new Date().toISOString();
    
    // Log personalizado para SESSÃO (Rastreamento de Lucro/Prejuízo)
    if (type === 'SESSION') {
        console.log(`\x1b[35m[${timestamp}] ${message}\x1b[0m`);
        return;
    }
    
    // Em produção, enviar para Datadog/CloudWatch
    const color = type === 'ERROR' ? '\x1b[31m' : type === 'CHEAT' ? '\x1b[41m\x1b[37m' : type === 'BANK' ? '\x1b[32m' : '\x1b[36m';
    console.log(`${color}[${timestamp}] [${type}]\x1b[0m ${message}`);
};

// Helper para logar resultados finais de jogo (Win/Loss)
const logGameResult = (gameName, username, resultAmount, currentSessionNet, totalBets) => {
    const isWin = resultAmount > 0;
    const isPush = resultAmount === 0;
    const icon = isWin ? '🟢' : isPush ? '⚪' : '🔴';
    const amountStr = Math.abs(resultAmount).toFixed(2);
    const sign = isWin ? '+' : isPush ? '' : '-';
    const roi = totalBets > 0 ? ((currentSessionNet / totalBets) * 100).toFixed(1) : '0.0';
    
    // Apenas loga o resultado FINAL, limpando a poluição visual de apostas
    const msg = `📊 SESSION: [${gameName}] ${username} | Result: ${icon} ${sign}${amountStr} | Net: R$ ${currentSessionNet.toFixed(2)} (ROI: ${roi}%)`;
    logEvent('SESSION', msg);
};

// --- SECURE RNG UTILS (CSPRNG) ---
// Usa crypto nativo do Node.js (não Math.random) para segurança criptográfica
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

// --- HASHING UTIL (Integridade) ---
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

// --- MONGOOSE SCHEMAS (SECURITY ARCHITECTURE) ---

const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'REFUND'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    game: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'WALLET'], default: 'WALLET' },
    referenceId: { type: String }, 
    integrityHash: { type: String }, // Hash chain para imutabilidade
}, { timestamps: true });

const gameLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    game: { type: String, required: true },
    bet: { type: Number, required: true },
    payout: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    // Provably Fair Data
    serverSeed: { type: String }, 
    clientSeed: { type: String },
    resultSnapshot: { type: mongoose.Schema.Types.Mixed }, 
    riskLevel: { type: String },
}, { timestamps: true });

const activeGameSchema = new mongoose.Schema({
    type: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'NONE'], default: 'NONE' },
    bet: { type: Number, default: 0 },
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
    serverSeed: { type: String }, // Guardado durante o jogo
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true, select: false },
  refreshToken: { type: String, select: false },
  
  balance: { type: Number, default: 0, min: 0 },
  
  // Risk Engine Data & Session Tracking
  totalDeposits: { type: Number, default: 0 },
  
  // IMPORTANT: Session Tracking for the 15% Rule
  sessionProfit: { type: Number, default: 0 }, 
  sessionTotalBets: { type: Number, default: 0 }, // Novo campo para calcular ROI da sessão
  
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

// --- HELPER: FINANCIAL LEDGER (ATOMIC & IMMUTABLE) ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null) => {
    const absAmount = Math.abs(amount);
    const balanceChange = (type === 'BET' || type === 'WITHDRAW') ? -absAmount : absAmount;
    
    // Calcula mudança no lucro da sessão (Sorte)
    const profitChange = (type === 'WIN') ? absAmount : (type === 'BET') ? -absAmount : 0;
    
    // Atualiza Total Apostado na Sessão se for aposta
    const betsChange = (type === 'BET') ? absAmount : 0;

    // 1. Operação Atômica
    const query = { _id: userId };
    if (balanceChange < 0) {
        query.balance = { $gte: Math.abs(balanceChange) };
    }

    const updatedUser = await User.findOneAndUpdate(
        query,
        { 
            $inc: { 
                balance: balanceChange, 
                sessionProfit: profitChange,
                sessionTotalBets: betsChange 
            }
        }, 
        { new: true }
    );

    if (!updatedUser) {
        throw new Error('Saldo insuficiente ou erro de concorrência.');
    }

    // 2. Ledger Imutável
    try {
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 });
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = {
            userId,
            type,
            amount: absAmount, 
            balanceAfter: updatedUser.balance,
            game,
            referenceId,
            timestamp: new Date().toISOString()
        };
        
        const integrityHash = generateHash({ ...txData, prevHash }); 

        await Transaction.create({ ...txData, integrityHash });
        
        // --- LOG LOGIC ---
        if (type === 'WIN') {
            logGameResult(game, updatedUser.username, absAmount, updatedUser.sessionProfit, updatedUser.sessionTotalBets);
        } else if (type !== 'BET') {
            logEvent('BANK', `${type}: User ${updatedUser.username} | ${balanceChange > 0 ? '+' : ''}${balanceChange} | New Balance: ${updatedUser.balance}`);
        }

    } catch (e) {
        console.error("CRITICAL: Failed to log transaction", e);
    }

    return updatedUser;
};

// --- RISK ENGINE (CENTRALIZED HOUSE EDGE) ---

// NOVO: Verifica se o jogador atingiu o teto de 15% de lucro sobre o apostado
const isProfitCapped = (user) => {
    if (user.sessionTotalBets === 0) return false;
    // Se o lucro da sessão for maior que 15% do total apostado, TRAVA.
    const allowedProfit = user.sessionTotalBets * 0.15;
    const isCapped = user.sessionProfit > allowedProfit;
    
    // Log apenas se estiver barrando, para auditoria, mas sem poluir
    if (isCapped && secureRandomFloat() < 0.05) { // 5% de chance de logar para não spammar
         logEvent('RISK', `Profit Cap Limit Reached: ${user.username} (Profit: ${user.sessionProfit.toFixed(2)} > 15% of ${user.sessionTotalBets.toFixed(2)})`);
    }
    
    return isCapped;
};

// Define a agressividade da "Casa" baseada no comportamento do jogador
const calculateRisk = (user, currentBet) => {
    let isRigged = false;
    let reason = '';
    let level = 'NORMAL';

    // 1. HARD CAP DE 15% (Prioridade Máxima)
    if (isProfitCapped(user)) {
        return { isRigged: true, level: 'EXTREME', reason: 'Profit Cap 15% Breach' };
    }

    try {
        // --- DEFESA ANTI-MARTINGALE (Dobrar na Perda) ---
        // O jogador perdeu várias vezes e agora dobrou a aposta para recuperar.
        if (user.consecutiveLosses >= 3 && user.previousBet > 0 && currentBet >= user.previousBet * 1.8) {
             isRigged = true;
             level = 'HIGH';
             reason = 'Martingale Defense (Chase Loss)';
        }
        
        // --- DEFESA PAROLI (Dobrar na Vitória) ---
        // O jogador ganhou e agora dobrou a aposta (Alavancagem / Greed).
        // Isso é perigoso para a casa, pois permite vitórias exponenciais.
        else if (user.consecutiveWins >= 1 && user.previousBet > 0 && currentBet >= user.previousBet * 1.8) {
             isRigged = true;
             level = 'HIGH'; // Aumenta risco para quebrar a sequência
             reason = 'Paroli Defense (Greed Trap)';
        }
        
        // --- OUTRAS REGRAS ---
        
        // Regra 3: Streak Randomizada (Sofisticação)
        else if (user.consecutiveWins >= 2) {
            const streakProb = Math.min(0.9, (user.consecutiveWins - 1) * 0.30);
            if (secureRandomFloat() < streakProb) {
                isRigged = true; 
                reason = `Kin Streak Protocol (W:${user.consecutiveWins})`; 
            }
        }
        
        // Regra 4: All-In Trap (Apostou mais de 50% do saldo atual)
        else if (user.balance > 0 && currentBet >= (user.balance * 0.5)) { isRigged = true; reason = 'Desperation Trap'; }
        
        // Regra 5: Sniper Bet
        else if (user.previousBet >= 10 && currentBet >= user.previousBet * 8) { isRigged = true; reason = 'Sniper Bet'; }

        if (isRigged) {
            // Se já não foi setado como EXTREME ou HIGH
            if (level === 'NORMAL') level = 'HIGH';
        }

    } catch (err) { return { isRigged: false, level: 'NORMAL' }; }

    return { isRigged, level, reason };
};

// --- MIDDLEWARES (SECURITY LAYER) ---
const createRateLimiter = ({ windowMs, max }) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of requests.entries()) {
            if (now > data.expiry) requests.delete(key);
        }
    }, 60000); 

    return (req, res, next) => {
        const clientVersion = req.headers['x-client-version'];
        if (req.method !== 'OPTIONS' && clientVersion && clientVersion !== VERSION) {
            return res.status(426).json({ message: 'Cliente desatualizado. Recarregue a página.' });
        }
        let key = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (req.user && req.user.id) key = `USER:${req.user.id}`;
        if (req.ip === '127.0.0.1' || req.ip === '::1') return next();
        const now = Date.now();
        if (!requests.has(key)) {
            requests.set(key, { count: 1, expiry: now + windowMs });
        } else {
            const data = requests.get(key);
            if (now > data.expiry) {
                requests.set(key, { count: 1, expiry: now + windowMs });
            } else {
                data.count++;
                if (data.count > max) return res.status(429).json({ message: 'Muitas requisições. Aguarde.' });
            }
        }
        next();
    };
};

const checkActionCooldown = (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();
    const now = Date.now();
    const lastAction = app.locals[`cooldown_${userId}`] || 0;
    if (now - lastAction < 150) return res.status(429).json({ message: 'Ação muito rápida.' });
    app.locals[`cooldown_${userId}`] = now;
    next();
};

const validateRequest = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (error) {
        return res.status(400).json({ message: 'Dados inválidos', details: error.errors });
    }
};

app.set('trust proxy', 1);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.removeHeader('X-Powered-By');
    next();
});

app.use(cors({ 
    origin: true, 
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-version'] 
}));

app.use(createRateLimiter({ windowMs: 60000, max: 300 })); 
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 

// --- AUTHENTICATION ---
const authenticateToken = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        connectDB(); 
        return res.status(503).json({ message: 'Servidor iniciando. Tente novamente em 5s.' });
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- DB CONNECTION ---
let isConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) return; 
  if (isConnecting) return;
  isConnecting = true;
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI não definido.");
    await mongoose.connect(uri, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 15000, socketTimeoutMS: 45000 });
    console.log(`✅ MongoDB Conectado (Secure Mode)`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ Falha MongoDB: ${error.message}`);
    isConnecting = false;
    setTimeout(connectDB, 2000); 
  }
};

const sanitizeUser = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password; delete userObj.refreshToken; delete userObj._id; 
    if (userObj.activeGame) { delete userObj.activeGame.bjDeck; delete userObj.activeGame.minesList; delete userObj.activeGame.serverSeed; }
    return userObj;
};

// --- VALIDATION SCHEMAS (ZOD) ---
const LoginSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });
const RegisterSchema = z.object({ fullName: z.string().min(2), username: z.string().min(4).regex(/^[a-zA-Z0-9_]+$/), email: z.string().email(), cpf: z.string().min(11), birthDate: z.string().min(8), password: z.string().min(6) });
const BetSchema = z.object({ amount: z.number().int().positive().max(MAX_BET_LIMIT) });
const MinesStartSchema = z.object({ amount: z.number().int().positive().max(MAX_BET_LIMIT), minesCount: z.number().int().min(1).max(24) });

// --- ROUTES ---

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.status(dbState === 1 ? 200 : 503).json({ status: dbState === 1 ? 'UP' : 'DOWN', dbState });
});

app.post('/api/login', validateRequest(LoginSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando. Aguarde 5s...' }); }
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [ { username: new RegExp(`^${username}$`, 'i') }, { email: new RegExp(`^${username}$`, 'i') } ] }).select('+password');

    if (user && await verifyPassword(password, user.password)) {
        // RESET SESSION TRACKING ON LOGIN
        await User.updateOne({ _id: user._id }, { 
             $set: { 
                 sessionProfit: 0, 
                 sessionTotalBets: 0, 
                 consecutiveLosses: 0, 
                 activeGame: { type: 'NONE' } 
            } 
        });
        
        const accessToken = jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        await User.updateOne({ _id: user._id }, { refreshToken });
        
        res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        logEvent('AUTH', `Login: ${user.username} (Session Reset)`);
        
        const freshUser = await User.findById(user._id);
        return res.json({ accessToken, ...sanitizeUser(freshUser) });
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.sendStatus(503); }
    const user = await User.findOne({ refreshToken: cookies.jwt });
    if (!user) return res.sendStatus(403); 
    jwt.verify(cookies.jwt, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err || user._id.toString() !== decoded.id) return res.sendStatus(403);
        res.json({ accessToken: jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }) });
    });
});

app.post('/api/logout', async (req, res) => {
    if (req.cookies?.jwt && mongoose.connection.readyState === 1) {
        await User.updateOne({ refreshToken: req.cookies.jwt }, { refreshToken: '' }).catch(() => {});
    }
    res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION });
    res.sendStatus(204);
});

app.post('/api/register', validateRequest(RegisterSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando...' }); }
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário já existe.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), missions: [] });
    const accessToken = jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    user.refreshToken = refreshToken; await user.save();
    res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    logEvent('AUTH', `Register: ${user.username}`);
    res.status(201).json({ accessToken, ...sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

// --- TRANSACTIONS ---
app.post('/api/balance', authenticateToken, async (req, res) => {
    const { newBalance } = req.body; 
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    const diff = newBalance - user.balance;
    if (diff === 0) return res.json({ success: true });
    try {
        const type = diff > 0 ? 'DEPOSIT' : 'WITHDRAW';
        await processTransaction(user._id, diff, type, 'WALLET', `MANUAL_${Date.now()}`);
        res.json({ success: true });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/user/sync', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    if (user.activeGame && user.activeGame.type !== 'NONE') {
        // Se usuário abandonou a sessão, reseta e conta como derrota
        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1 } });
    }
    const freshUser = await User.findById(req.user.id);
    res.json(sanitizeUser(freshUser));
});

// --- PROFILE & STORE ROUTES ---
app.post('/api/user/avatar', authenticateToken, validateRequest(z.object({ avatarId: z.string() })), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        // Verifica se é avatar premium e se o usuário possui
        if (req.body.avatarId.startsWith('avatar_') && !user.ownedItems.includes(req.body.avatarId)) {
            return res.status(403).json({ message: 'Você não possui este avatar.' });
        }
        user.avatarId = req.body.avatarId;
        await user.save();
        res.json({ success: true, avatarId: user.avatarId });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/user/verify', authenticateToken, async (req, res) => {
    try {
        await User.updateOne({ _id: req.user.id }, { documentsStatus: 'PENDING' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/store/purchase', authenticateToken, validateRequest(z.object({ itemId: z.string(), cost: z.number().int().positive() })), async (req, res) => {
    try {
        const { itemId, cost } = req.body;
        const user = await User.findById(req.user.id);
        
        if (user.loyaltyPoints < cost) return res.status(400).json({ message: 'Pontos insuficientes.' });
        if (user.ownedItems.includes(itemId)) return res.status(400).json({ message: 'Item já adquirido.' });

        user.loyaltyPoints -= cost;
        user.ownedItems.push(itemId);
        
        // Se for avatar, equipa automaticamente
        if (itemId.startsWith('avatar_')) user.avatarId = itemId;

        await user.save();
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- BLACKJACK ENGINE ---
app.post('/api/blackjack/deal', authenticateToken, checkActionCooldown, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;
        const user = await processTransaction(userId, -amount, 'BET', 'BLACKJACK');
        
        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = [];
        for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { 
            let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; 
            deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); 
        }
        secureShuffle(deck);
        const pHand=[deck.pop(),deck.pop()];
        const dHand=[deck.pop(),deck.pop()];

        const risk = calculateRisk(user, amount);
        const riskLevel = risk.level;
        const serverSeed = generateSeed(); 

        // HOUSE EDGE BLACKJACK:
        // Se EXTREME (15% Cap) ou HIGH, o Dealer começa com vantagem clara.
        if (risk.isRigged) {
             logEvent('CHEAT', `Blackjack > Rigged Deal (${risk.reason}) | User: ${user.username}`);
             try {
                 const tenIdx = deck.findIndex(c => c.value === 10);
                 const aceIdx = deck.findIndex(c => c.rank === 'A');
                 
                 if (riskLevel === 'EXTREME') {
                     // NOVO: Modo Extremo força carta oculta do dealer ser 10 ou Ás (Mão forte ou BJ)
                     if (tenIdx !== -1 && aceIdx !== -1) {
                        dHand[1] = deck.splice(secureRandomFloat() > 0.3 ? tenIdx : aceIdx, 1)[0];
                     }
                 } else if (dHand[1].value < 7 && tenIdx !== -1) {
                     // Modo High padrão: Evita dealer com mão muito ruim (ex: 2 a 6)
                     dHand[1] = deck.splice(tenIdx, 1)[0]; 
                 }
             } catch(e){}
        }

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand);
        const dScore = calc(dHand);
        
        let status = 'PLAYING';
        let result = 'NONE';
        let payout = 0;

        if (pScore === 21) {
            status = 'GAME_OVER';
            if (dScore === 21) { result = 'PUSH'; payout = amount; }
            else { result = 'BLACKJACK'; payout = amount * 2.5; }
        }

        // SAVE GAME STATE & PREVIOUS BET
        if (status === 'GAME_OVER') {
            if (payout > 0) {
                await processTransaction(userId, payout, 'WIN', 'BLACKJACK');
            } else {
                if (result !== 'PUSH') logGameResult('BLACKJACK', user.username, -amount, user.sessionProfit, user.sessionTotalBets);
            }
            await User.updateOne({ _id: userId }, { $set: { activeGame: { type: 'NONE' }, previousBet: amount } });
            await GameLog.create({ userId, game: 'BLACKJACK', bet: amount, payout, profit: payout - amount, resultSnapshot: { pHand, dHand }, riskLevel, serverSeed });
        } else {
            await User.updateOne({ _id: userId }, { 
                $set: { 
                    previousBet: amount, // Grava a aposta para análise futura
                    activeGame: { 
                        type: 'BLACKJACK', bet: amount, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: 'PLAYING', riskLevel, serverSeed
                    }
                } 
            });
        }

        const finalUser = await User.findById(userId);
        res.json({
            playerHand: pHand,
            dealerHand: status==='PLAYING'?[dHand[0],{...dHand[1],isHidden:true}]:dHand,
            status, result, 
            newBalance: finalUser.balance
        });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/blackjack/hit', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        
        const g = user.activeGame;
        const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        // HOUSE EDGE HIT:
        // Se EXTREME (15% Cap) e jogador tem chance de estourar, dá a carta que estoura.
        if (g.riskLevel === 'EXTREME') {
            const currentScore = calc(g.bjPlayerHand);
            if (currentScore >= 12) {
                // Tenta achar carta que estoure (10, J, Q, K são ótimos pra isso)
                const bustCardIdx = deck.findIndex(c => currentScore + c.value > 21);
                if (bustCardIdx !== -1) {
                    deck.push(deck.splice(bustCardIdx, 1)[0]);
                    logEvent('CHEAT', `Blackjack > Precision Bust | User: ${user.username}`);
                }
            }
        }

        const card = deck.pop();
        g.bjPlayerHand.push(card);
        
        let status = 'PLAYING';
        let result = 'NONE';
        
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER';
            result = 'BUST';
            await User.updateOne({ _id: user._id }, { 
                $set: { activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } 
            });
            await GameLog.create({ userId: user._id, game: 'BLACKJACK', bet: g.bet, payout: 0, profit: -g.bet, resultSnapshot: { pHand: g.bjPlayerHand, reason: 'BUST' }, riskLevel: g.riskLevel, serverSeed: g.serverSeed });
            
            // LOG MANUAL DA PERDA
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
        } else {
            await User.updateOne({ _id: user._id }, { 
                $set: { 'activeGame.bjPlayerHand': g.bjPlayerHand, 'activeGame.bjDeck': deck } 
            });
        }

        const freshUser = await User.findById(user._id);
        res.json({
            playerHand: g.bjPlayerHand, 
            dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], 
            status, result, 
            newBalance: freshUser.balance
        });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(g.bjPlayerHand);
        let dScore = calc(g.bjDealerHand);

        while (dScore < 17) {
            // HOUSE EDGE STAND:
            // Se HIGH/EXTREME, dealer tenta encontrar carta perfeita para ganhar ou empatar sem estourar.
            if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && dScore + 10 > 21) {
                 const killerCardIdx = deck.findIndex(c => {
                     const val = dScore + c.value;
                     // Tenta ganhar (val >= pScore) ou pelo menos empatar, sem estourar (<= 21)
                     return val <= 21 && val >= pScore;
                 });
                 if (killerCardIdx !== -1) {
                     deck.push(deck.splice(killerCardIdx, 1)[0]);
                     logEvent('CHEAT', `Blackjack > Sweaty Dealer | User: ${user.username}`);
                 }
            }
            g.bjDealerHand.push(deck.pop());
            dScore = calc(g.bjDealerHand);
        }

        let result = 'LOSE';
        let payout = 0;
        if (dScore > 21 || pScore > dScore) { result = 'WIN'; payout = g.bet * 2; } 
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

        if (payout > 0) {
            await processTransaction(user._id, payout, 'WIN', 'BLACKJACK');
            if (result === 'WIN') await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
            // LOG DA PERDA
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
        }

        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' } } });
        await GameLog.create({ userId: user._id, game: 'BLACKJACK', bet: g.bet, payout, profit: payout - g.bet, resultSnapshot: { pScore, dScore }, riskLevel: g.riskLevel, serverSeed: g.serverSeed });
        const finalUser = await User.findById(user._id);
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: finalUser.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- MINES GAME ---
app.post('/api/mines/start', authenticateToken, checkActionCooldown, validateRequest(MinesStartSchema), async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES');
        const minesSet = new Set();
        while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        
        const risk = calculateRisk(user, amount);
        const serverSeed = generateSeed();

        await User.updateOne({ _id: req.user.id }, {
            $set: { 
                previousBet: amount,
                activeGame: { 
                    type: 'MINES', bet: amount, minesCount, 
                    minesList: Array.from(minesSet), minesRevealed: [], 
                    minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed
                }
            }
        });
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/mines/reveal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        if (g.minesGameOver) return res.status(400).json({ message: 'Finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', newBalance: user.balance});

        let currentMines = g.minesList;
        const isFarm = g.minesCount <= 3; 
        let rigProb = 0;
        const revealedCount = g.minesRevealed.length;
        
        // --- DEFESA "PAROLI" (ANTI-MARTINGALE) SOFISTICADA ---
        // Se o risco for HIGH (Greed Trap detectada), permitimos 1 ou 2 cliques seguros para
        // dar a sensação de vitória, e depois aumentamos drasticamente o risco.
        if (g.riskLevel === 'HIGH') {
            if (revealedCount === 0) rigProb = 0.0; // 1º Clique: Seguro (Hook)
            else if (revealedCount === 1) rigProb = 0.20; // 2º Clique: Baixo Risco
            else if (revealedCount === 2) rigProb = 0.60; // 3º Clique: A Armadilha se fecha
            else rigProb = 0.95; // 4º+ Clique: Morte Súbita
            
            // logEvent('CHEAT', `Mines > Paroli Defense | Step: ${revealedCount+1} | Prob: ${rigProb}`);
        } 
        else if (g.riskLevel === 'EXTREME') {
            // HARD CAP: Sem piedade
            rigProb = 1.0;
        } else {
            // Risco Normal (Escada progressiva suave)
            if (isFarm && user.consecutiveWins >= 3) rigProb = 0.4;
        }

        // Algoritmo Quantum Mine
        if (secureRandomFloat() < rigProb && !currentMines.includes(tileId)) {
            const safeIdx = currentMines.findIndex(m => !g.minesRevealed.includes(m));
            if (safeIdx !== -1) { 
                currentMines.splice(safeIdx, 1); 
                currentMines.push(tileId); 
                
                const logMsg = g.riskLevel === 'EXTREME' ? 'Illusion of Choice' : g.riskLevel === 'HIGH' ? 'Paroli Trap' : 'Quantum Mine';
                logEvent('CHEAT', `Mines > ${logMsg} | User: ${user.username} | Click #${revealedCount + 1}`); 
            }
        }

        if (currentMines.includes(tileId)) {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            await GameLog.create({ userId: user._id, game: 'MINES', bet: g.bet, payout: 0, profit: -g.bet, resultSnapshot: { hit: tileId }, riskLevel: g.riskLevel, serverSeed: g.serverSeed });
            
            // LOG MANUAL DA PERDA
            logGameResult('MINES', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);

            let visualMines = [...currentMines];
            return res.json({ outcome: 'BOMB', mines: visualMines, status: 'GAME_OVER', newBalance: user.balance });
        }

        g.minesRevealed.push(tileId);
        const multiplier = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.minesRevealed': g.minesRevealed, 'activeGame.minesMultiplier': multiplier, 'activeGame.minesList': currentMines } });
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * multiplier, multiplier, newBalance: user.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        await processTransaction(user._id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveWins: user.consecutiveWins + 1, consecutiveLosses: 0 } });
        await GameLog.create({ userId: user._id, game: 'MINES', bet: g.bet, payout: profit, profit: profit - g.bet, resultSnapshot: { revealed: g.minesRevealed.length }, riskLevel: g.riskLevel, serverSeed: g.serverSeed });
        const finalUser = await User.findById(user._id);
        res.json({ success: true, profit, newBalance: finalUser.balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- TIGER GAME ---
app.post('/api/tiger/spin', authenticateToken, checkActionCooldown, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        const serverSeed = generateSeed();
        
        // 1. Determine Outcome Strategy
        let outcome = 'LOSS';
        const rand = secureRandomFloat();
        
        let bigWinProb = 0.30; // 30% chance of Real Profit
        let ldwProb = 0.25;    // 25% chance of LDW (Small Fake Win)

        if (risk.level === 'HIGH') {
            // Se for Paroli Defense (Dobrou na vitória), cortamos a Big Win drasticamente
            // E aumentamos o LDW para drenar o saldo mantendo a ilusão
            bigWinProb = 0.05; // Quase impossível ganhar de verdade
            ldwProb = 0.50; // Alta chance de vitória falsa (ganha menos que a aposta)
            logEvent('CHEAT', `Tigrinho > High Risk (${risk.reason}) | User: ${user.username}`);
        } else if (risk.level === 'EXTREME') {
            bigWinProb = 0.0; // No real profit allowed
            ldwProb = 0.60; // Heavy fake wins to drain slowly
            logEvent('CHEAT', `Tigrinho > Draining (LDW Mode) | User: ${user.username}`);
        }

        if (rand < bigWinProb) outcome = 'BIG_WIN';
        else if (rand < (bigWinProb + ldwProb)) outcome = 'SMALL_WIN';

        let totalWin = 0;
        let grid = [];
        let winningLines = [];
        let isFullScreen = false;

        if (outcome === 'BIG_WIN') {
            // Real profit (2x to 10x)
            const mult = secureRandomFloat() < 0.1 ? 10 : 2;
            totalWin = amount * mult;
            winningLines = [1]; // Middle line
            // Grid with Wild in middle
            grid = ['orange', 'bag', 'statue', 'orange', 'wild', 'orange', 'jewel', 'firecracker', 'envelope'];
            if (mult === 10) {
                grid = Array(9).fill('wild');
                winningLines = [0,1,2,3,4];
                isFullScreen = true;
            }
        } else if (outcome === 'SMALL_WIN') {
            // LDW: Payout 0.2x to 0.8x (PREJUÍZO DISFARÇADO)
            const mult = (secureRandomInt(2, 8) / 10); // 0.2x a 0.8x
            totalWin = amount * mult;
            winningLines = [1]; // Middle line matches visually
            
            logEvent('CHEAT', `Tigrinho > LDW Generated | Pay: ${mult}x | Bet: ${amount} > Win: ${totalWin.toFixed(2)}`);

            // Visual: 3 Oranges (weakest symbol) in middle row
            grid = [
                'bag', 'firecracker', 'jewel', 
                'orange', 'orange', 'orange', 
                'envelope', 'statue', 'bag'
            ];
            // Shuffle top and bottom rows for randomness
            const top = ['bag', 'firecracker', 'jewel', 'statue', 'envelope'];
            secureShuffle(top);
            grid[0]=top[0]; grid[1]=top[1]; grid[2]=top[2];
            grid[6]=top[3]; grid[7]=top[4]; grid[8]=top[0];
        } else {
            // LOSS
            totalWin = 0;
            winningLines = [];
            // Generate random grid with no obvious lines
            const syms = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel'];
            grid = [];
            for(let i=0; i<9; i++) grid.push(syms[secureRandomInt(0, syms.length)]);
            
            // Inject Near Miss if High Risk
            // Se o jogador dobrou a aposta e perdeu, mostramos 2 Wilds para parecer "quase"
            if (risk.level === 'HIGH' && secureRandomFloat() < 0.4) {
                // Two wilds in middle
                grid[3] = 'orange'; grid[4] = 'wild'; grid[5] = 'wild';
            }
        }

        if (totalWin > 0) {
            await processTransaction(user._id, totalWin, 'WIN', 'TIGER');
            // Só conta como vitória consecutiva se for lucro real
            if (outcome === 'BIG_WIN') {
                await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, previousBet: amount });
            } else {
                // LDW reseta win streak ou mantém? Geralmente mantém para o usuário achar que está ganhando
                // Mas matematicamente é loss. Vamos resetar para não ativar triggers de "sorte".
                await User.updateOne({ _id: user._id }, { $set: { consecutiveWins: 0 }, previousBet: amount });
            }
        } else {
            await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, previousBet: amount });
            // LOG DA PERDA (Spin vazio)
            logGameResult('TIGER', user.username, -amount, user.sessionProfit, user.sessionTotalBets);
        }

        await GameLog.create({ userId: user._id, game: 'TIGER', bet: amount, payout: totalWin, profit: totalWin - amount, riskLevel: risk.level, serverSeed });
        const finalUser = await User.findById(user._id);
        res.json({ grid, totalWin, winningLines, isFullScreen, newBalance: finalUser.balance });
    } catch(e) { res.status(400).json({message: e.message}); }
});

// Serve Static Assets (ALWAYS ACTIVE IN THIS FIX)
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-All para React Router (Serve o index.html se não for rota de API)
app.get('*', (req, res) => { 
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: 'Endpoint não encontrado.' });
    }
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath); 
    } else {
        res.status(500).send("Erro crítico: Build do frontend não encontrado. Execute 'npm run build'.");
    }
});

const startServer = async () => { 
    connectDB(); 
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Secure (${VERSION}) running on port ${PORT}`)); 
};
startServer();
