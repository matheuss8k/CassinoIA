const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';

// --- CONFIGURAÇÃO DE CORS ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, true);
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
      console.warn('⚠️  AVISO: MONGODB_URI não definida. O banco de dados não será conectado.');
      return;
    }

    console.log(`🔄 [${ENV.toUpperCase()}] Conectando ao MongoDB...`);
    await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Conectado!`);
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
  }
};

// Define User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // Novo campo
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
    const { username, email, cpf, birthDate, password } = req.body;

    if (!username || !email || !password || !cpf || !birthDate) {
        return res.status(400).json({ message: 'Preencha todos os campos.' });
    }

    // Verifica se usuário ou email já existem
    const userExists = await User.findOne({ 
        $or: [
            { username: username }, 
            { email: email }
        ] 
    });

    if (userExists) {
      if (userExists.username === username) {
          return res.status(400).json({ message: 'Este nome de usuário já está em uso.' });
      }
      if (userExists.email === email) {
          return res.status(400).json({ message: 'Este email já está cadastrado.' });
      }
    }

    const user = await User.create({
      username, email, cpf, birthDate, password, balance: 1000
    });

    res.status(201).json({
      id: user._id,
      username: user.username,
      email: user.email,
      balance: user.balance
    });
  } catch (error) {
    console.error('Erro registro:', error);
    res.status(500).json({ message: 'Erro ao criar conta. Tente novamente.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Permite login por username OU email (opcional, aqui mantive username, mas ajustável)
    const user = await User.findOne({ username });

    if (user && user.password === password) {
      res.json({
        id: user._id,
        username: user.username,
        email: user.email,
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

// --- SERVIR FRONTEND ---
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'Endpoint API não encontrado' });
    }
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else if (ENV === 'production') {
  console.warn('⚠️  AVISO: Pasta "dist" não encontrada. O frontend não será servido.');
}

// Iniciar
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT} [${ENV}]`));
});