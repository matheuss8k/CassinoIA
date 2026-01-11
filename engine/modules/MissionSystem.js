
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
        // NOTA: Se 'user' vier de um find sem .lean(), user.missions é um MongooseArray.
        // Convertemos para array puro para manipulação segura.
        let currentMissions = user.missions ? JSON.parse(JSON.stringify(user.missions)) : [];
        let dirty = false;

        // Verifica Reset Diário ou Missões Vazias
        // A falta do campo 'lastDailyReset' no schema anterior causava loop aqui
        if (user.lastDailyReset !== today || currentMissions.length === 0) {
            currentMissions = getDailyMissionsTemplate();
            
            // Atualiza referência local se possível (para retorno imediato)
            if(user.set) {
                user.set('lastDailyReset', today);
                user.set('missions', currentMissions);
            } else {
                user.lastDailyReset = today;
                user.missions = currentMissions;
            }
            
            dirty = true;
            logEvent('METRIC', `📅 Daily Missions Reset for ${user.username}`);
        }

        // Se houve alteração, persiste apenas os campos necessários atomicamente
        if (dirty && user._id) {
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
        
        return currentMissions;
    }

    /**
     * Atualiza o progresso, lida com o reset diário internamente e salva tudo em uma única operação.
     * Usado durante o jogo (Bet/Win).
     */
    static async updateProgress(userId, eventData) {
        let activeMissions = [];
        try {
            // 1. Busca estado atual com LEAN para performance e evitar erros de serialização
            const user = await User.findById(userId).select('missions lastDailyReset username loyaltyPoints').lean();
            if (!user) return { completedMissions: [], allMissions: [] };

            const today = new Date().toISOString().split('T')[0];
            activeMissions = user.missions || [];
            let isReset = false;

            // 2. Lógica de Reset (Inline)
            // Se a data mudou, descartamos o progresso antigo e carregamos o template novo IMEDIATAMENTE
            if (user.lastDailyReset !== today || activeMissions.length === 0) {
                activeMissions = getDailyMissionsTemplate();
                isReset = true;
                if (user.lastDailyReset) {
                    logEvent('METRIC', `📅 Daily Missions Reset for ${user.username} (Triggered by Action)`);
                }
            }

            // 3. Cálculo de Progresso
            let hasProgressUpdate = false;
            let pointsToAdd = 0;
            const completedNow = [];
            
            // Mapeia o array (plain object graças ao .lean())
            const updatedMissions = activeMissions.map(mission => {
                // Se já completou, mantém como está
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
                        newMissionState.current = mission.target; // Trava visual
                        newMissionState.completed = true;
                        
                        pointsToAdd += mission.rewardPoints;
                        
                        completedNow.push({
                            id: mission.id,
                            description: mission.description,
                            reward: mission.rewardPoints
                        });
                        
                        logEvent('METRIC', `🎯 Mission Completed: ${mission.description} (${user.username})`);
                    }
                    return newMissionState;
                }
                
                return mission;
            });

            // 4. Monta Query de Update Única (Atômica)
            // Resolve a condição de corrida salvando Data e Missões juntos
            const updateSet = {};
            const updateInc = {};

            if (isReset) {
                updateSet.lastDailyReset = today;
                updateSet.missions = updatedMissions; 
            } else if (hasProgressUpdate) {
                updateSet.missions = updatedMissions;
            }

            if (pointsToAdd > 0) {
                updateInc.loyaltyPoints = pointsToAdd;
            }

            // Executa no Banco se houve qualquer mudança (Reset ou Progresso)
            if (Object.keys(updateSet).length > 0 || Object.keys(updateInc).length > 0) {
                const updateQuery = {};
                if (Object.keys(updateSet).length > 0) updateQuery.$set = updateSet;
                if (Object.keys(updateInc).length > 0) updateQuery.$inc = updateInc;

                await User.updateOne({ _id: userId }, updateQuery);
            }

            // 5. Retorno Seguro
            return { 
                completedMissions: completedNow, 
                allMissions: updatedMissions 
            };

        } catch (e) {
            console.error("[MissionSystem] Critical Error:", e);
            // Retorna as missões antigas (se houver) para evitar que a UI fique vazia
            // Isso previne o "Erro de Sincronização" visual por dados faltantes
            return { completedMissions: [], allMissions: activeMissions };
        }
    }
}

module.exports = { MissionSystem };
