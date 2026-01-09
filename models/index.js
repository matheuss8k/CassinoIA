
const mongoose = require('mongoose');

// --- GAME SESSION SCHEMA (Separated from User) ---
// Armazena apenas o estado temporário do jogo ativo.
const gameSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    type: { type: String, default: 'NONE' },
    bet: { type: Number, default: 0 },
    sideBets: { perfectPairs: { type: Number, default: 0 }, dealerBust: { type: Number, default: 0 } },
    insuranceBet: { type: Number, default: 0 },
    
    // Blackjack Specifics
    bjDeck: { type: Array, default: [], select: false }, 
    bjPlayerHand: { type: Array, default: [] },
    bjDealerHand: { type: Array, default: [] },
    bjStatus: String,
    
    // Mines Specifics
    minesList: { type: Array, default: [], select: false },
    minesCount: { type: Number, default: 0 },
    minesRevealed: { type: Array, default: [] },
    minesMultiplier: { type: Number, default: 1.0 },
    minesGameOver: { type: Boolean, default: false },
    
    // Tiger Specifics (Simpler state)
    // ...Tiger geralmente resolve num único request, mas mantemos estrutura para consistência
    
    riskLevel: { type: String, default: 'NORMAL' },
    serverSeed: { type: String }, 
    updatedAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete após 24h de inatividade (Cleanup de sessões órfãs)
});

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true },
  cpf: { type: String, required: true, unique: true },
  birthDate: { type: String, required: true },
  password: { type: String, required: true, select: false },
  refreshToken: { type: String, select: false },
  tokenVersion: { type: Number, default: 0, select: true },
  balance: { type: Number, default: 0, min: 0 },
  totalDeposits: { type: Number, default: 0 },
  
  // Session Stats
  sessionProfit: { type: Number, default: 0 }, 
  sessionTotalBets: { type: Number, default: 0 }, 
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  lastBetResult: { type: String, default: 'NONE' }, 
  previousBet: { type: Number, default: 0 }, 
  lastGamePlayed: { type: String, default: 'NONE' }, 
  
  // Profile
  avatarId: { type: String, default: '1' },
  frameId: { type: String, default: 'frame_1' }, // Default basic frame
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  
  // Gamification
  loyaltyPoints: { type: Number, default: 0 },
  missions: { type: Array, default: [] },
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  favorites: { type: [String], default: [] }, // NEW: Favorites Persistence
  
  // Stats
  stats: {
      totalGames: { type: Number, default: 0 },
      totalWins: { type: Number, default: 0 },
      totalBlackjacks: { type: Number, default: 0 },
      highestWin: { type: Number, default: 0 },
      totalWagered: { type: Number, default: 0 },
      totalWonAmount: { type: Number, default: 0 } // New: Required for Test Account ROI
  }
  // activeGame removido daqui para reduzir payload
}, { timestamps: true });

// --- TRANSACTION SCHEMA ---
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'REFUND'], required: true },
    amount: { type: Number, required: true }, 
    balanceAfter: { type: Number, required: true },
    game: { type: String, default: 'WALLET' },
    referenceId: { type: String }, 
    integrityHash: { type: String }, 
}, { timestamps: true });
transactionSchema.index({ userId: 1, createdAt: -1 });

// --- GAME LOG SCHEMA ---
const gameLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }, 
    game: { type: String, required: true },
    bet: { type: Number, required: true },
    payout: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    serverSeed: { type: String }, 
    clientSeed: { type: String },
    resultSnapshot: { type: mongoose.Schema.Types.Mixed }, 
    riskLevel: { type: String },
    engineAdjustment: { type: String }
}, { timestamps: true });

// TTL: Logs são deletados automaticamente após 90 dias
gameLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// --- ACTION LOCK SCHEMA (Mutex) ---
const actionLockSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    createdAt: { type: Date, default: Date.now, expires: 30 } 
});

module.exports = {
    User: mongoose.model('User', userSchema),
    GameSession: mongoose.model('GameSession', gameSessionSchema),
    Transaction: mongoose.model('Transaction', transactionSchema),
    GameLog: mongoose.model('GameLog', gameLogSchema),
    ActionLock: mongoose.model('ActionLock', actionLockSchema)
};
