
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
const MAX_BET_LIMIT = 50; 
const VERSION = 'v1.3.0'; 

// --- AMBIENTE ---
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- SEGREDOS JWT (Em produção, use .env) ---
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// --- LOGGER UTILS ---
const logEvent = (type, message, data = {}) => {
    const timestamp = new Date().toISOString();
    const icon = type === 'AUTH' ? '🔐' : type === 'MONEY' ? '💰' : type === 'GAME' ? '🎮' : type === 'SYSTEM' ? '🛡️' : 'ℹ️';
    // Se for SYSTEM, usa console.error para destacar em vermelho em alguns terminais, ou log normal com destaque
    if (type === 'SYSTEM') {
        console.log(`\x1b[31m${icon} [${timestamp}] [SECURITY_TRIGGER] ${message}\x1b[0m`, Object.keys(data).length ? JSON.stringify(data) : '');
    } else {
        console.log(`${icon} [${timestamp}] [${type}] ${message}`, Object.keys(data).length ? JSON.stringify(data) : '');
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
                    console.log(`[DDOS] Bloqueio de IP: ${ip}`);
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
    const userId = req.user?.id; // Agora pegamos do Token, não do Body
    if (!userId) return next();

    const now = Date.now();
    const lastAction = userActionTimestamps.get(userId) || 0;
    
    if (now - lastAction < 300) {
        logEvent('SYSTEM', `⚡ ANTI-SCRIPT: ${req.user.username} (Action too fast: ${now - lastAction}ms)`); 
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
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

app.use(createRateLimiter({ windowMs: 60000, max: 300 }));
app.use(cookieParser()); // Necessário para ler o Refresh Token
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10kb' })); 

// --- JWT MIDDLEWARE (SECURITY CORE) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden (Token inválido ou expirado)
        req.user = user; // Anexa o payload do token (contendo o ID real) ao request
        next();
    });
};

// --- DB CONNECTION ---
let isConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (isConnecting) return;
  isConnecting = true;
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
      console.error('❌ FATAL: MONGODB_URI não definida.');
      isConnecting = false;
      return;
  }
  try {
    await mongoose.connect(mongoURI, { dbName: 'casino_ai_db', serverSelectionTimeoutMS: 5000, connectTimeoutMS: 10000, authSource: 'admin', writeConcern: { w: 'majority' } });
    console.log(`✅ MongoDB Conectado (Secure)!`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ Falha MongoDB: ${error.message}`);
    isConnecting = false;
    setTimeout(connectDB, 5000); 
  }
};
mongoose.connection.on('error', err => console.error('❌ Erro MongoDB:', err));
mongoose.connection.on('disconnected', () => { connectDB(); });

// --- SCHEMAS ---
const missionSchema = new mongoose.Schema({
    id: String, type: String, description: String, target: Number,
    current: { type: Number, default: 0 }, rewardPoints: Number, completed: { type: Boolean, default: false }
});

const activeGameSchema = new mongoose.Schema({
    type: { type: String, enum: ['BLACKJACK', 'MINES', 'TIGER', 'NONE'], default: 'NONE' },
    bet: { type: Number, default: 0 },
    bjDeck: { type: Array, default: [] },
    bjPlayerHand: { type: Array, default: [] },
    bjDealerHand: { type: Array, default: [] },
    bjStatus: String,
    minesList: { type: Array, default: [] },
    minesCount: { type: Number, default: 0 },
    minesRevealed: { type: Array, default: [] },
    minesMultiplier: { type: Number, default: 1.0 },
    minesGameOver: { type: Boolean, default: false },
    riskLevel: { type: String, default: 'NORMAL' } // New Security Field
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true },
  refreshToken: { type: String, select: false }, // Armazena token para permitir revogação
  balance: { type: Number, default: 0 }, 
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
    delete userObj.password; 
    delete userObj.refreshToken;
    delete userObj._id; 
    if (userObj.activeGame) { delete userObj.activeGame.bjDeck; delete userObj.activeGame.minesList; }
    return userObj;
};

const generateAccessToken = (user) => {
    return jwt.sign({ id: user._id, username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }); // Curta duração
};

const generateRefreshToken = (user) => {
    return jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' }); // Longa duração
};

// ... [Game Helper Functions omitidas para brevidade, mantêm-se iguais] ...
const generateDailyMissions = () => {
    const pool = [
        { id: 'bj_win_5', type: 'blackjack_win', description: 'Vença 5 mãos de Blackjack', target: 5, rewardPoints: 50 },
        { id: 'bj_play_10', type: 'bet_total', description: 'Aposte R$ 100 no total', target: 100, rewardPoints: 30 },
        { id: 'mines_safe_10', type: 'mines_play', description: 'Jogue 10 rodadas de Mines', target: 10, rewardPoints: 40 },
        { id: 'profit_500', type: 'profit_total', description: 'Obtenha R$ 500 de lucro', target: 500, rewardPoints: 100 },
    ];
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3).map(m => ({ ...m, current: 0, completed: false }));
};

const MINES_MULTIPLIERS = {
    1: [1.01, 1.05, 1.10, 1.15, 1.21, 1.27, 1.34, 1.42, 1.51, 1.60, 1.71, 1.83, 1.97, 2.13, 2.31, 2.52, 2.77, 3.08, 3.46, 3.96, 4.62, 5.54, 6.93, 9.24],
    2: [1.06, 1.13, 1.21, 1.30, 1.40, 1.52, 1.65, 1.81, 1.99, 2.20, 2.45, 2.75, 3.11, 3.56, 4.13, 4.85, 5.82, 7.16, 9.09, 12.01, 16.82, 25.72, 45.01],
    3: [1.11, 1.22, 1.36, 1.52, 1.71, 1.95, 2.24, 2.61, 3.08, 3.69, 4.51, 5.63, 7.23, 9.58, 13.18, 18.98, 28.98, 47.96, 88.73, 192.25, 576.75],
    5: [1.21, 1.45, 1.77, 2.21, 2.83, 3.73, 5.06, 7.11, 10.39, 15.87, 25.56, 43.82, 81.38, 167.31, 390.39, 1093.09, 4153.74, 24922.44],
    10: [1.58, 2.64, 4.58, 8.39, 16.32, 34.27, 78.33, 198.44, 578.78, 2025.75, 9115.86, 60772.43]
};

const getMinesMultiplier = (minesCount, revealedCount) => {
    if (MINES_MULTIPLIERS[minesCount]) {
        if (revealedCount <= 0) return 1.0;
        const index = revealedCount - 1;
        if (index < MINES_MULTIPLIERS[minesCount].length) return MINES_MULTIPLIERS[minesCount][index];
    }
    let multiplier = 1.0;
    const houseEdge = 0.97;
    for (let i = 0; i < revealedCount; i++) {
        const tilesLeft = 25 - i;
        const safeLeft = 25 - minesCount - i;
        if (safeLeft <= 0) break;
        multiplier *= (1 / (safeLeft / tilesLeft));
    }
    return parseFloat((multiplier * houseEdge).toFixed(2));
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

const logSession = (user, roundNet) => {
    const total = user.sessionProfit || 0;
    logEvent('MONEY', `SESSION: ${user.username} | Round: ${roundNet >= 0 ? '+' : ''}${roundNet.toFixed(2)} | Total: ${total >= 0 ? '+' : ''}${total.toFixed(2)}`);
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

// --- AUTH ROUTES ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando...' }); }

    const safeUser = escapeRegex(username);
    const user = await User.findOne({ $or: [ { username: { $regex: new RegExp(`^${safeUser}$`, 'i') } }, { email: { $regex: new RegExp(`^${safeUser}$`, 'i') } } ] }).select('+password');

    if (user) {
        let isValid = false;
        if (!user.password.includes(':')) {
            if (user.password === password) {
                isValid = true;
                user.password = await hashPassword(password);
                await user.save();
            }
        } else {
            isValid = await verifyPassword(password, user.password);
        }

        if (isValid) {
            logEvent('AUTH', `Login Success: ${username}`);
            user.balance = Number(user.balance) || 0; 
            user.sessionProfit = 0;

            if (user.activeGame && user.activeGame.type !== 'NONE') {
                handleLoss(user, user.activeGame.bet);
                user.activeGame = { type: 'NONE' };
            }
            
            const today = new Date().toISOString().split('T')[0];
            if (user.lastDailyReset !== today) { user.missions = generateDailyMissions(); user.lastDailyReset = today; user.markModified('missions'); }
            
            // SECURITY: GENERATE TOKENS
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            
            user.refreshToken = refreshToken; // Save Refresh Token to Revoke later
            await user.save();

            // SEND REFRESH TOKEN AS HTTPONLY COOKIE
            // FIXED: Secure only in Production to prevent F5 logout in Dev/HTTP
            res.cookie('jwt', refreshToken, { 
                httpOnly: true, 
                secure: IS_PRODUCTION, 
                sameSite: 'Lax', // Lax is better for top-level navigation (F5) than Strict
                maxAge: 7 * 24 * 60 * 60 * 1000 
            });

            // SEND ACCESS TOKEN AS JSON
            return res.json({ accessToken, ...sanitizeUser(user) });
        }
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/refresh', async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);
    
    const refreshToken = cookies.jwt;
    const user = await User.findOne({ refreshToken }).select('+refreshToken');
    
    if (!user) return res.sendStatus(403); // Token Reuse Detection or Invalid

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err || user._id.toString() !== decoded.id) return res.sendStatus(403);
        const accessToken = generateAccessToken(user);
        res.json({ accessToken });
    });
});

app.post('/api/logout', async (req, res) => {
    const cookies = req.cookies;
    if (cookies?.jwt) {
        // Clear from DB
        const user = await User.findOne({ refreshToken: cookies.jwt });
        if (user) {
            user.refreshToken = '';
            await user.save();
        }
        // Clear Cookie
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'Lax', secure: IS_PRODUCTION });
    }
    res.sendStatus(204);
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário já existe.' });
    
    const hashedPassword = await hashPassword(password);
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: hashedPassword, balance: 0, sessionProfit: 0, missions: generateDailyMissions(), lastDailyReset: new Date().toISOString().split('T')[0] });
    
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie('jwt', refreshToken, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ accessToken, ...sanitizeUser(user) });
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

// --- PROTECTED ROUTES (Require Valid Access Token) ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', version: VERSION, db: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED' });
});

app.post('/api/user/sync', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // FROM TOKEN
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
        
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            handleLoss(user, user.activeGame.bet);
            user.sessionProfit = (user.sessionProfit || 0) - user.activeGame.bet;
            user.activeGame = { type: 'NONE' };
            await user.save();
        }
        res.json(sanitizeUser(user));
    } catch (e) { res.status(500).json({ message: 'Erro sync' }); }
});

app.post('/api/balance', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // FROM TOKEN
        const { newBalance } = req.body;
        await User.findByIdAndUpdate(userId, { balance: newBalance });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/avatar', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { avatarId: req.body.avatarId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/verify', authenticateToken, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { documentsStatus: 'PENDING' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/store/purchase', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { itemId, cost } = req.body;
        const user = await User.findOneAndUpdate(
            { _id: req.user.id, loyaltyPoints: { $gte: cost } },
            { $inc: { loyaltyPoints: -cost }, $addToSet: { ownedItems: itemId } },
            { new: true }
        );
        if (!user) return res.status(400).json({message: 'Pontos insuficientes.'});
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

// --- GAME ROUTES (SECURED) ---

app.post('/api/blackjack/deal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const userId = req.user.id; // FROM TOKEN
        const { amount } = req.body;
        const betAmount = Math.abs(Number(amount)); 
        
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

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
            { _id: userId, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { 
                $inc: { balance: -betAmount, sessionProfit: -betAmount },
                $set: { 'activeGame.type': 'BLACKJACK', 'activeGame.bet': betAmount, 'activeGame.bjDeck': d, 'activeGame.bjPlayerHand': p, 'activeGame.bjDealerHand': dl, 'activeGame.bjStatus': 'PLAYING', 'activeGame.riskLevel': 'NORMAL' }
            },
            { new: true }
        );

        if (!user) return res.status(400).json({ message: 'Erro de aposta' });

        // RIGGING LOGIC (Expanded)
        let isRigged = false;
        let riskReason = "";
        let deckModified = false;
        let currentDeck = [...d]; let currentPlayerHand = [...p]; let currentDealerHand = [...dl];

        // 1. Kill Switch (Win Streak)
        if (user.consecutiveWins >= 3) {
             isRigged = true;
             riskReason = "KILL_SWITCH";
             logEvent('SYSTEM', `💀 KILL SWITCH: ${user.username} (Win Streak: ${user.consecutiveWins})`);
        } 
        // 2. Anti-Martingale (Loss Streak + Doubled Bet)
        else if (user.consecutiveLosses >= 2 && user.previousBet > 0 && betAmount >= user.previousBet * 1.8) {
             isRigged = true;
             riskReason = "MARTINGALE";
             logEvent('SYSTEM', `📉 ANTI-MARTINGALE: ${user.username} (Bet doubled after losses)`);
        }
        // 3. Sniper (Sudden High Bet)
        else if (user.previousBet > 0 && betAmount > user.previousBet * 2.5) {
             if (secureRandomFloat() < 0.8) {
                 isRigged = true;
                 riskReason = "SNIPER";
                 logEvent('SYSTEM', `🎯 SNIPER DETECTED: ${user.username} (Sudden High Bet)`);
             }
        }

        // Apply Rigging
        if (isRigged) {
            user.activeGame.riskLevel = 'HIGH'; // Persist risk for HIT actions
            // Force Dealer Strong Start
            if (currentDealerHand[0].value < 10 && currentDealerHand[0].rank !== 'A') {
                 const tenIdx = currentDeck.findIndex(c => c.value === 10);
                 if (tenIdx !== -1) {
                     const temp = currentDealerHand[0];
                     currentDealerHand[0] = currentDeck[tenIdx];
                     currentDeck[tenIdx] = temp;
                     deckModified = true;
                 }
            }
        }

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        // Prevent User Instant Blackjack if Rigged
        let pScore = calc(currentPlayerHand);
        if (pScore === 21) {
            if (isRigged || secureRandomFloat() < 0.5) {
                const aceIndex = currentPlayerHand.findIndex(c => c.rank === 'A');
                if (aceIndex !== -1) {
                    const safeCardIdx = currentDeck.findIndex(c => c.value < 10 && c.rank !== 'A');
                    if (safeCardIdx !== -1) {
                        const oldCard = currentPlayerHand[aceIndex];
                        currentPlayerHand[aceIndex] = currentDeck.splice(safeCardIdx, 1)[0];
                        currentDeck.push(oldCard);
                        deckModified = true;
                        logEvent('GAME', `🚫 BJ DENIED: ${user.username} (Security Trigger)`);
                    }
                }
            }
        }
        pScore = calc(currentPlayerHand);

        let st='PLAYING', rs='NONE';
        let payout = 0;
        let dScore = calc(currentDealerHand);
        
        if(pScore===21){ 
            st='GAME_OVER'; 
            if(dScore===21){ rs='PUSH'; payout = betAmount; }
            else { rs='BLACKJACK'; payout = betAmount * 2.5; }
        }

        if (deckModified || st === 'GAME_OVER' || isRigged) {
            user.activeGame.bjDeck = currentDeck;
            user.activeGame.bjPlayerHand = currentPlayerHand;
            user.activeGame.bjDealerHand = currentDealerHand;
            user.activeGame.bjStatus = st;
            if (st === 'GAME_OVER') {
                user.activeGame.type = 'NONE';
                if (payout > 0) {
                    user.balance += payout;
                    user.sessionProfit += payout;
                    if(rs === 'BLACKJACK') handleWin(user, betAmount);
                    else user.previousBet = betAmount;
                }
            }
            await user.save();
        }
        logSession(user, payout - betAmount);
        res.json({playerHand:currentPlayerHand,dealerHand:st==='PLAYING'?[currentDealerHand[0],{...currentDealerHand[1],isHidden:true}]:currentDealerHand,status:st,result:rs,newBalance:user.balance,loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/hit', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' });
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        
        const g = user.activeGame;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const currentScore = calc(g.bjPlayerHand);
        
        let isRigged = g.riskLevel === 'HIGH'; // Carry over risk from DEAL
        
        // Dynamic Risk adjustment
        if (!isRigged && user.consecutiveWins >= 3 && currentScore >= 12) isRigged = true;

        if (isRigged) {
             const pointsNeededToBust = 22 - currentScore;
             const bustCardIdx = g.bjDeck.findIndex(c => c.value >= pointsNeededToBust);
             if (bustCardIdx !== -1) {
                 const bustCard = g.bjDeck.splice(bustCardIdx, 1)[0];
                 g.bjDeck.push(bustCard);
                 logEvent('GAME', `🃏 FORCED BUST: ${user.username} (Rigging Logic)`);
             }
        }

        const card = g.bjDeck.pop();
        g.bjPlayerHand.push(card);
        let st='PLAYING', rs='NONE';
        
        if(calc(g.bjPlayerHand)>21){ 
            st='GAME_OVER'; rs='BUST'; g.type='NONE'; handleLoss(user, g.bet);
            logSession(user, 0); 
        } else { user.markModified('activeGame'); } 
        
        await user.save();
        res.json({playerHand:g.bjPlayerHand, dealerHand:[g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status:st, result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' });
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        
        const g = user.activeGame;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const ps = calc(g.bjPlayerHand);
        let ds = calc(g.bjDealerHand);

        let isRigged = g.riskLevel === 'HIGH'; // Carry over

        while(ds < 17) {
            if (isRigged) {
                 const minVal = (ps - ds) + 1;
                 const maxVal = 21 - ds;
                 let targetCardIdx = -1;
                 // Try to beat player
                 if (maxVal >= minVal) targetCardIdx = g.bjDeck.findIndex(c => c.value >= minVal && c.value <= maxVal);
                 // If can't beat without bust, try small card to get closer
                 if (targetCardIdx === -1) targetCardIdx = g.bjDeck.findIndex(c => c.value <= maxVal);
                 
                 if (targetCardIdx !== -1) {
                     const riggedCard = g.bjDeck.splice(targetCardIdx, 1)[0];
                     g.bjDeck.push(riggedCard); // Put at bottom, use pop next
                     // Correct logic: we need to put it at TOP (end of array) for pop()
                     // But wait, secureShuffle makes array. pop() takes from end.
                     // So we pushed to end. Correct.
                     logEvent('GAME', `🃏 DEALER BUFF: ${user.username} (Ensuring Win/Push)`);
                 }
            }
            g.bjDealerHand.push(g.bjDeck.pop());
            ds = calc(g.bjDealerHand);
        }
        
        let rs='LOSE';
        let payout = 0;
        
        if(ds>21 || ps>ds) { 
            rs='WIN'; payout = g.bet*2; user.balance += payout; user.sessionProfit += payout;
            handleWin(user, g.bet); 
        } else if(ps===ds) { 
            rs='PUSH'; payout = g.bet; user.balance += payout; user.sessionProfit += payout;
            user.previousBet = g.bet; 
        } else { handleLoss(user, g.bet); }
        
        logSession(user, payout - g.bet);
        g.type='NONE';
        await user.save();
        res.json({dealerHand:g.bjDealerHand, status:'GAME_OVER', result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/start', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const betAmount = Math.abs(Number(amount));
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

        const minesSet = new Set();
        while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        
        // Security Check at Start
        let riskLevel = 'NORMAL';
        if (req.user.consecutiveWins >= 3) {
            riskLevel = 'HIGH';
            logEvent('SYSTEM', `💀 KILL SWITCH: ${req.user.username} (Mines Start)`);
        } else if (req.user.consecutiveLosses >= 2 && req.user.previousBet > 0 && betAmount >= req.user.previousBet * 1.8) {
            riskLevel = 'HIGH';
            logEvent('SYSTEM', `📉 ANTI-MARTINGALE: ${req.user.username} (Mines - Doubling after loss)`);
        }

        const newGame = { 
            type:'MINES', bet:betAmount, minesCount, minesList:Array.from(minesSet), 
            minesRevealed:[], minesMultiplier:1.0, minesGameOver:false, riskLevel 
        };

        const user = await User.findOneAndUpdate(
            { _id: req.user.id, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { $inc: { balance: -betAmount, sessionProfit: -betAmount }, $set: { activeGame: newGame } },
            { new: true }
        );
        
        if(!user) return res.status(400).json({message: 'Erro ao iniciar'});
        logSession(user, -betAmount);
        res.json({success:true, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/reveal', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;

        if (g.minesGameOver) return res.status(400).json({ message: 'Finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});

        let rigProbability = 0;
        let isRigged = false;
        
        // Dynamic Risk + Stored Risk
        if (g.riskLevel === 'HIGH') rigProbability = 0.8; // High chance to hit bomb if marked high risk
        else if (g.minesCount <= 3 && user.consecutiveWins >= 2) rigProbability = 0.3;
        else if (user.consecutiveWins >= 4) rigProbability = 0.9;

        if (secureRandomFloat() < rigProbability) {
             if (!g.minesList.includes(tileId)) {
                 // Move a bomb to this tile
                 const safeTileIndex = g.minesList.findIndex(m => !g.minesRevealed.includes(m)); // Should pick a bomb, wait.
                 // minesList contains IDs of BOMBS.
                 // If clicked tile is NOT in minesList, it is safe.
                 // To rig, we make it a bomb.
                 // We remove a bomb from somewhere else (that wasn't revealed yet) and put it here.
                 // We pop the last bomb ID and push the clicked ID.
                 g.minesList.pop(); 
                 g.minesList.push(tileId); 
                 user.markModified('activeGame'); 
                 isRigged = true;
                 logEvent('GAME', `💣 MINE MOVED to #${tileId} for ${user.username} (Rigged)`);
             }
        }

        if(g.minesList.includes(tileId)) { 
            g.minesGameOver=true; g.type='NONE'; handleLoss(user, g.bet); 
            await user.save(); 
            logSession(user, 0); 
            return res.json({outcome:'BOMB',mines:g.minesList,status:'GAME_OVER',newBalance:user.balance}); 
        }
        
        g.minesRevealed.push(tileId); 
        g.minesMultiplier = getMinesMultiplier(g.minesCount, g.minesRevealed.length);
        
        if(g.minesRevealed.length >= (25 - g.minesCount)) { 
             const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
             user.balance += profit; user.sessionProfit += profit; handleWin(user, g.bet);
             g.type = 'NONE';
             await user.save();
             logSession(user, profit); 
             return res.json({outcome:'GEM', status:'WIN_ALL', profit, multiplier:g.minesMultiplier, newBalance:user.balance, mines: g.minesList});
        }
        
        user.markModified('activeGame'); await user.save();
        res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        
        if (g.minesGameOver) return res.status(400).json({ message: 'Jogo já finalizado' });

        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        user.balance += profit; user.sessionProfit += profit; handleWin(user, g.bet);
        const mines = g.minesList; g.type='NONE'; await user.save();
        logSession(user, profit);
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/tiger/spin', authenticateToken, checkActionCooldown, async (req, res) => {
    try {
        const { amount } = req.body;
        const betAmount = Math.abs(Number(amount));
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

        const user = await User.findOneAndUpdate(
            { _id: req.user.id, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { $inc: { balance: -betAmount, sessionProfit: -betAmount } },
            { new: true }
        );

        if (!user) return res.status(400).json({message: 'Saldo insuficiente.'});

        let symbolsPool = [...TIGER_SYMBOLS];
        
        // 1. Kill Switch
        if (user.consecutiveWins >= 3) {
             symbolsPool = symbolsPool.map(s => s.weight > 10 ? s : {...s, weight: Math.max(1, s.weight * 0.5)});
             logEvent('SYSTEM', `💀 KILL SWITCH: ${user.username} (Tiger Odds Slashed)`);
        }
        // 2. Anti-Martingale
        else if (user.previousBet > 0 && betAmount > user.previousBet * 1.8 && user.consecutiveLosses > 2) {
             symbolsPool = symbolsPool.map(s => s.weight > 10 ? s : {...s, weight: Math.max(1, s.weight * 0.6)});
             logEvent('SYSTEM', `📉 ANTI-MARTINGALE: ${user.username} (Tiger - Doubling after loss)`);
        }

        const getRandomSymbol = () => {
            const totalWeight = symbolsPool.reduce((acc, s) => acc + s.weight, 0);
            let random = secureRandomFloat() * totalWeight;
            for (const sym of symbolsPool) {
                if (random < sym.weight) return sym;
                random -= sym.weight;
            }
            return symbolsPool[0];
        };

        const grid = Array(9).fill(null).map(() => getRandomSymbol());
        let totalWin = 0; let winningLines = []; let fullScreenSymbol = null;

        for (let i = 0; i < PAYLINES.length; i++) {
            const line = PAYLINES[i];
            const s1 = grid[line[0]]; const s2 = grid[line[1]]; const s3 = grid[line[2]];
            let match = false; let winSymbol = null;

            if (s1.id === 'wild' && s2.id === 'wild' && s3.id === 'wild') { match = true; winSymbol = s1; }
            else if (s1.id !== 'wild' && (s2.id === s1.id || s2.id === 'wild') && (s3.id === s1.id || s3.id === 'wild')) { match = true; winSymbol = s1; }
            else if (s1.id === 'wild' && s2.id !== 'wild' && (s3.id === s2.id || s3.id === 'wild')) { match = true; winSymbol = s2; }
            else if (s1.id === 'wild' && s2.id === 'wild' && s3.id !== 'wild') { match = true; winSymbol = s3; }

            if (match && winSymbol) {
                totalWin += betAmount * winSymbol.value;
                winningLines.push(i);
            }
        }

        const firstNonWild = grid.find(s => s.id !== 'wild');
        const baseId = firstNonWild ? firstNonWild.id : 'wild';
        const isFullScreen = grid.every(s => s.id === baseId || s.id === 'wild');

        if (isFullScreen && totalWin > 0) { totalWin *= 10; fullScreenSymbol = baseId; }

        if (totalWin > 0) {
            user.balance += totalWin; user.sessionProfit += totalWin; handleWin(user, betAmount);
        } else { handleLoss(user, betAmount); }
        
        logSession(user, totalWin - betAmount);
        await user.save();
        res.json({ grid: grid.map(s => s.id), totalWin, winningLines, isFullScreen, newBalance: user.balance, loyaltyPoints: user.loyaltyPoints });

    } catch(e) { res.status(500).json({message: e.message}); }
});

// --- SERVE STATIC ASSETS IN PRODUCTION ---
// Colocar isso DEPOIS das rotas de API
if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
    app.use(express.static(path.join(__dirname, 'dist')));
    
    app.get('*', (req, res) => {
        // Se for uma rota de API que passou batido, retorna 404 JSON
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ message: 'Endpoint não encontrado.' });
        }
        // Para qualquer outra rota (client-side routing), retorna o index.html
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Secure (${VERSION}) running on port ${PORT}`));
};
startServer();
