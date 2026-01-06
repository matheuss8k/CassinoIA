
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
const VERSION = '4.9.5'; // HTTPS Redirect Tuned

// --- CACHE HTML ---
let cachedIndexHtml = null;
const indexPath = path.join(__dirname, 'dist', 'index.html');
try {
    if (fs.existsSync(indexPath)) cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
} catch (e) { }

// --- CONFIG ---
// Trust Proxy: Definido como true para confiar em proxies (Cloudflare/Nginx/Heroku)
// Isso garante que req.protocol e req.hostname reflitam a requisição original do usuário.
app.set('trust proxy', true);

// Middleware: Redirecionamento HTTPS Simples
app.use((req, res, next) => {
    // 1. Verificar Domínio de Produção
    // Evita redirecionar em localhost ou IPs internos
    if (req.hostname.includes('cassinoia.com')) {
        // 2. Verificar Protocolo
        // 'x-forwarded-proto' é o padrão da indústria vindo de Load Balancers
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        
        if (protocol === 'http') {
            // Redirecionamento 301 (Moved Permanently) para a versão HTTPS
            return res.redirect(301, `https://${req.hostname}${req.url}`);
        }
    }
    next();
});

app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    res.removeHeader('X-Powered-By'); 
    
    // Configuração de Segurança (CSP)
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.transparenttextures.com; connect-src 'self'`);
    
    // Nota: HSTS removido conforme solicitação ("não precisa forçar")
    // Isso permite flexibilidade no certificado sem bloquear navegadores por longo prazo.
    
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

    server.keepAliveTimeout = 61000;
    server.headersTimeout = 65000;

    server.on('error', (e) => { 
        if (e.code === 'EADDRINUSE') { process.exit(1); } else { throw e; }
    });
};
startServer();
