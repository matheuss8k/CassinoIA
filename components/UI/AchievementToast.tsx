
import React, { useEffect, useState, useRef } from 'react';
import { TROPHY_MAP } from '../../types';
import { Trophy, Star, Crown, Target, Coins } from 'lucide-react';

interface ToastItem {
    type: 'trophy' | 'mission';
    id: string;
    title: string;
    description: string;
    icon?: React.ReactNode;
    reward?: number;
    rarity?: string;
}

export const AchievementToast: React.FC = () => {
    const [queue, setQueue] = useState<ToastItem[]>([]);
    const [currentItem, setCurrentItem] = useState<ToastItem | null>(null);

    useEffect(() => {
        // Listener for Achievements (Trophies) - Receives ID strings
        const handleUnlock = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && Array.isArray(detail)) {
                const newItems: ToastItem[] = detail.map(id => {
                    const trophy = TROPHY_MAP.find(t => t.id === id);
                    if (!trophy) return null;
                    return {
                        type: 'trophy',
                        id: trophy.id,
                        title: trophy.name,
                        description: trophy.description,
                        rarity: trophy.rarity,
                        icon: null // Will use default logic
                    };
                }).filter(Boolean) as ToastItem[];
                
                if (newItems.length > 0) setQueue(prev => [...prev, ...newItems]);
            }
        };

        // Listener for Missions - Receives objects {id, description, reward}
        const handleMission = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && Array.isArray(detail)) {
                const newItems: ToastItem[] = detail.map(m => ({
                    type: 'mission',
                    id: m.id,
                    title: 'Missão Cumprida!',
                    description: m.description,
                    reward: m.reward,
                    rarity: 'common'
                }));
                if (newItems.length > 0) setQueue(prev => [...prev, ...newItems]);
            }
        };

        window.addEventListener('achievement-unlocked', handleUnlock);
        window.addEventListener('mission-completed', handleMission);
        
        return () => {
            window.removeEventListener('achievement-unlocked', handleUnlock);
            window.removeEventListener('mission-completed', handleMission);
        };
    }, []);

    useEffect(() => {
        if (queue.length > 0 && !currentItem) {
            const next = queue[0];
            setQueue(prev => prev.slice(1));
            setCurrentItem(next);
            playNotificationSound(next.type);

            setTimeout(() => {
                setCurrentItem(null);
            }, 4000); 
        }
    }, [queue, currentItem]);

    const playNotificationSound = (type: 'trophy' | 'mission') => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const now = ctx.currentTime;
            
            if (type === 'trophy') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
                osc.frequency.setValueAtTime(1046.50, now + 0.35); // C6
            } else {
                // Mission Sound: Quick double beep (Success)
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0, now + 0.1);
                gain.gain.setValueAtTime(0.05, now + 0.15);
                osc.frequency.setValueAtTime(1760, now + 0.15);
            }
            
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (type === 'trophy' ? 1.2 : 0.6));
            
            osc.start();
            osc.stop(now + (type === 'trophy' ? 1.2 : 0.6));
        } catch (e) {}
    };

    if (!currentItem) return null;

    // Logic for Trophies
    let icon, rarityStyle, iconBg;
    
    if (currentItem.type === 'trophy') {
        const trophyData = TROPHY_MAP.find(t => t.id === currentItem.id);
        const rarity = trophyData?.rarity || 'common';
        icon = trophyData?.icon;

        rarityStyle = {
            common: 'bg-slate-900/95 border-slate-700 shadow-lg',
            rare: 'bg-slate-900/95 border-blue-500/40 shadow-[0_0_25px_rgba(59,130,246,0.15)]',
            epic: 'bg-slate-900/95 border-purple-500/40 shadow-[0_0_25px_rgba(168,85,247,0.15)]',
            legendary: 'bg-slate-900/95 border-yellow-500/40 shadow-[0_0_30px_rgba(234,179,8,0.2)]'
        }[rarity];

        iconBg = {
            common: 'bg-slate-800 text-slate-400',
            rare: 'bg-blue-500/10 text-blue-400',
            epic: 'bg-purple-500/10 text-purple-400',
            legendary: 'bg-yellow-500/10 text-yellow-400'
        }[rarity];
    } else {
        // Logic for Missions
        icon = <Target size={18} />;
        rarityStyle = 'bg-slate-900/95 border-green-500/40 shadow-[0_0_25px_rgba(34,197,94,0.15)]';
        iconBg = 'bg-green-500/10 text-green-400';
    }

    return (
        <div className="fixed top-20 right-6 z-[1000] animate-slide-up pointer-events-none">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${rarityStyle} backdrop-blur-xl min-w-[260px] max-w-sm relative overflow-hidden group`}>
                
                {currentItem.type === 'trophy' && currentItem.rarity !== 'common' && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-xl -mr-10 -mt-10 pointer-events-none"></div>
                )}
                
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconBg}`}>
                    {icon}
                </div>
                
                <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">
                            {currentItem.type === 'trophy' ? 'Conquista' : 'Missão'}
                        </span>
                        {currentItem.type === 'trophy' && currentItem.rarity === 'legendary' && <Crown size={10} className="text-yellow-500" />}
                    </div>
                    <h3 className="text-white font-bold text-xs truncate leading-tight">{currentItem.title}</h3>
                    <p className="text-[10px] text-slate-400 truncate opacity-70 leading-tight mt-0.5">
                        {currentItem.description}
                    </p>
                    {currentItem.reward && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-yellow-500">
                            <Coins size={10} /> +{currentItem.reward} Pontos
                        </div>
                    )}
                </div>

                <div className="absolute top-2 right-2 opacity-50">
                    {currentItem.type === 'trophy' && currentItem.rarity === 'rare' && <Star size={10} className="text-blue-400 fill-blue-400" />}
                    {currentItem.type === 'trophy' && currentItem.rarity === 'legendary' && <Trophy size={10} className="text-yellow-500 fill-yellow-500" />}
                </div>
            </div>
        </div>
    );
};
