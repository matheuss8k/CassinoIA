
const { logEvent } = require('../../utils');

const calculateRisk = (user, currentBet) => {
    const balance = user.balance;
    let risk = 'NORMAL';
    let triggers = [];

    // 1. All-in Trap: Aposta > 90% da banca original
    const originalBalance = user.balance + currentBet;
    const betRatio = originalBalance > 0 ? (currentBet / originalBalance) : 0;
    
    if (betRatio >= 0.90) {
        return { level: 'EXTREME', triggers: ['ALL_IN_TRAP'] };
    }

    // 2. Sniper: Aumento de 5x na aposta comparado a anterior
    if (user.previousBet > 0 && currentBet >= (user.previousBet * 5)) {
        risk = 'EXTREME';
        triggers.push('SNIPER_PROTOCOL');
    }

    // 3. ROI Guard: Lucro Excessivo vs Depósitos
    const hasRealDeposits = user.totalDeposits > 10;
    const baseCapital = hasRealDeposits ? user.totalDeposits : Math.max(user.balance, 100); 
    
    // Cálculo de Lucro Líquido Total
    // Se é conta de teste (sem depósitos), assumimos lucro histórico 0 para não travar a conta imediatamente.
    const totalNetProfit = hasRealDeposits ? (user.balance - user.totalDeposits) : 0;

    const currentProfit = user.sessionProfit; // Lucro da sessão atual
    const totalProfitRatio = totalNetProfit / baseCapital;
    
    // Regras Estritas (15% de tolerância) - Ajustado conforme solicitado
    if (currentProfit > (baseCapital * 0.15) || totalProfitRatio > 0.15) {
        // Apenas ativa se o saldo for significativo (> 100 reais)
        if (user.balance > 100) {
            risk = 'EXTREME';
            triggers.push('ROI_GUARD');
        }
    }

    // 4. Kill Switch: 4 vitórias seguidas
    if (user.consecutiveWins >= 4) { 
        risk = 'EXTREME';
        triggers.push('KILL_SWITCH_STREAK');
    }

    // 5. Anti-Martingale: Dobra após derrota ou vitória
    if (user.previousBet > 0 && currentBet >= (user.previousBet * 1.95) && currentBet <= (user.previousBet * 2.1)) {
        risk = risk === 'EXTREME' ? 'EXTREME' : 'HIGH';
        triggers.push('MARTINGALE_DETECTED');
    }

    // Fallback: RTP Correction
    if (risk === 'NORMAL' && user.stats?.totalWagered > 500 && (user.stats?.totalWins / user.stats?.totalGames) > 0.65) {
        risk = 'HIGH';
        triggers.push('RTP_CORRECTION');
    }

    if (triggers.length > 0) {
        logEvent('METRIC', `User: ${user.username} | Load: ${risk} | Flags: [${triggers.join(', ')}]`);
    }

    return { level: risk, triggers };
};

module.exports = { calculateRisk };
