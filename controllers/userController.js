
const { User } = require('../models');
const { processTransaction } = require('../engine');
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
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    res.json(sanitizeUser(await User.findById(req.user.id)));
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
