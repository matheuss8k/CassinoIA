const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';

// --- CONFIGURAÇÃO DE CORS ---
// Lista de origens permitidas para acessar sua API
const allowedOrigins = [
  'http://localhost:5173',       // Vite Local
  'http://localhost:3000',       // Teste de build local
  'https://seucassino.com.br',   // SEU DOMÍNIO DE PRODUÇÃO (Configure no Render)
  'https://www.seucassino.com.br',
  // O Render adiciona o domínio onrender.com automaticamente, 
  // mas é bom garantir que seu frontend consiga falar com o backend se estiverem separados.
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite conexões sem origem (como Postman ou Apps Mobile)
    // Permite conexões de Desenvolvimento (localhost)
    // Permite conexões da lista allowedOrigins
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`Bloqueio CORS para origem: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// --- BANCO DE DADOS ---
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.error('\n❌ ERRO: MONGODB_URI não definida no .env!');
      return;
    }

    console.log(`🔄 [${ENV.toUpperCase()}] Conectando ao MongoDB...`);
    await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Conectado!`);
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// Define User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  cpf: { type: String, required: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 1000 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- ROTAS DA API ---

// Registro
app.post('/api/register', async (req, res) => {
  try {
    const { username, cpf, birthDate, password } = req.body;

    if (!username || !password || !cpf) {
        return res.status(400).json({ message: 'Preencha todos os campos.' });
    }

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Usuário já existe.' });
    }

    const user = await User.create({
      username, cpf, birthDate, password, balance: 1000
    });

    res.status(201).json({
      id: user._id,
      username: user.username,
      balance: user.balance
    });
  } catch (error) {
    console.error('Erro registro:', error);
    res.status(500).json({ message: 'Erro ao criar conta.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && user.password === password) {
      res.json({
        id: user._id,
        username: user.username,
        cpf: user.cpf,
        balance: user.balance
      });
    } else {
      res.status(401).json({ message: 'Credenciais inválidas.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor.' });
  }
});

// Atualizar Saldo (Carteira)
app.post('/api/balance', async (req, res) => {
  try {
    const { userId, newBalance } = req.body;
    const user = await User.findByIdAndUpdate(userId, { balance: newBalance }, { new: true });
    if (user) res.json({ balance: user.balance });
    else res.status(404).json({ message: 'Usuário não encontrado' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Aposta (Deduzir)
app.post('/api/game/bet', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const user = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (user) res.json({ success: true, newBalance: user.balance });
    else res.status(400).json({ success: false, message: 'Saldo insuficiente' });
  } catch (error) {
    res.status(500).json({ message: 'Erro na aposta' });
  }
});

// Pagamento (Adicionar)
app.post('/api/game/payout', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amount } },
      { new: true }
    );
    if (user) res.json({ success: true, newBalance: user.balance });
    else res.status(404).json({ message: 'Usuário não encontrado' });
  } catch (error) {
    res.status(500).json({ message: 'Erro no pagamento' });
  }
});

// --- SERVIR FRONTEND EM PRODUÇÃO ---
// Se estiver rodando no Render (NODE_ENV=production), o Node serve o site React
if (ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Qualquer rota que não seja /api devolve o index.html (SPA)
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

// Iniciar
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT} [${ENV}]`));
});