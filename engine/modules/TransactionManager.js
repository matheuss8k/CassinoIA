
const mongoose = require('mongoose');
const { User, Transaction, GameLog, GameSession } = require('../../models');
const { toCents, fromCents, generateHash, logEvent } = require('../../utils');

// --- STATS BATCHER (Hardened) ---
class StatsBatcher {
    constructor() {
        this.buffer = new Map(); // userId -> { incs: {} }
        this.FLUSH_INTERVAL = 5000;
        this.isFlushing = false;
        
        // Loop de limpeza
        this.interval = setInterval(() => this.flush(), this.FLUSH_INTERVAL);

        // Graceful Shutdown Hooks
        const cleanup = async () => {
            console.log("💾 [StatsBatcher] Saving pending stats before shutdown...");
            await this.flush();
            process.exit(0);
        };
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
    }

    add(userId, increments) {
        const uid = userId.toString();
        if (!this.buffer.has(uid)) {
            this.buffer.set(uid, { incs: {} });
        }
        const entry = this.buffer.get(uid);
        for (const [key, val] of Object.entries(increments)) {
            entry.incs[key] = (entry.incs[key] || 0) + val;
        }
    }

    async flush() {
        if (this.buffer.size === 0 || this.isFlushing) return;
        this.isFlushing = true;

        const currentBatch = new Map(this.buffer);
        this.buffer.clear();

        const ops = [];
        for (const [userId, data] of currentBatch.entries()) {
            if (Object.keys(data.incs).length > 0) {
                ops.push({
                    updateOne: {
                        filter: { _id: userId },
                        update: { $inc: data.incs }
                    }
                });
            }
        }

        if (ops.length > 0) {
            try {
                await User.bulkWrite(ops, { ordered: false });
            } catch (e) {
                console.error("[StatsBatcher] Write Error:", e);
                // Em caso de erro crítico, poderíamos tentar recolocar no buffer, 
                // mas para analytics, aceitamos a perda leve para não travar o loop.
            }
        }
        this.isFlushing = false;
    }
}

const statsBatcher = new StatsBatcher();

// --- CORE TRANSACTION ENGINE (Updated for GameSession) ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null, initialGameState = null) => {
    const amountCents = toCents(Math.abs(amount));
    const balanceChangeCents = (type === 'BET' || type === 'WITHDRAW') ? -amountCents : amountCents;
    const profitChangeCents = (type === 'WIN') ? amountCents : (type === 'BET') ? -amountCents : 0;
    
    let session = null;
    let result = null;

    try {
        session = await mongoose.startSession();
        session.startTransaction();

        // 1. Update User Balance & Local Stats
        const opts = { session, new: true, lean: true };
        const query = { _id: userId };
        
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

        if (Object.keys(sets).length > 0) {
            update.$set = { ...update.$set, ...sets };
        }

        const u = await User.findOneAndUpdate(query, update, opts);
        
        if (!u) {
            const exists = await User.exists({ _id: userId }).session(session);
            if (!exists) throw new Error('USER_NOT_FOUND');
            throw new Error('INSUFFICIENT_FUNDS');
        }

        // 2. Handle Game Session (ACID with Balance)
        if (initialGameState) {
            // New Game: Upsert GameSession
            await GameSession.findOneAndUpdate(
                { userId }, 
                { ...initialGameState, userId, updatedAt: new Date() }, 
                { upsert: true, session }
            );
        } else if (game !== 'WALLET' && (type === 'WIN' || type === 'REFUND')) {
            // End Game: Delete GameSession
            await GameSession.deleteOne({ userId }).session(session);
        }
        
        // 3. Create Transaction Record
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session).lean();
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = { userId, type, amount: fromCents(amountCents), balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
        const integrityHash = generateHash({ ...txData, prevHash }); 
        
        const [tx] = await Transaction.create([ { ...txData, integrityHash } ], { session });

        await session.commitTransaction();
        
        // Prepare return object
        u.id = u._id;
        u.lastTransactionId = tx._id;
        
        // Inject game state into returned user object for backward compatibility with Engines
        if (initialGameState) {
            u.activeGame = initialGameState;
        } else {
            u.activeGame = { type: 'NONE' };
        }
        
        result = u;

    } catch (err) {
        if (session) await session.abortTransaction();
        const isFundError = err.message === 'INSUFFICIENT_FUNDS';
        if (!isFundError) {
            logEvent('ERROR', `Tx Fail: ${err.message} | User: ${userId}`);
        }
        throw new Error(isFundError ? 'Saldo insuficiente.' : 'Erro no processamento da transação.');
    } finally {
        if (session) session.endSession();
    }

    return result;
};

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
    // Saves intermediate state (e.g., Blackjack Hit, Mines Reveal)
    // NOTE: This does NOT affect balance, so we can do it outside the main transaction if we want speed,
    // but doing it safely ensures consistency.
    save: async (userId, gameState) => {
        const session = await GameSession.findOneAndUpdate(
            { userId }, 
            { ...gameState, updatedAt: new Date() },
            { new: true, upsert: true, lean: true } 
        );
        
        // We return the user balance separately to keep frontend interface consistent
        const user = await User.findById(userId).select('balance').lean();
        return { ...user, activeGame: session };
    },
    
    // Explicit clear (e.g. forfeit)
    clear: async (userId) => {
        await GameSession.deleteOne({ userId });
    }
};

module.exports = {
    processTransaction,
    saveGameLog,
    GameStateHelper,
    statsBatcher
};
