
import React from 'react';
import { TROPHY_MAP } from '../../types';
import { Lock, Crown } from 'lucide-react';
import { RARITY_TRANSLATION, RARITY_STYLES } from './profile.styles';

interface TrophiesTabProps {
    unlockedIds: string[];
}

export const TrophiesTab: React.FC<TrophiesTabProps> = ({ unlockedIds }) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-fade-in">
            {TROPHY_MAP.map(trophy => { 
                const isUnlocked = unlockedIds?.includes(trophy.id); 
                
                // Styles mapping
                const style = RARITY_STYLES[trophy.rarity] || RARITY_STYLES['common'];
                // Clean Border for Trophies (simpler than store cards)
                const borderClass = trophy.rarity === 'legendary' ? 'border-yellow-500' : trophy.rarity === 'epic' ? 'border-purple-500' : trophy.rarity === 'rare' ? 'border-blue-500' : 'border-white/10';
                const textClass = trophy.rarity === 'legendary' ? 'text-yellow-500' : trophy.rarity === 'epic' ? 'text-purple-400' : trophy.rarity === 'rare' ? 'text-blue-400' : 'text-slate-500';

                return (
                    <div key={trophy.id} className={`p-3 rounded-xl border text-center relative overflow-hidden group transition-all duration-300 ${isUnlocked ? `bg-gradient-to-br from-slate-800 to-slate-950 ${borderClass} shadow-lg hover:-translate-y-1` : 'bg-slate-950 border-white/5 opacity-50 grayscale'}`}>
                        <div className="absolute top-1 right-1 flex flex-col items-end">
                            {!isUnlocked && <Lock size={10} className="text-slate-600 mb-0.5"/>}
                            {isUnlocked && trophy.rarity === 'legendary' && <Crown size={10} className="text-yellow-500 animate-pulse"/>}
                        </div>
                        <div className="text-2xl mb-2 filter drop-shadow-lg transform group-hover:scale-110 transition-transform duration-300">{trophy.icon}</div>
                        <h4 className={`font-bold text-xs leading-tight mb-0.5 ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>{trophy.name}</h4>
                        <span className={`text-[8px] uppercase font-bold tracking-widest ${textClass}`}>{RARITY_TRANSLATION[trophy.rarity]}</span>
                        <p className="text-[9px] text-slate-400 mt-1 leading-tight opacity-80">{trophy.description}</p>
                    </div>
                ) 
            })}
        </div>
    );
};
