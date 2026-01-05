
const mongoose = require('mongoose');
const { User, Transaction, GameLog } = require('../models');
const { toCents, fromCents, generateHash, logEvent } = require('../utils');

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

// --- CORE TRANSACTION ENGINE (BANKING GRADE) ---
// Handles Money + State atomically within a Transaction
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null, initialGameState = null) => {
    const amountCents = toCents(Math.abs(amount));
    const balanceChangeCents = (type === 'BET' || type === 'WITHDRAW') ? -amountCents : amountCents;
    const profitChangeCents = (type === 'WIN') ? amountCents : (type === 'BET') ? -amountCents : 0;
    
    let session = null;
    let result = null;

    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const opts = { session };
        const query = { _id: userId };
        
        // Optimistic Locking for Balance
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

        // State Integrity
        if (initialGameState) {
            sets.activeGame = initialGameState;
        } else if (game !== 'WALLET' && (type === 'WIN' || type === 'REFUND')) {
            sets['activeGame.type'] = 'NONE';
        }

        if (Object.keys(sets).length > 0) {
            update.$set = { ...update.$set, ...sets };
        }

        const u = await User.findOneAndUpdate(query, update, { new: true, ...opts });
        
        if (!u) {
            // Check if it was balance or user not found
            const exists = await User.exists({ _id: userId }).session(session);
            if (!exists) throw new Error('USER_NOT_FOUND');
            throw new Error('INSUFFICIENT_FUNDS');
        }
        
        // Audit Hash
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session);
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = { userId, type, amount: fromCents(amountCents), balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
        const integrityHash = generateHash({ ...txData, prevHash }); 
        
        const [tx] = await Transaction.create([ { ...txData, integrityHash } ], opts);

        await session.commitTransaction();
        
        // Attach Transaction ID to return for linking
        result = { user: u, transactionId: tx._id };

    } catch (err) {
        if (session) await session.abortTransaction();
        
        const isFundError = err.message === 'INSUFFICIENT_FUNDS';
        if (!isFundError) {
            logEvent('ERROR', `Tx Fail: ${err.message} | User: ${userId}`);
        }
        
        // Normalize error for controller
        throw new Error(isFundError ? 'Saldo insuficiente.' : 'Erro no processamento da transação.');
    } finally {
        if (session) session.endSession();
    }

    // Return User + TxID (Backwards compatible return, user is accessible via result.user)
    result.user.lastTransactionId = result.transactionId; 
    return result.user;
};

// Updated to link GameLog with Transaction
const saveGameLog = async (userId, game, bet, payout, resultSnapshot, riskLevel, engineAdjustment, transactionId = null) => {
    try {
        await GameLog.create({ 
            userId, 
            transactionId, 
            game, 
            bet, 
            payout, 
            profit: payout - bet, 
            resultSnapshot, 
            riskLevel, 
            engineAdjustment, 
            timestamp: new Date() 
        });
    } catch(e) { console.error("DB Log Error:", e.message); }
};

const GameStateHelper = {
    save: async (userId, gameState) => {
        await User.updateOne({ _id: userId }, { $set: { activeGame: gameState } });
    },
    clear: async (userId) => {
        await User.updateOne({ _id: userId }, { $set: { activeGame: { type: 'NONE' } } });
    }
};

module.exports = {
    calculateRisk,
    processTransaction,
    saveGameLog,
    GameStateHelper
};
