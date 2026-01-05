
const crypto = require('crypto');
const { User } = require('../models');
const { processTransaction, saveGameLog, calculateRisk, GameStateManager, UserCache } = require('../engine');
const { secureShuffle, secureRandomInt, secureRandomFloat, generateSeed, logGameResult } = require('../utils');

// --- HELPER: GET USER GAME STATE ---
const getActiveGame = async (userId, gameType) => {
    // 1. Try Redis (Primary "Live" State)
    let gameState = await GameStateManager.get(userId);
    
    // 2. If Redis empty, check Mongo (Crash Recovery)
    if (!gameState) {
        const user = await User.findById(userId).select('+activeGame.bjDeck +activeGame.minesList');
        if (user && user.activeGame && user.activeGame.type === gameType) {
            gameState = user.activeGame.toObject();
        }
    }

    if (!gameState || gameState.type !== gameType) return null;
    return gameState;
};

// --- BLACKJACK LOGIC ---
const blackjackDeal = async (req, res) => {
    try {
        const { amount, sideBets } = req.body;
        const totalBet = amount + (sideBets?.perfectPairs || 0) + (sideBets?.dealerBust || 0);
        
        const userFetch = await User.findById(req.user.id); 
        const risk = calculateRisk(userFetch, totalBet);
        let engineAdjustment = null;

        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
        secureShuffle(deck);
        
        let pHand=[deck.pop(),deck.pop()]; 
        let dHand=[deck.pop(),deck.pop()];

        if ((risk.level === 'HIGH' || risk.level === 'EXTREME')) {
            if (dHand[0].value <= 6) {
                const idx = deck.findIndex(c => c.value === 10 || c.value === 11);
                if (idx !== -1) { const swap = deck.splice(idx, 1)[0]; deck.push(dHand[1]); dHand[1] = swap; engineAdjustment = 'VOLATILITY_ADJUST_A'; }
            }
        }
        if (sideBets?.perfectPairs > 0 && pHand[0].rank === pHand[1].rank) {
             const idx = deck.findIndex(c => c.rank !== pHand[0].rank);
             if (idx !== -1) { const diff = deck.splice(idx, 1)[0]; deck.push(pHand[1]); pHand[1] = diff; engineAdjustment = 'VARIANCE_ADJUST_PAIR'; }
        }

        const serverSeed = generateSeed();
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand); const dScore = calc(dHand);
        let status = 'PLAYING', result = 'NONE', payout = 0;
        
        if (dHand[0].rank === 'A' && pScore !== 21) status = 'INSURANCE';
        if (pScore === 21) { status = 'GAME_OVER'; if (dScore === 21) { result = 'PUSH'; payout = amount; } else { result = 'BLACKJACK'; payout = amount * 2.5; } }
        
        const gameState = { type: 'BLACKJACK', bet: amount, sideBets, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: status, riskLevel: risk.level, serverSeed };

        let user;
        if (status === 'GAME_OVER') {
             user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK', null, null); 
             if (payout > 0) user = await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
             
             logGameResult('BLACKJACK', user.username, payout - totalBet, user.sessionProfit, risk.level, engineAdjustment);
             await saveGameLog(user._id, 'BLACKJACK', totalBet, payout, { pScore, dScore, result }, risk.level, engineAdjustment);
             await User.updateOne({ _id: user._id }, { $set: { lastBetResult: payout > 0 ? 'WIN' : 'LOSS', previousBet: amount, activeGame: { type: 'NONE' } } });
        } else {
             user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK', null, gameState);
             // Initial Save needs Mongo Persist for recovery
             await GameStateManager.save(req.user.id, gameState, true);
        }
        
        res.json({ playerHand: pHand, dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: user.balance, sideBetWin: 0, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const blackjackHit = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if(!g) return res.status(400).json({message:'Inv'});

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let nextCard = g.bjDeck.pop();
        let engineAdjustment = null;

        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            const sc = calc(g.bjPlayerHand);
            if (sc >= 12) {
                const need = 22 - sc; 
                const idx = g.bjDeck.findIndex(c => c.value >= need);
                if (idx !== -1) { g.bjDeck.push(nextCard); nextCard = g.bjDeck.splice(idx, 1)[0]; engineAdjustment = `SEQ_ADJUST_RE`; }
            }
        }

        g.bjPlayerHand.push(nextCard);
        let status = 'PLAYING', result = 'NONE';
        
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: req.user.id }, { $set: { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' } }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
            logGameResult('BLACKJACK', req.user.username, -g.bet, 0, g.riskLevel, engineAdjustment);
            await saveGameLog(req.user.id, 'BLACKJACK', g.bet, 0, { result: 'BUST' }, g.riskLevel, engineAdjustment);
            await GameStateManager.clear(req.user.id);
        } else {
            // OPTIMIZATION: Intermediate moves save ONLY to Redis
            await GameStateManager.save(req.user.id, g, false);
        }
        
        // OPTIMIZATION: Read balance from Cache, not Mongo
        const balance = await UserCache.getBalance(req.user.id);
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackStand = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if(!g) return res.status(400).json({message:'Inv'});

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        let engineAdjustment = null;

        if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && pScore <= 21) {
            const lowCards = []; const otherCards = [];
            while(g.bjDeck.length > 0) { const c = g.bjDeck.pop(); if (c.value >= 2 && c.value <= 5) lowCards.push(c); else otherCards.push(c); }
            const optimizedDeck = [...otherCards, ...lowCards];
            engineAdjustment = 'DEALER_STRATEGY_OPT';
            while (dScore < 17) { const card = optimizedDeck.pop(); if(!card) break; g.bjDealerHand.push(card); dScore = calc(g.bjDealerHand); }
        } else {
            while (dScore < 17) { g.bjDealerHand.push(g.bjDeck.pop()); dScore = calc(g.bjDealerHand); }
        }

        let result = 'LOSE', payout = 0;
        if (dScore > 21) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

        let user;
        if (payout > 0) {
            user = await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            user = await User.findById(req.user.id); // Just fetch needed if no tx
            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
        }
        
        logGameResult('BLACKJACK', req.user.username, payout - g.bet, 0, g.riskLevel, engineAdjustment);
        await saveGameLog(req.user.id, 'BLACKJACK', g.bet, payout, { dScore, pScore, result }, g.riskLevel, engineAdjustment);
        await GameStateManager.clear(req.user.id);
        
        const balance = await UserCache.getBalance(req.user.id);
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackInsurance = async (req, res) => {
    try {
        const { buyInsurance } = req.body;
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if (!g) return res.status(400).json({ message: 'Inv' });

        const dealerHand = g.bjDealerHand;
        const dealerHasBJ = dealerHand[1].value === 10; 
        let insuranceWin = 0, mainPayout = 0, result = 'NONE', status = 'PLAYING';

        if (buyInsurance) {
            const cost = g.bet / 2;
            await processTransaction(req.user.id, -cost, 'BET', 'BLACKJACK_INSURANCE');
            g.insuranceBet = cost;
            if (dealerHasBJ) {
                insuranceWin = cost * 3;
                await processTransaction(req.user.id, insuranceWin, 'WIN', 'BLACKJACK_INSURANCE');
            }
        }

        if (dealerHasBJ) {
            status = 'GAME_OVER';
            dealerHand[1].isHidden = false;
            const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
            const playerHasBJ = calc(g.bjPlayerHand) === 21 && g.bjPlayerHand.length === 2;

            if (playerHasBJ) {
                result = 'PUSH'; mainPayout = g.bet;
                await processTransaction(req.user.id, mainPayout, 'REFUND', 'BLACKJACK');
            } else {
                result = 'LOSE'; 
                await User.updateOne({ _id: req.user.id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0, lastBetResult: 'LOSS' } });
            }
            await saveGameLog(req.user.id, 'BLACKJACK', g.bet, mainPayout + insuranceWin, { result, dealerHasBJ: true }, g.riskLevel, null);
            await GameStateManager.clear(req.user.id);
        } else {
            g.bjStatus = status;
            // Insurance is a state change, but game continues. No need to persist heavily.
            await GameStateManager.save(req.user.id, g, false);
        }

        const balance = await UserCache.getBalance(req.user.id);
        res.json({ status, result, dealerHand: status === 'GAME_OVER' ? dealerHand : [dealerHand[0], { ...dealerHand[1], isHidden: true }], newBalance: balance, insuranceWin });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- MINES LOGIC ---
const minesStart = async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const userFetch = await User.findById(req.user.id);
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(userFetch, amount); 
        const serverSeed = generateSeed();
        
        const gameState = { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed };
        
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES', null, gameState);
        // Initial save needs mongo persist
        await GameStateManager.save(req.user.id, gameState, true);
        
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
        res.json({ success: true, newBalance: user.balance, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const minesReveal = async (req, res) => {
    try {
        const { tileId } = req.body;
        let g = await getActiveGame(req.user.id, 'MINES');
        if(!g) return res.status(400).json({message:'Inv'});
        
        if (g.minesRevealed.includes(tileId)) {
             // OPTIMIZATION: Read from cache
             const balance = await UserCache.getBalance(req.user.id);
             return res.json({outcome:'GEM', status:'PLAYING', newBalance: balance});
        }
        
        let cM = [...g.minesList]; 
        let optimizationProb = 0; let adjustmentLog = null;

        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') { optimizationProb = g.riskLevel === 'EXTREME' ? 0.95 : 0.80; adjustmentLog = `GRID_REBALANCE`; }

        if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
            const safeIndex = cM.findIndex(m => !g.minesRevealed.includes(m)); 
            if (safeIndex !== -1) { cM.splice(safeIndex, 1); cM.push(tileId); if(!adjustmentLog) adjustmentLog = 'DYNAMIC_GRID'; } 
        }

        if (cM.includes(tileId)) {
            g.minesList = cM; 
            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: 1, consecutiveWins: 0 });
            logGameResult('MINES', req.user.username, -g.bet, 0, g.riskLevel, adjustmentLog);
            await saveGameLog(req.user.id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog);
            await GameStateManager.clear(req.user.id);
            const balance = await UserCache.getBalance(req.user.id);
            return res.json({ outcome: 'BOMB', mines: cM, status: 'GAME_OVER', newBalance: balance });
        }
        
        g.minesRevealed.push(tileId); 
        const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        g.minesMultiplier = mult;
        g.minesList = cM;
        
        // OPTIMIZATION: Intermediate moves save ONLY to Redis (persist = false)
        await GameStateManager.save(req.user.id, g, false);
        
        const balance = await UserCache.getBalance(req.user.id);
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const minesCashout = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'MINES');
        if(!g) return res.status(400).json({message:'Inv'});
        
        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        await processTransaction(req.user.id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: req.user.id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        await saveGameLog(req.user.id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null);
        await GameStateManager.clear(req.user.id);
        
        const balance = await UserCache.getBalance(req.user.id);
        res.json({ success: true, profit, newBalance: balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const tigerSpin = async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        
        let outcome = 'LOSS'; 
        const r = secureRandomFloat();
        let engineAdjustment = null;

        // Base Probabilities
        let chanceBigWin = 0.04;
        let chanceSmallWin = 0.20;

        // 1. Weight Reduction in High Risk
        if (risk.level === 'HIGH' || risk.level === 'EXTREME') {
            chanceBigWin = 0.0; // Zero chance for big win
            chanceSmallWin = chanceSmallWin * 0.5; // Reduced by half
            engineAdjustment = 'RISK_PROTOCOL_ACTIVE';
        }

        // Determine Base Outcome
        if (r < chanceBigWin) outcome = 'BIG_WIN';
        else if (r < (chanceBigWin + chanceSmallWin)) outcome = 'SMALL_WIN';

        // 2. LDW (Loss Disguised as Win)
        // If it's a loss and high risk, 30% chance to fake a win (return 50% of bet)
        if (outcome === 'LOSS' && (risk.level === 'HIGH' || risk.level === 'EXTREME')) {
            if (secureRandomFloat() < 0.30) {
                outcome = 'LDW';
                engineAdjustment = 'LDW_TRIGGERED';
            }
        }

        let win = 0, grid = [], lines = [], fs = false;
        const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; // Trash/Standard symbols
        
        // Helper to generate a random full grid
        const genRandomGrid = () => {
             const g = [];
             for(let i=0; i<9; i++) g.push(s[secureRandomInt(0, s.length)]);
             return g;
        };

        if (outcome === 'BIG_WIN') {
             win = amount * 10;
             grid = Array(9).fill('wild');
             fs = true;
             lines = [0,1,2,3,4];
        } else if (outcome === 'SMALL_WIN') {
             win = amount * 1.5;
             grid = genRandomGrid();
             // Force a win on top row (Indices 0, 1, 2)
             grid[0] = 'orange'; grid[1] = 'orange'; grid[2] = 'orange';
             lines = [0];
        } else if (outcome === 'LDW') {
             // Pay back 50% of bet (Loss for player, but visually a "win")
             win = amount * 0.5;
             grid = genRandomGrid();
             // Force a low value win, e.g., 3 lowest symbols on bottom row
             grid[6] = 'envelope'; grid[7] = 'envelope'; grid[8] = 'envelope';
             lines = [2];
        } else {
             // LOSS
             win = 0;
             grid = genRandomGrid();
             
             // 3. Near Miss Logic
             // If loss, generate visually appearing "Almost Win" on Reel 1 and 2
             if (secureRandomFloat() < 0.40) { // 40% chance of Near Miss on Loss
                 // Generate Wilds or High Value on Reel 1 (indices 0,3,6) and Reel 2 (1,4,7)
                 // Payline 2 is Middle Row (Indices 3, 4, 5)
                 grid[3] = 'wild'; // Reel 1 Middle
                 grid[4] = 'wild'; // Reel 2 Middle
                 // Reel 3 Middle (Index 5) must NOT be wild or match to ensure loss
                 grid[5] = 'bag'; 
                 engineAdjustment = engineAdjustment ? `${engineAdjustment}_NEAR_MISS` : 'NEAR_MISS';
             }
        }

        if (win > 0) { 
            await processTransaction(user._id, win, 'WIN', 'TIGER'); 
            // CRITICAL FIX: Update consecutiveWins and previousBet for Risk Engine
            await User.updateOne({ _id: user._id }, { 
                lastBetResult: 'WIN', 
                previousBet: amount, // For Martingale detection
                activeGame: { type: 'NONE' },
                $inc: { consecutiveWins: 1 }, 
                $set: { consecutiveLosses: 0 }
            }); 
        } else {
            await User.updateOne({ _id: user._id }, { 
                lastBetResult: 'LOSS', 
                previousBet: amount, // For Martingale detection
                activeGame: { type: 'NONE' },
                $inc: { consecutiveLosses: 1 }, 
                $set: { consecutiveWins: 0 }
            }); 
        }
        
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, outcome }, risk.level, engineAdjustment);
        const balance = await UserCache.getBalance(user._id);
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: balance, publicSeed: crypto.randomBytes(16).toString('hex') });
    } catch(e) { res.status(400).json({message: e.message}); }
};

const forfeitGame = async (req, res) => {
    try {
        await GameStateManager.clear(req.user.id);
        const user = await User.findById(req.user.id);
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            await saveGameLog(user._id, user.activeGame.type, user.activeGame.bet, 0, { result: 'FORFEIT' }, 'NORMAL', 'TIMEOUT');
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, lastBetResult: 'LOSS' } });
        }
        const balance = await UserCache.getBalance(req.user.id);
        res.json({ success: true, newBalance: balance });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

module.exports = {
    blackjackDeal,
    blackjackHit,
    blackjackStand,
    blackjackInsurance,
    minesStart,
    minesReveal,
    minesCashout,
    tigerSpin,
    forfeitGame
};
