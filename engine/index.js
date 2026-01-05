
const mongoose = require('mongoose');
const { User, Transaction, GameLog } = require('../models');
const { toCents, fromCents, generateHash, logEvent } = require('../utils');
const { redisClient } = require('../config');

// --- USER CACHE (BANKING GRADE READS) ---
const UserCache = {
    getBalance: async (userId) => {
        // 1. Try Redis (Fast Path)
        if (redisClient && redisClient.status === 'ready') {
            const cached = await redisClient.get(`balance:${userId}`);
            if (cached !== null) return parseFloat(cached);
        }
        
        // 2. Fallback Mongo (Safe Path)
        const user = await User.findById(userId).select('balance').lean();
        if (user) {
            // Self-heal cache
            if (redisClient && redisClient.status === 'ready') {
                await redisClient.set(`balance:${userId}`, user.balance, 'EX', 3600); // 1h Cache
            }
            return user.balance;
        }
        return 0;
    },

    setBalance: async (userId, newBalance) => {
        if (redisClient && redisClient.status === 'ready') {
            await redisClient.set(`balance:${userId}`, newBalance, 'EX', 3600);
        }
    },
    
    updateSession: async (userId, data) => {
         if (redisClient && redisClient.status === 'ready') {
             // Cache specific session fields if needed
         }
    }
};

// --- GAME STATE MANAGER (REDIS + WRITE-BEHIND) ---
const GameStateManager = {
    // persistToMongo: FALSE for intermediate moves (Hit, Reveal), TRUE for Start/End
    save: async (userId, gameState, persistToMongo = false) => {
        if (redisClient && redisClient.status === 'ready') {
            // 1. Write to Redis (Fast, Blocking)
            await redisClient.set(`gamestate:${userId}`, JSON.stringify(gameState), 'EX', 3600); // 1h TTL
            
            // 2. Write to Mongo (Conditional)
            if (persistToMongo) {
                User.updateOne({ _id: userId }, { $set: { activeGame: gameState } })
                    .exec()
                    .catch(err => console.warn(`[Write-Behind] Failed for user ${userId}: ${err.message}`));
            }
        } else {
            // Fallback for Dev/Crash Mode (No Redis)
            await User.updateOne({ _id: userId }, { $set: { activeGame: gameState } }).exec();
        }
    },

    // Get state from Redis or Mongo
    get: async (userId) => {
        if (redisClient && redisClient.status === 'ready') {
            const data = await redisClient.get(`gamestate:${userId}`);
            return data ? JSON.parse(data) : null;
        }
        // Fallback for Dev Mode
        return null;
    },

    // Clear state from Redis
    clear: async (userId) => {
        if (redisClient && redisClient.status === 'ready') {
            await redisClient.del(`gamestate:${userId}`);
        }
        // Always ensure Mongo is cleared of active game to prevent stuck sessions
        await User.updateOne({ _id: userId }, { $set: { activeGame: { type: 'NONE' } } }).exec();
    }
};

// --- RISK ENGINE ---
const calculateRisk = (user, currentBet) => {
    const balance = user.balance;
    let risk = 'NORMAL';
    let triggers = [];

    const betRatio = currentBet / (user.balance + currentBet);
    if (betRatio >= 0.90) return { level: 'EXTREME', triggers: ['HIGH_EXPOSURE'] };

    const baseCapital = user.totalDeposits > 0 ? user.totalDeposits : 100;
    const currentProfit = user.sessionProfit;
    if (currentProfit > (baseCapital * 0.15)) {
        risk = 'EXTREME';
        triggers.push('PROFIT_CAP');
    }

    if (user.consecutiveWins >= 3) {
        risk = 'EXTREME';
        triggers.push('WIN_STREAK');
    }

    if (user.lastBetResult === 'LOSS' && currentBet >= (user.previousBet * 1.9)) {
        risk = risk === 'EXTREME' ? 'EXTREME' : 'HIGH';
        triggers.push('MARTINGALE_DETECTED');
    }

    if (triggers.length > 0) {
        logEvent('METRIC', `User: ${user.username} | Load: ${risk} | Flags: [${triggers.join(', ')}]`);
    }

    return { level: risk, triggers };
};

// --- WALLET SERVICE ---
// Updated to use UserCache for instant frontend updates
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null, initialGameState = null) => {
    const amountCents = toCents(Math.abs(amount));
    const balanceChangeCents = (type === 'BET' || type === 'WITHDRAW') ? -amountCents : amountCents;
    const profitChangeCents = (type === 'WIN') ? amountCents : (type === 'BET') ? -amountCents : 0;
    
    let session = null;
    let updatedUser = null;

    try {
        try { session = await mongoose.startSession(); } catch(e) {}

        const executeLogic = async (sess) => {
            const opts = sess ? { session: sess } : {};
            const query = { _id: userId };
            
            // Optimistic Locking for Balance (Banking Grade Safety)
            if (balanceChangeCents < 0) {
                query.balance = { $gte: fromCents(Math.abs(balanceChangeCents)) };
            }

            const update = { $inc: { balance: fromCents(balanceChangeCents) } };
            const sets = {};

            if (type === 'DEPOSIT' || type === 'WITHDRAW') {
                sets.sessionProfit = 0;
                sets.sessionTotalBets = 0;
                sets.consecutiveWins = 0;
                sets.consecutiveLosses = 0;
                sets.lastBetResult = 'NONE';
                sets.previousBet = 0;
                if (type === 'DEPOSIT') { update.$inc.totalDeposits = fromCents(amountCents); }
            } else {
                update.$inc.sessionProfit = fromCents(profitChangeCents);
                if (type === 'BET') update.$inc.sessionTotalBets = fromCents(amountCents);
                if (game !== 'WALLET') sets.lastGamePlayed = game;
            }

            // ATOMIC START: Save Game State WITH the money deduction in Mongo (Safety)
            if (initialGameState) {
                sets.activeGame = initialGameState;
            } else if (game !== 'WALLET' && (type === 'WIN' || type === 'REFUND')) {
                // Game Over Clean (Sync)
                sets['activeGame.type'] = 'NONE';
            }

            if (Object.keys(sets).length > 0) {
                update.$set = { ...update.$set, ...sets };
            }

            const u = await User.findOneAndUpdate(query, update, { new: true, ...opts });
            if (!u) throw new Error('Insufficient Funds or Concurrent Modification');
            
            // Generate Audit Hash
            const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(sess);
            const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
            
            const txData = { userId, type, amount: fromCents(amountCents), balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
            const integrityHash = generateHash({ ...txData, prevHash }); 
            
            await Transaction.create([ { ...txData, integrityHash } ], opts);
            return u;
        };

        if (session) {
            session.startTransaction();
            try { updatedUser = await executeLogic(session); await session.commitTransaction(); } 
            catch (err) { await session.abortTransaction(); throw err; } 
            finally { session.endSession(); }
        } else { updatedUser = await executeLogic(null); }

        // UPDATE CACHE INSTANTLY (Write-Through)
        if (updatedUser) {
            await UserCache.setBalance(userId, updatedUser.balance);
        }

        return updatedUser;
    } catch (e) {
        logEvent('ERROR', `Tx Fail: ${e.message} | User: ${userId}`);
        throw e;
    }
};

const saveGameLog = async (userId, game, bet, payout, resultSnapshot, riskLevel, engineAdjustment) => {
    try {
        await GameLog.create({ 
            userId, game, bet, payout, profit: payout - bet, resultSnapshot, riskLevel, engineAdjustment, timestamp: new Date() 
        });
    } catch(e) { console.error("DB Log Error:", e.message); }
};

module.exports = {
    calculateRisk,
    processTransaction,
    saveGameLog,
    GameStateManager,
    UserCache
};
