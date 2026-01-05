
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

// --- WALLET SERVICE ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null) => {
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
            if (balanceChangeCents < 0) {
                query.balance = { $gte: fromCents(Math.abs(balanceChangeCents)) };
            }

            const update = { $inc: { balance: fromCents(balanceChangeCents) } };

            if (type === 'DEPOSIT' || type === 'WITHDRAW') {
                update.$set = { sessionProfit: 0, sessionTotalBets: 0, consecutiveWins: 0, consecutiveLosses: 0, lastBetResult: 'NONE', previousBet: 0 };
                if (type === 'DEPOSIT') { update.$inc.totalDeposits = fromCents(amountCents); }
            } else {
                update.$inc.sessionProfit = fromCents(profitChangeCents);
                if (type === 'BET') update.$inc.sessionTotalBets = fromCents(amountCents);
                if (game !== 'WALLET') update.$set = { lastGamePlayed: game };
            }

            const u = await User.findOneAndUpdate(query, update, { new: true, ...opts });
            if (!u) throw new Error('Insufficient Funds or Concurrent Modification');
            
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
    saveGameLog
};
