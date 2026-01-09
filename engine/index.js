
const mongoose = require('mongoose');
const { User, Transaction, GameLog } = require('../models');
const { toCents, fromCents, generateHash, logEvent } = require('../utils');

// --- RISK ENGINE (CORE LOGIC) ---
const calculateRisk = (user, currentBet) => {
    const balance = user.balance;
    let risk = 'NORMAL';
    let triggers = [];

    // 1. All-in Trap: Aposta > 90% da banca original
    const originalBalance = user.balance + currentBet;
    const betRatio = originalBalance > 0 ? (currentBet / originalBalance) : 0;
    
    if (betRatio >= 0.90) {
        return { level: 'EXTREME', triggers: ['ALL_IN_TRAP'] };
    }

    // 2. Sniper: Aumento de 5x na aposta comparado a anterior
    if (user.previousBet > 0 && currentBet >= (user.previousBet * 5)) {
        risk = 'EXTREME';
        triggers.push('SNIPER_PROTOCOL');
    }

    // 3. ROI Guard: Lucro Excessivo vs Depósitos
    // Lógica ajustada para Contas Baleia/Teste (Depósitos = 0)
    
    const hasRealDeposits = user.totalDeposits > 10;

    // Se tiver depósitos, a base é o total depositado. 
    // Se não (baleia manual), a base é o próprio saldo (evita divisão por zero ou números pequenos).
    const baseCapital = hasRealDeposits ? user.totalDeposits : Math.max(user.balance, 100); 
    
    // Cálculo de Lucro Líquido Total
    // Se é conta de teste (sem depósitos), assumimos lucro histórico 0 para não travar a conta imediatamente.
    // Isso impede o cálculo: (10000 - 0) / 100 = 100x lucro.
    const totalNetProfit = hasRealDeposits ? (user.balance - user.totalDeposits) : 0;

    const currentProfit = user.sessionProfit; // Lucro da sessão atual
    const totalProfitRatio = totalNetProfit / baseCapital;
    
    // Regras Estritas (50% de tolerância)
    if (currentProfit > (baseCapital * 0.50) || totalProfitRatio > 0.50) {
        // Apenas ativa se o saldo for significativo (> 100 reais)
        if (user.balance > 100) {
            risk = 'EXTREME';
            triggers.push('ROI_GUARD');
        }
    }

    // 4. Kill Switch: 3 vitórias seguidas (Mantido, mas menos agressivo em saldo baixo)
    if (user.consecutiveWins >= 4) { // Subiu para 4 para dar mais respiro
        risk = 'EXTREME';
        triggers.push('KILL_SWITCH_STREAK');
    }

    // 5. Anti-Martingale: Dobra após derrota ou vitória
    if (user.previousBet > 0 && currentBet >= (user.previousBet * 1.95) && currentBet <= (user.previousBet * 2.1)) {
        risk = risk === 'EXTREME' ? 'EXTREME' : 'HIGH';
        triggers.push('MARTINGALE_DETECTED');
    }

    // Fallback: RTP Correction
    // Se o usuário está ganhando muito a longo prazo (> 60% win rate), força High
    if (risk === 'NORMAL' && user.stats?.totalWagered > 500 && (user.stats?.totalWins / user.stats?.totalGames) > 0.65) {
        risk = 'HIGH';
        triggers.push('RTP_CORRECTION');
    }

    if (triggers.length > 0) {
        logEvent('METRIC', `User: ${user.username} | Load: ${risk} | Flags: [${triggers.join(', ')}]`);
    }

    return { level: risk, triggers };
};

// --- STATS BATCHER (Write-Behind Pattern) ---
class StatsBatcher {
    constructor() {
        this.buffer = new Map(); // userId -> { incs: {} }
        this.FLUSH_INTERVAL = 5000; // 5 segundos
        
        // Inicia o loop de limpeza
        setInterval(() => this.flush(), this.FLUSH_INTERVAL);
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
        if (this.buffer.size === 0) return;

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
                console.error("[STATS] Batch Write Error:", e);
            }
        }
    }
}

const statsBatcher = new StatsBatcher();

// --- ACHIEVEMENT SYSTEM ---
const AchievementSystem = {
    check: async (userId, gameContext) => {
        try {
            const user = await User.findById(userId);
            if (!user) return;

            const unlockedNow = [];
            const currentTrophies = user.unlockedTrophies || [];
            
            const unlock = (id) => {
                if (!currentTrophies.includes(id)) unlockedNow.push(id);
            };

            const profit = gameContext.payout - gameContext.bet;
            const isWin = profit > 0;
            const multiplier = gameContext.bet > 0 ? (gameContext.payout / gameContext.bet) : 0;

            if (isWin) unlock('first_win');
            if (gameContext.bet >= 500) unlock('high_roller');
            if (gameContext.game === 'MINES' && gameContext.extra?.revealedCount >= 20) unlock('sniper');
            
            if ((user.stats?.totalGames || 0) + 1 >= 50) unlock('club_50');
            if ((user.stats?.totalGames || 0) + 1 >= 30) unlock('loyal_player');

            if (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) {
                if ((user.stats?.totalBlackjacks || 0) + 1 >= 10) unlock('bj_master');
            }

            if (user.balance + profit >= 5000) unlock('rich_club');
            if (user.consecutiveWins >= 10) unlock('unbeatable');
            if (multiplier >= 50) unlock('multiplier_king');
            if (gameContext.payout >= 200) unlock('heavy_hitter');
            if (gameContext.extra?.lossStreakBroken && gameContext.extra?.previousLosses >= 3) {
                unlock('phoenix');
            }

            const statsIncrements = {
                'stats.totalGames': 1,
                'stats.totalWagered': gameContext.bet,
                'stats.totalWins': isWin ? 1 : 0,
                'stats.totalBlackjacks': (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) ? 1 : 0
            };
            
            statsBatcher.add(userId, statsIncrements);

            const directUpdate = {};
            let shouldWriteImmediately = false;

            if (unlockedNow.length > 0) {
                directUpdate.$addToSet = { unlockedTrophies: { $each: unlockedNow } };
                shouldWriteImmediately = true;
            }

            if (profit > (user.stats?.highestWin || 0)) {
                directUpdate.$set = { 'stats.highestWin': profit };
                shouldWriteImmediately = true;
            }

            if (shouldWriteImmediately) {
                await User.updateOne({ _id: userId }, directUpdate);
                if (unlockedNow.length > 0) {
                    logEvent('METRIC', `🏆 Achievement Unlocked: ${unlockedNow.join(', ')} for ${user.username}`);
                }
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
        
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session).lean();
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = { userId, type, amount: fromCents(amountCents), balanceAfter: u.balance, game, referenceId, timestamp: new Date().toISOString() };
        const integrityHash = generateHash({ ...txData, prevHash }); 
        
        const [tx] = await Transaction.create([ { ...txData, integrityHash } ], { session });

        await session.commitTransaction();
        
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

const GameStateHelper = {
    save: async (userId, gameState) => {
        return await User.findOneAndUpdate(
            { _id: userId }, 
            { $set: { activeGame: gameState } },
            { new: true, lean: true, projection: 'balance activeGame' } 
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
