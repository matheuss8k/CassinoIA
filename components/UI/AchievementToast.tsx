
import React, { useEffect, useState, useRef } from 'react';
import { TROPHY_MAP } from '../../types';
import { Trophy, Star, Crown } from 'lucide-react';

export const AchievementToast: React.FC = () => {
    const [queue, setQueue] = useState<string[]>([]);
    const [currentTrophy, setCurrentTrophy] = useState<string | null>(null);
    const audioRef = useRef<OscillatorNode | null>(null);

    useEffect(() => {
        const handleUnlock = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && Array.isArray(detail)) {
                setQueue(prev => [...prev, ...detail]);
            }
        };
        window.addEventListener('achievement-unlocked', handleUnlock);
        return () => window.removeEventListener('achievement-unlocked', handleUnlock);
    }, []);

    useEffect(() => {
        if (queue.length > 0 && !currentTrophy) {
            const next = queue[0];
            setQueue(prev => prev.slice(1));
            setCurrentTrophy(next);
            playAchievementSound();

            setTimeout(() => {
                setCurrentTrophy(null);
            }, 4000); // Tempo reduzido para 4s (mais dinâmico)
        }
    }, [queue, currentTrophy]);

    const playAchievementSound = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            // Som mais sutil e cristalino (High-end chime)
            const now = ctx.currentTime;
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
            osc.frequency.setValueAtTime(1046.50, now + 0.35); // C6
            
            gain.gain.setValueAtTime(0.05, now); // Volume mais baixo
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            
            osc.start();
            osc.stop(now + 1.2);
        } catch (e) {}
    };

    if (!currentTrophy) return null;

    const trophyData = TROPHY_MAP.find(t => t.id === currentTrophy);
    if (!trophyData) return null;

    // Estilos refinados: Menos borda, mais glow sutil, fundo escuro
    const rarityStyles = {
        common: 'bg-slate-900/95 border-slate-700 shadow-lg',
        rare: 'bg-slate-900/95 border-blue-500/40 shadow-[0_0_25px_rgba(59,130,246,0.15)]',
        legendary: 'bg-slate-900/95 border-yellow-500/40 shadow-[0_0_30px_rgba(234,179,8,0.2)]'
    };

    const iconBg = {
        common: 'bg-slate-800 text-slate-400',
        rare: 'bg-blue-500/10 text-blue-400',
        legendary: 'bg-yellow-500/10 text-yellow-400'
    };

    return (
        // POSIÇÃO: Top-20 (80px) para ficar logo abaixo da Navbar (h-16 = 64px)
        <div className="fixed top-20 right-6 z-[1000] animate-fade-in pointer-events-none">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${rarityStyles[trophyData.rarity]} backdrop-blur-xl min-w-[260px] max-w-sm relative overflow-hidden group`}>
                
                {/* Efeito de brilho de fundo (apenas para lendário e raro) */}
                {trophyData.rarity !== 'common' && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-xl -mr-10 -mt-10 pointer-events-none"></div>
                )}
                
                {/* Ícone menor e mais integrado */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconBg[trophyData.rarity]}`}>
                    {trophyData.icon}
                </div>
                
                <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">Conquista</span>
                        {trophyData.rarity === 'legendary' && <Crown size={10} className="text-yellow-500" />}
                    </div>
                    <h3 className="text-white font-bold text-xs truncate leading-tight">{trophyData.name}</h3>
                    <p className="text-[10px] text-slate-400 truncate opacity-70 leading-tight mt-0.5">{trophyData.description}</p>
                </div>

                {/* Ícone de raridade no canto absoluto */}
                <div className="absolute top-2 right-2 opacity-50">
                    {trophyData.rarity === 'rare' && <Star size={10} className="text-blue-400 fill-blue-400" />}
                    {trophyData.rarity === 'legendary' && <Trophy size={10} className="text-yellow-500 fill-yellow-500" />}
                </div>
            </div>
        </div>
    );
};
