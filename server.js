
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Módulo nativo para criptografia
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BET_LIMIT = 50; // Limite global de segurança

// --- SECURE RNG UTILS (CSPRNG) ---
// Substitui Math.random() por criptografia forte para evitar previsibilidade
const secureRandomInt = (min, max) => {
    return crypto.randomInt(min, max);
};

// Retorna float entre 0 (inclusivo) e 1 (exclusivo) com alta entropia
const secureRandomFloat = () => {
    return crypto.randomInt(0, 100000000) / 100000000;
};

// Shuffle Fisher-Yates Seguro
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

// --- SECURITY UTILS ---
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

// --- RATE LIMIT GLOBAL (DDOS Protection) ---
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

// --- ACTION COOLDOWN (Anti-Bot/Script) ---
// Impede que um mesmo UserID faça ações mais rápido que 300ms
const userActionTimestamps = new Map();
const checkActionCooldown = (req, res, next) => {
    const userId = req.body.userId;
    if (!userId) return next();

    const now = Date.now();
    const lastAction = userActionTimestamps.get(userId) || 0;
    
    // 300ms cooldown entre ações críticas de jogo
    if (now - lastAction < 300) {
        return res.status(429).json({ message: 'Ação muito rápida. Aguarde.' });
    }
    
    userActionTimestamps.set(userId, now);
    next();
};

app.set('trust proxy', 1);

// --- MIDDLEWARES DE SEGURANÇA ---
app.use((req, res, next) => {
    // Hardening Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

app.use(createRateLimiter({ windowMs: 60000, max: 300 }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10kb' })); 

// --- MONGODB CONNECTION ---
let isConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB já está conectado.');
      return;
  }
  if (isConnecting) return;
  isConnecting = true;
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
      console.error('❌ FATAL: MONGODB_URI não definida.');
      isConnecting = false;
      return;
  }
  try {
    await mongoose.connect(mongoURI, {
        dbName: 'casino_ai_db',
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        authSource: 'admin', 
        retryWrites: true,
        w: 'majority'
    });
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
    minesGameOver: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true }, 
  balance: { type: Number, default: 0 }, 
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
    delete userObj.password; delete userObj._id; 
    if (userObj.activeGame) { delete userObj.activeGame.bjDeck; delete userObj.activeGame.minesList; }
    return userObj;
};

const generateDailyMissions = () => {
    const pool = [
        { id: 'bj_win_5', type: 'blackjack_win', description: 'Vença 5 mãos de Blackjack', target: 5, rewardPoints: 50 },
        { id: 'bj_play_10', type: 'bet_total', description: 'Aposte R$ 100 no total', target: 100, rewardPoints: 30 },
        { id: 'mines_safe_10', type: 'mines_play', description: 'Jogue 10 rodadas de Mines', target: 10, rewardPoints: 40 },
        { id: 'profit_500', type: 'profit_total', description: 'Obtenha R$ 500 de lucro', target: 500, rewardPoints: 100 },
    ];
    // Secure Shuffle for Missions too
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3).map(m => ({ ...m, current: 0, completed: false }));
};

// --- HELPERS DE JOGO ---
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
        const winChance = safeLeft / tilesLeft;
        multiplier *= (1 / winChance);
    }
    return parseFloat((multiplier * houseEdge).toFixed(2));
};

const handleLoss = (user, currentBet) => {
    user.consecutiveLosses = (user.consecutiveLosses || 0) + 1;
    const wasStreak = user.consecutiveWins >= 3;
    const isLowBet = user.previousBet > 0 && currentBet < (user.previousBet * 0.5);
    if (wasStreak && isLowBet) { user.consecutiveWins = 3; } 
    else { user.consecutiveWins = 0; }
    user.previousBet = currentBet;
};

const handleWin = (user, currentBet) => {
    user.consecutiveWins++;
    user.consecutiveLosses = 0;
    user.previousBet = currentBet;
};

// --- TIGER (SLOT) LOGIC ---
const TIGER_SYMBOLS = [
    { id: 'orange', value: 0.6, weight: 65 },
    { id: 'firecracker', value: 1.0, weight: 30 },
    { id: 'envelope', value: 2.0, weight: 15 },
    { id: 'bag', value: 4.0, weight: 10 },
    { id: 'statue', value: 10.0, weight: 5 },
    { id: 'jewel', value: 20.0, weight: 2 },
    { id: 'wild', value: 50.0, weight: 1 }
];

const PAYLINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]
];

// --- ROUTES ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando...' }); }

    const safeUser = escapeRegex(username);
    const user = await User.findOne({ $or: [ { username: { $regex: new RegExp(`^${safeUser}$`, 'i') } }, { email: { $regex: new RegExp(`^${safeUser}$`, 'i') } } ] });

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
            user.balance = Number(user.balance) || 0; 
            
            // AUTO-FORFEIT ON LOGIN
            if (user.activeGame && user.activeGame.type !== 'NONE') {
                handleLoss(user, user.activeGame.bet);
                user.activeGame = { type: 'NONE' };
            }
            
            const today = new Date().toISOString().split('T')[0];
            if (user.lastDailyReset !== today) { user.missions = generateDailyMissions(); user.lastDailyReset = today; user.markModified('missions'); }
            
            await user.save();
            return res.json(sanitizeUser(user));
        }
    }
    res.status(401).json({ message: 'Credenciais inválidas.' });
  } catch (error) { res.status(500).json({ message: 'Erro interno de servidor.' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando.' }); }

    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário, Email ou CPF já cadastrados.' });
    
    const hashedPassword = await hashPassword(password);

    const user = await User.create({ fullName, username, email, cpf, birthDate, password: hashedPassword, balance: 0, missions: generateDailyMissions(), lastDailyReset: new Date().toISOString().split('T')[0] });
    res.status(201).json(sanitizeUser(user));
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

app.post('/api/user/sync', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
        
        // AUTO-FORFEIT ON REFRESH
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            handleLoss(user, user.activeGame.bet);
            user.activeGame = { type: 'NONE' };
            user.markModified('activeGame'); 
            await user.save();
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.lastDailyReset !== today) { user.missions = generateDailyMissions(); user.lastDailyReset = today; user.markModified('missions'); }
        
        await user.save();
        res.json(sanitizeUser(user));
    } catch (e) { res.status(500).json({ message: 'Erro de sincronização' }); }
});

app.post('/api/balance', async (req, res) => {
    try {
        const { userId, newBalance } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        if (typeof newBalance !== 'number' || newBalance < 0 || isNaN(newBalance)) return res.status(400).json({ message: 'Saldo inválido' });
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.balance = newBalance;
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/avatar', async (req, res) => {
    try {
        const { userId, avatarId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        await User.findByIdAndUpdate(userId, { avatarId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/verify', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        await User.findByIdAndUpdate(userId, { documentsStatus: 'PENDING' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/store/purchase', checkActionCooldown, async (req, res) => {
    try {
        const { userId, itemId, cost } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        
        const user = await User.findOneAndUpdate(
            { _id: userId, loyaltyPoints: { $gte: cost } },
            { 
                $inc: { loyaltyPoints: -cost },
                $addToSet: { ownedItems: itemId }
            },
            { new: true }
        );

        if (!user) return res.status(400).json({message: 'Pontos insuficientes.'});
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

// --- ATOMIC GAME TRANSACTIONS (SECURE) ---

app.post('/api/blackjack/deal', checkActionCooldown, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const betAmount = Math.abs(Number(amount)); 
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({message: 'Aposta inválida'});
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let d=[]; 
        // 6 Decks
        for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { 
            let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; 
            // Unique secure ID per card
            d.push({rank:r,suit:s,value:v,id:crypto.randomBytes(8).toString('hex'),isHidden:false}); 
        }
        
        // Secure Shuffle
        secureShuffle(d);
        
        const p=[d.pop(),d.pop()], dl=[d.pop(),d.pop()];
        let st='PLAYING', rs='NONE';
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let payout = 0;
        let pScore = calc(p);
        let dScore = calc(dl);
        
        if(pScore===21){ 
            st='GAME_OVER'; 
            if(dScore===21){ rs='PUSH'; payout = betAmount; }
            else { rs='BLACKJACK'; payout = betAmount * 2.5; }
        }

        const newActiveGame = st==='PLAYING' ? 
            { type:'BLACKJACK', bet:betAmount, bjDeck:d, bjPlayerHand:p, bjDealerHand:dl, bjStatus:st } : 
            { type:'NONE' };

        const user = await User.findOneAndUpdate(
            { _id: userId, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { 
                $inc: { balance: -betAmount },
                $set: { activeGame: newActiveGame }
            },
            { new: true }
        );

        if (!user) return res.status(400).json({message: 'Jogo em andamento ou saldo insuficiente.'});

        if (payout > 0) {
             user.balance += payout;
             if(rs === 'BLACKJACK') handleWin(user, betAmount);
             else user.previousBet = betAmount;
             await user.save();
        }

        res.json({playerHand:p,dealerHand:st==='PLAYING'?[dl[0],{...dl[1],isHidden:true}]:dl,status:st,result:rs,newBalance:user.balance,loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/hit', checkActionCooldown, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });

        const user = await User.findOne({ _id: userId, 'activeGame.type': 'BLACKJACK' });
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        
        const g = user.activeGame;
        const card = g.bjDeck.pop();
        g.bjPlayerHand.push(card);
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        let st='PLAYING', rs='NONE';
        
        if(calc(g.bjPlayerHand)>21){ 
            st='GAME_OVER'; rs='BUST'; g.type='NONE'; handleLoss(user, g.bet);
        } else { user.markModified('activeGame'); } 
        
        if (st === 'GAME_OVER') { g.type = 'NONE'; }
        await user.save();
        res.json({playerHand:g.bjPlayerHand, dealerHand:[g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status:st, result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', checkActionCooldown, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });

        const user = await User.findOne({ _id: userId, 'activeGame.type': 'BLACKJACK' });
        if(!user) return res.status(400).json({message:'Jogo inválido'});
        
        const g = user.activeGame;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        while(calc(g.bjDealerHand)<17) g.bjDealerHand.push(g.bjDeck.pop());
        
        const ps=calc(g.bjPlayerHand), ds=calc(g.bjDealerHand);
        let rs='LOSE';
        
        if(ds>21 || ps>ds) { rs='WIN'; user.balance += g.bet*2; handleWin(user, g.bet); }
        else if(ps===ds) { rs='PUSH'; user.balance += g.bet; user.previousBet = g.bet; } 
        else { handleLoss(user, g.bet); }
        
        g.type='NONE';
        await user.save();
        res.json({dealerHand:g.bjDealerHand, status:'GAME_OVER', result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/start', checkActionCooldown, async (req, res) => {
    try {
        const { userId, amount, minesCount } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        
        const betAmount = Math.abs(Number(amount));
        if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({message: 'Aposta inválida'});
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

        // Secure Random Mines Generation
        const minesSet = new Set();
        while(minesSet.size < minesCount) {
            minesSet.add(secureRandomInt(0, 25)); // 0 to 24 inclusive
        }
        
        const newGame = { type:'MINES', bet:betAmount, minesCount, minesList:Array.from(minesSet), minesRevealed:[], minesMultiplier:1.0, minesGameOver:false };

        const user = await User.findOneAndUpdate(
            { _id: userId, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { 
                $inc: { balance: -betAmount },
                $set: { activeGame: newGame }
            },
            { new: true }
        );
        
        if(!user) return res.status(400).json({message: 'Jogo em andamento ou saldo insuficiente.'});

        res.json({success:true, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/reveal', checkActionCooldown, async (req, res) => {
    try {
        const { userId, tileId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });

        const user = await User.findById(userId);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;

        if (g.minesGameOver) return res.status(400).json({ message: 'Jogo finalizado.' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});

        // --- RIG LOGIC (Hardened) ---
        let rigProbability = 0;
        let isRigged = false;
        
        // Anti-Farming & Risk Control
        if (g.minesCount <= 3) {
            if (user.consecutiveWins >= 2) rigProbability = 0.3;
            if (user.consecutiveWins >= 5) rigProbability = 0.8;
        }
        if (user.consecutiveWins >= 4) rigProbability = 1.0;
        if (user.previousBet > 0 && g.bet >= (user.previousBet * 1.8)) rigProbability = Math.max(rigProbability, 0.4); 

        // Uses Secure Random Float for probability check
        if (secureRandomFloat() < rigProbability) {
             if (!g.minesList.includes(tileId)) {
                 g.minesList.pop(); 
                 g.minesList.push(tileId); 
                 user.markModified('activeGame');
                 isRigged = true;
             }
        }

        if(g.minesList.includes(tileId)) { 
            g.minesGameOver=true; g.type='NONE'; handleLoss(user, g.bet); 
            await user.save(); 
            return res.json({outcome:'BOMB',mines:g.minesList,status:'GAME_OVER',newBalance:user.balance}); 
        }
        
        g.minesRevealed.push(tileId); 
        g.minesMultiplier = getMinesMultiplier(g.minesCount, g.minesRevealed.length);
        const totalSafe = 25 - g.minesCount;
        
        if(g.minesRevealed.length >= totalSafe) { // Win All
             const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
             user.balance += profit;
             handleWin(user, g.bet);
             g.type = 'NONE';
             await user.save();
             return res.json({outcome:'GEM', status:'WIN_ALL', profit, multiplier:g.minesMultiplier, newBalance:user.balance, mines: g.minesList});
        }
        
        user.markModified('activeGame'); await user.save();
        res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', checkActionCooldown, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });

        const user = await User.findById(userId);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        
        if (g.minesGameOver) return res.status(400).json({ message: 'Jogo já finalizado' });

        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        user.balance += profit;
        handleWin(user, g.bet);
        
        const mines = g.minesList; g.type='NONE'; await user.save();
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/tiger/spin', checkActionCooldown, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });

        const betAmount = Math.abs(Number(amount));
        if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({message: 'Aposta inválida'});
        if (betAmount > MAX_BET_LIMIT) return res.status(400).json({message: 'Limite excedido'});

        const user = await User.findOneAndUpdate(
            { _id: userId, 'activeGame.type': 'NONE', balance: { $gte: betAmount } },
            { $inc: { balance: -betAmount } },
            { new: true }
        );

        if (!user) return res.status(400).json({message: 'Saldo insuficiente.'});

        // --- SECURE SLOT RNG ---
        let symbolsPool = [...TIGER_SYMBOLS];
        if (user.previousBet > 0 && betAmount > user.previousBet * 1.8 && user.consecutiveLosses > 2) {
             symbolsPool = symbolsPool.map(s => s.weight > 10 ? s : {...s, weight: Math.max(1, s.weight * 0.7)});
        }

        const getRandomSymbol = () => {
            const totalWeight = symbolsPool.reduce((acc, s) => acc + s.weight, 0);
            // Secure Random Float for Weight Selection
            let random = secureRandomFloat() * totalWeight;
            for (const sym of symbolsPool) {
                if (random < sym.weight) return sym;
                random -= sym.weight;
            }
            return symbolsPool[0];
        };

        const grid = Array(9).fill(null).map(() => getRandomSymbol());
        
        let totalWin = 0;
        let winningLines = [];
        let fullScreenSymbol = null;

        for (let i = 0; i < PAYLINES.length; i++) {
            const line = PAYLINES[i];
            const s1 = grid[line[0]];
            const s2 = grid[line[1]];
            const s3 = grid[line[2]];

            let match = false;
            let winSymbol = null;

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

        if (isFullScreen && totalWin > 0) {
            totalWin *= 10;
            fullScreenSymbol = baseId;
        }

        if (totalWin > 0) {
            user.balance += totalWin;
            handleWin(user, betAmount);
        } else {
            handleLoss(user, betAmount);
        }

        await user.save();
        res.json({ grid: grid.map(s => s.id), totalWin, winningLines, isFullScreen, newBalance: user.balance, loyaltyPoints: user.loyaltyPoints });

    } catch(e) { res.status(500).json({message: e.message}); }
});

// --- STATIC FILES ---
const distPath = path.resolve(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'API Route Not Found' });
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(503).send('<h1>Sistema em manutenção</h1>');
  });
}

const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Secure (v1.0.7) running on port ${PORT}`));
};
startServer();
