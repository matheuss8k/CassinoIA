
const express = require('express');
const router = express.Router();
const { 
    dbCheck, 
    authenticateToken, 
    lockUserAction, 
    validateRequest 
} = require('./middleware');

const { 
    LoginSchema, 
    RegisterSchema, 
    BetSchema, 
    MinesStartSchema 
} = require('./utils');

const AuthController = require('./controllers/authController');
const UserController = require('./controllers/userController');
const GameController = require('./controllers/gameController');
const { z } = require('zod');

// --- AUTH ---
router.post('/login', dbCheck, validateRequest(LoginSchema), AuthController.login);
router.post('/register', dbCheck, validateRequest(RegisterSchema), AuthController.register);
router.post('/refresh', dbCheck, AuthController.refresh);
router.post('/logout', dbCheck, AuthController.logout);

// --- USER ---
router.post('/balance', authenticateToken, lockUserAction, UserController.getBalance);
router.post('/user/sync', authenticateToken, UserController.syncUser);
router.post('/user/favorite', authenticateToken, validateRequest(z.object({ gameId: z.string() })), UserController.toggleFavorite);
// Updated to generic Equip endpoint
router.post('/user/equip', authenticateToken, validateRequest(z.object({ itemId: z.string(), type: z.enum(['avatar', 'frame']) })), UserController.equipItem);
router.post('/user/verify', authenticateToken, UserController.verifyUser);
router.get('/store', authenticateToken, UserController.getStore); 
router.post('/store/purchase', authenticateToken, lockUserAction, validateRequest(z.object({ itemId: z.string(), cost: z.number().int().positive() })), UserController.purchaseItem);

// --- GAMES ---
router.post('/game/forfeit', authenticateToken, lockUserAction, GameController.forfeitGame);

// Blackjack
router.post('/blackjack/deal', authenticateToken, lockUserAction, validateRequest(BetSchema), GameController.blackjackDeal);
router.post('/blackjack/hit', authenticateToken, lockUserAction, GameController.blackjackHit);
router.post('/blackjack/stand', authenticateToken, lockUserAction, GameController.blackjackStand);
router.post('/blackjack/insurance', authenticateToken, lockUserAction, GameController.blackjackInsurance);

// Baccarat
router.post('/baccarat/deal', authenticateToken, lockUserAction, validateRequest(z.object({
    bets: z.object({
        PLAYER: z.number().min(0).optional(),
        BANKER: z.number().min(0).optional(),
        TIE: z.number().min(0).optional(),
        PAIR_PLAYER: z.number().min(0).optional(),
        PAIR_BANKER: z.number().min(0).optional()
    })
})), GameController.baccaratDeal);

// Mines
router.post('/mines/start', authenticateToken, lockUserAction, validateRequest(MinesStartSchema), GameController.minesStart);
router.post('/mines/reveal', authenticateToken, lockUserAction, GameController.minesReveal);
router.post('/mines/cashout', authenticateToken, lockUserAction, GameController.minesCashout);

// Tiger
router.post('/tiger/spin', authenticateToken, lockUserAction, validateRequest(BetSchema), GameController.tigerSpin);

// Health
router.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

module.exports = router;
