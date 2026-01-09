
const crypto = require('crypto');
const { User } = require('../../models');
const { processTransaction, saveGameLog } = require('../modules/TransactionManager');
const { calculateRisk } = require('../modules/RiskEngine');
const { AchievementSystem } = require('../modules/AchievementSystem');
const { secureRandomInt, secureRandomFloat, logGameResult } = require('../../utils');

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

const spin = async (userId, amount) => {
    // PERFORMANCE OPTIMIZATION: Removed GameSession check. 
    // Tiger is atomic spin, checking session db every spin causes latency.
    // Frontend handles "busy" state.
    const userFetch = await User.findById(userId);
    
    const prevLosses = userFetch.consecutiveLosses;

    let user = await processTransaction(userId, -amount, 'BET', 'TIGER');
    const risk = calculateRisk(user, amount);
    let outcome = 'LOSS'; 
    const r = secureRandomFloat();
    let engineAdjustment = null;
    
    // Base Probabilities - ADJUSTED (Low Big Win Frequency)
    // Big Win: 1% (Rare)
    // Small Win: 24% (Common) -> Cumulative 0.25
    // Tiny Win: 20% (Common) -> Cumulative 0.45
    // Total Hit Rate: ~45% (Keeps game alive, but low payout)
    let chanceBigWin = 0.01; 
    let chanceSmallWin = 0.25; 
    let chanceTinyWinThreshold = 0.45;
    
    if (risk.level === 'HIGH' || risk.level === 'EXTREME') { 
        chanceBigWin = 0.0; // 0% Chance
        chanceSmallWin = 0.10; 
        chanceTinyWinThreshold = 0.35; 
        engineAdjustment = 'WEIGHT_REDUCTION'; 
    }
    
    if (r < chanceBigWin) outcome = 'BIG_WIN'; 
    else if (r < chanceSmallWin) outcome = 'SMALL_WIN';
    else if (r < chanceTinyWinThreshold) outcome = 'TINY_WIN';
    else {
        if ((risk.level === 'HIGH' || risk.level === 'EXTREME') && secureRandomFloat() < 0.30) {
            outcome = 'FAKE_WIN'; 
            engineAdjustment = 'LDW_PROTOCOL';
        }
    }

    let win = 0, grid = [], lines = [], fs = false;
    const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; 
    grid = []; for(let i=0; i<9; i++) grid.push(s[secureRandomInt(0, s.length)]); 
    
    if (outcome === 'BIG_WIN') { 
        win = amount * 10; grid.fill('wild'); fs=true; lines=[0,1,2,3,4]; 
    } else if (outcome === 'SMALL_WIN') { 
        win = amount * 1.5; grid[0]='orange'; grid[1]='orange'; grid[2]='orange'; lines=[0]; 
    } else if (outcome === 'TINY_WIN') {
        win = amount * 0.5; grid[3]='orange'; grid[4]='orange'; grid[5]='orange'; lines=[1];
    } else if (outcome === 'FAKE_WIN') {
        win = amount * 0.5; 
        grid[6]='bag'; grid[7]='bag'; grid[8]='bag'; lines=[2];
        // Note: Fake win calculates amount for internal logic but does NOT payout below
    } else {
        // Near Miss (increased frequency for excitement)
        if (secureRandomFloat() < 0.45) {
            grid[0] = 'wild'; grid[1] = 'wild'; grid[2] = 'orange'; 
            engineAdjustment = 'NEAR_MISS_FX';
        }
    }

    // Only pay if NOT fake win
    if (outcome !== 'FAKE_WIN' && win > 0) { 
        user = await processTransaction(user._id, win, 'WIN', 'TIGER'); 
        if (win > amount) {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 }, $unset: { activeGame: "" } });
        } else {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', $set: { consecutiveWins: 0 }, $inc: { consecutiveLosses: 1 }, $unset: { activeGame: "" } });
        }
    } else {
        // Reset win amount for fake win so logs and frontend don't show money gained
        if (outcome === 'FAKE_WIN') win = 0; 
        await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', $set: { consecutiveWins: 0 }, $inc: { consecutiveLosses: 1 }, $unset: { activeGame: "" } }); 
    }
    
    const currentRoi = getRoiString(user, amount, win);
    logGameResult('TIGER', user.username, win - amount, user.sessionProfit, risk.level, engineAdjustment, currentRoi);

    saveGameLog(user._id, 'TIGER', amount, win, { grid, outcome }, risk.level, engineAdjustment, user.lastTransactionId).catch(console.error);
    
    const newTrophies = await AchievementSystem.check(user._id, { 
        game: 'TIGER', bet: amount, payout: win, 
        extra: { previousLosses: prevLosses, lossStreakBroken: win > amount, isFullScreen: fs }
    });
    
    return { grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: (await User.findById(user._id)).balance, publicSeed: crypto.randomBytes(16).toString('hex'), newTrophies, loyaltyPoints: user.loyaltyPoints };
};

module.exports = { spin };
