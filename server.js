const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- RATE LIMIT ---
const createRateLimiter = ({ windowMs, max, message }) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, data] of requests.entries()) {
            if (now > data.expiry) requests.delete(ip);
        }
    }, 60000); 

    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = Date.now();
        if (!requests.has(ip)) requests.set(ip, { count: 1, expiry: now + windowMs });
        else {
            const data = requests.get(ip);
            if (now > data.expiry) requests.set(ip, { count: 1, expiry: now + windowMs });
            else {
                data.count++;
                if (data.count > max) return res.status(429).json(message);
            }
        }
        next();
    };
};

const limiter = createRateLimiter({ windowMs: 60000, max: 5000, message: { message: 'Muitas requisições. Aguarde um momento.' } });
app.set('trust proxy', 1);
app.use(limiter);

// --- CORS & DEBUGGING ---
// Permite qualquer origem para resolver problemas de acesso via IP na rede local
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Log básico para debug de conexões externas
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// --- MONGODB ---
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) return console.warn('⚠️ MONGODB_URI não definida.');
    await mongoose.connect(mongoURI, { dbName: 'casino_ai_db' });
    console.log(`✅ MongoDB Conectado`);
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
  }
};

// --- SCHEMAS ---
const missionSchema = new mongoose.Schema({
    id: String,
    type: String,
    description: String,
    target: Number,
    current: { type: Number, default: 0 },
    rewardPoints: Number,
    completed: { type: Boolean, default: false }
});

const activeGameSchema = new mongoose.Schema({
    type: { type: String, enum: ['BLACKJACK', 'MINES', 'NONE'], default: 'NONE' },
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
  password: { type: String, required: true }, // Em produção real, deve ser hash (bcrypt)
  balance: { type: Number, default: 1000 },
  consecutiveWins: { type: Number, default: 0 },
  avatarId: { type: String, default: '1' },
  activeFrame: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  
  // Gamification Core
  loyaltyPoints: { type: Number, default: 0 },
  
  missions: [missionSchema],
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  lastDailyReset: { type: String, default: '' },
  totalGamesPlayed: { type: Number, default: 0 },
  totalBlackjacks: { type: Number, default: 0 },
  activeGame: { type: activeGameSchema, default: () => ({}) }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const User = mongoose.model('User', userSchema);

// --- HELPER: SANITIZE USER ---
const sanitizeUser = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password; 
    delete userObj._id; 
    
    if (userObj.activeGame) {
        if (userObj.activeGame.bjDeck) delete userObj.activeGame.bjDeck;
        if (userObj.activeGame.minesList) delete userObj.activeGame.minesList;
    }
    return userObj;
};

// --- CORE GAMIFICATION LOGIC ---

const applyGameRewards = (user, pointsEarned) => {
    if (pointsEarned > 0) user.loyaltyPoints += Math.floor(pointsEarned);
    user.loyaltyPoints = Math.floor(Number(user.loyaltyPoints) || 0);
};

const updateMissions = (user, type, amount) => {
    if (!user.missions) return;
    
    let missionChanged = false;
    user.missions.forEach(mission => {
        if (!mission.completed && mission.type === type) {
            mission.current = Math.floor(mission.current + amount);
            if (mission.current >= mission.target) {
                mission.current = mission.target;
                mission.completed = true;
                applyGameRewards(user, mission.rewardPoints);
            }
            missionChanged = true;
        }
    });
    if (missionChanged) user.markModified('missions');
};

const checkTrophies = (user, context) => {
    const { bet, winAmount, gameType, outcome, extraData } = context;
    let trophiesChanged = false;

    const unlock = (id) => {
        if (!user.unlockedTrophies.includes(id)) {
            user.unlockedTrophies.push(id);
            trophiesChanged = true;
        }
    };

    // 1. First Win (Qualquer vitória > 0)
    if (winAmount > 0) unlock('first_win');

    // 2. High Roller (Aposta >= 500)
    if (bet >= 500) unlock('high_roller');

    // 3. Sniper (Mines: 20 acertos)
    if (gameType === 'MINES' && extraData?.revealedCount >= 20) unlock('sniper');

    // 4. Club 50 (50 Jogos)
    if (user.totalGamesPlayed >= 50) unlock('club_50');

    // 5. BJ Master (10 Blackjacks Naturais)
    if (gameType === 'BLACKJACK' && outcome === 'BLACKJACK') {
        user.totalBlackjacks = (user.totalBlackjacks || 0) + 1;
        if (user.totalBlackjacks >= 10) unlock('bj_master');
    }

    // 6. Rich Club (Saldo >= 5000)
    if (user.balance >= 5000) unlock('rich_club');

    if (trophiesChanged) user.markModified('unlockedTrophies');
};

const generateDailyMissions = () => {
    const pool = [
        { id: 'bj_win_5', type: 'blackjack_win', description: 'Vença 5 mãos de Blackjack', target: 5, rewardPoints: 50 },
        { id: 'bj_play_10', type: 'bet_total', description: 'Aposte R$ 100 no total', target: 100, rewardPoints: 30 },
        { id: 'mines_safe_10', type: 'mines_play', description: 'Jogue 10 rodadas de Mines', target: 10, rewardPoints: 40 },
        { id: 'profit_500', type: 'profit_total', description: 'Obtenha R$ 500 de lucro', target: 500, rewardPoints: 100 },
    ];
    return pool.sort(() => 0.5 - Math.random()).slice(0, 3).map(m => ({ ...m, current: 0, completed: false }));
};

// --- ROUTES ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await User.findOne({ $or: [{ username }, { email: username }] });
    
    if (user && user.password === password) {
        // --- DATA INTEGRITY GUARD ---
        user.balance = Math.floor(Number(user.balance) || 1000);
        user.loyaltyPoints = Math.floor(Number(user.loyaltyPoints) || 0);
        user.vipLevel = Math.floor(Number(user.vipLevel) || 0);
        if (!user.missions) user.missions = [];
        if (!user.ownedItems) user.ownedItems = [];
        if (!user.unlockedTrophies) user.unlockedTrophies = [];
        if (!user.activeGame) user.activeGame = { type: 'NONE' };

        const today = new Date().toISOString().split('T')[0];
        if (user.lastDailyReset !== today) {
            user.missions = generateDailyMissions();
            user.lastDailyReset = today;
            user.markModified('missions');
        }
        
        if (user.activeGame?.minesGameOver) user.activeGame = { type: 'NONE' };

        await user.save();
        res.json(sanitizeUser(user));
    } else {
      res.status(401).json({ message: 'Credenciais inválidas.' });
    }
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

app.post('/api/user/sync', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'ID de usuário inválido.'});
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.balance = Math.floor(Number(user.balance) || 1000);
        user.loyaltyPoints = Math.floor(Number(user.loyaltyPoints) || 0);
        user.vipLevel = Math.floor(Number(user.vipLevel) || 0);
        if (!user.missions) user.missions = [];
        if (!user.ownedItems) user.ownedItems = [];
        if (!user.unlockedTrophies) user.unlockedTrophies = [];
        if (!user.activeGame) user.activeGame = { type: 'NONE' };
        
        const today = new Date().toISOString().split('T')[0];
        if (user.lastDailyReset !== today) {
            user.missions = generateDailyMissions();
            user.lastDailyReset = today;
            user.markModified('missions');
        }

        if (user.activeGame?.minesGameOver) user.activeGame = { type: 'NONE' };

        await user.save();
        res.json(sanitizeUser(user));
    } catch (e) { 
        console.error("SYNC ERROR:", e);
        res.status(500).json({ message: 'Sync error' }); 
    }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Dados já cadastrados (Usuário, Email ou CPF).' });

    const user = await User.create({ 
        fullName, username, email, cpf, birthDate, password, 
        balance: 1000, 
        missions: generateDailyMissions(),
        lastDailyReset: new Date().toISOString().split('T')[0],
        loyaltyPoints: 0,
        vipLevel: 0,
        activeFrame: null,
        activeGame: { type: 'NONE' }
    });

    res.status(201).json(sanitizeUser(user));
  } catch (error) { 
      console.error(error);
      res.status(500).json({ message: 'Erro ao criar conta.' }); 
  }
});

app.post('/api/user/avatar', async (req, res) => {
    try {
        const { userId, avatarId } = req.body;
        await User.findByIdAndUpdate(userId, { avatarId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/frame', async (req, res) => {
    try {
        const { userId, frameId } = req.body;
        await User.findByIdAndUpdate(userId, { activeFrame: frameId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/verify', async (req, res) => {
    try {
        const { userId } = req.body;
        await User.findByIdAndUpdate(userId, { documentsStatus: 'PENDING' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

// --- BLACKJACK ENDPOINTS ---

app.post('/api/blackjack/deal', async (req, res) => {
    const { userId, amount } = req.body;
    const bet = Math.floor(Number(amount));
    
    if (isNaN(bet) || bet <= 0) return res.status(400).json({ message: 'Aposta inválida' });
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if (user.balance < bet) return res.status(400).json({ message: 'Saldo insuficiente' });

    user.balance = Math.floor(user.balance - bet);
    user.totalGamesPlayed = (user.totalGamesPlayed || 0) + 1;

    const SUITS = ['♥', '♦', '♣', '♠'];
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const createDeck = () => {
        let d = []; for(let i=0; i<6; i++) for(let s of SUITS) for(let r of RANKS) {
            let v = parseInt(r); if(['J','Q','K'].includes(r)) v=10; if(r==='A') v=11;
            d.push({rank:r, suit:s, value:v, id:Math.random().toString(36).substr(2,9)});
        } return d.sort(() => Math.random() - 0.5);
    };
    const calc = (h) => { let s=0,a=0; h.forEach(c=>{if(!c.isHidden){s+=c.value; if(c.rank==='A')a++;}}); while(s>21&&a>0){s-=10;a--;} return s; };

    let deck = createDeck();
    const pHand = [deck.pop(), deck.pop()];
    const dHand = [deck.pop(), deck.pop()];
    let status = 'PLAYING';
    let result = 'NONE';
    let pScore = calc(pHand);
    let dScore = calc(dHand); 

    if (pScore === 21) { 
        status = 'GAME_OVER';
        if (dScore === 21) {
            result = 'PUSH'; user.balance += bet;
        } else {
            result = 'BLACKJACK'; user.balance += Math.floor(bet * 2.5); 
        }
    }

    user.activeGame = (status === 'PLAYING') ? { type: 'BLACKJACK', bet, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: status } : { type: 'NONE' };

    applyGameRewards(user, bet);
    updateMissions(user, 'bet_total', bet);

    // -- TROPHY CHECK (Initial Deal) --
    if (result === 'BLACKJACK') {
        user.consecutiveWins = (user.consecutiveWins || 0) + 1;
        applyGameRewards(user, Math.floor(bet * 0.2));
        updateMissions(user, 'blackjack_win', 1);
        checkTrophies(user, { bet, winAmount: Math.floor(bet * 2.5), gameType: 'BLACKJACK', outcome: 'BLACKJACK' });
    } else {
        checkTrophies(user, { bet, winAmount: 0, gameType: 'BLACKJACK', outcome: 'NONE' });
    }

    await user.save();
    
    const visibleDealer = (status === 'PLAYING') ? [dHand[0], { ...dHand[1], isHidden: true }] : dHand;
    
    res.json({ 
        playerHand: pHand, dealerHand: visibleDealer, status, result, 
        newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
    });
});

app.post('/api/blackjack/hit', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if (user.activeGame.type !== 'BLACKJACK') return res.status(400).json({ message: 'Nenhum jogo ativo' });

    const game = user.activeGame;
    if (!game.bjDeck || game.bjDeck.length === 0) return res.status(500).json({ message: 'Erro no baralho' });

    game.bjPlayerHand.push(game.bjDeck.pop());
    
    const calc = (h) => { let s=0,a=0; h.forEach(c=>{s+=c.value; if(c.rank==='A')a++;}); while(s>21&&a>0){s-=10;a--;} return s; };
    
    let score = calc(game.bjPlayerHand);
    let status = 'PLAYING';
    let result = 'NONE';

    if (score > 21) {
        status = 'GAME_OVER'; result = 'BUST'; game.type = 'NONE'; user.consecutiveWins = 0;
    }

    user.markModified('activeGame');
    await user.save(); 
    
    const visibleDealer = [game.bjDealerHand[0], { ...game.bjDealerHand[1], isHidden: true }];
    res.json({ 
        playerHand: game.bjPlayerHand, dealerHand: status === 'GAME_OVER' ? game.bjDealerHand : visibleDealer, status, result, 
        newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
    });
});

app.post('/api/blackjack/stand', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if (user.activeGame.type !== 'BLACKJACK') return res.status(400).json({ message: 'Nenhum jogo ativo' });

    const game = user.activeGame;
    const calc = (h) => { let s=0,a=0; h.forEach(c=>{s+=c.value; if(c.rank==='A')a++;}); while(s>21&&a>0){s-=10;a--;} return s; };
    
    let dScore = calc(game.bjDealerHand);
    while (dScore < 17) {
        if (!game.bjDeck.length) break;
        game.bjDealerHand.push(game.bjDeck.pop());
        dScore = calc(game.bjDealerHand);
    }
    
    let pScore = calc(game.bjPlayerHand);
    let result = 'LOSE';
    let payout = 0;

    if (dScore > 21 || pScore > dScore) { result = 'WIN'; payout = game.bet * 2; }
    else if (pScore === dScore) { result = 'PUSH'; payout = game.bet; }

    if (payout > 0) {
        user.balance += Math.floor(payout); 
        const profit = payout - game.bet;
        if (profit > 0) {
            applyGameRewards(user, Math.floor(profit * 0.5));
            updateMissions(user, 'profit_total', Math.floor(profit));
        }
    }

    if (result === 'WIN') {
        user.consecutiveWins = (user.consecutiveWins || 0) + 1;
        updateMissions(user, 'blackjack_win', 1);
    } else user.consecutiveWins = 0;

    // -- TROPHY CHECK (Stand/End) --
    checkTrophies(user, { bet: game.bet, winAmount: payout - game.bet, gameType: 'BLACKJACK', outcome: result });

    game.type = 'NONE';
    user.markModified('activeGame');
    await user.save();

    res.json({ 
        playerHand: game.bjPlayerHand, dealerHand: game.bjDealerHand, status: 'GAME_OVER', result, 
        newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
    });
});

// --- MINES ENDPOINTS ---

app.post('/api/mines/start', async (req, res) => {
    const { userId, amount, minesCount } = req.body;
    const bet = Math.floor(Number(amount));
    const mines = Number(minesCount);

    if (isNaN(bet) || bet <= 0) return res.status(400).json({ message: 'Aposta inválida' });
    if (isNaN(mines) || mines < 1 || mines > 24) return res.status(400).json({ message: 'Número de minas inválido (1-24)' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if (user.balance < bet) return res.status(400).json({ message: 'Saldo insuficiente' });

    user.balance = Math.floor(user.balance - bet);
    user.totalGamesPlayed = (user.totalGamesPlayed || 0) + 1;
    
    applyGameRewards(user, bet);
    updateMissions(user, 'bet_total', bet);
    updateMissions(user, 'mines_play', 1);

    // -- TROPHY CHECK (Start) --
    checkTrophies(user, { bet, winAmount: 0, gameType: 'MINES', outcome: 'NONE' });

    const minesSet = new Set();
    while(minesSet.size < mines) minesSet.add(Math.floor(Math.random() * 25));

    user.activeGame = {
        type: 'MINES', bet, minesCount: mines,
        minesList: Array.from(minesSet), minesRevealed: [],
        minesMultiplier: 1.0, minesGameOver: false
    };
    
    await user.save();

    res.json({ 
        success: true, 
        newBalance: user.balance, 
        loyaltyPoints: user.loyaltyPoints 
    });
});

app.post('/api/mines/reveal', async (req, res) => {
    const { userId, tileId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if(user.activeGame.type !== 'MINES') return res.status(400).json({message:'Nenhum jogo ativo'});
    
    const game = user.activeGame;
    const target = Number(tileId);
    
    if (target < 0 || target > 24 || isNaN(target)) return res.status(400).json({message: 'Tile inválido'});

    if(game.minesRevealed.includes(target)) {
        return res.json({ 
            outcome: 'GEM', status: 'PLAYING', 
            profit: Math.floor(game.bet * game.minesMultiplier), multiplier: game.minesMultiplier,
            newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
        });
    }

    if (game.minesList.includes(target)) {
        game.minesGameOver = true;
        game.type = 'NONE';
        user.consecutiveWins = 0;
        user.markModified('activeGame');
        await user.save();
        
        return res.json({ 
            outcome: 'BOMB', mines: game.minesList, status: 'GAME_OVER', 
            newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
        });
    }

    game.minesRevealed.push(target);
    const houseEdge = 0.97;
    let mult = 1.0;
    for(let i=0; i<game.minesRevealed.length; i++) {
        let rem = 25 - i;
        let safe = rem - game.minesCount;
        mult *= (houseEdge / (safe/rem));
    }
    game.minesMultiplier = mult;

    // -- TROPHY CHECK (Reveal - Sniper Check) --
    checkTrophies(user, { bet: game.bet, winAmount: 0, gameType: 'MINES', outcome: 'NONE', extraData: { revealedCount: game.minesRevealed.length } });

    if (game.minesRevealed.length === 25 - game.minesCount) {
        game.minesGameOver = true;
        game.type = 'NONE';
        const win = Math.floor(game.bet * game.minesMultiplier);
        user.balance += win;
        const profit = win - game.bet;
        user.consecutiveWins = (user.consecutiveWins || 0) + 1;
        
        if (profit > 0) {
            applyGameRewards(user, Math.floor(profit * 0.5));
            updateMissions(user, 'profit_total', Math.floor(profit));
        }
        
        // -- TROPHY CHECK (Win All) --
        checkTrophies(user, { bet: game.bet, winAmount: profit, gameType: 'MINES', outcome: 'WIN' });

        user.markModified('activeGame');
        await user.save();
        
        return res.json({ 
            outcome: 'GEM', status: 'WIN_ALL', profit: win, multiplier: game.minesMultiplier, 
            newBalance: user.balance, mines: game.minesList, 
            loyaltyPoints: user.loyaltyPoints 
        });
    }

    user.markModified('activeGame');
    await user.save();
    
    res.json({ 
        outcome: 'GEM', status: 'PLAYING', 
        profit: Math.floor(game.bet * game.minesMultiplier), multiplier: game.minesMultiplier,
        newBalance: user.balance, loyaltyPoints: user.loyaltyPoints 
    });
});

app.post('/api/mines/cashout', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    if(user.activeGame.type !== 'MINES') return res.status(400).json({message:'Nenhum jogo ativo para sacar'});
    
    const game = user.activeGame;
    if (game.minesRevealed.length === 0) return res.status(400).json({message: 'Revele ao menos um campo'});

    const win = Math.floor(game.bet * game.minesMultiplier);
    user.balance += win;
    const profit = win - game.bet;
    user.consecutiveWins = (user.consecutiveWins || 0) + 1;

    if(profit > 0) {
        applyGameRewards(user, Math.floor(profit * 0.5));
        updateMissions(user, 'profit_total', Math.floor(profit));
    }

    // -- TROPHY CHECK (Cashout) --
    checkTrophies(user, { bet: game.bet, winAmount: profit, gameType: 'MINES', outcome: 'WIN' });

    const mines = game.minesList;
    game.type = 'NONE';
    user.markModified('activeGame');
    await user.save();
    
    res.json({ 
        success: true, profit: win, newBalance: user.balance, mines, 
        loyaltyPoints: user.loyaltyPoints 
    });
});

app.post('/api/store/purchase', async (req, res) => {
    try {
        const { userId, itemId, cost } = req.body;
        const user = await User.findOneAndUpdate(
            { _id: userId, loyaltyPoints: { $gte: cost }, ownedItems: { $ne: itemId } },
            { $inc: { loyaltyPoints: -cost }, $push: { ownedItems: itemId } },
            { new: true }
        );
        if (!user) return res.status(400).json({ message: 'Erro na compra (Pontos insuficientes ou item já possuído)' });
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (error) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/balance', async (req, res) => {
    try {
        const { userId, newBalance } = req.body;
        const safeBalance = Math.max(0, Math.floor(newBalance));
        const user = await User.findByIdAndUpdate(userId, { balance: safeBalance }, { new: true });
        
        // Check Trophies on Balance Update
        if (user) {
            checkTrophies(user, { bet: 0, winAmount: 0, gameType: 'NONE', outcome: 'NONE' });
            await user.save();
        }

        res.json({ balance: user ? user.balance : 0 });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'API Error' });
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor na porta ${PORT}`));
};
startServer();