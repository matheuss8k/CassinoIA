
const mongoose = require('mongoose');
const { User, GameSession, Transaction } = require('../models');
const { processTransaction, AchievementSystem, MissionSystem } = require('../engine');
const { STORE_ITEMS, logEvent, generateHash } = require('../utils');

const getBalance = async (req, res) => {
    const { newBalance } = req.body; 
    const user = await User.findById(req.user.id);
    if (!user) return res.sendStatus(404);
    
    const diff = newBalance - user.balance;
    if (diff === 0) return res.json({ success: true });
    
    try {
        const type = diff > 0 ? 'DEPOSIT' : 'WITHDRAW';
        await processTransaction(user._id, diff, type, 'WALLET', `MANUAL_${Date.now()}`);
        
        // CHECK DEPOSIT ACHIEVEMENTS (SAFE)
        if (type === 'DEPOSIT' && AchievementSystem?.check) {
            await AchievementSystem.check(user._id, { game: 'DEPOSIT', amount: diff }).catch(e => console.error(e));
        }

        res.json({ success: true });
    } catch(e) { res.status(400).json({ message: e.message }); }
};

const syncUser = async (req, res) => {
    // PERFORMANCE AGGREGATION (BFF Pattern)
    // Fetch User and Session in parallel for speed
    const [userFetch, session] = await Promise.all([
        User.findById(req.user.id),
        GameSession.findOne({ userId: req.user.id }).lean()
    ]);

    if (!userFetch) return res.sendStatus(404);

    // --- MISSION DAILY CHECK ---
    // A função ensureDailySync agora retorna as missões atualizadas
    const syncedMissions = await MissionSystem.ensureDailySync(userFetch);
    
    // Normalize User Object
    const user = userFetch.toObject ? userFetch.toObject() : userFetch;
    
    // Garante que o frontend receba a versão mais recente das missões (pós-reset, se houve)
    user.missions = syncedMissions;
    
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
        
        await user.save();
        
        res.json({ success: true, newPoints: user.loyaltyPoints, ownedItems: user.ownedItems });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// --- BANKING GRADE CLAIM MISSION ---
// Atomicidade e Auditoria Completa
const claimMission = async (req, res) => {
    let session = null;
    try {
        const { missionId } = req.body;
        const userId = req.user.id;

        // 1. Inicia Transação ACID (MongoDB Session)
        session = await mongoose.startSession();
        session.startTransaction();

        // 2. Leitura inicial (dentro da sessão) para validar existência
        const userCheck = await User.findById(userId).session(session);
        if (!userCheck) {
            await session.abortTransaction();
            return res.sendStatus(404);
        }

        const missionIndex = userCheck.missions.findIndex(m => String(m.id) === String(missionId));
        if (missionIndex === -1) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Missão não encontrada." });
        }

        const mission = userCheck.missions[missionIndex];

        // Validações de Regra de Negócio (Redundância de segurança)
        if (!mission.completed) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Missão incompleta." });
        }
        if (mission.claimed) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Recompensa já resgatada." });
        }

        const rewardPoints = mission.rewardPoints;

        // 3. Atualização Atômica (Optimistic Locking via Query)
        // Substitui o user.save() que poderia sobrescrever saldo em condição de corrida.
        // A condição 'missions.$.claimed: false' garante que só atualiza se ainda não foi clamado.
        const updatedUser = await User.findOneAndUpdate(
            { 
                _id: userId, 
                missions: { 
                    $elemMatch: { 
                        id: missionId, 
                        completed: true, 
                        claimed: false 
                    } 
                } 
            },
            {
                $set: { "missions.$.claimed": true },
                $inc: { loyaltyPoints: rewardPoints }
            },
            { new: true, session }
        );

        if (!updatedUser) {
            // Se falhou aqui, foi Race Condition (já clamado por outro request paralelo)
            await session.abortTransaction();
            return res.status(409).json({ message: "Operação conflitante. Tente novamente." });
        }

        // 4. Geração de Log Financeiro (Audit Trail)
        // Insere registro na tabela Transaction para auditoria de pontos.
        const lastTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 }).session(session).lean();
        const prevHash = lastTx ? lastTx.integrityHash : 'GENESIS';
        
        const txData = { 
            userId, 
            type: 'MISSION_REWARD', 
            currency: 'POINTS', // Campo novo para diferenciar de dinheiro real
            amount: rewardPoints, 
            balanceAfter: updatedUser.loyaltyPoints, // Neste contexto, saldo é pontos
            game: 'MISSION', 
            referenceId: missionId, 
            timestamp: new Date().toISOString() 
        };
        const integrityHash = generateHash({ ...txData, prevHash });

        await Transaction.create([{ ...txData, integrityHash }], { session });

        // 5. Commit da Transação
        await session.commitTransaction();

        logEvent('METRIC', `🎁 Mission Reward Claimed: ${mission.description} (+${rewardPoints} pts) by ${updatedUser.username}`);

        res.json({ 
            success: true, 
            newPoints: updatedUser.loyaltyPoints, 
            missions: updatedUser.missions 
        });

    } catch (e) {
        if (session) await session.abortTransaction();
        console.error("Claim Transaction Error:", e);
        res.status(500).json({ message: "Erro interno seguro ao processar resgate." });
    } finally {
        if (session) session.endSession();
    }
};

module.exports = { getBalance, syncUser, toggleFavorite, equipItem, verifyUser, purchaseItem, getStore, claimMission };
