import React, { useState } from 'react';
import { StoreItem, User } from '../../types';
import { Avatar } from '../UI/Avatar';
import { Shield, Coins } from 'lucide-react';
import { RARITY_STYLES, RARITY_TRANSLATION, RARITY_WEIGHT, FREE_AVATAR_IDS } from './profile.styles';

interface StoreTabProps {
    items: StoreItem[];
    user: User;
    loading: boolean;
    onPurchaseClick: (item: StoreItem) => void;
    onEquipRequest: (category: 'avatar' | 'frame') => void;
}

export const StoreTab: React.FC<StoreTabProps> = ({ items, user, loading, onPurchaseClick, onEquipRequest }) => {
    const [storeFilter, setStoreFilter] = useState<'all' | 'avatar' | 'frame' | 'consumable'>('all');

    return (
        <div className="animate-fade-in space-y-6 max-w-5xl mx-auto">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {[{id: 'all', label: 'Tudo'}, {id: 'avatar', label: 'Avatares'}, {id: 'frame', label: 'Molduras'}, {id: 'consumable', label: 'Consumíveis'}].map(f => (
                    <button key={f.id} onClick={() => setStoreFilter(f.id as any)} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${storeFilter === f.id ? 'bg-white text-black border-white shadow-lg' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800'}`}>{f.label}</button>
                ))}
            </div>

            {loading ? <div className="text-center text-xs text-slate-500 py-20 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-white rounded-full animate-spin"></div>
                Carregando catálogo...
            </div> : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {items
                        .filter(i => storeFilter === 'all' || i.category === storeFilter)
                        .sort((a, b) => RARITY_WEIGHT[a.rarity] - RARITY_WEIGHT[b.rarity])
                        .map(item => {
                        const isDefaultFrame = item.id === 'frame_1';
                        const isFreeAvatar = FREE_AVATAR_IDS.includes(item.id);
                        const isOwned = user.ownedItems?.includes(item.id) || isDefaultFrame || isFreeAvatar;
                        const isCosmetic = item.type === 'cosmetic';
                        
                        const style = RARITY_STYLES[item.rarity] || RARITY_STYLES['common'];
                        
                        return (
                            <div key={item.id} className={`group relative rounded-2xl border ${style.border} ${style.cardBg} overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl flex flex-col`}>
                                
                                {/* Rarity Glow Top - Explicit Gradient */}
                                <div className={`absolute top-0 inset-x-0 h-24 bg-gradient-to-b ${style.topGlow} to-transparent pointer-events-none`}></div>
                                
                                {/* Rarity Badge */}
                                <div className={`absolute top-3 right-3 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest z-20 backdrop-blur-md border ${style.badge}`}>
                                    {RARITY_TRANSLATION[item.rarity]}
                                </div>

                                {/* Item Preview */}
                                <div className="h-28 w-full flex items-center justify-center relative z-10 p-4">
                                    <div className="group-hover:scale-110 transition-transform duration-500 ease-out relative z-10">
                                        {item.category === 'frame' ? (
                                            <Avatar avatarId={user.avatarId} frameId={item.id} size="lg" showFrame={true} />
                                        ) : item.category === 'avatar' ? (
                                            <Avatar avatarId={item.id} frameId={user.frameId} size="lg" showFrame={true} />
                                        ) : (
                                            <div className="w-16 h-16 bg-slate-900/80 rounded-full flex items-center justify-center text-3xl border border-white/10 shadow-lg backdrop-blur-sm">
                                                {item.id === 'insurance' ? <Shield size={28} className="text-blue-400" /> : '📦'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Info Section */}
                                <div className="p-4 pt-2 flex flex-col flex-1 bg-slate-950/30 border-t border-white/5 relative z-20">
                                    <h4 className={`font-black text-[11px] leading-tight mb-1 uppercase truncate ${style.text}`}>{item.name}</h4>
                                    <p className="text-[9px] text-slate-500 mb-4 leading-tight line-clamp-2 min-h-[1.8rem]">{item.description}</p>
                                    
                                    <div className="mt-auto">
                                        {isOwned && isCosmetic ? (
                                            <button 
                                                onClick={() => onEquipRequest(item.category as 'avatar' | 'frame')} 
                                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-wider transition-colors border border-white/5"
                                            >
                                                Equipar
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => onPurchaseClick(item)} 
                                                className={`w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-95 ${style.button}`}
                                            >
                                                {item.cost > 0 ? (
                                                    <>
                                                        <Coins size={12} className={item.rarity === 'legendary' ? 'text-black' : 'text-current'} /> 
                                                        {item.cost}
                                                    </>
                                                ) : 'Grátis'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};