
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- RATE LIMIT (Relaxado para Mobile/CGNAT) ---
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
        if (!requests.has(ip)) requests.set(ip, { count: 1, expiry: now + windowMs });
        else {
            const data = requests.get(ip);
            if (now > data.expiry) requests.set(ip, { count: 1, expiry: now + windowMs });
            else {
                data.count++;
                if (data.count > 10000) return res.status(429).json({ message: 'Muitas requisições. Aguarde.' });
            }
        }
        next();
    };
};

app.set('trust proxy', 1);
app.use(createRateLimiter({ windowMs: 60000, max: 10000 }));

// --- CORS ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

// --- MONGODB ---
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) { console.warn('⚠️ MONGODB_URI não definida.'); return; }
    await mongoose.connect(mongoURI, { dbName: 'casino_ai_db' });
    console.log(`✅ MongoDB Conectado`);
  } catch (error) { console.error(`❌ Erro MongoDB: ${error.message}`); }
};

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
  balance: { type: Number, default: 1000 },
  consecutiveWins: { type: Number, default: 0 },
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
    const user = await User.findOne({ $or: [{ username: { $regex: new RegExp(`^${username}$`, 'i') } }, { email: { $regex: new RegExp(`^${username}$`, 'i') } }] });
    if (user && user.password === password) {
        user.balance = Math.floor(Number(user.balance) || 1000);
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
    } else { res.status(401).json({ message: 'Usuário ou senha incorretos.' }); }
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro interno.' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    const existing = await User.findOne({ $or: [{ username }, { email }, { cpf }] });
    if (existing) return res.status(400).json({ message: 'Usuário, Email ou CPF já cadastrados.' });
    const user = await User.create({ fullName, username, email, cpf, birthDate, password, balance: 1000, missions: generateDailyMissions(), lastDailyReset: new Date().toISOString().split('T')[0] });
    res.status(201).json(sanitizeUser(user));
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao criar conta.' }); }
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

// --- JOGOS (Blackjack e Mines) ---
// (Resumido para focar na estrutura, lógica mantida via Models e serviços anteriores)
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
        if(calc(p)===21){ st='GAME_OVER'; if(calc(dl)===21){rs='PUSH';user.balance+=amount}else{rs='BLACKJACK';user.balance+=amount*2.5} }
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
        if(calc(g.bjPlayerHand)>21){ st='GAME_OVER'; rs='BUST'; g.type='NONE'; }
        else { user.markModified('activeGame'); } // Continua jogando
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
        if(ds>21 || ps>ds) { rs='WIN'; user.balance += g.bet*2; }
        else if(ps===ds) { rs='PUSH'; user.balance += g.bet; }
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
        if(g.minesList.includes(tileId)) { g.minesGameOver=true; g.type='NONE'; await user.save(); return res.json({outcome:'BOMB',mines:g.minesList,status:'GAME_OVER',newBalance:user.balance}); }
        if(!g.minesRevealed.includes(tileId)) { g.minesRevealed.push(tileId); g.minesMultiplier *= 1.15; }
        const totalSafe = 25 - g.minesCount;
        if(g.minesRevealed.length >= totalSafe) { // Win All
             const profit = Math.floor(g.bet * g.minesMultiplier);
             user.balance += profit;
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
        const mines = g.minesList; g.type='NONE'; await user.save();
        res.json({success:true, profit, newBalance:user.balance, mines});
    } catch(e) { res.status(500).json({message:e.message}); }
});

// --- SERVIDOR DE ARQUIVOS ESTÁTICOS (PRODUÇÃO) ---
const distPath = path.resolve(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  console.log(`📂 Servindo arquivos de: ${distPath}`);
  app.use(express.static(distPath));
  // SPA Fallback
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'API Route Not Found' });
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  // --- TELA DE MANUTENÇÃO / BUILD REQUIRED ---
  // Se a pasta 'dist' não existe, mostramos uma página bonita instruindo o admin.
  // Isso evita o erro de "Pasta não encontrada" no console e mantém o servidor de pé.
  console.warn(`⚠️ Pasta 'dist' não encontrada. Servindo página de manutenção.`);
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(503).json({ message: 'Server Building...' });
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cassino IA - Instalação Necessária</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      </head>
      <body class="bg-[#020617] text-white h-screen flex flex-col items-center justify-center font-['Outfit'] overflow-hidden relative">
        <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div class="absolute w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] -top-20 -left-20 animate-pulse"></div>
        <div class="absolute w-96 h-96 bg-yellow-600/20 rounded-full blur-[100px] -bottom-20 -right-20 animate-pulse"></div>

        <div class="relative z-10 text-center p-8 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl max-w-lg mx-4">
          <div class="w-20 h-20 bg-yellow-500/10 rounded-2xl border border-yellow-500/30 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <h1 class="text-4xl font-black mb-2 tracking-tight">FRONTEND <span class="text-yellow-500">AUSENTE</span></h1>
          <p class="text-slate-400 mb-6 leading-relaxed">O servidor backend está rodando perfeitamente, mas os arquivos do site ainda não foram gerados.</p>
          
          <div class="bg-black/50 rounded-xl p-4 text-left mb-6 border border-white/5">
            <p class="text-xs text-slate-500 uppercase font-bold mb-2 tracking-wider">Execute no terminal:</p>
            <code class="text-green-400 font-mono text-sm block">$ npm run build</code>
            <p class="text-xs text-slate-600 mt-2">Após isso, reinicie o servidor com <span class="font-mono text-slate-400">npm start</span>.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });
}

const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor na porta ${PORT}`));
};
startServer();
