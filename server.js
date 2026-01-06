
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { connectDB } = require('./config');
const { mongoSanitize, compressionMiddleware, createRateLimiter } = require('./middleware');
const routes = require('./routes');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '4.9.1'; // Backend Version Optimized & Audited

// --- CACHE HTML ---
let cachedIndexHtml = null;
const indexPath = path.join(__dirname, 'dist', 'index.html');
try {
    if (fs.existsSync(indexPath)) cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
} catch (e) { }

// --- CONFIG ---
app.set('trust proxy', 1);
app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    res.removeHeader('X-Powered-By'); 
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.transparenttextures.com; connect-src 'self'`);
    // HTTP Keep-Alive Header explicit
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=60');
    next();
});

app.use(cors({ 
    origin: process.env.FRONTEND_URL || true, 
    credentials: true, 
    allowedHeaders: ['Content-Type', 'Authorization', 'x-client-version'] 
}));

app.use(createRateLimiter({ windowMs: 60000, max: 300 })); 
app.use(cookieParser());
app.use(express.json({ limit: '10kb' })); 
app.use(mongoSanitize); 
app.use(compressionMiddleware);

// --- ROUTES ---
app.use('/api', routes);

// --- FRONTEND SERVE ---
app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => { 
    if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Not Found' });
    if (cachedIndexHtml) {
        res.setHeader('Cache-Control', 'no-store'); 
        res.setHeader('Content-Type', 'text/html');
        res.send(cachedIndexHtml.replace(/__NONCE__/g, res.locals.nonce));
    } else res.status(500).send("Init...");
});

// --- START ---
const startServer = async () => { 
    await connectDB(); 
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 System (${VERSION}) Active`);
    });

    // --- OPTIMIZATION: HTTP KEEP-ALIVE TUNING ---
    // Ensure Node.js keeps connections open longer than the Load Balancer (typically 60s)
    // allowing the browser to reuse the TCP connection for multiple bets.
    server.keepAliveTimeout = 61000; // 61 seconds
    server.headersTimeout = 65000; // 65 seconds

    server.on('error', (e) => { 
        if (e.code === 'EADDRINUSE') { process.exit(1); } else { throw e; }
    });
};
startServer();
