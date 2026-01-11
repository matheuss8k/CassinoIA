
const { User } = require('../../models');
const { getDailyMissionsTemplate } = require('../config/DailyMissions');
const { logEvent } = require('../../utils');

class MissionSystem {
    
    /**
     * Garante que o usuário tenha as missões corretas do dia.
     * Salva no banco imediatamente se houver mudanças (usado no Login/F5).
     */
    static async ensureDailySync(user) {
        const today = new Date().toISOString().split('T')[0];
        
        // Se user.missions for undefined ou null, inicializa
        let currentMissions = user.missions ? JSON.parse(JSON.stringify(user.missions)) : [];
        let dirty = false;

        // VERIFICAÇÃO 1: Reset Diário ou Missões Inexistentes
        if (user.lastDailyReset !== today || currentMissions.length === 0) {
            currentMissions = getDailyMissionsTemplate();
            dirty = true;
            logEvent('METRIC', `📅 Daily Missions Reset for ${user.username}`);
        } else {
            // VERIFICAÇÃO 2: Integridade (Anti-Manual Tampering)
            // Se o usuário zerou manualmente no DB (current=0) mas esqueceu de tirar completed=true,
            // ou se a missão está num estado impossível.
            let fixedCount = 0;
            currentMissions = currentMissions.map(m => {
                // Se está marcado como completo, mas o progresso é zero ou menor que o alvo,
                // assume que foi resetado manualmente e corrige o status.
                if (m.completed && m.current < m.target) {
                    m.completed = false;
                    m.claimed = false;
                    fixedCount++;
                }
                // Garante que current nunca seja NaN ou null
                if (isNaN(m.current)) m.current = 0;
                
                // Garante que o campo claimed exista (migração)
                if (m.completed && m.claimed === undefined) m.claimed = true; // Assume claimed para missões antigas
                if (!m.completed) m.claimed = false;

                return m;
            });
            
            if (fixedCount > 0) {
                dirty = true;
                logEvent('AUDIT', `🔧 Auto-fixed ${fixedCount} broken missions for ${user.username}`);
            }
        }

        // Aplica mudanças no objeto local E no banco se necessário
        if (dirty) {
            // Atualiza referência local se possível (para retorno imediato na API)
            if(user.set) {
                user.set('lastDailyReset', today);
                user.set('missions', currentMissions);
            } else {
                user.lastDailyReset = today;
                user.missions = currentMissions;
            }

            if (user._id) {
                await User.updateOne(
                    { _id: user._id }, 
                    { 
                        $set: { 
                            missions: currentMissions, 
                            lastDailyReset: today 
                        } 
                    }
                );
            }
        }
        
        return currentMissions;
    }

    /**
     * Atualiza o progresso, lida com o reset diário internamente e salva tudo em uma única operação.
     * Usado durante o jogo (Bet/Win).
     */
    static async updateProgress(userId, eventData) {
        let activeMissions = [];
        try {
            // 1. Busca estado atual com LEAN para performance
            const user = await User.findById(userId).select('missions lastDailyReset username loyaltyPoints').lean();
            if (!user) return { completedMissions: [], allMissions: [] };

            const today = new Date().toISOString().split('T')[0];
            activeMissions = user.missions || [];
            let isReset = false;

            // 2. Lógica de Reset (Inline) - Se dados estiverem corrompidos ou dia mudou
            if (user.lastDailyReset !== today || activeMissions.length === 0) {
                activeMissions = getDailyMissionsTemplate();
                isReset = true;
                if (user.lastDailyReset) {
                    logEvent('METRIC', `📅 Daily Missions Reset for ${user.username} (Triggered by Action)`);
                }
            }

            // 3. Cálculo de Progresso
            let hasProgressUpdate = false;
            // REMOVIDO: let pointsToAdd = 0; // Pontos agora são dados apenas no CLAIM manual
            const completedNow = [];
            
            // Mapeia o array
            const updatedMissions = activeMissions.map(mission => {
                // Se já completou, ignora
                if (mission.completed) return mission;

                let delta = 0;

                // Matcher de Eventos
                if (mission.type === 'BET_TOTAL' && eventData.type === 'BET') {
                    delta = eventData.amount;
                } else if (mission.type === 'WIN_TOTAL' && eventData.type === 'WIN') {
                    delta = eventData.amount;
                } else if (mission.type === eventData.gameEvent) {
                    delta = eventData.value || 1;
                }

                if (delta > 0) {
                    hasProgressUpdate = true;
                    // Garante conversão numérica segura
                    const currentVal = parseFloat(mission.current || 0);
                    const newVal = currentVal + delta;
                    
                    // Cria novo objeto para não mutar referência se algo falhar
                    const newMissionState = { ...mission, current: newVal };

                    // Verifica conclusão
                    if (newVal >= mission.target) {
                        newMissionState.current = mission.target; // Trava visual no máximo
                        newMissionState.completed = true;
                        newMissionState.claimed = false; // Exige ação do usuário
                        
                        // REMOVIDO: pointsToAdd += mission.rewardPoints;
                        
                        completedNow.push({
                            id: mission.id,
                            description: mission.description,
                            reward: mission.rewardPoints
                        });
                        
                        logEvent('METRIC', `🎯 Mission Goal Reached (Unclaimed): ${mission.description} (${user.username})`);
                    }
                    return newMissionState;
                }
                
                return mission;
            });

            // 4. Monta Query de Update Única (Atômica)
            const updateSet = {};
            // REMOVIDO: const updateInc = {};

            if (isReset) {
                updateSet.lastDailyReset = today;
                updateSet.missions = updatedMissions; 
            } else if (hasProgressUpdate || isReset) { // Salva se houve progresso ou correção
                updateSet.missions = updatedMissions;
            }

            // REMOVIDO: if (pointsToAdd > 0) { updateInc.loyaltyPoints = pointsToAdd; }

            // Executa no Banco
            if (Object.keys(updateSet).length > 0) {
                const updateQuery = {};
                if (Object.keys(updateSet).length > 0) updateQuery.$set = updateSet;
                // REMOVIDO: if (Object.keys(updateInc).length > 0) updateQuery.$inc = updateInc;

                await User.updateOne({ _id: userId }, updateQuery);
            }

            // 5. Retorno Seguro
            return { 
                completedMissions: completedNow, 
                allMissions: updatedMissions 
            };

        } catch (e) {
            console.error("[MissionSystem] Critical Error:", e);
            return { completedMissions: [], allMissions: activeMissions };
        }
    }
}

module.exports = { MissionSystem };
