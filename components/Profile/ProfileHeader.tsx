
import React from 'react';
import { User, TROPHY_MAP } from '../../types';
import { Avatar } from '../UI/Avatar';
import { Edit2, CheckCircle, AlertCircle, Crown, Coins } from 'lucide-react';
import { RARITY_STYLES } from './profile.styles';

interface ProfileHeaderProps {
    user: User;
    onEditClick: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, onEditClick }) => {
    
    // Showcase Logic
    const unlockedTrophiesList = TROPHY_MAP.filter(t => user.unlockedTrophies?.includes(t.id));
    const trophyShowcase = unlockedTrophiesList.sort((a, b) => {
        const priority = { legendary: 3, epic: 2.5, rare: 2, common: 1 };
        return (priority[b.rarity as keyof typeof priority] || 1) - (priority[a.rarity as keyof typeof priority] || 1);
    }).slice(0, 3);

    return (
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-white/10 shadow-xl w-full flex flex-col md:flex-row">
            <div className="absolute inset-0 bg-gradient-to-r from-casino-purple via-indigo-900 to-slate-900 opacity-80 z-0"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 z-0"></div>
            <div className="relative z-10 p-5 md:p-6 flex flex-col md:flex-row items-center gap-5 w-full">
                
                <div className="relative group cursor-pointer shrink-0" onClick={onEditClick}>
                    <Avatar avatarId={user.avatarId} frameId={user.frameId} size="xl" showFrame={true} className="shadow-2xl" />
                    <div className="absolute bottom-0 right-0 z-20 bg-white text-black p-1.5 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] border-[3px] border-slate-900 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0 flex items-center justify-center hover:scale-110">
                        <Edit2 size={12} />
                    </div>
                </div>

                <div className="flex-1 text-center md:text-left w-full min-w-0">
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight break-words">{user.fullName}</h1>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                        <span className="bg-black/30 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-white/5 whitespace-nowrap">@{user.username}</span>
                        {user.isVerified ? <span className="flex items-center gap-1 text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20 text-[10px] font-bold whitespace-nowrap"><CheckCircle size={10} /> Verificado</span> : <span className="flex items-center gap-1 text-red-400 bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20 text-[10px] font-bold whitespace-nowrap"><AlertCircle size={10} /> Não Verificado</span>}
                    </div>
                    
                    {trophyShowcase.length > 0 && (
                        <div className="mt-3 flex items-center justify-center md:justify-start gap-1.5">
                            <span className="text-[8px] text-slate-400 uppercase font-bold tracking-widest mr-1">Top</span>
                            {trophyShowcase.map(trophy => {
                                const style = RARITY_STYLES[trophy.rarity] || RARITY_STYLES['common'];
                                // Adaptação rápida dos estilos para os mini-ícones
                                let bgClass = 'bg-slate-800';
                                let borderClass = 'border-slate-600';
                                let textClass = 'text-slate-400';
                                
                                if(trophy.rarity === 'legendary') { bgClass='bg-yellow-900/40'; borderClass='border-yellow-500'; textClass='text-yellow-400'; }
                                else if(trophy.rarity === 'epic') { bgClass='bg-purple-900/40'; borderClass='border-purple-500'; textClass='text-purple-400'; }
                                else if(trophy.rarity === 'rare') { bgClass='bg-blue-900/40'; borderClass='border-blue-500'; textClass='text-blue-400'; }

                                return (
                                    <div key={trophy.id} className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs relative group cursor-help ${bgClass} ${borderClass} ${textClass} ${trophy.rarity === 'legendary' ? 'shadow-[0_0_10px_rgba(234,179,8,0.4)]' : ''}`} title={trophy.name}>
                                        {trophy.icon}
                                        {trophy.rarity === 'legendary' && <div className="absolute -top-1 -right-1 text-yellow-500 drop-shadow-md"><Crown size={8} fill="currentColor"/></div>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                <div className="md:ml-auto shrink-0 mt-2 md:mt-0 w-full md:w-auto">
                    <div className="bg-black/30 backdrop-blur-md border border-casino-gold/30 p-2.5 rounded-xl flex items-center justify-center md:justify-start gap-3 w-full">
                        <div className="w-9 h-9 rounded-full bg-casino-gold/10 flex items-center justify-center text-casino-gold border border-casino-gold/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]"><Coins size={18} /></div>
                        <div className="text-left"><p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Pontos Loja</p><p className="text-lg font-bold text-white leading-none">{Math.floor(user.loyaltyPoints || 0)}</p></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
