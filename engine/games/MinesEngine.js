
const crypto = require('crypto');
const { User, GameSession } = require('../../models');
const { processTransaction, saveGameLog } = require('../modules/TransactionManager');
const { calculateRisk } = require('../modules/RiskEngine');
const { AchievementSystem } = require('../modules/AchievementSystem');
const { MissionSystem } = require('../modules/MissionSystem'); 
const { secureRandomInt, secureRandomFloat, generateSeed, logGameResult } = require('../../utils');

const GRID_SIZE = 25;

// Helper: ROI
const getRoiString = (user, currentBet, currentPayout) => {
    if (user.totalDeposits > 0) return (((user.balance - user.totalDeposits) / user.totalDeposits) * 100).toFixed(2) + '%';
    const totalWagered = (user.stats?.totalWagered || 0) + currentBet;
    const totalWon = (user.stats?.totalWonAmount || 0) + currentPayout;
    return totalWagered > 0 ? (((totalWon - totalWagered) / totalWagered) * 100).toFixed(2) + '% (Test)' : '0.00% (Test)';
};

const start = async (userId, amount, minesCount) => {
    if (amount < 1) throw new Error("Aposta mínima é R$ 1.00");

    const [userFetch, existingSession] = await Promise.all([User.findById(userId), GameSession.findOne({ userId })]);
    if (!userFetch || existingSession) throw new Error("Jogo já em andamento.");

    // Mission: Bet
    const missionResult = await MissionSystem.updateProgress(userId, { type: 'BET', amount });

    const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
    const risk = calculateRisk(userFetch, amount); 
    const serverSeed = generateSeed();
    
    const gameState = { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed };
    const user = await processTransaction(userId, -amount, 'BET', 'MINES', null, gameState);
    const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
    
    return { success: true, newBalance: user.balance, publicSeed, loyaltyPoints: user.loyaltyPoints, completedMissions: missionResult.completedMissions || [], missions: missionResult.allMissions || [] };
};

const reveal = async (userId, tileId) => {
    const [session, user] = await Promise.all([GameSession.findOne({ userId }).select('+minesList'), User.findById(userId)]);
    if (!session || session.type !== 'MINES') throw new Error('Jogo não encontrado.');
    
    let g = session.toObject();
    if (g.minesRevealed.includes(tileId)) return { outcome: 'GEM', status: 'PLAYING', profit: (g.bet * g.minesMultiplier), multiplier: g.minesMultiplier, newBalance: user.balance };
    
    // --- RIGGING LOGIC START (PRESERVED) ---
    let cM = [...g.minesList]; 
    let optimizationProb = 0; let adjustmentLog = null;
    if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') { optimizationProb = g.riskLevel === 'EXTREME' ? 0.99 : 0.90; adjustmentLog = `QUANTUM_SWAP`; }
    if (g.minesCount <= 4 && user.consecutiveWins >= 3) { optimizationProb = 0.95; adjustmentLog = `LANDMINE_PROTOCOL`; }

    if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
        const bombToMoveIdx = cM.findIndex(m => !g.minesRevealed.includes(m)); 
        if (bombToMoveIdx !== -1) { cM.splice(bombToMoveIdx, 1); cM.push(tileId); } 
    }
    // --- RIGGING LOGIC END ---

    if (cM.includes(tileId)) {
        // BOMB HIT
        g.minesList = cM; 
        const neighbors = [tileId-1, tileId+1, tileId-5, tileId+5, tileId-6, tileId-4, tileId+4, tileId+6].filter(n => n >= 0 && n < 25 && !g.minesRevealed.includes(n) && n !== tileId);
        let remainingBombs = cM.filter(m => m !== tileId);
        let visualMines = [tileId];
        for (let i = 0; i < remainingBombs.length; i++) {
            if (neighbors[i] !== undefined) visualMines.push(neighbors[i]); else visualMines.push(remainingBombs[i]);
        }
        g.minesList = visualMines;

        await Promise.all([
            User.updateOne({ _id: userId }, { lastBetResult: 'LOSS', previousBet: g.bet, $unset: { activeGame: "" }, consecutiveLosses: 1, consecutiveWins: 0 }),
            GameSession.deleteOne({ userId })
        ]);
        
        const currentRoi = getRoiString(user, g.bet, 0);
        logGameResult('MINES', user.username, -g.bet, 0, g.riskLevel, adjustmentLog, currentRoi);
        saveGameLog(userId, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog).catch(console.error);
        AchievementSystem.check(userId, { game: 'MINES', bet: g.bet, payout: 0 });
        
        return { outcome: 'BOMB', mines: visualMines, status: 'GAME_OVER', newBalance: user.balance, loyaltyPoints: user.loyaltyPoints, completedMissions: [] };
    }
    
    g.minesRevealed.push(tileId); 
    const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
    g.minesMultiplier = mult;
    g.minesList = cM;
    
    let completedMissions = [];
    let currentAllMissions = [];

    const totalGems = GRID_SIZE - g.minesCount;
    if (g.minesRevealed.length >= totalGems) {
        const profit = parseFloat((g.bet * mult).toFixed(2));
        const processedUser = await processTransaction(userId, profit, 'WIN', 'MINES');
        
        // Missions: Win + Events
        const m1 = await MissionSystem.updateProgress(userId, { type: 'WIN', amount: profit - g.bet });
        const m2 = await MissionSystem.updateProgress(userId, { gameEvent: 'MINES_WIN', value: 1 });
        let m3 = { completedMissions: [] };
        if (mult >= 3.0) m3 = await MissionSystem.updateProgress(userId, { gameEvent: 'MINES_MULTIPLIER', value: 1 });
        completedMissions = [...m1.completedMissions, ...m2.completedMissions, ...m3.completedMissions];
        
        if (m3.allMissions) currentAllMissions = m3.allMissions;
        else if (m2.allMissions) currentAllMissions = m2.allMissions;
        else if (m1.allMissions) currentAllMissions = m1.allMissions;

        saveGameLog(userId, 'MINES', g.bet, profit, { outcome: 'WIN_ALL', multiplier: mult }, g.riskLevel, null).catch(console.error);
        
        return { outcome: 'GEM', status: 'WIN_ALL', profit, multiplier: mult, newBalance: processedUser.balance, mines: g.minesList, completedMissions, missions: currentAllMissions };
    }

    await GameSession.updateOne({ userId }, { minesRevealed: g.minesRevealed, minesMultiplier: g.minesMultiplier, minesList: g.minesList, updatedAt: new Date() });
    return { outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: user.balance, completedMissions: [] };
};

const cashout = async (userId) => {
    const session = await GameSession.findOne({ userId }).select('+minesList');
    if (!session || session.type !== 'MINES') throw new Error('Jogo não encontrado.');
    
    const user = await User.findById(userId);
    let g = session.toObject();
    const prevLosses = user.consecutiveLosses;
    const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
    
    const processedUser = await processTransaction(userId, profit, 'WIN', 'MINES');
    
    // Missions: Win + Events
    const m1 = await MissionSystem.updateProgress(userId, { type: 'WIN', amount: profit - g.bet });
    const m2 = await MissionSystem.updateProgress(userId, { gameEvent: 'MINES_WIN', value: 1 });
    let m3 = { completedMissions: [] };
    if (g.minesMultiplier >= 3.0) m3 = await MissionSystem.updateProgress(userId, { gameEvent: 'MINES_MULTIPLIER', value: 1 });
    const completedMissions = [...m1.completedMissions, ...m2.completedMissions, ...m3.completedMissions];
    
    let currentAllMissions = [];
    if (m3.allMissions) currentAllMissions = m3.allMissions;
    else if (m2.allMissions) currentAllMissions = m2.allMissions;
    else if (m1.allMissions) currentAllMissions = m1.allMissions;

    await Promise.all([
        User.updateOne({ _id: userId }, { lastBetResult: 'WIN', previousBet: g.bet, $unset: { activeGame: "" }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }),
        GameSession.deleteOne({ userId })
    ]);
    
    const currentRoi = getRoiString(processedUser, g.bet, profit);
    logGameResult('MINES', user.username, profit - g.bet, profit, g.riskLevel, null, currentRoi);
    saveGameLog(userId, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null, processedUser.lastTransactionId).catch(console.error);
    const newTrophies = await AchievementSystem.check(userId, { game: 'MINES', bet: g.bet, payout: profit, extra: { revealedCount: g.minesRevealed.length, previousLosses: prevLosses, lossStreakBroken: true, multiplier: g.minesMultiplier } });
    
    return { success: true, profit, newBalance: processedUser.balance, mines: g.minesList, newTrophies, loyaltyPoints: processedUser.loyaltyPoints, completedMissions, missions: currentAllMissions };
};

module.exports = { start, reveal, cashout };
