
const { User, GameSession } = require('../models');
const { processTransaction, AchievementSystem } = require('../engine');
const { STORE_ITEMS } = require('../utils');

const getBalance = async (req, res) => {
    const { newBalance } = req.body; 
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    
    const diff = newBalance - user.balance;
    if (diff === 0) return res.json({ success: true });
    
    try {
        const type = diff > 0 ? 'DEPOSIT' : 'WITHDRAW';
        await processTransaction(user._id, diff, type, 'WALLET', `MANUAL_${Date.now()}`);
        
        // CHECK DEPOSIT ACHIEVEMENTS
        if (type === 'DEPOSIT') {
            const newTrophies = await AchievementSystem.check(user._id, { game: 'DEPOSIT', amount: diff });
            // Se houver troféus, o frontend os pegará na próxima sincronização ou via websocket (se houvesse)
            // Aqui apenas garantimos que o banco foi atualizado.
        }

        res.json({ success: true });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const syncUser = async (req, res) => {
    // PERFORMANCE AGGREGATION (BFF Pattern)
    // Fetch User and Session in parallel for speed
    const [user, session] = await Promise.all([
        User.findById(req.user.id).lean(),
        GameSession.findOne({ userId: req.user.id }).lean()
    ]);

    if (!user) return res.sendStatus(404);
    
    // Normalize User Object
    user.id = user._id;
    delete user._id;
    delete user.__v;
    delete user.password;
    delete user.refreshToken;
    
    // Default values if missing (migration safety)
    if (!user.frameId) user.frameId = 'frame_1';
    if (!user.favorites) user.favorites = [];

    // Inject Active Game Session
    if (session) {
        const safeState = { ...session };
        delete safeState._id;
        delete safeState.__v;
        delete safeState.userId;
        delete safeState.serverSeed; // Security: Never send server seed
        delete safeState.bjDeck;     // Security: Never send full deck
        delete safeState.minesList;  // Security: Never send mine locations
        user.activeGame = safeState;
    } else {
        user.activeGame = { type: 'NONE' };
    }

    res.json(user);
};

const toggleFavorite = async (req, res) => {
    try {
        const { gameId } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.sendStatus(404);

        if (!user.favorites) user.favorites = [];

        const idx = user.favorites.indexOf(gameId);
        if (idx > -1) {
            user.favorites.splice(idx, 1); // Remove
        } else {
            user.favorites.push(gameId); // Add
        }

        await user.save();
        res.json({ success: true, favorites: user.favorites });
    } catch (e) {
        res.status(500).json({ message: "Error updating favorites" });
    }
};

const equipItem = async (req, res) => {
    try {
        const { itemId, type } = req.body; // type: 'avatar' | 'frame'
        const user = await User.findById(req.user.id);
        
        // Basic Items (Free) don't need ownership check
        const isFreeAvatar = ['1', '2', '3', '4', '5', '6', '7', '8'].includes(itemId);
        const isFreeFrame = itemId === 'frame_1';

        if (!isFreeAvatar && !isFreeFrame && !user.ownedItems.includes(itemId)) {
             return res.status(403).json({ message: 'Item bloqueado. Adquira na loja.' });
        }
        
        if (type === 'avatar') user.avatarId = itemId;
        else if (type === 'frame') user.frameId = itemId;
        else return res.status(400).json({ message: 'Tipo inválido.' });

        await user.save();
        res.json({ success: true, avatarId: user.avatarId, frameId: user.frameId });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

const verifyUser = async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { documentsStatus: 'PENDING' });
    res.json({ success: true });
};

const getStore = async (req, res) => {
    res.json(STORE_ITEMS);
};

const purchaseItem = async (req, res) => {
    try {
        const { itemId, cost } = req.body;
        const item = STORE_ITEMS.find(i => i.id === itemId);
        if (!item) return res.status(400).json({ message: "Item not found." });
        if (item.cost !== cost) return res.status(400).json({ message: "Price mismatch." });

        const user = await User.findById(req.user.id);
        if (user.loyaltyPoints < cost) return res.status(400).json({ message: 'Pontos insuficientes.' });
        if (user.ownedItems.includes(itemId)) return res.status(400).json({ message: 'Item já adquirido.' });
        
        user.loyaltyPoints -= cost; 
        user.ownedItems.push(itemId);
        
        // Auto-equip if requested or if logic dictates (omitted for now, user equips manually)
        
        await user.save();
        
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = { getBalance, syncUser, toggleFavorite, equipItem, verifyUser, purchaseItem, getStore };
