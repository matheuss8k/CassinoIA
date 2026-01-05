
const mongoose = require('mongoose');

// --- USER SCHEMA ---
const activeGameSchema = new mongoose.Schema({
    type: { type: String, default: 'NONE' },
    bet: { type: Number, default: 0 },
    sideBets: { perfectPairs: { type: Number, default: 0 }, dealerBust: { type: Number, default: 0 } },
    insuranceBet: { type: Number, default: 0 },
    bjDeck: { type: Array, default: [], select: false }, 
    bjPlayerHand: { type: Array, default: [] },
    bjDealerHand: { type: Array, default: [] },
    bjStatus: String,
    minesList: { type: Array, default: [], select: false },
    minesCount: { type: Number, default: 0 },
    minesRevealed: { type: Array, default: [] },
    minesMultiplier: { type: Number, default: 1.0 },
    minesGameOver: { type: Boolean, default: false },
    riskLevel: { type: String, default: 'NORMAL' },
    serverSeed: { type: String }, 
}, { _id: false });

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
  sessionProfit: { type: Number, default: 0 }, 
  sessionTotalBets: { type: Number, default: 0 }, 
  consecutiveWins: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  lastBetResult: { type: String, default: 'NONE' }, 
  previousBet: { type: Number, default: 0 }, 
  lastGamePlayed: { type: String, default: 'NONE' }, 
  avatarId: { type: String, default: '1' },
  isVerified: { type: Boolean, default: false },
  documentsStatus: { type: String, default: 'NONE' },
  vipLevel: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  missions: { type: Array, default: [] },
  unlockedTrophies: { type: [String], default: [] },
  ownedItems: { type: [String], default: [] }, 
  activeGame: { type: activeGameSchema, default: () => ({}) }
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
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }, // AUDIT LINK
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

// --- ACTION LOCK SCHEMA (Mutex) ---
// BANKING UPGRADE: Increased expiry to 30s to prevent lock-slip on slow DBs.
// The app manually releases this lock instantly, so this is just a Deadlock Failsafe.
const actionLockSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    createdAt: { type: Date, default: Date.now, expires: 30 } 
});

module.exports = {
    User: mongoose.model('User', userSchema),
    Transaction: mongoose.model('Transaction', transactionSchema),
    GameLog: mongoose.model('GameLog', gameLogSchema),
    ActionLock: mongoose.model('ActionLock', actionLockSchema)
};
