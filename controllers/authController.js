
const jwt = require('jsonwebtoken');
const { User, GameSession } = require('../models');
const { verifyPassword, hashPassword } = require('../utils');
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../middleware');
const { IS_PRODUCTION } = require('../config');

// Helper to assemble user object for response
const assembleUserResponse = async (userDoc) => {
    const u = userDoc.toObject ? userDoc.toObject() : userDoc;
    delete u.password;
    delete u.refreshToken;
    delete u.__v;
    u.id = u._id;
    delete u._id;

    // Fetch active session if exists
    const session = await GameSession.findOne({ userId: u.id }).lean();
    if (session) {
        const safeState = { ...session };
        delete safeState._id;
        delete safeState.userId;
        delete safeState.__v;
        delete safeState.serverSeed;
        delete safeState.bjDeck;
        delete safeState.minesList;
        u.activeGame = safeState;
    } else {
        u.activeGame = { type: 'NONE' };
    }
    return u;
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const start = Date.now();
    const user = await User.findOne({ $or: [ { username: new RegExp(`^${username}$`, 'i') }, { email: new RegExp(`^${username}$`, 'i') } ] }).select('+password');
    const valid = user && await verifyPassword(password, user.password);
    
    const elapsed = Date.now() - start;
    if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed));

    if (valid) {
        const v = (user.tokenVersion || 0) + 1;
        // Note: activeGame is no longer on User, so we don't need to clear it here. 
        // Logic handled by GameSession existence.
        
        await User.updateOne({ _id: user._id }, { tokenVersion: v });
        
        const at = jwt.sign({ id: user._id, username: user.username, tokenVersion: v }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        const rt = jwt.sign({ id: user._id, tokenVersion: v }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        await User.updateOne({ _id: user._id }, { refreshToken: rt });
        
        res.cookie('jwt', rt, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        
        const userData = await assembleUserResponse(user);
        return res.json({ accessToken: at, ...userData });
    }
    res.status(401).json({ message: 'Invalid Credentials.' });
  } catch (error) { res.status(500).json({ message: 'Internal Error.' }); }
};

const register = async (req, res) => {
  try {
    const { fullName, username, email, cpf, birthDate, password } = req.body;
    if (await User.findOne({ $or: [{ username }, { email }] })) return res.status(400).json({ message: 'User exists.' });
    
    const user = await User.create({ fullName, username, email, cpf, birthDate, password: await hashPassword(password), missions: [], tokenVersion: 1 });
    
    const at = jwt.sign({ id: user._id, username: user.username, tokenVersion: 1 }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const rt = jwt.sign({ id: user._id, tokenVersion: 1 }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    
    user.refreshToken = rt; 
    await user.save();
    
    res.cookie('jwt', rt, { httpOnly: true, secure: IS_PRODUCTION, sameSite: IS_PRODUCTION ? 'None' : 'Lax' });
    
    // New user has no game session
    const userData = user.toObject();
    userData.id = userData._id;
    delete userData._id; delete userData.password; delete userData.refreshToken; delete userData.__v;
    userData.activeGame = { type: 'NONE' };

    res.status(201).json({ accessToken: at, ...userData });
  } catch (error) { res.status(500).json({ message: 'Create Error.' }); }
};

const refresh = async (req, res) => {
    const c = req.cookies; if (!c?.jwt) return res.json({ accessToken: null });
    const u = await User.findOne({ refreshToken: c.jwt });
    if (!u) { res.clearCookie('jwt'); return res.json({ accessToken: null }); }
    jwt.verify(c.jwt, REFRESH_TOKEN_SECRET, (err, dec) => {
        if (err || u.id !== dec.id || u.tokenVersion !== dec.tokenVersion) { res.clearCookie('jwt'); return res.json({ accessToken: null }); }
        res.json({ accessToken: jwt.sign({ id: u._id, username: u.username, tokenVersion: u.tokenVersion }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }) });
    });
};

const logout = async (req, res) => {
    if (req.cookies?.jwt) await User.updateOne({ refreshToken: req.cookies.jwt }, { refreshToken: '', $inc: { tokenVersion: 1 } });
    res.clearCookie('jwt'); res.sendStatus(204);
};

module.exports = { login, register, refresh, logout }; // Removed export sanitizeUser as it's local now
