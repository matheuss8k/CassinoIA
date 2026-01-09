
import React from 'react';
import { User, StoreItem } from '../../types';
import { Avatar } from '../UI/Avatar';
import { X, Coins, XCircle, User as UserIcon, Layout, Star } from 'lucide-react';
import { FREE_AVATAR_IDS, DEFAULT_FRAME_ID } from './profile.styles';

interface PurchaseModalProps {
    item: StoreItem | null;
    user: User;
    onClose: () => void;
    onConfirm: () => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ item, user, onClose, onConfirm }) => {
    if (!item) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in">
            <div className="w-[260px] bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-slide-up relative flex flex-col">
                <div className="h-24 bg-gradient-to-b from-yellow-500/10 to-transparent absolute top-0 inset-x-0 pointer-events-none" />
                <button onClick={onClose} className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors bg-black/20 p-2 rounded-full z-20 hover:bg-black/40"><X size={16}/></button>

                <div className="pt-12 pb-6 px-5 flex flex-col items-center text-center relative z-10">
                    <div className="text-[10px] font-bold text-yellow-500/80 uppercase tracking-widest mb-6">Confirmar Compra</div>
                    <div className="w-28 h-28 mb-4 relative flex items-center justify-center">
                            <div className="absolute inset-0 bg-yellow-500/20 rounded-full blur-2xl"></div>
                            <div className="relative z-10 transform hover:scale-105 transition-transform duration-500">
                                {item.category === 'frame' ? (
                                    <Avatar avatarId={user.avatarId} frameId={item.id} size="xl" showFrame={true} />
                                ) : item.category === 'avatar' ? (
                                    <Avatar avatarId={item.id} frameId={user.frameId} size="xl" showFrame={true} />
                                ) : (
                                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center text-4xl border border-white/10 shadow-inner p-4">📦</div>
                                )}
                            </div>
                    </div>
                    
                    <h3 className="text-xl font-black text-white leading-tight mb-2">{item.name}</h3>
                    <p className="text-[11px] text-slate-400 mb-6 px-2 leading-relaxed line-clamp-2 min-h-[2.5em]">{item.description}</p>
                    
                    <div className="flex items-center justify-center gap-2 mb-6 bg-slate-900/80 px-6 py-2.5 rounded-xl border border-white/5 w-full">
                        <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Valor:</span>
                        <div className="flex items-center gap-1">
                            <Coins size={14} className="text-yellow-400" />
                            <span className="text-white font-black text-base">{item.cost}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full">
                        <button onClick={onClose} className="py-3 rounded-xl bg-slate-800 text-slate-400 font-bold text-[10px] uppercase tracking-wider hover:bg-slate-700 hover:text-white transition-colors border border-white/5">Cancelar</button>
                        <button onClick={onConfirm} className="py-3 rounded-xl bg-yellow-500 text-black font-black text-[10px] uppercase tracking-wider hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20 active:scale-95">Comprar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface EditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    ownedPremiumAvatars: StoreItem[];
    ownedFrames: StoreItem[];
    onEquip: (id: string, type: 'avatar' | 'frame') => void;
    initialTab?: 'avatar' | 'frame';
}

export const EditModal: React.FC<EditModalProps> = ({ isOpen, onClose, user, ownedPremiumAvatars, ownedFrames, onEquip, initialTab = 'avatar' }) => {
    const [tab, setTab] = React.useState<'avatar' | 'frame'>(initialTab);
    
    // Reset tab when modal opens with a specific intent
    React.useEffect(() => {
        if(isOpen) setTab(initialTab);
    }, [isOpen, initialTab]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-3xl relative shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-slide-up">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-50 bg-black/20 p-1 rounded-full backdrop-blur-sm"><XCircle size={24} /></button>
                
                <div className="w-full bg-gradient-to-b from-slate-800 to-slate-900 p-6 flex flex-col items-center justify-center border-b border-white/5 relative shrink-0">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 absolute top-4 left-6">Visualização</h3>
                    <div className="scale-125 transform transition-all duration-300 mt-2 mb-2">
                        <Avatar avatarId={user.avatarId} frameId={user.frameId} size="xl" showFrame={true} />
                    </div>
                    <div className="mt-4 text-center">
                        <p className="text-white font-bold text-lg">{user.username}</p>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Prévia do Perfil</p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col bg-slate-950 min-h-0">
                    <div className="flex border-b border-white/5 shrink-0">
                        <button onClick={() => setTab('avatar')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${tab === 'avatar' ? 'bg-slate-900 text-white border-b-2 border-casino-gold' : 'text-slate-500 hover:bg-slate-900/50'}`}><UserIcon size={14}/> Avatares</button>
                        <button onClick={() => setTab('frame')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${tab === 'frame' ? 'bg-slate-900 text-white border-b-2 border-casino-gold' : 'text-slate-500 hover:bg-slate-900/50'}`}><Layout size={14}/> Molduras</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                        {tab === 'avatar' && (
                            <>
                            <h4 className="text-[9px] text-slate-500 uppercase font-bold mb-3 tracking-widest pl-1">Básicos</h4>
                            <div className="grid grid-cols-4 gap-2 mb-6">
                                {FREE_AVATAR_IDS.map((id) => (
                                    <button key={id} onClick={() => onEquip(id, 'avatar')} className={`flex flex-col items-center gap-1.5 p-1.5 rounded-lg border transition-all hover:scale-105 ${user.avatarId === id ? 'bg-slate-800 border-casino-gold shadow-lg ring-1 ring-casino-gold/50' : 'bg-slate-900 border-white/5 hover:border-white/20'}`}>
                                        <Avatar avatarId={id} size="md" showFrame={false} />
                                    </button>
                                ))}
                            </div>
                            
                            {ownedPremiumAvatars.length > 0 && (
                                <>
                                    <h4 className="text-[9px] text-yellow-500 uppercase font-bold mb-3 tracking-widest flex items-center gap-1 pl-1"><Star size={10}/> Premium</h4>
                                    <div className="grid grid-cols-4 gap-2">
                                        {ownedPremiumAvatars.map((item) => (
                                            <button key={item.id} onClick={() => onEquip(item.id, 'avatar')} className={`relative flex flex-col items-center gap-1.5 p-1.5 rounded-lg border transition-all ${user.avatarId === item.id ? 'bg-yellow-900/20 border-yellow-500 ring-1 ring-yellow-500/50' : 'bg-slate-900 border-white/10 hover:border-white/30'}`}>
                                                <div className="relative">
                                                    <Avatar avatarId={item.id} size="md" showFrame={false} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            </>
                        )}

                        {tab === 'frame' && (
                            <div className="grid grid-cols-3 gap-3">
                                <button onClick={() => onEquip(DEFAULT_FRAME_ID, 'frame')} className={`relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${user.frameId === DEFAULT_FRAME_ID ? 'bg-slate-800 border-casino-gold shadow-lg' : 'bg-slate-900 border-white/5 hover:border-white/20'}`}>
                                    <div className="relative mb-2 scale-90">
                                        <Avatar avatarId={user.avatarId} frameId="frame_1" size="md" showFrame={true} />
                                    </div>
                                    <span className="text-[8px] font-bold text-slate-300 uppercase">Padrão</span>
                                </button>

                                {ownedFrames.map((item) => (
                                    <button key={item.id} onClick={() => onEquip(item.id, 'frame')} className={`relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${user.frameId === item.id ? 'bg-yellow-900/20 border-yellow-500' : 'bg-slate-900 border-white/10 hover:border-white/30'}`}>
                                        <div className="relative mb-2 scale-90">
                                            <Avatar avatarId={user.avatarId} frameId={item.id} size="md" showFrame={true} />
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-300 uppercase truncate w-full text-center">{item.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
