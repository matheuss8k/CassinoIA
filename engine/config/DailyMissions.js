
const crypto = require('crypto');

// Pool de Missões Possíveis
// Tipos suportados: 'BET_TOTAL', 'WIN_TOTAL', 'BLACKJACK_WIN', 'MINES_WIN', 'TIGER_WIN', 'BACCARAT_WIN'
const MISSION_POOL = [
    { id: 'daily_bet_1', type: 'BET_TOTAL', target: 50, rewardPoints: 100, description: 'Aposte um total de R$ 50,00' },
    { id: 'daily_bet_2', type: 'BET_TOTAL', target: 200, rewardPoints: 250, description: 'Aposte um total de R$ 200,00' },
    { id: 'daily_win_1', type: 'WIN_TOTAL', target: 100, rewardPoints: 150, description: 'Obtenha R$ 100,00 em lucros' },
    
    { id: 'bj_rounds_1', type: 'BLACKJACK_WIN', target: 5, rewardPoints: 200, description: 'Vença 5 rodadas no Blackjack' },
    { id: 'bj_natural', type: 'BLACKJACK_NATURAL', target: 1, rewardPoints: 300, description: 'Consiga 1 Blackjack Natural (21)' },
    
    { id: 'mines_safe', type: 'MINES_WIN', target: 10, rewardPoints: 150, description: 'Vença 10 rodadas no Mines' },
    { id: 'mines_high', type: 'MINES_MULTIPLIER', target: 3, rewardPoints: 400, description: 'Acerte um multiplicador 3x no Mines' },
    
    { id: 'tiger_spin', type: 'TIGER_WIN', target: 20, rewardPoints: 200, description: 'Ganhe 20 vezes no Tigrinho' },
    { id: 'tiger_big', type: 'TIGER_BIG_WIN', target: 1, rewardPoints: 500, description: 'Consiga um Big Win no Tigrinho' },
    
    { id: 'bacc_rounds', type: 'BACCARAT_WIN', target: 5, rewardPoints: 200, description: 'Vença 5 rodadas de Baccarat' }
];

// Gerador Determinístico Diário
// Baseado na data (YYYY-MM-DD), gera sempre os mesmos índices para todos os usuários.
const getDailyMissionsTemplate = () => {
    const today = new Date().toISOString().split('T')[0]; // "2024-01-30"
    
    // Cria um hash da data para usar como semente aleatória
    const hash = crypto.createHash('sha256').update(today).digest('hex');
    
    // Converte partes do hash em números para selecionar missões
    const seed1 = parseInt(hash.substring(0, 8), 16);
    const seed2 = parseInt(hash.substring(8, 16), 16);
    const seed3 = parseInt(hash.substring(16, 24), 16);
    
    // Seleciona 3 missões distintas usando módulo
    const m1 = MISSION_POOL[seed1 % MISSION_POOL.length];
    
    let pool2 = MISSION_POOL.filter(m => m.id !== m1.id);
    const m2 = pool2[seed2 % pool2.length];
    
    let pool3 = pool2.filter(m => m.id !== m2.id);
    const m3 = pool3[seed3 % pool3.length];

    // Retorna estrutura pronta para o User Model
    return [m1, m2, m3].map(m => ({
        id: m.id,
        type: m.type,
        description: m.description,
        target: m.target,
        current: 0,
        rewardPoints: m.rewardPoints,
        completed: false
    }));
};

module.exports = { getDailyMissionsTemplate };
