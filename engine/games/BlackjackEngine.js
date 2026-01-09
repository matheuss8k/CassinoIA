
const crypto = require('crypto');
const { User, GameSession } = require('../../models');
const { processTransaction, saveGameLog, GameStateHelper } = require('../modules/TransactionManager');
const { calculateRisk } = require('../modules/RiskEngine');
const { AchievementSystem } = require('../modules/AchievementSystem');
const { secureShuffle, secureRandomFloat, generateSeed, logGameResult } = require('../../utils');

// Helper to calculate hand score
const calc = (h) => {
    let s = 0, a = 0;
    h.forEach(c => {
        if (!c.isHidden) { s += c.value; if (c.rank === 'A') a++; }
    });
    while (s > 21 && a > 0) { s -= 10; a--; }
    return s;
};

// Helper: Calculate ROI String safely
const getRoiString = (user, currentBet, currentPayout) => {
    if (user.totalDeposits > 0) {
        return (((user.balance - user.totalDeposits) / user.totalDeposits) * 100).toFixed(2) + '%';
    } else {
        // Test Account Logic: Yield based (Win / Wagered)
        const totalWagered = (user.stats?.totalWagered || 0) + currentBet;
        const totalWon = (user.stats?.totalWonAmount || 0) + currentPayout;
        if (totalWagered > 0) {
            const yieldVal = ((totalWon - totalWagered) / totalWagered) * 100;
            return yieldVal.toFixed(2) + '% (Test)';
        }
        return '0.00% (Test)';
    }
};

// --- DEAL ---
const deal = async (userId, amount, sideBets) => {
    const totalBet = amount + (sideBets?.perfectPairs || 0) + (sideBets?.dealerBust || 0);
    // Parallel Fetch
    const [userFetch, existingSession] = await Promise.all([
        User.findById(userId),
        GameSession.findOne({ userId })
    ]);

    if (!userFetch) throw new Error("User not found");
    if (existingSession) throw new Error("Jogo já em andamento. Recarregue a página.");

    const risk = calculateRisk(userFetch, totalBet);
    let engineAdjustment = null;

    const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
    secureShuffle(deck);
    
    let pHand=[deck.pop(),deck.pop()]; 
    let dHand=[deck.pop(),deck.pop()];

    // RIGGED DEAL (High Risk)
    if ((risk.level === 'HIGH' || risk.level === 'EXTREME')) {
        if (dHand[0].value <= 9 && dHand[1].value <= 9) {
            const powerCard = deck.find(c => c.value === 10 || c.value === 11);
            if (powerCard) {
                const idx = deck.indexOf(powerCard);
                deck.splice(idx, 1);
                deck.push(dHand[1]);
                dHand[1] = powerCard; 
                engineAdjustment = 'RIGGED_DEALER_HAND';
            }
        }
        if (sideBets?.perfectPairs > 0 && pHand[0].rank === pHand[1].rank) {
             const diffCard = deck.find(c => c.rank !== pHand[0].rank);
             if (diffCard) {
                 const idx = deck.indexOf(diffCard);
                 deck.splice(idx, 1);
                 deck.push(pHand[1]);
                 pHand[1] = diffCard;
                 engineAdjustment = 'PAIR_BREAKER';
             }
        }
    }

    const serverSeed = generateSeed();
    const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');

    const pScore = calc(pHand); const dScore = calc(dHand);
    let status = 'PLAYING', result = 'NONE', payout = 0;
    
    if (dHand[0].rank === 'A' && pScore !== 21) status = 'INSURANCE';
    if (pScore === 21) { 
        status = 'GAME_OVER'; 
        if (dScore === 21) { result = 'PUSH'; payout = amount; } 
        else { result = 'BLACKJACK'; payout = amount * 2.5; } 
    }
    
    const gameState = { type: 'BLACKJACK', bet: amount, sideBets, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: status, riskLevel: risk.level, serverSeed };

    let user;
    let newTrophies = [];

    if (status === 'GAME_OVER') {
         user = await processTransaction(userId, -totalBet, 'BET', 'BLACKJACK', null, null); 
         if (payout > 0) user = await processTransaction(userId, payout, 'WIN', 'BLACKJACK');
         
         // Async Log
         const currentRoi = getRoiString(user, totalBet, payout);
         logGameResult('BLACKJACK', user.username, payout - totalBet, user.sessionProfit, risk.level, engineAdjustment, currentRoi);
         
         saveGameLog(user._id, 'BLACKJACK', totalBet, payout, { pScore, dScore, result }, risk.level, engineAdjustment, user.lastTransactionId).catch(console.error);
         
         const prevLosses = userFetch.consecutiveLosses;
         await User.updateOne({ _id: user._id }, { $set: { lastBetResult: payout > 0 ? 'WIN' : 'LOSS', previousBet: amount }, $unset: { activeGame: "" }, $inc: { consecutiveWins: payout > 0 ? 1 : 0, consecutiveLosses: payout > 0 ? 0 : 1 } });
         
         newTrophies = await AchievementSystem.check(user._id, { 
             game: 'BLACKJACK', bet: totalBet, payout, extra: { isBlackjack: result === 'BLACKJACK', previousLosses: prevLosses, lossStreakBroken: payout > 0 } 
         });
    } else {
         user = await processTransaction(userId, -totalBet, 'BET', 'BLACKJACK', null, gameState);
    }
    
    return { playerHand: pHand, dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: user.balance, sideBetWin: 0, publicSeed, newTrophies };
};

// --- HIT ---
const hit = async (userId) => {
    // Parallel fetch not needed here since we mostly need session
    const session = await GameSession.findOne({ userId }).select('+bjDeck');
    if (!session || session.type !== 'BLACKJACK') throw new Error("Jogo não encontrado ou expirado.");
    
    const user = await User.findById(userId);
    let g = session.toObject();

    let nextCard = g.bjDeck.pop();
    let engineAdjustment = null;

    if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
        const sc = calc(g.bjPlayerHand);
        if (sc >= 12) {
            const bustValueNeeded = 22 - sc; 
            const bustCardIdx = g.bjDeck.findIndex(c => c.value >= bustValueNeeded);
            if (bustCardIdx !== -1) { 
                g.bjDeck.unshift(nextCard);
                nextCard = g.bjDeck.splice(bustCardIdx, 1)[0]; 
                engineAdjustment = `PRECISION_BUST_${sc}`; 
            }
        }
    }

    g.bjPlayerHand.push(nextCard);
    let status = 'PLAYING', result = 'NONE';
    let newTrophies = [];
    
    // Check Bust
    if (calc(g.bjPlayerHand) > 21) {
        status = 'GAME_OVER'; result = 'BUST';
        
        await Promise.all([
            GameSession.deleteOne({ userId }),
            User.updateOne({ _id: userId }, { $set: { lastBetResult: 'LOSS', previousBet: g.bet }, $unset: { activeGame: "" }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } })
        ]);
        
        const currentRoi = getRoiString(user, g.bet, 0);
        logGameResult('BLACKJACK', user.username, -g.bet, 0, g.riskLevel, engineAdjustment, currentRoi);
        
        saveGameLog(userId, 'BLACKJACK', g.bet, 0, { result: 'BUST' }, g.riskLevel, engineAdjustment).catch(console.error);
        
        newTrophies = await AchievementSystem.check(userId, { game: 'BLACKJACK', bet: g.bet, payout: 0 });
    } else {
        // Just update hand in session, no user update needed (balance unchanged)
        await GameSession.updateOne({ userId }, { bjPlayerHand: g.bjPlayerHand, bjDeck: g.bjDeck, updatedAt: new Date() });
    }
    
    return { 
        playerHand: g.bjPlayerHand, 
        dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], 
        status, 
        result, 
        newBalance: user.balance, // Return cached balance (unchanged on hit)
        newTrophies 
    };
};

// --- STAND ---
const stand = async (userId) => {
    const session = await GameSession.findOne({ userId }).select('+bjDeck');
    if (!session || session.type !== 'BLACKJACK') throw new Error("Jogo não encontrado.");
    
    const user = await User.findById(userId);
    let g = session.toObject();

    const prevLosses = user.consecutiveLosses;
    
    let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
    let engineAdjustment = null;

    // SWEATY DEALER
    if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && pScore <= 21) {
        const sweatyCards = g.bjDeck.filter(c => c.value >= 2 && c.value <= 5);
        const otherCards = g.bjDeck.filter(c => c.value < 2 || c.value > 5);
        
        if (sweatyCards.length > 5) {
            g.bjDeck = [...otherCards, ...sweatyCards]; 
            engineAdjustment = 'SWEATY_DEALER_PROTOCOL';
        }
    }

    while (dScore < 17) { g.bjDealerHand.push(g.bjDeck.pop()); dScore = calc(g.bjDealerHand); }

    let result = 'LOSE', payout = 0;
    if (dScore > 21) { result = 'WIN'; payout = g.bet * 2; }
    else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; }
    else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

    let processedUser;
    // Clear Session first
    await GameSession.deleteOne({ userId });

    if (payout > 0) {
        processedUser = await processTransaction(userId, payout, 'WIN', 'BLACKJACK');
        await User.updateOne({ _id: userId }, { lastBetResult: 'WIN', previousBet: g.bet, $unset: { activeGame: "" }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
    } else {
        processedUser = await User.findById(userId); 
        await User.updateOne({ _id: userId }, { lastBetResult: 'LOSS', previousBet: g.bet, $unset: { activeGame: "" }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
    }
    
    const currentRoi = getRoiString(processedUser, g.bet, payout);
    logGameResult('BLACKJACK', user.username, payout - g.bet, 0, g.riskLevel, engineAdjustment, currentRoi);
    
    saveGameLog(userId, 'BLACKJACK', g.bet, payout, { dScore, pScore, result }, g.riskLevel, engineAdjustment, processedUser.lastTransactionId).catch(console.error);
    
    const newTrophies = await AchievementSystem.check(userId, { 
        game: 'BLACKJACK', bet: g.bet, payout, extra: { isBlackjack: false, previousLosses: prevLosses, lossStreakBroken: payout > 0 } 
    });
    
    return { dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: processedUser.balance, newTrophies };
};

// --- INSURANCE ---
const insurance = async (userId, buyInsurance) => {
    const session = await GameSession.findOne({ userId }).select('+bjDeck');
    if (!session || session.type !== 'BLACKJACK' || session.bjStatus !== 'INSURANCE') throw new Error('Ação inválida ou jogo expirado.');
    
    const user = await User.findById(userId);
    let g = session.toObject();

    const insuranceCost = g.bet * 0.5;
    
    if (buyInsurance) {
        if (user.balance < insuranceCost) throw new Error('Saldo insuficiente');
        await processTransaction(userId, -insuranceCost, 'BET', 'BLACKJACK_INSURANCE');
        g.insuranceBet = insuranceCost;
    }

    let hiddenCard = g.bjDealerHand[1];
    let engineAdjustment = null;

    if (buyInsurance) {
        if (hiddenCard.value === 10) {
            const nonTenIdx = g.bjDeck.findIndex(c => c.value !== 10);
            if (nonTenIdx !== -1) {
                const nonTen = g.bjDeck.splice(nonTenIdx, 1)[0];
                g.bjDeck.push(hiddenCard);
                g.bjDealerHand[1] = nonTen; 
                engineAdjustment = 'INSURANCE_SCAM_SAFE';
            }
        }
    }

    const checkDealerBJ = (hand) => {
        let s=0, a=0; hand.forEach(c => { s+=c.value; if(c.rank==='A') a++; });
        while(s>21 && a>0) { s-=10; a--; }
        return s === 21;
    };
    const dealerHasBJ = checkDealerBJ(g.bjDealerHand);
    
    let insuranceWin = 0;
    let mainResult = 'NONE';
    let mainPayout = 0;

    if (dealerHasBJ) {
        g.bjStatus = 'GAME_OVER';
        g.bjDealerHand[1].isHidden = false; 

        if (buyInsurance) {
            insuranceWin = g.insuranceBet * 3;
            await processTransaction(userId, insuranceWin, 'WIN', 'BLACKJACK_INSURANCE_WIN');
        }

        const playerHasBJ = calc(g.bjPlayerHand) === 21;
        if (playerHasBJ) {
            mainResult = 'PUSH';
            mainPayout = g.bet;
            await processTransaction(userId, mainPayout, 'REFUND', 'BLACKJACK');
        } else {
            mainResult = 'LOSE';
        }
        
        await Promise.all([
            GameSession.deleteOne({ userId }),
            User.updateOne({ _id: userId }, { lastBetResult: mainPayout > 0 ? 'PUSH' : 'LOSS', $unset: { activeGame: "" } })
        ]);
        
        const finalUser = await User.findById(userId);
        const currentRoi = getRoiString(finalUser, g.bet + g.insuranceBet, mainPayout + insuranceWin);
        logGameResult('BLACKJACK', user.username, (mainPayout + insuranceWin) - (g.bet + g.insuranceBet), 0, g.riskLevel, engineAdjustment, currentRoi);

        saveGameLog(userId, 'BLACKJACK', g.bet, mainPayout + (buyInsurance ? insuranceWin : 0), { result: 'DEALER_BJ', insurance: buyInsurance }, g.riskLevel, engineAdjustment).catch(console.error);

    } else {
        g.bjStatus = 'PLAYING';
        const playerHasBJ = calc(g.bjPlayerHand) === 21;
        if (playerHasBJ) {
            g.bjStatus = 'GAME_OVER';
            mainResult = 'BLACKJACK';
            mainPayout = g.bet * 2.5; 
            await processTransaction(userId, mainPayout, 'WIN', 'BLACKJACK');
            
            await Promise.all([
                GameSession.deleteOne({ userId }),
                User.updateOne({ _id: userId }, { lastBetResult: 'WIN', $unset: { activeGame: "" }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } })
            ]);
            
            const finalUser = await User.findById(userId);
            const currentRoi = getRoiString(finalUser, g.bet, mainPayout);
            logGameResult('BLACKJACK', user.username, mainPayout - g.bet, 0, g.riskLevel, engineAdjustment, currentRoi);

            saveGameLog(userId, 'BLACKJACK', g.bet, mainPayout, { result: 'BLACKJACK' }, g.riskLevel, engineAdjustment).catch(console.error);
        } else {
            await GameSession.updateOne({ userId }, { 
                bjDeck: g.bjDeck, 
                bjDealerHand: g.bjDealerHand, 
                bjStatus: 'PLAYING', 
                insuranceBet: g.insuranceBet,
                updatedAt: new Date()
            });
        }
    }

    const finalUser = await User.findById(userId);
    return {
        status: g.bjStatus,
        dealerHand: g.bjStatus === 'GAME_OVER' ? g.bjDealerHand : [g.bjDealerHand[0], { ...g.bjDealerHand[1], isHidden: true }],
        playerHand: g.bjPlayerHand,
        result: mainResult,
        insuranceWin: insuranceWin > 0 ? (insuranceWin - g.insuranceBet) : 0, 
        newBalance: finalUser.balance
    };
};

module.exports = { deal, hit, stand, insurance };
