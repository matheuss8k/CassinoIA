
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
router.post('/user/avatar', authenticateToken, validateRequest(z.object({ avatarId: z.string() })), UserController.updateAvatar);
router.post('/user/verify', authenticateToken, UserController.verifyUser);
router.post('/store/purchase', authenticateToken, lockUserAction, validateRequest(z.object({ itemId: z.string(), cost: z.number().int().positive() })), UserController.purchaseItem);

// --- GAMES ---
router.post('/game/forfeit', authenticateToken, lockUserAction, GameController.forfeitGame);

// Blackjack
router.post('/blackjack/deal', authenticateToken, lockUserAction, validateRequest(BetSchema), GameController.blackjackDeal);
router.post('/blackjack/hit', authenticateToken, lockUserAction, GameController.blackjackHit);
router.post('/blackjack/stand', authenticateToken, lockUserAction, GameController.blackjackStand);
router.post('/blackjack/insurance', authenticateToken, lockUserAction, GameController.blackjackInsurance);

// Mines
router.post('/mines/start', authenticateToken, lockUserAction, validateRequest(MinesStartSchema), GameController.minesStart);
router.post('/mines/reveal', authenticateToken, lockUserAction, GameController.minesReveal);
router.post('/mines/cashout', authenticateToken, lockUserAction, GameController.minesCashout);

// Tiger
router.post('/tiger/spin', authenticateToken, lockUserAction, validateRequest(BetSchema), GameController.tigerSpin);

// Health
router.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

module.exports = router;
