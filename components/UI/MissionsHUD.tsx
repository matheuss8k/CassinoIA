
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { User, Mission } from '../../types';
import { Target, ChevronRight, X, Trophy, CheckCircle2, Zap, Gift, Coins, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { DatabaseService } from '../../services/database';

interface MissionsHUDProps {
    user: User;
    updateUser: (data: Partial<User>) => void;
}

export const MissionsHUD: React.FC<MissionsHUDProps> = ({ user, updateUser }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [progressToast, setProgressToast] = useState<string | null>(null);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    
    // Timer States
    const [timeRemaining, setTimeRemaining] = useState<string>("--:--:--");
    const [isUrgent, setIsUrgent] = useState(false);

    const location = useLocation();
    const prevMissionsRef = useRef<Record<string, number>>({});

    // Efeito de partículas
    const [rewardAnim, setRewardAnim] = useState<{show: boolean, x: number, y: number}>({ show: false, x: 0, y: 0 });

    // --- TIMER LOGIC (UTC Midnight) ---
    useEffect(() => {
        const calculateTime = () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0); // Next UTC Midnight
            const diff = tomorrow.getTime() - now.getTime();

            if (diff <= 0) {
                // Hora do reset (Reload suave ou apenas zerar)
                setTimeRemaining("00:00:00");
                return;
            }

            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            setTimeRemaining(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );

            // Urgência: Menos de 1 hora
            setIsUrgent(diff < 3600000);
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleClaim = async (mission: Mission, e: React.MouseEvent) => {
        e.stopPropagation();
        if (claimingId) return;
        setClaimingId(mission.id);

        try {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setRewardAnim({ show: true, x: rect.left + rect.width / 2, y: rect.top });

            const result = await DatabaseService.claimMission(user.id, mission.id);
            
            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContextClass();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            } catch(e) {}

            if (result.success) {
                // ATUALIZAÇÃO REATIVA (SEM RELOAD)
                updateUser({
                    loyaltyPoints: result.newPoints,
                    missions: result.missions
                });
                
                // Emite evento para o Toast de Conquistas/Notificações se necessário
                window.dispatchEvent(new CustomEvent('mission-claimed', { detail: { points: mission.rewardPoints } }));
            } else {
                console.error("Erro no resgate:", result);
            }

        } catch (e) {
            console.error("Falha ao resgatar missão:", e);
            alert("Erro de conexão ao resgatar prêmio. Tente novamente.");
        } finally {
            setClaimingId(null);
            setTimeout(() => setRewardAnim({ ...rewardAnim, show: false }), 1000);
        }
    };

    // --- 1. FILTRAGEM INTELIGENTE ---
    const relevantMissions = useMemo(() => {
        const path = location.pathname.toLowerCase();
        const isBlackjack = path.includes('blackjack');
        const isMines = path.includes('mines');
        const isTiger = path.includes('tigrinho') || path.includes('tiger');
        const isBaccarat = path.includes('baccarat');
        const isDashboard = path === '/' || path === '/profile';

        return (user.missions || []).filter(m => {
            if (['BET_TOTAL', 'WIN_TOTAL', 'PROFIT_TOTAL'].includes(m.type)) return true;
            if (isDashboard) return true;
            if (isBlackjack && m.type.includes('BLACKJACK')) return true;
            if (isMines && m.type.includes('MINES')) return true;
            if (isTiger && m.type.includes('TIGER')) return true;
            if (isBaccarat && m.type.includes('BACCARAT')) return true;
            return false;
        }).sort((a, b) => {
            const aReady = a.completed && !a.claimed;
            const bReady = b.completed && !b.claimed;
            if (aReady && !bReady) return -1;
            if (!aReady && bReady) return 1;
            if (a.claimed && !b.claimed) return 1;
            if (!a.claimed && b.claimed) return -1;
            return 0;
        });
    }, [user.missions, location.pathname]);

    // --- CÁLCULO DE PONTOS EM RISCO ---
    const pointsAtRisk = useMemo(() => {
        return (user.missions || [])
            .filter(m => !m.completed)
            .reduce((acc, m) => acc + m.rewardPoints, 0);
    }, [user.missions]);

    // --- 2. DETECÇÃO DE PROGRESSO ---
    useEffect(() => {
        let hasProgress = false;
        let diffLabel = '';

        user.missions?.forEach(m => {
            const prev = prevMissionsRef.current[m.id] || 0;
            const current = m.current;

            if (current > prev) {
                hasProgress = true;
                const delta = current - prev;
                if (m.type.includes('BET') || m.type.includes('WIN')) {
                    diffLabel = `+ R$ ${delta.toFixed(0)}`;
                } else {
                    diffLabel = `+ ${delta}`;
                }
            }
            prevMissionsRef.current[m.id] = current;
        });

        if (hasProgress) {
            setIsAnimating(true);
            if (!isOpen) {
                setProgressToast(diffLabel);
                const timer = setTimeout(() => setProgressToast(null), 2500);
                return () => clearTimeout(timer);
            }
            const timerAnim = setTimeout(() => setIsAnimating(false), 1000);
            return () => clearTimeout(timerAnim);
        }
    }, [user.missions, isOpen]);

    if (!relevantMissions || relevantMissions.length === 0) return null;

    const notificationCount = relevantMissions.filter(m => !m.claimed && (m.completed || m.current > 0)).length;
    const readyToClaimCount = relevantMissions.filter(m => m.completed && !m.claimed).length;
    const progressPercent = (mission: Mission) => Math.min(100, (mission.current / mission.target) * 100);

    return (
        <>
            {/* REWARD ANIMATION */}
            {rewardAnim.show && (
                <div 
                    className="fixed z-[9999] pointer-events-none"
                    style={{ left: rewardAnim.x, top: rewardAnim.y }}
                >
                    <div className="absolute -translate-x-1/2 -translate-y-1/2">
                        <div className="relative">
                            {[...Array(12)].map((_, i) => (
                                <div key={i} className="absolute w-4 h-4 bg-yellow-400 rounded-full animate-[explode_0.8s_ease-out_forwards]" style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${Math.random() * 0.1}s` }} />
                            ))}
                            <div className="absolute text-yellow-300 font-black text-xl animate-[floatUp_1s_ease-out_forwards] -translate-x-1/2 whitespace-nowrap drop-shadow-md">+ PONTOS!</div>
                        </div>
                    </div>
                    <style>{`@keyframes explode { 0% { transform: rotate(var(--r)) translate(0); opacity: 1; } 100% { transform: rotate(var(--r)) translate(100px); opacity: 0; } } @keyframes floatUp { 0% { transform: translateY(0) scale(0.5); opacity: 0; } 50% { transform: translateY(-30px) scale(1.2); opacity: 1; } 100% { transform: translateY(-60px) scale(1); opacity: 0; } }`}</style>
                </div>
            )}

            {/* --- FAB --- */}
            <div className="fixed bottom-6 right-6 z-[90] flex items-center gap-3">
                {progressToast && (
                    <div className="animate-slide-up bg-yellow-500 text-black font-black text-xs px-3 py-1.5 rounded-full shadow-lg border-2 border-yellow-300 flex items-center gap-1">
                        <Zap size={12} fill="black" /> {progressToast}
                    </div>
                )}

                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`
                        relative w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all duration-300 active:scale-95 group border-2
                        ${isOpen ? 'bg-slate-800 border-slate-600 text-white' : readyToClaimCount > 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300 text-black animate-pulse' : 'bg-gradient-to-br from-indigo-600 to-purple-700 border-indigo-400 text-white hover:scale-105'}
                        ${!isOpen && isUrgent && pointsAtRisk > 0 ? 'ring-2 ring-red-500 animate-pulse' : ''}
                    `}
                >
                    {isOpen ? <X size={24} /> : readyToClaimCount > 0 ? <Gift size={24} className="animate-bounce" /> : <Target size={24} className={isAnimating ? 'animate-bounce' : ''} />}
                    
                    {!isOpen && notificationCount > 0 && (
                        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-slate-900 ${readyToClaimCount > 0 ? 'bg-red-500 text-white' : isUrgent ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                            {readyToClaimCount > 0 ? '!' : notificationCount}
                        </div>
                    )}
                </button>
            </div>

            {/* --- DRAWER --- */}
            {isOpen && <div className="fixed inset-0 z-[90] bg-black/20 md:bg-transparent backdrop-blur-[1px] md:backdrop-blur-none cursor-default" onClick={() => setIsOpen(false)} />}

            <div className={`
                fixed top-0 right-0 h-full w-[300px] md:w-[320px] bg-slate-950/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-[95] transition-transform duration-300 ease-out flex flex-col
                ${isOpen ? 'translate-x-0' : 'translate-x-full'}
            `}>
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><Target size={20} /></div>
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-wider">Missões Ativas</h2>
                            <p className="text-[10px] text-slate-400">Complete para ganhar pontos</p>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1"><ChevronRight size={24} /></button>
                </div>

                {/* TIMER BANNER (URGÊNCIA) */}
                <div className={`
                    mx-4 mt-4 mb-1 p-2.5 rounded-xl border flex items-center justify-between shadow-inner
                    ${isUrgent 
                        ? 'bg-red-500/10 border-red-500/30' 
                        : 'bg-slate-900 border-white/5'}
                `}>
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${isUrgent ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-blue-500/10 text-blue-400'}`}>
                            {isUrgent ? <AlertTriangle size={14} /> : <Clock size={14} />}
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className={`text-[9px] font-bold uppercase tracking-wide ${isUrgent ? 'text-red-400' : 'text-slate-400'}`}>
                                {isUrgent ? 'Expira em breve' : 'Reset Diário'}
                            </span>
                            <span className={`font-mono font-bold text-sm ${isUrgent ? 'text-red-300' : 'text-white'}`}>
                                {timeRemaining}
                            </span>
                        </div>
                    </div>
                    {pointsAtRisk > 0 && (
                        <div className="text-right">
                            <span className="text-[8px] text-slate-500 uppercase font-bold block mb-0.5">Em risco</span>
                            <span className={`text-xs font-black ${isUrgent ? 'text-red-400' : 'text-yellow-500'}`}>
                                -{pointsAtRisk} pts
                            </span>
                        </div>
                    )}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                    {relevantMissions.map((mission) => {
                        const pct = progressPercent(mission);
                        const isDone = mission.completed; 
                        const isClaimed = mission.claimed; 
                        const isReadyToClaim = isDone && !isClaimed;
                        const isClaimingThis = claimingId === mission.id;

                        return (
                            <div key={mission.id} className={`relative p-3 rounded-xl border transition-all duration-300 overflow-hidden group ${isReadyToClaim ? 'bg-gradient-to-r from-yellow-900/40 to-slate-900 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' : isClaimed ? 'bg-green-900/10 border-green-500/20 opacity-70' : 'bg-slate-900/80 border-white/5 hover:border-indigo-500/30'}`}>
                                {!isClaimed && (<div className="absolute bottom-0 left-0 h-1 bg-indigo-500/20 w-full"><div className={`h-full transition-all duration-1000 ease-out ${isReadyToClaim ? 'bg-yellow-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`} style={{ width: `${pct}%` }} /></div>)}
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <h4 className={`text-xs font-bold leading-tight pr-2 ${isClaimed ? 'text-green-400 line-through decoration-green-500/50' : 'text-slate-200'}`}>{mission.description}</h4>
                                    {isClaimed ? (<CheckCircle2 size={16} className="text-green-500 shrink-0" />) : (<div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex items-center gap-1 ${isReadyToClaim ? 'bg-yellow-500 text-black border-yellow-400 animate-pulse' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}><Coins size={10} /> +{mission.rewardPoints}</div>)}
                                </div>
                                <div className="flex justify-between items-end relative z-10 mt-2">
                                    <div className="text-[10px] text-slate-500 font-mono">{isClaimed ? 'Concluída' : isReadyToClaim ? 'Pronto para resgate!' : 'Em andamento'}</div>
                                    {isReadyToClaim ? (
                                        <button 
                                            onClick={(e) => handleClaim(mission, e)} 
                                            disabled={isClaimingThis || claimingId !== null} 
                                            className={`bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase px-3 py-1.5 rounded-lg shadow-lg hover:shadow-yellow-500/50 transition-all active:scale-95 flex items-center gap-1 ${isClaimingThis ? 'opacity-80 cursor-wait' : 'animate-bounce'}`}
                                        >
                                            {isClaimingThis ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />}
                                            {isClaimingThis ? 'RESGATANDO...' : 'RESGATAR'} 
                                        </button>
                                    ) : (<div className={`font-mono font-black text-xs ${isClaimed ? 'text-green-500' : 'text-indigo-300'}`}>{Math.floor(mission.current)} <span className="text-slate-600 text-[9px]">/ {mission.target}</span></div>)}
                                </div>
                            </div>
                        );
                    })}
                    {relevantMissions.length === 0 && (<div className="text-center py-10 text-slate-600"><Trophy size={32} className="mx-auto mb-2 opacity-20" /><p className="text-xs">Nenhuma missão para este modo.</p></div>)}
                </div>

                <div className="p-4 border-t border-white/5 bg-slate-950/80 text-center">
                    <p className="text-[9px] text-slate-500">As missões resetam diariamente às 00:00 UTC</p>
                </div>
            </div>
        </>
    );
};
