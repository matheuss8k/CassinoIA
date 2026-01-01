
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- UTILS ---
const escapeRegex = (text) => {
    if (!text) return "";
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

// --- RATE LIMIT (Produção) ---
// 300 requisições por minuto = 5 req/segundo (Suficiente para clicar rápido, mas bloqueia scripts de ataque)
const createRateLimiter = ({ windowMs, max }) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, data] of requests.entries()) {
            if (now > data.expiry) requests.delete(ip);
        }
    }, 60000); 

    return (req, res, next) => {
        // Permitir localhost irrestrito para testes internos
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
                    return res.status(429).json({ message: 'Muitas requisições. Aguarde um momento.' });
                }
            }
        }
        next();
    };
};

app.set('trust proxy', 1);
app.use(createRateLimiter({ windowMs: 60000, max: 300 }));

// --- CORS ---
// Em produção, recomenda-se restringir a origin, mas '*' é aceitável se o frontend estiver na mesma origem ou for público.
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10kb' })); // Limita payload para evitar DOS

// --- MONGODB CONNECTION MANAGER ---
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
      console.error('❌ FATAL: MONGODB_URI não definida nas Variáveis de Ambiente.');
      isConnecting = false;
      return;
  }

  // Mascara senha para log de segurança
  const maskedURI = mongoURI.replace(/:([^:@]+)@/, ':****@');
  console.log(`🔌 Tentando conectar ao MongoDB (AuthSource: admin)...`);

  try {
    await mongoose.connect(mongoURI, {
        dbName: 'casino_ai_db',
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        authSource: 'admin', 
        retryWrites: true,
        w: 'majority'
    });
    console.log(`✅ MongoDB Conectado com Sucesso!`);
    isConnecting = false;
  } catch (error) {
    console.error(`❌ Falha na conexão MongoDB: ${error.message}`);
    isConnecting = false;
    setTimeout(connectDB, 5000); 
  }
};

mongoose.connection.on('error', err => console.error('❌ Erro de conexão MongoDB (Runtime):', err));
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB desconectado. Tentando reconectar...');
    connectDB();
});

// --- SCHEMAS E MODELS ---
const missionSchema = new mongoose.Schema({
    id: String, type: String, description: String, target: Number,
    current: { type: Number, default: 0 }, rewardPoints: Number, completed: { type: Boolean, default: false }
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
  password: { type: String, required: true }, 
  balance: { type: Number, default: 0 }, 
  consecutiveWins: { type: Number, default: 0 },
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
    return pool.sort(() => 0.5 - Math.random()).slice(0, 3).map(m => ({ ...m, current: 0, completed: false }));
};

// --- HELPERS DE JOGO ---

// Tabelas de Multiplicadores Padrão (Stake/BC Style) - RTP ~97-99%
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
    // Fallback Calculation
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
    const wasStreak = user.consecutiveWins >= 3;
    const isLowBet = user.previousBet > 0 && currentBet < (user.previousBet * 0.5);
    if (wasStreak && isLowBet) {
        console.log(`🛡️ Anti-Dodge: ${user.username} perdeu aposta baixa. Streak mantido em 3.`);
        user.consecutiveWins = 3; 
    } else {
        user.consecutiveWins = 0; 
    }
    user.previousBet = currentBet;
};

const handleWin = (user, currentBet) => {
    user.consecutiveWins++;
    user.previousBet = currentBet;
};

// --- ROTAS API ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando. Tente novamente em 5 segundos.' }); }

    const safeUser = escapeRegex(username);
    const user = await User.findOne({ $or: [ { username: { $regex: new RegExp(`^${safeUser}$`, 'i') } }, { email: { $regex: new RegExp(`^${safeUser}$`, 'i') } } ] });

    if (user && user.password === password) {
        user.balance = Number(user.balance) || 0; 
        if (!user.activeGame) user.activeGame = { type: 'NONE' };
        if (user.activeGame?.minesGameOver) user.activeGame = { type: 'NONE' };
        
        const today = new Date().toISOString().split('T')[0];
        if (user.lastDailyReset !== today) { user.missions = generateDailyMissions(); user.lastDailyReset = today; user.markModified('missions'); }
        
        await user.save();
        res.json(sanitizeUser(user));
    } else { res.status(401).json({ message: 'Credenciais inválidas.' }); }
  } catch (error) { res.status(500).json({ message: 'Erro interno de servidor.' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (mongoose.connection.readyState !== 1) { connectDB(); return res.status(503).json({ message: 'Sistema inicializando.' }); }

    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário, Email ou CPF já cadastrados.' });
    
    const user = await User.create({ fullName, username, email, cpf, birthDate, password, balance: 0, missions: generateDailyMissions(), lastDailyReset: new Date().toISOString().split('T')[0] });
    res.status(201).json(sanitizeUser(user));
  } catch (error) { res.status(500).json({ message: 'Erro ao criar conta.' }); }
});

app.post('/api/user/sync', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'ID Inválido' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
        const today = new Date().toISOString().split('T')[0];
        if (user.lastDailyReset !== today) { user.missions = generateDailyMissions(); user.lastDailyReset = today; user.markModified('missions'); }
        await user.save();
        res.json(sanitizeUser(user));
    } catch (e) { res.status(500).json({ message: 'Erro de sincronização' }); }
});

app.post('/api/balance', async (req, res) => {
    try {
        const { userId, newBalance } = req.body;
        // Prevent negative balance attack
        if (newBalance < 0) return res.status(400).json({ message: 'Saldo inválido' });
        await User.findByIdAndUpdate(userId, { balance: newBalance });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/user/avatar', async (req, res) => {
    try {
        const { userId, avatarId } = req.body;
        await User.findByIdAndUpdate(userId, { avatarId });
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

app.post('/api/store/purchase', async (req, res) => {
    try {
        const { userId, itemId, cost } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({message: 'User not found'});
        if (user.loyaltyPoints < cost) return res.status(400).json({message: 'Pontos insuficientes'});
        user.loyaltyPoints -= cost;
        if (!user.ownedItems.includes(itemId)) user.ownedItems.push(itemId);
        await user.save();
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: 'Erro' }); }
});

app.post('/api/blackjack/deal', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const betAmount = Math.abs(amount); // Security: Ensure positive bet
        const user = await User.findById(userId);
        if(!user) return res.status(404).json({message:'User'});
        if(user.balance < betAmount) return res.status(400).json({message:'Saldo'});
        user.balance -= betAmount;
        
        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let d=[]; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; d.push({rank:r,suit:s,value:v,id:Math.random().toString(36),isHidden:false}); }
        d.sort(()=>Math.random()-0.5);
        const p=[d.pop(),d.pop()], dl=[d.pop(),d.pop()];
        let st='PLAYING', rs='NONE';
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        if(calc(p)===21){ 
            st='GAME_OVER'; 
            if(calc(dl)===21){ rs='PUSH';user.balance+=betAmount; user.previousBet = betAmount; } 
            else { rs='BLACKJACK';user.balance+=betAmount*2.5; handleWin(user, betAmount); } 
        }

        user.activeGame = st==='PLAYING' ? {type:'BLACKJACK',bet:betAmount,bjDeck:d,bjPlayerHand:p,bjDealerHand:dl,bjStatus:st} : {type:'NONE'};
        await user.save();
        res.json({playerHand:p,dealerHand:st==='PLAYING'?[dl[0],{...dl[1],isHidden:true}]:dl,status:st,result:rs,newBalance:user.balance,loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/hit', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if(!user || user.activeGame.type !== 'BLACKJACK') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const card = g.bjDeck.pop();
        g.bjPlayerHand.push(card);
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        let st='PLAYING', rs='NONE';
        
        if(calc(g.bjPlayerHand)>21){ 
            st='GAME_OVER'; rs='BUST'; g.type='NONE'; handleLoss(user, g.bet);
        } else { user.markModified('activeGame'); } 
        
        if (st === 'GAME_OVER') { g.type = 'NONE'; } else { user.markModified('activeGame'); }
        await user.save();
        res.json({playerHand:g.bjPlayerHand, dealerHand:[g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status:st, result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/blackjack/stand', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if(!user || user.activeGame.type !== 'BLACKJACK') return res.status(400).json({message:'Jogo inválido'});
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

app.post('/api/mines/start', async (req, res) => {
    try {
        const { userId, amount, minesCount } = req.body;
        const betAmount = Math.abs(amount); // Security: Ensure positive bet
        const user = await User.findById(userId);
        if(!user) return res.status(404).json({message:'User'}); if(user.balance < betAmount) return res.status(400).json({message:'Saldo'});
        user.balance -= betAmount;
        
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(Math.floor(Math.random()*25));
        
        user.activeGame = { type:'MINES', bet:betAmount, minesCount, minesList:Array.from(minesSet), minesRevealed:[], minesMultiplier:1.0, minesGameOver:false };
        await user.save();
        res.json({success:true, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/reveal', async (req, res) => {
    try {
        const { userId, tileId } = req.body;
        const user = await User.findById(userId);
        
        // Validation Checks
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;

        // Security: Prevent interacting if game is already over (Race Condition Block)
        if (g.minesGameOver) {
            return res.status(400).json({ message: 'O jogo já terminou.' });
        }
        
        // Idempotency: Se tile já revelado, retorna estado atual sem erro
        if (g.minesRevealed.includes(tileId)) {
             return res.json({outcome:'GEM', status:'PLAYING', profit:parseFloat((g.bet*g.minesMultiplier).toFixed(2)), multiplier:g.minesMultiplier, newBalance:user.balance});
        }

        // --- RIG LOGIC ---
        let rigProbability = 0;
        const attemptingStep = g.minesRevealed.length + 1;

        if (user.consecutiveWins === 3) {
            rigProbability = (g.bet <= 5) ? Math.max(rigProbability, 0.4) : Math.max(rigProbability, 0.7); 
        } else if (user.consecutiveWins >= 4) {
            rigProbability = 1.0; 
            console.log(`⛔ STOP WIN ATIVADO: ${user.username} tentou ${user.consecutiveWins + 1}ª vitória.`);
        }

        if (user.previousBet > 0 && g.bet >= (user.previousBet * 1.8)) rigProbability = Math.max(rigProbability, 0.4); 

        if (g.bet > 5 && attemptingStep >= 3) {
             const greedRisk = 0.10 + ((attemptingStep - 3) * 0.10);
             rigProbability = Math.max(rigProbability, Math.min(greedRisk, 0.9));
             if (rigProbability > 0) console.log(`🔥 HIGH BET RISK: ${user.username} (Tile #${attemptingStep}, Risk: ${rigProbability.toFixed(2)})`);
        }

        if (Math.random() < rigProbability) {
             if (!g.minesList.includes(tileId)) {
                 g.minesList.pop(); g.minesList.push(tileId); user.markModified('activeGame');
             }
        }

        if(g.minesList.includes(tileId)) { 
            g.minesGameOver=true; 
            g.type='NONE'; 
            handleLoss(user, g.bet); 
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

app.post('/api/mines/cashout', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        
        // Security: Prevent double cashout
        if (g.minesGameOver) return res.status(400).json({ message: 'Jogo já finalizado' });

        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        user.balance += profit;
        
        handleWin(user, g.bet);
        
        const mines = g.minesList; g.type='NONE'; await user.save();
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
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
    if (req.path.startsWith('/api')) return res.status(503).json({ message: 'Backend iniciado, Frontend compilando...' });
    res.status(503).send('<h1>Sistema em manutenção</h1><p>Verifique o build no Render.</p>');
  });
}

const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
};
startServer();
