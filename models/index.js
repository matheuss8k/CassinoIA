
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
    
    riskLevel: { type: String, default: 'NORMAL' },
    serverSeed: { type: String }, 
    updatedAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete após 24h de inatividade
});

// --- MISSION SCHEMA (Structured for Atomic Updates) ---
const missionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    type: { type: String, required: true },
    description: String,
    target: { type: Number, required: true },
    current: { type: Number, default: 0 },
    rewardPoints: { type: Number, required: true },
    completed: { type: Boolean, default: false },
    claimed: { type: Boolean, default: false }
}, { _id: false }); // _id false para facilitar comparações simples de array

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
  frameId: { type: String, default: 'frame_1' }, 
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  
  // Gamification
  loyaltyPoints: { type: Number, default: 0 },
  missions: { type: [missionSchema], default: [] }, // Tipagem Forte
  lastDailyReset: { type: String, default: '' }, 
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  favorites: { type: [String], default: [] }, 
  
  // Stats
  stats: {
      totalGames: { type: Number, default: 0 },
      totalWins: { type: Number, default: 0 },
      totalBlackjacks: { type: Number, default: 0 },
      highestWin: { type: Number, default: 0 },
      totalWagered: { type: Number, default: 0 },
      totalWonAmount: { type: Number, default: 0 }
  }
}, { timestamps: true });

// --- TRANSACTION SCHEMA (AUDIT LEDGER) ---
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'REFUND', 'MISSION_REWARD'], required: true },
    currency: { type: String, enum: ['BRL', 'POINTS'], default: 'BRL' }, // Campo Crítico para Auditoria de Pontos
    amount: { type: Number, required: true }, 
    balanceAfter: { type: Number, required: true },
    game: { type: String, default: 'WALLET' },
    referenceId: { type: String }, // Pode guardar o ID da Missão
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
