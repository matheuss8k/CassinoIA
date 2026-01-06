
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

// --- ACHIEVEMENT SYSTEM (NEW & SECURE) ---
const AchievementSystem = {
    check: async (userId, gameContext) => {
        // gameContext: { game: 'BLACKJACK'|'MINES'|'TIGER', bet: number, payout: number, extra: object }
        try {
            const user = await User.findById(userId);
            if (!user) return;

            const unlockedNow = [];
            const currentTrophies = user.unlockedTrophies || [];
            
            // Helper to add unique
            const unlock = (id) => {
                if (!currentTrophies.includes(id)) unlockedNow.push(id);
            };

            // Calculate Profit & Multiplier
            const profit = gameContext.payout - gameContext.bet;
            const isWin = profit > 0;
            const multiplier = gameContext.bet > 0 ? (gameContext.payout / gameContext.bet) : 0;

            // --- 1. First Win ---
            if (isWin) unlock('first_win');

            // --- 2. High Roller (Bet >= 500) ---
            if (gameContext.bet >= 500) unlock('high_roller');

            // --- 3. Sniper (Mines Specific) ---
            if (gameContext.game === 'MINES' && gameContext.extra?.revealedCount >= 20) {
                unlock('sniper');
            }

            // --- 4. Club 50 (50 Games Played) ---
            if ((user.stats?.totalGames || 0) + 1 >= 50) unlock('club_50');
            
            // --- 5. Loyal Player (30 Games) ---
            if ((user.stats?.totalGames || 0) + 1 >= 30) unlock('loyal_player');

            // --- 6. Blackjack Master (10 Naturals) ---
            if (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) {
                if ((user.stats?.totalBlackjacks || 0) + 1 >= 10) unlock('bj_master');
            }

            // --- 7. Rich Club (Balance >= 5000) ---
            if (user.balance + profit >= 5000) unlock('rich_club');

            // --- NEW TROPHIES LOGIC ---

            // 8. O Imbatível (10 Consecutive Wins)
            // Note: user.consecutiveWins is updated in the controller *before* this check usually.
            if (user.consecutiveWins >= 10) unlock('unbeatable');

            // 9. Rei do Multiplicador (50x Multiplier)
            if (multiplier >= 50) unlock('multiplier_king');

            // 10. Heavy Hitter (Payout >= 200 in single game)
            if (gameContext.payout >= 200) unlock('heavy_hitter');

            // 11. A Fênix (Win after 3+ losses)
            // Context needs to pass 'wasLossStreak' or we check local state if accessible.
            // Since we rely on DB state, we check if PREVIOUS consecutiveLosses was >= 3.
            // However, controller resets losses on win. We rely on the `extra` param passed from controller.
            if (gameContext.extra?.lossStreakBroken && gameContext.extra?.previousLosses >= 3) {
                unlock('phoenix');
            }

            // Update User Stats & Trophies Atomic
            const update = {
                $addToSet: { unlockedTrophies: { $each: unlockedNow } },
                $inc: { 
                    'stats.totalGames': 1, 
                    'stats.totalWagered': gameContext.bet,
                    'stats.totalWins': isWin ? 1 : 0,
                    'stats.totalBlackjacks': (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) ? 1 : 0
                }
            };

            if (profit > (user.stats?.highestWin || 0)) {
                update['stats.highestWin'] = profit;
            }

            await User.updateOne({ _id: userId }, update);
            
            if (unlockedNow.length > 0) {
                logEvent('METRIC', `🏆 Achievement Unlocked: ${unlockedNow.join(', ')} for ${user.username}`);
            }

            return unlockedNow;

        } catch (e) {
            console.error("Achievement Check Error:", e);
        }
    }
};

// --- CORE TRANSACTION ENGINE (BANKING GRADE) ---
const processTransaction = async (userId, amount, type, game = 'WALLET', referenceId = null, initialGameState = null) => {
    const amountCents = toCents(Math.abs(amount));
    const balanceChangeCents = (type === 'BET' || type === 'WITHDRAW') ? -amountCents : amountCents;
    const profitChangeCents = (type === 'WIN') ? amountCents : (type === 'BET') ? -amountCents : 0;
    
    let session = null;
    let result = null;

    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const opts = { session, new: true, lean: true }; // OPTIMIZATION: Use lean()
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

        const u = await User.findOneAndUpdate(query, update, opts);
        
        if (!u) {
            const exists = await User.exists({ _id: userId }).session(session);
            if (!exists) throw new Error('USER_NOT_FOUND');
            throw new Error('INSUFFICIENT_FUNDS');
        }
        
        // Audit Hash
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session).lean();
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = { userId, type, amount: fromCents(amountCents), balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
        const integrityHash = generateHash({ ...txData, prevHash }); 
        
        const [tx] = await Transaction.create([ { ...txData, integrityHash } ], { session });

        await session.commitTransaction();
        
        // Manual ID fix for lean()
        u.id = u._id;
        u.lastTransactionId = tx._id;
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

// --- GAME STATE HELPER OPTIMIZED ---
const GameStateHelper = {
    // ATOMIC: Writes state AND returns new data in one go.
    save: async (userId, gameState) => {
        return await User.findOneAndUpdate(
            { _id: userId }, 
            { $set: { activeGame: gameState } },
            { new: true, lean: true, projection: 'balance activeGame' } // Return updated doc
        );
    },
    clear: async (userId) => {
        await User.updateOne({ _id: userId }, { $set: { activeGame: { type: 'NONE' } } });
    }
};

module.exports = {
    calculateRisk,
    processTransaction,
    saveGameLog,
    GameStateHelper,
    AchievementSystem
};
