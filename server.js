
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
const VERSION = 'v2.1.2-LOGCLEAN'; // Atualizado para limpeza de logs

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- SEGREDOS JWT ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS ---
const logEvent = (type, message) => {
    const timestamp = new Date().toISOString();
    if (type === 'SESSION') {
        console.log(`\x1b[35m[${timestamp}] ${message}\x1b[0m`);
    } else {
        const color = type === 'ERROR' ? '\x1b[31m' : type === 'CHEAT' ? '\x1b[41m\x1b[37m' : type === 'BANK' ? '\x1b[32m' : '\x1b[36m';
        console.log(`${color}[${timestamp}] [${type}]\x1b[0m ${message}`);
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

const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null) => {
    const absAmount = Math.abs(amount);
    const balanceChange = (type === 'BET' || type === 'WITHDRAW') ? -absAmount : absAmount;
    const profitChange = (type === 'WIN') ? absAmount : (type === 'BET') ? -absAmount : 0;
    const betsChange = (type === 'BET') ? absAmount : 0;

    const query = { _id: userId };
    if (balanceChange < 0) {
        query.balance = { $gte: Math.abs(balanceChange) };
    }

    const updatedUser = await User.findOneAndUpdate(
        query,
        { $inc: { balance: balanceChange, sessionProfit: profitChange, sessionTotalBets: betsChange } }, 
        { new: true }
    );

    if (!updatedUser) throw new Error('Saldo insuficiente ou erro de concorrência.');

    try {
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 });
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        const txData = { userId, type, amount: absAmount, balanceAfter: updatedUser.balance, game, referenceId, timestamp: new Date().toISOString() };
        const integrityHash = generateHash({ ...txData, prevHash }); 
        await Transaction.create({ ...txData, integrityHash });
        
        if (type === 'WIN') {
            logGameResult(game, updatedUser.username, absAmount, updatedUser.sessionProfit, updatedUser.sessionTotalBets);
        } else if (type !== 'BET') {
            // Oculta logs de BET para não poluir, mostra apenas transações bancárias relevantes
            logEvent('BANK', `${type}: User ${updatedUser.username} | ${balanceChange}`);
        }
    } catch (e) { console.error("Tx Log Error", e); }
    return updatedUser;
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
            else { data.count++; if (data.count > max) return res.status(429).json({ message: 'Aguarde.' }); }
        }
        next();
    };
};

const checkActionCooldown = (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();
    const now = Date.now();
    const lastAction = app.locals[`cooldown_${userId}`] || 0;
    if (now - lastAction < 150) return res.status(429).json({ message: 'Rápido demais.' });
    app.locals[`cooldown_${userId}`] = now;
    next();
};

const validateRequest = (schema) => (req, res, next) => {
    try { schema.parse(req.body); next(); } catch (error) { return res.status(400).json({ message: 'Dados inválidos' }); }
};

app.set('trust proxy', 1);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(cors({ origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(createRateLimiter({ windowMs: 60000, max: 300 })); 
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 

const authenticateToken = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Iniciando...' }); }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
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
    console.log(`✅ MongoDB Conectado`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ DB Error: ${error.message}`);
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

// --- VALIDATION SCHEMAS ---
const LoginSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });
const RegisterSchema = z.object({ fullName: z.string().min(2), username: z.string().min(4), email: z.string().email(), cpf: z.string().min(11), birthDate: z.string().min(8), password: z.string().min(6) });
const BetSchema = z.object({ amount: z.number().int().positive().max(MAX_BET_LIMIT) });
const MinesStartSchema = z.object({ amount: z.number().int().positive().max(MAX_BET_LIMIT), minesCount: z.number().int().min(1).max(24) });

// --- ROUTES ---
app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));

app.post('/api/login', validateRequest(LoginSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Aguarde...' }); }
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [ { username: new RegExp(`^${username}$`, 'i') }, { email: new RegExp(`^${username}$`, 'i') } ] }).select('+password');
    if (user && await verifyPassword(password, user.password)) {
        await User.updateOne({ _id: user._id }, { $set: { sessionProfit: 0, sessionTotalBets: 0, consecutiveLosses: 0, activeGame: { type: 'NONE' } } });
        const accessToken = jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        await User.updateOne({ _id: user._id }, { refreshToken });
        res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        const freshUser = await User.findById(user._id);
        return res.json({ accessToken, ...sanitizeUser(freshUser) });
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.json({ accessToken: null });
    
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.sendStatus(503); }
    
    const user = await User.findOne({ refreshToken: cookies.jwt });
    
    if (!user) {
        res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION });
        return res.json({ accessToken: null });
    }
    
    jwt.verify(cookies.jwt, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err || user._id.toString() !== decoded.id) {
             res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION });
             return res.json({ accessToken: null });
        }
        res.json({ accessToken: jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }) });
    });
});

app.post('/api/logout', async (req, res) => {
    if (req.cookies?.jwt) await User.updateOne({ refreshToken: req.cookies.jwt }, { refreshToken: '' }).catch(() => {});
    res.clearCookie('jwt', { httpOnly: true, sameSite: IS_PRODUCTION ? 'None' : 'Lax', secure: IS_PRODUCTION });
    res.sendStatus(204);
});

app.post('/api/register', validateRequest(RegisterSchema), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Aguarde...' }); }
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (await User.findOne({ $or: [{ username }, { email }] })) return res.status(400).json({ message: 'Usuário já existe.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), missions: [] });
    const accessToken = jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    user.refreshToken = refreshToken; await user.save();
    res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ accessToken, ...sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

app.post('/api/balance', authenticateToken, async (req, res) => {
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

app.post('/api/store/purchase', authenticateToken, validateRequest(z.object({ itemId: z.string(), cost: z.number().int().positive() })), async (req, res) => {
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

// --- GAMES ---
app.post('/api/blackjack/deal', authenticateToken, checkActionCooldown, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'BLACKJACK');
        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
        secureShuffle(deck);
        const pHand=[deck.pop(),deck.pop()]; const dHand=[deck.pop(),deck.pop()];
        const risk = calculateRisk(user, amount);
        
        if (risk.isRigged) {
             try {
                 const tenIdx = deck.findIndex(c => c.value === 10);
                 const aceIdx = deck.findIndex(c => c.rank === 'A');
                 if (risk.level === 'EXTREME' && tenIdx !== -1 && aceIdx !== -1) dHand[1] = deck.splice(secureRandomFloat() > 0.3 ? tenIdx : aceIdx, 1)[0];
                 else if (dHand[1].value < 7 && tenIdx !== -1) dHand[1] = deck.splice(tenIdx, 1)[0]; 
             } catch(e){}
        }
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand); const dScore = calc(dHand);
        let status = 'PLAYING', result = 'NONE', payout = 0;
        if (pScore === 21) { status = 'GAME_OVER'; if (dScore === 21) { result = 'PUSH'; payout = amount; } else { result = 'BLACKJACK'; payout = amount * 2.5; } }
        
        if (status === 'GAME_OVER') {
            if (payout > 0) await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
            else if (result !== 'PUSH') logGameResult('BLACKJACK', user.username, -amount, user.sessionProfit, user.sessionTotalBets);
            
            // SAVE LOG
            await saveGameLog(user._id, 'BLACKJACK', amount, payout, { result, pScore, dScore }, risk.level);
            
            await User.updateOne({ _id: req.user.id }, { $set: { activeGame: { type: 'NONE' }, previousBet: amount } });
        } else {
            await User.updateOne({ _id: req.user.id }, { $set: { previousBet: amount, activeGame: { type: 'BLACKJACK', bet: amount, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: 'PLAYING', riskLevel: risk.level, serverSeed: generateSeed() } } });
        }
        const fU = await User.findById(req.user.id);
        res.json({ playerHand: pHand, dealerHand: status==='PLAYING'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: fU.balance });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/blackjack/hit', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        if (g.riskLevel === 'EXTREME' && calc(g.bjPlayerHand) >= 12) { const bust = deck.findIndex(c => calc(g.bjPlayerHand) + c.value > 21); if (bust !== -1) deck.push(deck.splice(bust, 1)[0]); }
        g.bjPlayerHand.push(deck.pop());
        let status = 'PLAYING', result = 'NONE';
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
            
            // SAVE LOG (BUST)
            await saveGameLog(user._id, 'BLACKJACK', g.bet, 0, { result, hand: g.bjPlayerHand }, g.riskLevel);
        } else await User.updateOne({ _id: user._id }, { $set: { 'activeGame.bjPlayerHand': g.bjPlayerHand, 'activeGame.bjDeck': deck } });
        const fU = await User.findById(user._id);
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: fU.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        while (dScore < 17) {
            if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && dScore + 10 > 21) { const k = deck.findIndex(c => { const v = dScore + c.value; return v <= 21 && v >= pScore; }); if (k !== -1) deck.push(deck.splice(k, 1)[0]); }
            g.bjDealerHand.push(deck.pop()); dScore = calc(g.bjDealerHand);
        }
        let result = 'LOSE', payout = 0;
        if (dScore > 21 || pScore > dScore) { result = 'WIN'; payout = g.bet * 2; } else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }
        if (payout > 0) { await processTransaction(user._id, payout, 'WIN', 'BLACKJACK'); if (result === 'WIN') await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }); }
        else { await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } }); logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets); }
        await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' } } });
        
        // SAVE LOG
        await saveGameLog(user._id, 'BLACKJACK', g.bet, payout, { result, pScore, dScore }, g.riskLevel);

        const fU = await User.findById(user._id);
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: fU.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/start', authenticateToken, checkActionCooldown, validateRequest(MinesStartSchema), async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES');
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(user, amount);
        await User.updateOne({ _id: req.user.id }, { $set: { previousBet: amount, activeGame: { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed: generateSeed() } } });
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.status(400).json({ message: e.message }); }
});

app.post('/api/mines/reveal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; if (g.minesGameOver) return res.status(400).json({ message: 'Finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', newBalance: user.balance});
        let cM = g.minesList; let rig = 0; const rC = g.minesRevealed.length;
        if (g.riskLevel === 'HIGH') { if (rC === 1) rig = 0.20; else if (rC === 2) rig = 0.60; else if (rC > 2) rig = 0.95; } else if (g.riskLevel === 'EXTREME') rig = 1.0;
        if (secureRandomFloat() < rig && !cM.includes(tileId)) { const safe = cM.findIndex(m => !g.minesRevealed.includes(m)); if (safe !== -1) { cM.splice(safe, 1); cM.push(tileId); } }
        if (cM.includes(tileId)) {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            logGameResult('MINES', user.username, -g.bet, user.sessionProfit, user.sessionTotalBets);
            
            // SAVE LOG (BOMB)
            await saveGameLog(user._id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount, revealedCount: g.minesRevealed.length }, g.riskLevel);
            
            return res.json({ outcome: 'BOMB', mines: cM, status: 'GAME_OVER', newBalance: user.balance });
        }
        g.minesRevealed.push(tileId); const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.minesRevealed': g.minesRevealed, 'activeGame.minesMultiplier': mult, 'activeGame.minesList': cM } });
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: user.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inválido'});
        const g = user.activeGame; const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        await processTransaction(user._id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.type': 'NONE', consecutiveWins: user.consecutiveWins + 1, consecutiveLosses: 0 } });
        
        // SAVE LOG (CASHOUT)
        await saveGameLog(user._id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier, revealedCount: g.minesRevealed.length }, g.riskLevel);

        const fU = await User.findById(user._id);
        res.json({ success: true, profit, newBalance: fU.balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/tiger/spin', authenticateToken, checkActionCooldown, validateRequest(BetSchema), async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        let outcome = 'LOSS'; const r = secureRandomFloat();
        let bigWin = 0.30; let ldw = 0.25;
        if (risk.level === 'HIGH') { bigWin = 0.05; ldw = 0.50; } else if (risk.level === 'EXTREME') { bigWin = 0.0; ldw = 0.60; }
        if (r < bigWin) outcome = 'BIG_WIN'; else if (r < (bigWin + ldw)) outcome = 'SMALL_WIN';
        let win = 0, grid = [], lines = [], fs = false;
        if (outcome === 'BIG_WIN') { const m = secureRandomFloat() < 0.1 ? 10 : 2; win = amount * m; lines = [1]; grid = ['orange', 'bag', 'statue', 'orange', 'wild', 'orange', 'jewel', 'firecracker', 'envelope']; if (m === 10) { grid = Array(9).fill('wild'); lines = [0,1,2,3,4]; fs = true; } }
        else if (outcome === 'SMALL_WIN') { const m = (secureRandomInt(2, 8) / 10); win = amount * m; lines = [1]; grid = ['bag', 'firecracker', 'jewel', 'orange', 'orange', 'orange', 'envelope', 'statue', 'bag']; const top = ['bag', 'firecracker', 'jewel', 'statue', 'envelope']; secureShuffle(top); grid[0]=top[0]; grid[1]=top[1]; grid[2]=top[2]; grid[6]=top[3]; grid[7]=top[4]; grid[8]=top[0]; }
        else { win = 0; lines = []; const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; grid = []; for(let i=0; i<9; i++) grid.push(s[secureRandomInt(0, s.length)]); }
        
        if (win > 0) { await processTransaction(user._id, win, 'WIN', 'TIGER'); if (outcome === 'BIG_WIN') await User.updateOne({ _id: user._id }, { $inc: { consecutiveWins: 1 }, previousBet: amount }); else await User.updateOne({ _id: user._id }, { $set: { consecutiveWins: 0 }, previousBet: amount }); }
        else { await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, previousBet: amount }); logGameResult('TIGER', user.username, -amount, user.sessionProfit, user.sessionTotalBets); }
        
        // SAVE LOG
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, lines, isFullScreen: fs, outcome }, risk.level);

        const fU = await User.findById(user._id);
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: fU.balance });
    } catch(e) { res.status(400).json({message: e.message}); }
});

app.use(express.static(path.join(__dirname, 'dist')));

// --- SERVE INDEX.HTML NO CACHE ---
app.get('*', (req, res) => { 
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Endpoint não encontrado.' });
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.sendFile(indexPath); 
    } else {
        res.status(500).send("Erro: Build não encontrado. Execute 'npm run build'.");
    }
});

const startServer = async () => { connectDB(); app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server (${VERSION}) port ${PORT}`)); };
startServer();
