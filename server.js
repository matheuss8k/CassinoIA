
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BET_LIMIT = 100; 
const VERSION = 'v1.8.0-RC'; // Production Candidate

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- SEGREDOS JWT ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS (CLEAN & FOCUSED) ---
const logEvent = (type, message) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    switch (type) {
        case 'AUTH':
            console.log(`\x1b[36m[${timestamp}] 🔐 AUTH:\x1b[0m ${message}`);
            break;
        case 'BANK':
            // Depósitos em Verde, Saques em Amarelo
            if (message.includes('DEPOSIT')) console.log(`\x1b[32m[${timestamp}] 💰 BANK:\x1b[0m ${message}`);
            else console.log(`\x1b[33m[${timestamp}] 💸 BANK:\x1b[0m ${message}`);
            break;
        case 'CHEAT':
            // Trapaças em Vermelho Vivo
            console.log(`\x1b[41m\x1b[37m[${timestamp}] 💀 CHEAT ACTIVE:\x1b[0m \x1b[31m${message}\x1b[0m`);
            break;
        case 'PROFIT':
            // Sessão do usuário em Ciano/Branco
            console.log(`\x1b[35m[${timestamp}] 📊 SESSION:\x1b[0m ${message}`);
            break;
        case 'ERROR':
            console.error(`\x1b[31m[${timestamp}] ❌ ERROR:\x1b[0m ${message}`);
            break;
        default:
            console.log(`[${timestamp}] [${type}] ${message}`);
    }
};

// --- SECURE RNG UTILS (CSPRNG) ---
const secureRandomInt = (min, max) => {
    return crypto.randomInt(min, max);
};

const secureRandomFloat = () => {
    return crypto.randomInt(0, 100000000) / 100000000;
};

const secureShuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// --- UTILS ---
const escapeRegex = (text) => {
    if (!text) return "";
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

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

const validateBet = (amount) => {
    if (typeof amount !== 'number') return false;
    if (!Number.isInteger(amount)) return false;
    if (amount <= 0 || !Number.isFinite(amount)) return false;
    if (amount > MAX_BET_LIMIT) return false;
    return true;
};

// --- RISK ENGINE (CENTRALIZED) ---
const calculateRisk = (user, currentBet) => {
    let isRigged = false;
    let reason = '';

    try {
        // 1. KILL SWITCH (Sequência de Vitórias)
        if (user.consecutiveWins >= 3) {
            isRigged = true;
            reason = 'Streak (3+ Wins)';
        }
        // 2. ANTI-MARTINGALE (Aposta dobrada após derrota)
        else if (user.consecutiveLosses >= 2 && user.previousBet > 0 && currentBet >= user.previousBet * 1.8) {
            isRigged = true;
            reason = 'Anti-Martingale Detected';
        }
        // 3. ROI GUARD (Proteção de Lucro Excessivo)
        else if (user.totalDeposits > 0 && user.balance > 50 && user.balance > (user.totalDeposits * 1.5)) {
            isRigged = true;
            reason = `ROI Guard (Profit > 50%)`;
        }
        // 4. SNIPER (Aposta muito alta repentina)
        else if (user.previousBet > 0 && currentBet > user.previousBet * 5) {
            isRigged = true;
            reason = 'Sniper Bet (5x Jump)';
        }

        if (isRigged) {
            logEvent('CHEAT', `${user.username} | ${reason} | Bet: ${currentBet}`);
        }
    } catch (err) {
        // Fail-safe: Se o motor de risco falhar, assume jogo justo para não travar
        console.error("Risk Engine Error:", err);
        return false;
    }

    return isRigged;
};

// --- RATE LIMIT GLOBAL ---
const createRateLimiter = ({ windowMs, max }) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, data] of requests.entries()) {
            if (now > data.expiry) requests.delete(ip);
        }
    }, 60000); 

    return (req, res, next) => {
        if (req.ip === '127.0.0.1' || req.ip === '::1') return next();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = Date.now();
        if (!requests.has(ip)) {
            requests.set(ip, { count: 1, expiry: now + windowMs });
        } else {
            const data = requests.get(ip);
            if (now > data.expiry) {
                requests.set(ip, { count: 1, expiry: now + windowMs });
            } else {
                data.count++;
                if (data.count > max) {
                    return res.status(429).json({ message: 'Muitas requisições. Aguarde.' });
                }
            }
        }
        next();
    };
};

// --- ACTION COOLDOWN ---
const userActionTimestamps = new Map();
const checkActionCooldown = (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return next();

    const now = Date.now();
    const lastAction = userActionTimestamps.get(userId) || 0;
    
    if (now - lastAction < 50) {
        return res.status(429).json({ message: 'Ação muito rápida.' });
    }
    
    userActionTimestamps.set(userId, now);
    next();
};

app.set('trust proxy', 1);

// --- MIDDLEWARES ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.removeHeader('X-Powered-By');
    next();
});

app.use(createRateLimiter({ windowMs: 60000, max: 300 }));
app.use(cookieParser());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10kb' }));

// --- JWT ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- DB ---
let isConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (isConnecting) return;
  isConnecting = true;
  const mongoURI = process.env.MONGODB_URI;
  try {
    await mongoose.connect(mongoURI, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB Conectado!`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ Falha MongoDB: ${error.message}`);
    isConnecting = false;
    setTimeout(connectDB, 5000); 
  }
};

// --- SCHEMAS ---
const missionSchema = new mongoose.Schema({
    id: String, type: String, description: String, target: Number,
    current: { type: Number, default: 0 }, rewardPoints: Number, completed: { type: Boolean, default: false }
});

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
    riskLevel: { type: String, default: 'NORMAL' }
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true, select: false },
  refreshToken: { type: String, select: false },
  balance: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  sessionProfit: { type: Number, default: 0 },
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  previousBet: { type: Number, default: 0 }, 
  avatarId: { type: String, default: '1' },
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  missions: [missionSchema],
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  lastDailyReset: { type: String, default: '' },
  totalGamesPlayed: { type: Number, default: 0 },
  totalBlackjacks: { type: Number, default: 0 },
  activeGame: { type: activeGameSchema, default: () => ({}) }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

const User = mongoose.model('User', userSchema);

const sanitizeUser = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password; delete userObj.refreshToken; delete userObj._id; 
    if (userObj.activeGame) { delete userObj.activeGame.bjDeck; delete userObj.activeGame.minesList; }
    return userObj;
};

const generateAccessToken = (user) => jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
const generateRefreshToken = (user) => jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

// --- GAME LOGIC ---
const generateDailyMissions = () => {
    const pool = [
        { id: 'bj_win_5', type: 'blackjack_win', description: 'Vença 5 mãos de Blackjack', target: 5, rewardPoints: 50 },
        { id: 'bj_play_10', type: 'bet_total', description: 'Aposte R$ 100 no total', target: 100, rewardPoints: 30 },
        { id: 'mines_safe_10', type: 'mines_play', description: 'Jogue 10 rodadas de Mines', target: 10, rewardPoints: 40 },
        { id: 'profit_500', type: 'profit_total', description: 'Obtenha R$ 500 de lucro', target: 500, rewardPoints: 100 },
    ];
    return pool.slice(0, 3).map(m => ({ ...m, current: 0, completed: false }));
};

const MINES_MULTIPLIERS = {
    1: [1.01, 1.05, 1.10, 1.15, 1.21, 1.27, 1.34, 1.42, 1.51, 1.60, 1.71, 1.83, 1.97, 2.13, 2.31, 2.52, 2.77, 3.08, 3.46, 3.96, 4.62, 5.54, 6.93, 9.24],
    3: [1.11, 1.22, 1.36, 1.52, 1.71, 1.95, 2.24, 2.61, 3.08, 3.69, 4.51, 5.63, 7.23, 9.58, 13.18, 18.98, 28.98, 47.96, 88.73, 192.25, 576.75],
    5: [1.21, 1.45, 1.77, 2.21, 2.83, 3.73, 5.06, 7.11, 10.39, 15.87, 25.56, 43.82, 81.38, 167.31, 390.39, 1093.09, 4153.74, 24922.44],
    10: [1.58, 2.64, 4.58, 8.39, 16.32, 34.27, 78.33, 198.44, 578.78, 2025.75, 9115.86, 60772.43]
};

const getMinesMultiplier = (minesCount, revealedCount) => {
    if (MINES_MULTIPLIERS[minesCount] && revealedCount > 0) {
        const index = revealedCount - 1;
        if (index < MINES_MULTIPLIERS[minesCount].length) return MINES_MULTIPLIERS[minesCount][index];
    }
    return 1.0;
};

const handleLoss = (user, currentBet) => {
    user.consecutiveLosses = (user.consecutiveLosses || 0) + 1;
    const wasStreak = user.consecutiveWins >= 3;
    const isLowBet = user.previousBet > 0 && currentBet < (user.previousBet * 0.5);
    if (wasStreak && isLowBet) { user.consecutiveWins = 3; } else { user.consecutiveWins = 0; }
    user.previousBet = currentBet;
};

const handleWin = (user, currentBet) => {
    user.consecutiveWins++;
    user.consecutiveLosses = 0;
    user.previousBet = currentBet;
};

const logSession = (user, game, roundProfit) => {
    const total = user.sessionProfit || 0;
    const symbol = roundProfit >= 0 ? '🟢' : '🔴';
    logEvent('PROFIT', `[${game}] ${user.username} | Last: ${symbol} ${roundProfit.toFixed(2)} | Session Net: R$ ${total.toFixed(2)}`);
};

const TIGER_SYMBOLS = [
    { id: 'orange', value: 0.6, weight: 65 },
    { id: 'firecracker', value: 1.0, weight: 30 },
    { id: 'envelope', value: 2.0, weight: 15 },
    { id: 'bag', value: 4.0, weight: 10 },
    { id: 'statue', value: 10.0, weight: 5 },
    { id: 'jewel', value: 20.0, weight: 2 },
    { id: 'wild', value: 50.0, weight: 1 }
];
const PAYLINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];

// --- ROUTES ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando...' }); }
    const safeUser = escapeRegex(username);
    const user = await User.findOne({ $or: [ { username: { $regex: new RegExp(`^${safeUser}$`, 'i') } }, { email: { $regex: new RegExp(`^${safeUser}$`, 'i') } } ] }).select('+password');
    if (user) {
        let isValid = false;
        if (!user.password.includes(':')) {
            if (user.password === password) { isValid = true; user.password = await hashPassword(password); await user.save(); }
        } else { isValid = await verifyPassword(password, user.password); }

        if (isValid) {
            user.balance = Number(user.balance) || 0; user.sessionProfit = 0;
            if (user.activeGame && user.activeGame.type !== 'NONE') { handleLoss(user, user.activeGame.bet); user.activeGame = { type: 'NONE' }; }
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            user.refreshToken = refreshToken; await user.save();
            res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
            
            logEvent('AUTH', `User Login: ${user.username}`);
            
            return res.json({ accessToken, ...sanitizeUser(user) });
        }
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);
    const user = await User.findOne({ refreshToken: cookies.jwt }).select('+refreshToken');
    if (!user) return res.sendStatus(403); 
    jwt.verify(cookies.jwt, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err || user._id.toString() !== decoded.id) return res.sendStatus(403);
        res.json({ accessToken: generateAccessToken(user) });
    });
});

app.post('/api/logout', async (req, res) => {
    if (req.cookies?.jwt) {
        const user = await User.findOne({ refreshToken: req.cookies.jwt });
        if (user) { 
            user.refreshToken = ''; await user.save(); 
            logEvent('AUTH', `User Logout: ${user.username}`);
        }
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'Lax', secure: IS_PRODUCTION });
    }
    res.sendStatus(204);
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário já existe.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), balance: 0, totalDeposits: 0, sessionProfit: 0, missions: generateDailyMissions() });
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken; await user.save();
    res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    
    logEvent('AUTH', `New Register: ${user.username}`);
    
    res.status(201).json({ accessToken, ...sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

// --- PROTECTED UTILS ---
app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));
app.post('/api/user/sync', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (user && user.activeGame && user.activeGame.type !== 'NONE') { handleLoss(user, user.activeGame.bet); user.activeGame = { type: 'NONE' }; await user.save(); }
    res.json(sanitizeUser(user));
});
app.post('/api/balance', authenticateToken, async (req, res) => {
    const { newBalance } = req.body;
    const user = await User.findById(req.user.id);
    if (user) {
        const diff = newBalance - user.balance;
        if (diff > 0) {
            user.totalDeposits = (user.totalDeposits || 0) + diff;
            logEvent('BANK', `DEPOSIT: ${user.username} | +R$ ${diff.toFixed(2)}`);
        } else if (diff < 0) {
            // Se for negativo e não estiver em jogo (balance endpoint geralmente usado pela carteira)
            // Assumimos que é um saque ou ajuste manual
            logEvent('BANK', `WITHDRAW REQUEST: ${user.username} | -R$ ${Math.abs(diff).toFixed(2)}`);
        }
        user.balance = newBalance;
        await user.save();
    }
    res.json({ success: true });
});
app.post('/api/user/avatar', authenticateToken, async (req, res) => {
    await User.findByIdAndUpdate(req.user.id, { avatarId: req.body.avatarId });
    res.json({ success: true });
});
app.post('/api/user/verify', authenticateToken, async (req, res) => {
    await User.findByIdAndUpdate(req.user.id, { documentsStatus: 'PENDING' });
    res.json({ success: true });
});
app.post('/api/store/purchase', authenticateToken, checkActionCooldown, async (req, res) => {
    const { itemId, cost } = req.body;
    const user = await User.findOneAndUpdate({ _id: req.user.id, loyaltyPoints: { $gte: cost } }, { $inc: { loyaltyPoints: -cost }, $addToSet: { ownedItems: itemId } }, { new: true });
    if (!user) return res.status(400).json({message: 'Pontos insuficientes.'});
    res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
});

// --- BLACKJACK GAME ---
app.post('/api/blackjack/deal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!validateBet(amount)) return res.status(400).json({message: 'Aposta inválida'});
        const betAmount = Math.floor(amount);

        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let d=[]; 
        for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { 
            let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; 
            d.push({rank:r,suit:s,value:v,id:crypto.randomBytes(8).toString('hex'),isHidden:false}); 
        }
        secureShuffle(d);
        const p=[d.pop(),d.pop()];
        const dl=[d.pop(),d.pop()];

        const user = await User.findOneAndUpdate(
            { _id: req.user.id, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { $inc: { balance: -betAmount, sessionProfit: -betAmount }, $set: { 'activeGame.type': 'BLACKJACK', 'activeGame.bet': betAmount, 'activeGame.bjDeck': d, 'activeGame.bjPlayerHand': p, 'activeGame.bjDealerHand': dl, 'activeGame.bjStatus': 'PLAYING', 'activeGame.riskLevel': 'NORMAL' } },
            { new: true }
        );
        if (!user) return res.status(400).json({ message: 'Erro de aposta' });

        const isRigged = calculateRisk(user, betAmount);
        
        // FIX: Usar a variável local 'd' para o baralho
        let currentDeck = d; 
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        // FAIL-SAFE CHEAT BLOCK
        if (isRigged) {
             try {
                 user.activeGame.riskLevel = 'HIGH';
                 const tenIdx = currentDeck.findIndex(c => c.value === 10);
                 if (dl[1].value < 10 && tenIdx !== -1) {
                     const card = currentDeck.splice(tenIdx, 1)[0];
                     dl[1] = card; 
                     user.activeGame.bjDealerHand = dl;
                     logEvent('CHEAT', `Rigged Deal (Dealer buffed to 10 value hidden)`);
                 }
             } catch (err) { logEvent('ERROR', `BJ Deal Cheat Failed: ${err.message}`); }
        }

        const pScore = calc(p);
        let st='PLAYING', rs='NONE', payout=0;
        const dScore = calc(dl);
        
        if(pScore===21){ 
            st='GAME_OVER'; 
            if(dScore===21){ rs='PUSH'; payout = betAmount; }
            else { rs='BLACKJACK'; payout = betAmount * 2.5; }
        }

        if (st === 'GAME_OVER' || isRigged) {
            user.activeGame.bjDeck = currentDeck;
            user.activeGame.bjStatus = st;
            if (st === 'GAME_OVER') {
                user.activeGame.type = 'NONE';
                if (payout > 0) { user.balance += payout; user.sessionProfit += payout; if(rs==='BLACKJACK') handleWin(user, betAmount); }
                logSession(user, 'BLACKJACK', payout - betAmount);
            }
            await user.save();
        }
        
        res.json({playerHand:p,dealerHand:st==='PLAYING'?[dl[0],{...dl[1],isHidden:true}]:dl,status:st,result:rs,newBalance:user.balance,loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/hit', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const currentScore = calc(g.bjPlayerHand);
        
        let isRigged = g.riskLevel === 'HIGH' || calculateRisk(user, g.bet);

        // FAIL-SAFE CHEAT BLOCK
        if (isRigged) {
             try {
                 const neededToBust = 22 - currentScore; 
                 const bustCardIdx = g.bjDeck.findIndex(c => c.value === neededToBust);
                 if (bustCardIdx !== -1) {
                     const bustCard = g.bjDeck.splice(bustCardIdx, 1)[0];
                     g.bjDeck.push(bustCard); 
                     logEvent('CHEAT', `🎯 PRECISION BUST: Giving ${bustCard.value} to hit 22+`);
                 }
             } catch (err) { logEvent('ERROR', `BJ Hit Cheat Failed: ${err.message}`); }
        }

        const card = g.bjDeck.pop();
        g.bjPlayerHand.push(card);
        let st='PLAYING', rs='NONE';
        
        if(calc(g.bjPlayerHand)>21){ 
            st='GAME_OVER'; rs='BUST'; g.type='NONE'; handleLoss(user, g.bet);
            logSession(user, 'BLACKJACK', -g.bet); 
        } else { user.markModified('activeGame'); } 
        
        await user.save();
        res.json({playerHand:g.bjPlayerHand, dealerHand:[g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status:st, result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const ps = calc(g.bjPlayerHand);
        let ds = calc(g.bjDealerHand);
        
        let isRigged = g.riskLevel === 'HIGH' || calculateRisk(user, g.bet);

        // FAIL-SAFE CHEAT BLOCK
        if (isRigged && ds < ps && ps <= 20) {
             try {
                 const smallCards = g.bjDeck.filter(c => c.value >= 2 && c.value <= 5);
                 if (smallCards.length > 0) {
                     let count = 0;
                     for (let i = 0; i < g.bjDeck.length; i++) {
                         if (g.bjDeck[i].value <= 5) {
                             const c = g.bjDeck.splice(i, 1)[0];
                             g.bjDeck.push(c);
                             count++;
                             i--; 
                             if (count >= 3) break;
                         }
                     }
                     logEvent('CHEAT', `💦 SWEATY DEALER: Injecting low cards to force comeback`);
                 }
             } catch (err) { logEvent('ERROR', `BJ Stand Cheat Failed: ${err.message}`); }
        }

        while(ds < 17) {
            let nextCard = g.bjDeck.pop();
            g.bjDealerHand.push(nextCard);
            ds = calc(g.bjDealerHand);
        }
        
        let rs='LOSE', payout=0;
        if(ds>21 || ps>ds) { 
            rs='WIN'; payout = g.bet*2; user.balance += payout; user.sessionProfit += payout; handleWin(user, g.bet); 
        } else if(ps===ds) { 
            rs='PUSH'; payout = g.bet; user.balance += payout; user.sessionProfit += payout; user.previousBet = g.bet; 
        } else { handleLoss(user, g.bet); }
        
        logSession(user, 'BLACKJACK', payout - g.bet); 
        g.type='NONE'; await user.save();
        res.json({dealerHand:g.bjDealerHand, status:'GAME_OVER', result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- MINES GAME ---
app.post('/api/mines/start', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        if (!validateBet(amount)) return res.status(400).json({message: 'Aposta inválida'});
        const betAmount = Math.floor(amount);
        const minesSet = new Set();
        while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        
        const isRigged = calculateRisk(req.user, betAmount);
        let riskLevel = isRigged ? 'HIGH' : 'NORMAL';

        const user = await User.findOneAndUpdate(
            { _id: req.user.id, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { $inc: { balance: -betAmount, sessionProfit: -betAmount }, $set: { activeGame: { type:'MINES', bet:betAmount, minesCount, minesList:Array.from(minesSet), minesRevealed:[], minesMultiplier:1.0, minesGameOver:false, riskLevel } } },
            { new: true }
        );
        if(!user) return res.status(400).json({message: 'Erro ao iniciar'});
        // Start is logged implicitly via balance deduction or on game over
        res.json({success:true, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/reveal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        if (g.minesGameOver) return res.status(400).json({ message: 'Finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});

        let rigProbability = 0;
        let rigReason = '';
        
        // --- SOPHISTICATED ANTI-FARMING ("LANDMINE PROTOCOL") ---
        try {
            const isFarmingAttempt = g.minesCount <= 3;
            
            if (isFarmingAttempt) {
                if (g.minesCount === 1) {
                    if (user.consecutiveWins >= 2) { rigProbability = 0.10; rigReason = 'Anti-Farm (1 Mine | 2+ Wins)'; }
                    if (user.consecutiveWins >= 4) { rigProbability = 0.40; rigReason = 'Anti-Farm (1 Mine | 4+ Wins)'; }
                    if (user.consecutiveWins >= 6) { rigProbability = 0.90; rigReason = 'Anti-Farm (1 Mine | 6+ Wins)'; }
                } else {
                    if (user.consecutiveWins >= 4) { rigProbability = 0.30; rigReason = 'Anti-Farm (Low Risk | 4+ Wins)'; }
                    if (user.consecutiveWins >= 8) { rigProbability = 0.70; rigReason = 'Anti-Farm (Low Risk | 8+ Wins)'; }
                }

                if (g.minesRevealed.length === 0 && user.sessionProfit > 50) {
                    rigProbability += 0.20;
                    if (!rigReason) rigReason = 'Anti-Farm (First Click | Profit > 50)';
                }
            } else {
                const isHighRisk = g.riskLevel === 'HIGH' || calculateRisk(user, g.bet);
                if (isHighRisk && g.minesRevealed.length >= 2) { rigProbability = 0.8; rigReason = 'Global High Risk'; }
                else if (user.consecutiveWins >= 4 && g.minesRevealed.length >= 1) { rigProbability = 0.9; rigReason = 'Streak Killer'; }
            }
        } catch (err) { console.error("Mines Risk Calc Error", err); }

        // --- QUANTUM MINE ACTIVATION (FAIL-SAFE) ---
        if (secureRandomFloat() < rigProbability) {
             try {
                 if (!g.minesList.includes(tileId)) {
                     // Move a hidden bomb to the current tile (Quantum Physics!)
                     const safeTileIndex = g.minesList.findIndex(m => !g.minesRevealed.includes(m));
                     // Critical Check: Ensure we actually found a hidden mine to move
                     if (safeTileIndex !== -1) {
                         g.minesList.splice(safeTileIndex, 1); // Remove random hidden bomb
                         g.minesList.push(tileId); // Place bomb here
                         user.markModified('activeGame'); 
                         logEvent('CHEAT', `💣 QUANTUM MINE: ${rigReason} - Moved to ${tileId}`);
                     }
                 }
             } catch (err) { logEvent('ERROR', `Mines Cheat Failed: ${err.message}`); }
        }

        if(g.minesList.includes(tileId)) { 
            g.minesGameOver=true; g.type='NONE'; handleLoss(user, g.bet); await user.save(); 
            logSession(user, 'MINES', -g.bet);
            
            // Illusion of Choice
            let visualMines = [...g.minesList];
            try {
                const neighbors = [tileId-1, tileId+1, tileId-5, tileId+5].filter(n => n >= 0 && n < 25);
                visualMines = visualMines.map(m => {
                    if (neighbors.includes(m)) return (m + 10) % 25;
                    return m;
                });
                if(!visualMines.includes(tileId)) visualMines.push(tileId);
            } catch(e) {}

            return res.json({outcome:'BOMB',mines:visualMines,status:'GAME_OVER',newBalance:user.balance}); 
        }
        
        g.minesRevealed.push(tileId); 
        g.minesMultiplier = getMinesMultiplier(g.minesCount, g.minesRevealed.length);
        if(g.minesRevealed.length >= (25 - g.minesCount)) { 
             const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
             user.balance += profit; user.sessionProfit += profit; handleWin(user, g.bet); g.type = 'NONE';
             await user.save(); 
             logSession(user, 'MINES', profit - g.bet); 
             return res.json({outcome:'GEM', status:'WIN_ALL', profit, multiplier:g.minesMultiplier, newBalance:user.balance, mines: g.minesList});
        }
        user.markModified('activeGame'); await user.save();
        res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        if (g.minesGameOver) return res.status(400).json({ message: 'Jogo já finalizado' });
        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        user.balance += profit; user.sessionProfit += profit; handleWin(user, g.bet);
        const mines = g.minesList; g.type='NONE'; await user.save();
        logSession(user, 'MINES', profit - g.bet);
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- TIGER GAME ---
app.post('/api/tiger/spin', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!validateBet(amount)) return res.status(400).json({message: 'Aposta inválida'});
        const betAmount = Math.floor(amount);
        const user = await User.findOneAndUpdate({ _id: req.user.id, 'activeGame.type': 'NONE', balance: { $gte: betAmount } }, { $inc: { balance: -betAmount, sessionProfit: -betAmount } }, { new: true });
        if (!user) return res.status(400).json({message: 'Saldo insuficiente.'});

        let symbolsPool = [...TIGER_SYMBOLS];
        const isRigged = calculateRisk(user, betAmount);

        if (isRigged) {
            symbolsPool = symbolsPool.map(s => s.weight > 10 ? s : {...s, weight: Math.max(1, s.weight * 0.5)});
        }

        const getRandomSymbol = () => {
            const totalWeight = symbolsPool.reduce((acc, s) => acc + s.weight, 0);
            let random = secureRandomFloat() * totalWeight;
            for (const sym of symbolsPool) { if (random < sym.weight) return sym; random -= sym.weight; }
            return symbolsPool[0];
        };

        let grid = Array(9).fill(null).map(() => getRandomSymbol());
        let totalWin = 0; let winningLines = []; let fullScreenSymbol = null;

        // FAIL-SAFE CHEAT BLOCK
        if (isRigged) {
            try {
                const outcomeRNG = secureRandomFloat();
                if (outcomeRNG < 0.3) {
                    grid[3] = TIGER_SYMBOLS[0]; 
                    grid[4] = TIGER_SYMBOLS[0];
                    grid[5] = TIGER_SYMBOLS[0];
                    logEvent('CHEAT', `🎭 LDW TRIGGERED: Fake Win (0.6x)`);
                } else if (outcomeRNG < 0.6) {
                    grid[3] = TIGER_SYMBOLS[6]; 
                    grid[4] = TIGER_SYMBOLS[6]; 
                    grid[5] = TIGER_SYMBOLS[0]; 
                    logEvent('CHEAT', `👀 NEAR MISS: Forced 2 Wilds`);
                }
            } catch (err) { logEvent('ERROR', `Tiger Cheat Failed: ${err.message}`); }
        }

        for (let i = 0; i < PAYLINES.length; i++) {
            const line = PAYLINES[i];
            const s1 = grid[line[0]]; const s2 = grid[line[1]]; const s3 = grid[line[2]];
            let match = false; let winSymbol = null;
            if (s1.id === 'wild' && s2.id === 'wild' && s3.id === 'wild') { match = true; winSymbol = s1; }
            else if (s1.id !== 'wild' && (s2.id === s1.id || s2.id === 'wild') && (s3.id === s1.id || s3.id === 'wild')) { match = true; winSymbol = s1; }
            else if (s1.id === 'wild' && s2.id !== 'wild' && (s3.id === s2.id || s3.id === 'wild')) { match = true; winSymbol = s2; }
            else if (s1.id === 'wild' && s2.id === 'wild' && s3.id !== 'wild') { match = true; winSymbol = s3; }

            if (match && winSymbol) { totalWin += betAmount * winSymbol.value; winningLines.push(i); }
        }

        const firstNonWild = grid.find(s => s.id !== 'wild');
        const baseId = firstNonWild ? firstNonWild.id : 'wild';
        const isFullScreen = grid.every(s => s.id === baseId || s.id === 'wild');
        if (isFullScreen && totalWin > 0) { totalWin *= 10; fullScreenSymbol = baseId; }

        if (totalWin > 0) { user.balance += totalWin; user.sessionProfit += totalWin; handleWin(user, betAmount); } 
        else { handleLoss(user, betAmount); }
        
        logSession(user, 'TIGER', totalWin - betAmount); await user.save();
        res.json({ grid: grid.map(s => s.id), totalWin, winningLines, isFullScreen, newBalance: user.balance, loyaltyPoints: user.loyaltyPoints });

    } catch(e) { res.status(500).json({message: e.message}); }
});

if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => { if (req.path.startsWith('/api')) { return res.status(404).json({ message: 'Endpoint não encontrado.' }); } res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
}

const startServer = async () => { await connectDB(); app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Secure (${VERSION}) running on port ${PORT}`)); };
startServer();
