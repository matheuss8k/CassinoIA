
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

// --- RATE LIMIT (Relaxado) ---
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
        next();
    };
};

app.set('trust proxy', 1);
app.use(createRateLimiter({ windowMs: 60000, max: 10000 }));

// --- CORS ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

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
    // A opção authSource: 'admin' é crucial para usuários do Atlas
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
    
    // Diagnóstico específico para erro de senha
    if (error.code === 8000 || error.name === 'MongoServerError') {
        console.error(`⚠️ ALERTA DE AUTENTICAÇÃO: Verifique a senha nas variáveis de ambiente.`);
    }

    console.error(`🔄 Tentando novamente em 5 segundos...`);
    isConnecting = false;
    setTimeout(connectDB, 5000); 
  }
};

// Listeners de erro de conexão após estar conectado
mongoose.connection.on('error', err => {
    console.error('❌ Erro de conexão MongoDB (Runtime):', err);
});

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
  previousBet: { type: Number, default: 0 }, // Para rastrear Martingale
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

// --- ROTAS API ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
        connectDB(); 
        return res.status(503).json({ message: 'Sistema inicializando. Tente novamente em 5 segundos.' });
    }

    const safeUser = escapeRegex(username);
    const user = await User.findOne({ 
        $or: [
            { username: { $regex: new RegExp(`^${safeUser}$`, 'i') } }, 
            { email: { $regex: new RegExp(`^${safeUser}$`, 'i') } }
        ] 
    });

    if (user && user.password === password) {
        // Data Integrity Check
        user.balance = Math.floor(Number(user.balance) || 0); 
        user.loyaltyPoints = Math.floor(Number(user.loyaltyPoints) || 0);
        if (!user.missions) user.missions = [];
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
      res.status(500).json({ message: 'Erro interno de servidor.' }); 
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
        connectDB();
        return res.status(503).json({ message: 'Sistema inicializando. Tente novamente.' });
    }

    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário, Email ou CPF já cadastrados.' });
    
    const user = await User.create({ 
        fullName, 
        username, 
        email, 
        cpf, 
        birthDate, 
        password, 
        balance: 0, 
        missions: generateDailyMissions(), 
        lastDailyReset: new Date().toISOString().split('T')[0] 
    });
    res.status(201).json(sanitizeUser(user));
  } catch (error) { 
      console.error("REGISTER ERROR:", error);
      res.status(500).json({ message: 'Erro ao criar conta.' }); 
  }
});

// As rotas de jogos usam os models definidos acima
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
        const user = await User.findById(userId);
        if(!user) return res.status(404).json({message:'User'});
        if(user.balance < amount) return res.status(400).json({message:'Saldo'});
        user.balance -= amount;
        
        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let d=[]; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; d.push({rank:r,suit:s,value:v,id:Math.random().toString(36),isHidden:false}); }
        d.sort(()=>Math.random()-0.5);
        const p=[d.pop(),d.pop()], dl=[d.pop(),d.pop()];
        let st='PLAYING', rs='NONE';
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        if(calc(p)===21){ 
            st='GAME_OVER'; 
            if(calc(dl)===21){
                rs='PUSH';user.balance+=amount;
                // Empate não zera streak
            } else {
                rs='BLACKJACK';user.balance+=amount*2.5;
                user.consecutiveWins++;
            } 
            user.previousBet = amount;
        } else {
            // Jogo continua
        }

        user.activeGame = st==='PLAYING' ? {type:'BLACKJACK',bet:amount,bjDeck:d,bjPlayerHand:p,bjDealerHand:dl,bjStatus:st} : {type:'NONE'};
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
            st='GAME_OVER'; rs='BUST'; g.type='NONE'; 
            user.consecutiveWins = 0; // Perdeu streak
            user.previousBet = g.bet;
        } else { 
            user.markModified('activeGame'); 
        } 
        
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
        
        if(ds>21 || ps>ds) { 
            rs='WIN'; user.balance += g.bet*2; 
            user.consecutiveWins++;
        }
        else if(ps===ds) { 
            rs='PUSH'; user.balance += g.bet; 
            // Empate mantem
        } else {
            user.consecutiveWins = 0;
        }
        
        user.previousBet = g.bet;
        g.type='NONE';
        await user.save();
        res.json({dealerHand:g.bjDealerHand, status:'GAME_OVER', result:rs, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/start', async (req, res) => {
    try {
        const { userId, amount, minesCount } = req.body;
        const user = await User.findById(userId);
        if(!user) return res.status(404).json({message:'User'}); if(user.balance < amount) return res.status(400).json({message:'Saldo'});
        user.balance -= amount;
        
        // Gera minas, mas pode ser "rigado" durante o reveal
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(Math.floor(Math.random()*25));
        
        user.activeGame = { type:'MINES', bet:amount, minesCount, minesList:Array.from(minesSet), minesRevealed:[], minesMultiplier:1.0, minesGameOver:false };
        await user.save();
        res.json({success:true, newBalance:user.balance, loyaltyPoints:user.loyaltyPoints});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/reveal', async (req, res) => {
    try {
        const { userId, tileId } = req.body;
        const user = await User.findById(userId);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;

        // --- COOLING SYSTEM / ANTI-MARTINGALE (DISCRETO) ---
        
        const isStreak = user.consecutiveWins >= 3;
        const isMartingale = user.previousBet > 0 && g.bet >= (user.previousBet * 1.8);
        
        let shouldRig = false;

        if (isStreak) {
             // Streak de 3 vitórias = Cooling Ativo (100% de chance de perder para resfriar a conta)
             shouldRig = true;
        } else if (isMartingale) {
             // Anti-Martingale Discreto:
             // Se dobrou a aposta, tem 40% de chance de "dar azar".
             // Isso permite que o jogador ganhe algumas vezes no martingale, 
             // fazendo a derrota parecer natural e não manipulada.
             shouldRig = Math.random() < 0.4;
        }
        
        // Rig condition: Só ativa se tiver motivo (Streak/Martingale) e aposta > 5
        if (shouldRig && g.bet >= 5) {
             // Se o tile clicado NÃO é uma bomba, transformamos em bomba
             if (!g.minesList.includes(tileId)) {
                 console.log(`⚠️ RIG ACTIVATED for ${user.username} (Streak: ${isStreak}, Martingale: ${isMartingale})`);
                 g.minesList.pop(); 
                 g.minesList.push(tileId);
                 user.markModified('activeGame');
             }
        }

        if(g.minesList.includes(tileId)) { 
            g.minesGameOver=true; 
            g.type='NONE'; 
            user.consecutiveWins = 0; // Reseta streak na derrota
            user.previousBet = g.bet;
            await user.save(); 
            return res.json({outcome:'BOMB',mines:g.minesList,status:'GAME_OVER',newBalance:user.balance}); 
        }
        
        if(!g.minesRevealed.includes(tileId)) { g.minesRevealed.push(tileId); g.minesMultiplier *= 1.15; }
        const totalSafe = 25 - g.minesCount;
        
        if(g.minesRevealed.length >= totalSafe) { // Win All
             const profit = Math.floor(g.bet * g.minesMultiplier);
             user.balance += profit;
             user.consecutiveWins++; // Venceu
             user.previousBet = g.bet;
             g.type = 'NONE';
             await user.save();
             return res.json({outcome:'GEM', status:'WIN_ALL', profit, multiplier:g.minesMultiplier, newBalance:user.balance, mines: g.minesList});
        }
        
        user.markModified('activeGame'); await user.save();
        res.json({outcome:'GEM', status:'PLAYING', profit:Math.floor(g.bet*g.minesMultiplier), multiplier:g.minesMultiplier, newBalance:user.balance});
    } catch(e) { res.status(500).json({message:e.message}); }
});

app.post('/api/mines/cashout', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if(!user||user.activeGame.type!=='MINES') return res.status(400).json({message:'Jogo inválido'});
        const g = user.activeGame;
        const profit = Math.floor(g.bet * g.minesMultiplier);
        user.balance += profit;
        
        user.consecutiveWins++; // Cashout conta como vitória para streak
        user.previousBet = g.bet;
        
        const mines = g.minesList; g.type='NONE'; await user.save();
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- SERVIDOR DE ARQUIVOS ESTÁTICOS ---
const distPath = path.resolve(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'API Route Not Found' });
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  // Tela de fallback caso build falhe
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
