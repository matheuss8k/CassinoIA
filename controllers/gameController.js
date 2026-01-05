
const crypto = require('crypto');
const { User } = require('../models');
const { processTransaction, saveGameLog, calculateRisk } = require('../engine');
const { secureShuffle, secureRandomInt, secureRandomFloat, generateSeed, logGameResult } = require('../utils');

// --- BLACKJACK LOGIC ---
const blackjackDeal = async (req, res) => {
    try {
        const { amount, sideBets } = req.body;
        const totalBet = amount + (sideBets?.perfectPairs || 0) + (sideBets?.dealerBust || 0);
        const user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK');
        const risk = calculateRisk(user, totalBet);
        let engineAdjustment = null;

        const SUITS = ['♥', '♦', '♣', '♠']; const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; for(let i=0;i<6;i++) for(let s of SUITS) for(let r of RANKS) { let v=parseInt(r); if(['J','Q','K'].includes(r))v=10; if(r==='A')v=11; deck.push({rank:r,suit:s,value:v,id:crypto.randomBytes(4).toString('hex'),isHidden:false}); }
        secureShuffle(deck);
        
        let pHand=[deck.pop(),deck.pop()]; 
        let dHand=[deck.pop(),deck.pop()];

        // Dynamic Volatility Adjustment (Risk Management)
        if ((risk.level === 'HIGH' || risk.level === 'EXTREME')) {
            if (dHand[0].value <= 6) {
                const idx = deck.findIndex(c => c.value === 10 || c.value === 11);
                if (idx !== -1) {
                    const swap = deck.splice(idx, 1)[0];
                    deck.push(dHand[1]); dHand[1] = swap;
                    engineAdjustment = 'VOLATILITY_ADJUST_A';
                }
            } else if (dHand[0].value >= 10) {
                const idx = deck.findIndex(c => c.value === 10);
                if (idx !== -1) {
                    const ten = deck.splice(idx, 1)[0];
                    deck.push(dHand[1]); dHand[1] = ten;
                    engineAdjustment = 'VOLATILITY_ADJUST_B';
                }
            }
        }

        if (sideBets?.perfectPairs > 0) {
            if (pHand[0].rank === pHand[1].rank) {
                const idx = deck.findIndex(c => c.rank !== pHand[0].rank);
                if (idx !== -1) {
                    const diff = deck.splice(idx, 1)[0];
                    deck.push(pHand[1]); pHand[1] = diff;
                    engineAdjustment = 'VARIANCE_ADJUST_PAIR';
                }
            }
        }

        const serverSeed = generateSeed();
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        const pScore = calc(pHand); const dScore = calc(dHand);
        let status = 'PLAYING', result = 'NONE', payout = 0;
        
        if (dHand[0].rank === 'A' && pScore !== 21) status = 'INSURANCE';
        if (pScore === 21) { status = 'GAME_OVER'; if (dScore === 21) { result = 'PUSH'; payout = amount; } else { result = 'BLACKJACK'; payout = amount * 2.5; } }
        
        if (status === 'GAME_OVER') {
            if (payout > 0) await processTransaction(user._id, payout, 'WIN', 'BLACKJACK');
            else { await User.updateOne({ _id: user._id }, { $set: { lastBetResult: 'LOSS', previousBet: amount, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } }); }
            
            logGameResult('BLACKJACK', user.username, payout - totalBet, user.sessionProfit, risk.level, engineAdjustment);
            await saveGameLog(user._id, 'BLACKJACK', totalBet, payout, { pScore, dScore, result }, risk.level, engineAdjustment);
        } else {
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'BLACKJACK', bet: amount, sideBets, bjDeck: deck, bjPlayerHand: pHand, bjDealerHand: dHand, bjStatus: status, riskLevel: risk.level, serverSeed: serverSeed } } });
        }
        
        res.json({ playerHand: pHand, dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: (await User.findById(user._id)).balance, sideBetWin: 0, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const blackjackHit = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inv'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let nextCard = deck.pop();
        let engineAdjustment = null;

        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            const sc = calc(g.bjPlayerHand);
            if (sc >= 12) {
                const need = 22 - sc; 
                const idx = deck.findIndex(c => c.value >= need);
                if (idx !== -1) {
                    deck.push(nextCard); nextCard = deck.splice(idx, 1)[0];
                    engineAdjustment = `SEQ_ADJUST_RE`;
                }
            }
        }

        g.bjPlayerHand.push(nextCard);
        let status = 'PLAYING', result = 'NONE';
        
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: user._id }, { $set: { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 } });
            
            logGameResult('BLACKJACK', user.username, -g.bet, user.sessionProfit, g.riskLevel, engineAdjustment);
            await saveGameLog(user._id, 'BLACKJACK', g.bet, 0, { result: 'BUST' }, g.riskLevel, engineAdjustment);
        } else {
            await User.updateOne({ _id: user._id }, { $set: { 'activeGame.bjPlayerHand': g.bjPlayerHand, 'activeGame.bjDeck': deck } });
        }
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: (await User.findById(user._id)).balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackStand = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user.id, 'activeGame.type': 'BLACKJACK' }).select('+activeGame.bjDeck');
        if(!user) return res.status(400).json({message:'Inv'});
        const g = user.activeGame; const deck = g.bjDeck;
        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        let engineAdjustment = null;

        if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && pScore <= 21) {
            const lowCards = []; const otherCards = [];
            while(deck.length > 0) {
                const c = deck.pop();
                if (c.value >= 2 && c.value <= 5) lowCards.push(c);
                else otherCards.push(c);
            }
            const optimizedDeck = [...otherCards, ...lowCards];
            engineAdjustment = 'DEALER_STRATEGY_OPT';
            while (dScore < 17) { 
                const card = optimizedDeck.pop();
                if(!card) break; 
                g.bjDealerHand.push(card); dScore = calc(g.bjDealerHand); 
            }
        } else {
            while (dScore < 17) { g.bjDealerHand.push(deck.pop()); dScore = calc(g.bjDealerHand); }
        }

        let result = 'LOSE', payout = 0;
        if (dScore > 21) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

        if (payout > 0) {
            await processTransaction(user._id, payout, 'WIN', 'BLACKJACK');
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
        }
        
        logGameResult('BLACKJACK', user.username, payout - g.bet, user.sessionProfit, g.riskLevel, engineAdjustment);
        await saveGameLog(user._id, 'BLACKJACK', g.bet, payout, { dScore, pScore, result }, g.riskLevel, engineAdjustment);
        
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: (await User.findById(user._id)).balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackInsurance = async (req, res) => {
    try {
        const { buyInsurance } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.bjDeck');
        if (!user || user.activeGame.type !== 'BLACKJACK') return res.status(400).json({ message: 'Inv' });
        const g = user.activeGame;
        const dealerHand = g.bjDealerHand;
        const dealerHasBJ = dealerHand[1].value === 10; 
        let insuranceWin = 0, mainPayout = 0, result = 'NONE', status = 'PLAYING';

        if (buyInsurance) {
            const cost = g.bet / 2;
            await processTransaction(user._id, -cost, 'BET', 'BLACKJACK_INSURANCE');
            if (dealerHasBJ) {
                insuranceWin = cost * 3;
                await processTransaction(user._id, insuranceWin, 'WIN', 'BLACKJACK_INSURANCE');
            }
        }

        if (dealerHasBJ) {
            status = 'GAME_OVER';
            dealerHand[1].isHidden = false;
            const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
            const playerHasBJ = calc(g.bjPlayerHand) === 21 && g.bjPlayerHand.length === 2;

            if (playerHasBJ) {
                result = 'PUSH'; mainPayout = g.bet;
                await processTransaction(user._id, mainPayout, 'REFUND', 'BLACKJACK');
            } else {
                result = 'LOSE'; 
                await User.updateOne({ _id: user._id }, { $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0, lastBetResult: 'LOSS' } });
            }
            await saveGameLog(user._id, 'BLACKJACK', g.bet, mainPayout + insuranceWin, { result, dealerHasBJ: true }, g.riskLevel, null);
        }

        const update = { 'activeGame.bjStatus': status, 'activeGame.bjDealerHand': dealerHand, 'activeGame.insuranceBet': buyInsurance ? (g.bet/2) : 0 };
        if (status === 'GAME_OVER') update['activeGame.type'] = 'NONE';
        await User.updateOne({ _id: user._id }, { $set: update });
        
        res.json({ status, result, dealerHand: status === 'GAME_OVER' ? dealerHand : [dealerHand[0], { ...dealerHand[1], isHidden: true }], newBalance: (await User.findById(user._id)).balance, insuranceWin });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- MINES LOGIC ---
const minesStart = async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES');
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(user, amount); 
        const serverSeed = generateSeed();
        
        await User.updateOne({ _id: req.user.id }, { $set: { previousBet: amount, activeGame: { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed } } });
        
        const publicSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
        res.json({ success: true, newBalance: user.balance, publicSeed });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const minesReveal = async (req, res) => {
    try {
        const { tileId } = req.body;
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inv'});
        const g = user.activeGame; if (g.minesGameOver) return res.status(400).json({ message: 'End' });
        if (g.minesRevealed.includes(tileId)) return res.json({outcome:'GEM', status:'PLAYING', newBalance: user.balance});
        
        let cM = [...g.minesList]; 
        let optimizationProb = 0;
        let adjustmentLog = null;

        if (g.minesCount <= 4) {
            const wins = user.consecutiveWins;
            if (wins >= 2) optimizationProb = 0.30;
            if (wins >= 3) optimizationProb = 0.40;
            if (wins >= 4) { optimizationProb = 0.90; adjustmentLog = 'ANTI_FARM'; }
            if (g.minesRevealed.length === 0 && user.consecutiveWins >= 2) { optimizationProb = Math.max(optimizationProb, 0.50); }
        }

        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            optimizationProb = g.riskLevel === 'EXTREME' ? 0.95 : 0.80;
            adjustmentLog = `GRID_REBALANCE`;
        }

        if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
            const safeIndex = cM.findIndex(m => !g.minesRevealed.includes(m)); 
            if (safeIndex !== -1) { 
                cM.splice(safeIndex, 1); cM.push(tileId);
                if(!adjustmentLog) adjustmentLog = 'DYNAMIC_GRID';
            } 
        }

        if (cM.includes(tileId)) {
            const neighbors = [tileId-1, tileId+1, tileId-5, tileId+5, tileId-6, tileId-4, tileId+6, tileId+4].filter(n => n >= 0 && n < 25 && n !== tileId);
            let minesToMove = cM.filter(m => m !== tileId); 
            let visualMines = [tileId]; 
            for (let m of minesToMove) {
                if (neighbors.length > 0 && Math.random() > 0.3) { const n = neighbors.pop(); visualMines.push(n); } 
                else { visualMines.push(m); }
            }
            cM = visualMines;
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: user.consecutiveLosses + 1, consecutiveWins: 0 });
            
            logGameResult('MINES', user.username, -g.bet, user.sessionProfit, g.riskLevel, adjustmentLog);
            await saveGameLog(user._id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog);
            return res.json({ outcome: 'BOMB', mines: cM, status: 'GAME_OVER', newBalance: user.balance });
        }
        
        g.minesRevealed.push(tileId); 
        const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        await User.updateOne({ _id: user._id }, { $set: { 'activeGame.minesRevealed': g.minesRevealed, 'activeGame.minesMultiplier': mult, 'activeGame.minesList': cM } });
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: user.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const minesCashout = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+activeGame.minesList');
        if(!user || user.activeGame.type !== 'MINES') return res.status(400).json({message:'Inv'});
        const g = user.activeGame; const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        await processTransaction(user._id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveWins: user.consecutiveWins + 1, consecutiveLosses: 0 });
        await saveGameLog(user._id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null);
        res.json({ success: true, profit, newBalance: (await User.findById(user._id)).balance, mines: g.minesList });
    } catch(e) { res.status(500).json({message:e.message}); }
};

// --- TIGER LOGIC ---
const tigerSpin = async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        let outcome = 'LOSS'; 
        const r = secureRandomFloat();
        let engineAdjustment = null;
        let chanceBigWin = 0.04; 
        let chanceSmallWin = 0.15; 

        if (risk.level === 'HIGH' || risk.level === 'EXTREME') {
            chanceBigWin = 0.0; chanceSmallWin = 0.12; 
            engineAdjustment = 'RTP_ADJUST_1';
        }

        const currentNet = user.balance - user.totalDeposits;
        if (currentNet > 0 && r < chanceBigWin) {
            outcome = 'SMALL_WIN'; engineAdjustment = 'RTP_ADJUST_2';
        } else if (r < chanceBigWin) {
            outcome = 'BIG_WIN';
        } else if (r < (chanceBigWin + chanceSmallWin)) {
            outcome = 'SMALL_WIN';
        }
        
        if (outcome === 'LOSS') {
           const engagementRoll = secureRandomFloat();
           if (engagementRoll < 0.50) {
               outcome = 'PARTIAL_RETURN'; engineAdjustment = 'RETENTION_MECH_A';
           } else {
               engineAdjustment = 'RETENTION_MECH_B';
           }
        }

        if (risk.triggers.includes('LATENCY_CRITICAL')) {
            outcome = 'LOSS'; engineAdjustment = 'SAFETY_STOP';
        }

        let win = 0, grid = [], lines = [], fs = false;
        
        if (outcome === 'BIG_WIN') { 
            const m = secureRandomFloat() < 0.1 ? 10 : 5; 
            win = amount * m; lines = [1]; 
            grid = ['orange', 'bag', 'statue', 'orange', 'wild', 'orange', 'jewel', 'firecracker', 'envelope']; 
            if (m === 10) { grid = Array(9).fill('wild'); lines = [0,1,2,3,4]; fs = true; } 
        } else if (outcome === 'SMALL_WIN') { 
            const m = (secureRandomInt(11, 20) / 10); 
            win = amount * m; lines = [1]; 
            grid = ['bag', 'firecracker', 'jewel', 'orange', 'orange', 'orange', 'envelope', 'statue', 'bag']; 
        } else if (outcome === 'PARTIAL_RETURN') {
            const m = 0.5; win = amount * m; lines = [1]; 
            grid = ['statue', 'bag', 'orange', 'envelope', 'envelope', 'envelope', 'firecracker', 'wild', 'jewel'];
        } else { 
            win = 0; const s = ['orange', 'bag', 'firecracker', 'envelope', 'statue', 'jewel']; 
            grid = []; for(let i=0; i<9; i++) grid.push(s[secureRandomInt(0, s.length)]); 
            grid[0] = 'wild'; grid[1] = 'wild'; grid[2] = 'orange'; 
            engineAdjustment = 'RETENTION_MECH_C';
        }
        
        if (win > 0) { 
            await processTransaction(user._id, win, 'WIN', 'TIGER'); 
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: amount, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } }); 
        } else { 
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: amount, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } }); 
        }
        
        logGameResult('TIGER', user.username, win - amount, user.sessionProfit, risk.level, engineAdjustment);
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, lines, isFullScreen: fs, outcome }, risk.level, engineAdjustment);
        
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: (await User.findById(user._id)).balance, publicSeed: crypto.createHash('sha256').update(generateSeed()).digest('hex') });
    } catch(e) { res.status(400).json({message: e.message}); }
};

const forfeitGame = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            const bet = user.activeGame.bet;
            await saveGameLog(user._id, user.activeGame.type, bet, 0, { result: 'FORFEIT' }, user.activeGame.riskLevel, 'TIMEOUT_AUTO_FOLD');
            await User.updateOne({ _id: user._id }, { 
                $set: { activeGame: { type: 'NONE' }, lastBetResult: 'LOSS', consecutiveWins: 0 },
                $inc: { consecutiveLosses: 1 }
            });
            logGameResult(user.activeGame.type, user.username, -bet, user.sessionProfit, 'NORMAL', 'TIMEOUT');
        }
        res.json({ success: true, newBalance: user.balance });
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
