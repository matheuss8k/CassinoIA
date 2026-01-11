
const { User } = require('../models');
const { saveGameLog, GameStateHelper, AchievementSystem } = require('../engine');
const { BlackjackEngine, BaccaratEngine, MinesEngine, TigerEngine } = require('../engine');

// --- HELPER: FORFEIT LOGIC (Shared) ---
const forfeitGame = async (req, res) => {
    try {
        await GameStateHelper.clear(req.user.id);
        const user = await User.findById(req.user.id);
        if (user.activeGame && user.activeGame.type !== 'NONE') {
            await saveGameLog(user._id, user.activeGame.type, user.activeGame.bet, 0, { result: 'FORFEIT' }, 'NORMAL', 'TIMEOUT');
            await User.updateOne({ _id: user._id }, { $set: { activeGame: { type: 'NONE' }, lastBetResult: 'LOSS' } });
            
            // Safe call to Achievement System
            if (AchievementSystem && typeof AchievementSystem.check === 'function') {
                AchievementSystem.check(user._id, { game: user.activeGame.type, bet: user.activeGame.bet, payout: 0 });
            }
        }
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { 
        console.error("Forfeit Error:", e);
        res.status(500).json({ message: e.message }); 
    }
};

// --- BACCARAT ---
const baccaratDeal = async (req, res) => {
    try {
        const { bets } = req.body; 
        const result = await BaccaratEngine.deal(req.user.id, bets);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- BLACKJACK ---
const blackjackDeal = async (req, res) => {
    try {
        const { amount, sideBets } = req.body;
        const result = await BlackjackEngine.deal(req.user.id, amount, sideBets);
        res.json(result);
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const blackjackHit = async (req, res) => {
    try {
        const result = await BlackjackEngine.hit(req.user.id);
        res.json(result);
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackStand = async (req, res) => {
    try {
        const result = await BlackjackEngine.stand(req.user.id);
        res.json(result);
    } catch(e) { res.status(500).json({message:e.message}); }
};

const blackjackInsurance = async (req, res) => {
    try {
        const { buyInsurance } = req.body;
        const result = await BlackjackEngine.insurance(req.user.id, buyInsurance);
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- MINES ---
const minesStart = async (req, res) => {
    try {
        const { amount, minesCount } = req.body;
        const result = await MinesEngine.start(req.user.id, amount, minesCount);
        res.json(result);
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const minesReveal = async (req, res) => {
    try {
        const { tileId } = req.body;
        const result = await MinesEngine.reveal(req.user.id, tileId);
        res.json(result);
    } catch(e) { res.status(500).json({message:e.message}); }
};

const minesCashout = async (req, res) => {
    try {
        const result = await MinesEngine.cashout(req.user.id);
        res.json(result);
    } catch(e) { res.status(500).json({message:e.message}); }
};

// --- TIGER ---
const tigerSpin = async (req, res) => {
    try {
        const { amount } = req.body;
        const result = await TigerEngine.spin(req.user.id, amount);
        res.json(result);
    } catch(e) { res.status(400).json({message: e.message}); }
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
