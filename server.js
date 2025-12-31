const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DE EMERGÊNCIA ---
// Se você não consegue abrir o arquivo .env, cole sua URL de conexão dentro das aspas abaixo:
const FALLBACK_MONGO_URI = ''; 

// MongoDB Connection
const connectDB = async () => {
  try {
    // Tenta pegar do .env, se falhar ou estiver vazio, usa o FALLBACK hardcoded acima
    const mongoURI = process.env.MONGODB_URI || FALLBACK_MONGO_URI;
    
    // Verificação de segurança para ajudar o iniciante
    if (!mongoURI || mongoURI.includes('SUA_SENHA_AQUI') || (mongoURI === '' && !process.env.MONGODB_URI)) {
      console.error('\n❌ ERRO CRÍTICO: O Banco de Dados não está configurado!');
      console.log('---------------------------------------------------------');
      console.log('Opção 1 (Padrão): Abra o arquivo ".env" e cole sua URL de conexão.');
      console.log('Opção 2 (Alternativa): Abra este arquivo "server.js" e cole sua URL na variável FALLBACK_MONGO_URI na linha 17.');
      console.log('---------------------------------------------------------\n');
      return;
    }

    console.log('🔄 Tentando conectar ao MongoDB...');
    const conn = await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Conectado com Sucesso: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Erro na conexão com o MongoDB: ${error.message}`);
    console.log('Dica: Verifique se sua senha está correta e se seu IP está liberado no MongoDB Atlas.');
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

// API Routes

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, cpf, birthDate, password } = req.body;

    if (!username || !password || !cpf) {
        return res.status(400).json({ message: 'Preencha todos os campos.' });
    }

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Este nome de usuário já está em uso.' });
    }

    const user = await User.create({
      username,
      cpf,
      birthDate,
      password,
      balance: 1000 // Saldo inicial
    });

    if (user) {
      console.log(`👤 Novo usuário registrado: ${user.username}`);
      res.status(201).json({
        id: user._id,
        username: user.username,
        cpf: user.cpf,
        birthDate: user.birthDate,
        balance: user.balance
      });
    } else {
      res.status(400).json({ message: 'Dados inválidos' });
    }
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro ao criar conta. Tente novamente.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && user.password === password) {
      console.log(`🔓 Login realizado: ${user.username}`);
      res.json({
        id: user._id,
        username: user.username,
        cpf: user.cpf,
        birthDate: user.birthDate,
        balance: user.balance
      });
    } else {
      res.status(401).json({ message: 'Usuário ou senha incorretos.' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro ao conectar com o servidor.' });
  }
});

// Update Balance (Generic - Wallet)
app.post('/api/balance', async (req, res) => {
  try {
    const { userId, newBalance } = req.body;
    const user = await User.findById(userId);

    if (user) {
      user.balance = newBalance;
      await user.save();
      console.log(`💰 Carteira atualizada para ${user.username}: R$ ${newBalance}`);
      res.json({ balance: user.balance });
    } else {
      res.status(404).json({ message: 'Usuário não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao atualizar saldo:', error);
    res.status(500).json({ message: error.message });
  }
});

// GAME TRANSACTION: PLACE BET (Deduct)
// Critical for Anti-F5: Deducts immediately on server
app.post('/api/game/bet', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    // Atomic update to prevent race conditions
    // Only updates if balance is sufficient ($gte)
    const user = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (user) {
      console.log(`🎲 Aposta iniciada ${user.username}: -R$ ${amount}`);
      res.json({ success: true, newBalance: user.balance });
    } else {
      res.status(400).json({ success: false, message: 'Saldo insuficiente ou usuário inválido' });
    }
  } catch (error) {
    console.error('Erro na aposta:', error);
    res.status(500).json({ message: 'Erro ao processar aposta' });
  }
});

// GAME TRANSACTION: PAYOUT (Add)
app.post('/api/game/payout', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amount } },
      { new: true }
    );

    if (user) {
      console.log(`🏆 Pagamento realizado ${user.username}: +R$ ${amount}`);
      res.json({ success: true, newBalance: user.balance });
    } else {
      res.status(404).json({ message: 'Usuário não encontrado' });
    }
  } catch (error) {
    console.error('Erro no pagamento:', error);
    res.status(500).json({ message: 'Erro ao processar pagamento' });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV !== 'development') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

// Start Server
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
});