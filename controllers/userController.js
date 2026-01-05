
const { User } = require('../models');
const { processTransaction, GameStateManager, UserCache } = require('../engine');
const { sanitizeUser } = require('./authController');

const getBalance = async (req, res) => {
    const { newBalance } = req.body; 
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    const diff = newBalance - user.balance;
    if (diff === 0) return res.json({ success: true });
    try {
        await processTransaction(user._id, diff, diff > 0 ? 'DEPOSIT' : 'WITHDRAW', 'WALLET', `MANUAL_${Date.now()}`);
        res.json({ success: true });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const syncUser = async (req, res) => {
    // PERFORMANCE: .lean() returns a plain JS object, skipping Mongoose hydration overhead.
    // This is crucial for the most frequently called endpoint.
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.sendStatus(404);
    
    // Manual ID adjustment because lean() doesn't convert _id to id automatically like toObject()
    user.id = user._id;
    delete user._id;
    delete user.__v;
    delete user.password;
    delete user.refreshToken;
    
    let userData = user; // sanitizeUser supports plain objects too

    // MERGE REDIS STATE
    try {
        const redisState = await GameStateManager.get(req.user.id);
        if (redisState) {
            // SECURITY: Sanitize sensitive data before sending to client
            // Never expose serverSeed, full deck, or mine locations
            const safeState = { ...redisState };
            delete safeState.serverSeed;
            delete safeState.bjDeck;
            delete safeState.minesList;
            
            userData.activeGame = safeState;
        }
        // CACHE BALANCE SYNC
        const cachedBalance = await UserCache.getBalance(req.user.id);
        // If Redis has a newer balance, send that (Display purposes)
        if (cachedBalance !== undefined && cachedBalance !== userData.balance) {
             userData.balance = cachedBalance;
        } else if (cachedBalance === 0 && userData.balance > 0) {
            // Edge case: Populate cache if empty but DB has funds
            await UserCache.setBalance(req.user.id, userData.balance);
        }
    } catch (e) { console.warn("Redis sync skip"); }

    res.json(userData);
};

const updateAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (req.body.avatarId.startsWith('avatar_') && !user.ownedItems.includes(req.body.avatarId)) return res.status(403).json({ message: 'Locked' });
        user.avatarId = req.body.avatarId; await user.save();
        res.json({ success: true, avatarId: user.avatarId });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

const verifyUser = async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { documentsStatus: 'PENDING' });
    res.json({ success: true });
};

const purchaseItem = async (req, res) => {
    try {
        const { itemId, cost } = req.body;
        const user = await User.findById(req.user.id);
        if (user.loyaltyPoints < cost) return res.status(400).json({ message: 'Insufficient Points.' });
        if (user.ownedItems.includes(itemId)) return res.status(400).json({ message: 'Owned.' });
        user.loyaltyPoints -= cost; user.ownedItems.push(itemId);
        if (itemId.startsWith('avatar_')) user.avatarId = itemId;
        await user.save();
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = { getBalance, syncUser, updateAvatar, verifyUser, purchaseItem };
