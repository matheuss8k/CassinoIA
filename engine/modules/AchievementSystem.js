
const { User } = require('../../models');
const { logEvent } = require('../../utils');
const { statsBatcher } = require('./TransactionManager');

const AchievementSystem = {
    check: async (userId, gameContext) => {
        try {
            const user = await User.findById(userId);
            if (!user) return;

            const unlockedNow = [];
            const currentTrophies = user.unlockedTrophies || [];
            
            const unlock = (id) => {
                if (!currentTrophies.includes(id)) unlockedNow.push(id);
            };

            // Contexto de Jogo vs Contexto de Depósito
            if (gameContext.game === 'DEPOSIT') {
                unlock('first_deposit');
                if (user.totalDeposits >= 1000) unlock('whale');
            } else {
                // Lógica de Jogo
                const profit = gameContext.payout - gameContext.bet;
                const isWin = profit > 0;
                const multiplier = gameContext.bet > 0 ? (gameContext.payout / gameContext.bet) : 0;

                // Trophy Logic Generic
                if (isWin) unlock('first_win');
                if (gameContext.bet >= 500) unlock('high_roller');
                
                // Stats Checks
                if ((user.stats?.totalGames || 0) + 1 >= 50) unlock('club_50');
                if ((user.stats?.totalGames || 0) + 1 >= 30) unlock('loyal_player');
                if (user.balance + profit >= 5000) unlock('rich_club');
                if (user.consecutiveWins >= 10) unlock('unbeatable');
                if (gameContext.payout >= 200) unlock('heavy_hitter');
                if (gameContext.extra?.lossStreakBroken && gameContext.extra?.previousLosses >= 3) {
                    unlock('phoenix');
                }

                // MINES SPECIFIC
                if (gameContext.game === 'MINES') {
                    if (gameContext.extra?.revealedCount >= 20) unlock('sniper');
                    if (gameContext.extra?.multiplier >= 10) unlock('mines_surgeon');
                }

                // TIGER SPECIFIC
                if (gameContext.game === 'TIGER') {
                    if (multiplier >= 50) unlock('multiplier_king');
                    if (gameContext.extra?.isFullScreen) unlock('tiger_gold');
                }

                // BLACKJACK SPECIFIC
                if (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) {
                    if ((user.stats?.totalBlackjacks || 0) + 1 >= 10) unlock('bj_master');
                }

                // BACCARAT SPECIFIC
                // Simplificado: Apenas 5 vitórias seguidas no Baccarat
                if (gameContext.game === 'BACCARAT' && isWin) {
                    if ((user.consecutiveWins || 0) >= 5) unlock('bacc_king');
                }

                // Stats Update
                const statsIncrements = {
                    'stats.totalGames': 1,
                    'stats.totalWagered': gameContext.bet,
                    'stats.totalWonAmount': gameContext.payout, // UPDATED: Track payouts for ROI calc
                    'stats.totalWins': isWin ? 1 : 0,
                    'stats.totalBlackjacks': (gameContext.game === 'BLACKJACK' && gameContext.extra?.isBlackjack) ? 1 : 0
                };
                
                statsBatcher.add(userId, statsIncrements);

                // High score update
                if (profit > (user.stats?.highestWin || 0)) {
                    await User.updateOne({ _id: userId }, { $set: { 'stats.highestWin': profit } });
                }
            }

            // Immediate Unlock DB Write
            if (unlockedNow.length > 0) {
                await User.updateOne({ _id: userId }, { $addToSet: { unlockedTrophies: { $each: unlockedNow } } });
                logEvent('METRIC', `🏆 Achievement Unlocked: ${unlockedNow.join(', ')} for ${user.username}`);
            }

            return unlockedNow;

        } catch (e) {
            console.error("Achievement Check Error:", e);
        }
    }
};

module.exports = { AchievementSystem };
