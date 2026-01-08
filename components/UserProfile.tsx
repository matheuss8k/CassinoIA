
import React, { useState, useEffect } from 'react';
import { User, Mission, StoreItem, TROPHY_MAP } from '../types';
import { DatabaseService } from '../services/database';
import { User as UserIcon, Shield, Wallet, Trophy as TrophyIcon, Mail, Hash, Calendar, Star, Crown, Edit2, CheckCircle, XCircle, AlertCircle, Camera, Upload, Bot, Skull, Ghost, Sword, Zap, Glasses, Target, ShoppingBag, Coins, Gift, Lock, Unlock, FileText, Smartphone, Check, X, Clock, Sparkles } from 'lucide-react';
import { Button } from './UI/Button';

interface UserProfileProps {
  user: User;
  onUpdateUser?: (updatedUser: User) => void;
}

// Avatares Gratuitos (Padrão)
const FREE_AVATARS = [
    { id: '1', icon: <UserIcon size={24} />, name: 'Padrão', bg: 'from-slate-700 to-slate-800' },
    { id: '2', icon: <Bot size={24} />, name: 'Cyber Bot', bg: 'from-cyan-900 to-cyan-700' },
    { id: '3', icon: <Skull size={24} />, name: 'High Risk', bg: 'from-red-900 to-red-700' },
    { id: '4', icon: <Ghost size={24} />, name: 'Stealth', bg: 'from-purple-900 to-purple-700' },
    { id: '5', icon: <Sword size={24} />, name: 'Warrior', bg: 'from-orange-900 to-orange-700' },
    { id: '6', icon: <Zap size={24} />, name: 'Speed', bg: 'from-yellow-700 to-yellow-500' },
    { id: '7', icon: <Glasses size={24} />, name: 'Dealer', bg: 'from-emerald-900 to-emerald-700' },
    { id: '8', icon: <Crown size={24} />, name: 'King', bg: 'from-pink-900 to-pink-700' },
];

const STORE_ITEMS: StoreItem[] = [
    // Consumíveis e Cosméticos
    { id: 'insurance', name: 'Seguro 5%', description: 'Protege 5% da próxima aposta', cost: 800, type: 'consumable', icon: 'shield' },
    { id: 'frame_gold', name: 'Moldura Gold', description: 'Borda de ouro no perfil', cost: 2500, type: 'cosmetic', icon: 'frame' },
    
    // Avatares Premium
    { id: 'avatar_rich', name: 'Mr. Monopoly', description: 'Avatar exclusivo de magnata', cost: 5000, type: 'cosmetic', icon: 'avatar_rich' },
    { id: 'avatar_alien', name: 'Alien VIP', description: 'De outro mundo', cost: 3000, type: 'cosmetic', icon: 'avatar_alien' },
    { id: 'avatar_robot_gold', name: 'Golden Bot', description: 'Robô banhado a ouro', cost: 8000, type: 'cosmetic', icon: 'avatar_robot_gold' },
    { id: 'avatar_dragon', name: 'Dragon Lord', description: 'Poder supremo', cost: 10000, type: 'cosmetic', icon: 'avatar_dragon' },
];

const getPremiumAvatarIcon = (id: string) => {
    switch(id) {
        case 'avatar_rich': return { icon: <span className="text-xl font-black text-white">$</span>, bg: 'from-yellow-600 to-yellow-900' };
        case 'avatar_alien': return { icon: <span className="text-xl">👽</span>, bg: 'from-green-600 to-emerald-900' };
        case 'avatar_robot_gold': return { icon: <Bot size={24} className="text-yellow-200" />, bg: 'from-yellow-500 to-orange-600' };
        case 'avatar_dragon': return { icon: <Zap size={24} className="text-red-200" />, bg: 'from-red-600 to-purple-900' };
        default: return { icon: <Star size={24} />, bg: 'from-slate-700 to-slate-900' };
    }
};

export const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'missions' | 'trophies' | 'store'>('profile');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [timeToReset, setTimeToReset] = useState<string>('');

  const getAvatarConfig = (id: string) => {
      const free = FREE_AVATARS.find(a => a.id === id);
      if (free) return free;
      const premium = STORE_ITEMS.find(i => i.id === id);
      if (premium) {
          const style = getPremiumAvatarIcon(premium.id);
          return { id: premium.id, icon: style.icon, name: premium.name, bg: style.bg };
      }
      return FREE_AVATARS[0];
  };

  const currentAvatar = getAvatarConfig(user.avatarId);

  // Showcase Logic: Filter unlocked then sort by rarity
  const unlockedTrophiesList = TROPHY_MAP.filter(t => user.unlockedTrophies?.includes(t.id));
  const trophyShowcase = unlockedTrophiesList.sort((a, b) => {
      const priority = { legendary: 3, rare: 2, common: 1 };
      return priority[b.rarity] - priority[a.rarity];
  }).slice(0, 3); // Top 3

  useEffect(() => {
    const updateTimer = () => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0); 
        const diff = tomorrow.getTime() - now.getTime();
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeToReset(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCPFDisplay = (cpf: string | undefined) => {
      if (!cpf) return '---';
      const nums = cpf.replace(/\D/g, '');
      if (nums.length !== 11) return cpf; 
      return `***.${nums.slice(3, 6)}.${nums.slice(6, 9)}-**`;
  };

  const maskedCpf = formatCPFDisplay(user.cpf);

  const handleAvatarSelect = async (avatarId: string) => {
      const isPremium = STORE_ITEMS.some(i => i.id === avatarId);
      if (isPremium && !user.ownedItems?.includes(avatarId)) {
          if(confirm("Este avatar é exclusivo! Deseja ir para a loja adquirí-lo?")) {
              setIsAvatarModalOpen(false);
              setActiveTab('store');
          }
          return;
      }
      try {
          if (!user.id) return;
          await DatabaseService.updateAvatar(user.id, avatarId);
          if (onUpdateUser) onUpdateUser({ ...user, avatarId });
          setIsAvatarModalOpen(false);
      } catch (e: any) { alert("Erro ao atualizar avatar"); }
  };

  const handleVerifyRequest = async () => {
      if (user.documentsStatus === 'PENDING' || user.isVerified) return;
      if (!confirm("Confirmar envio dos documentos para análise?")) return;
      setIsUploading(true);
      setTimeout(async () => {
          try {
              await DatabaseService.requestVerification(user.id);
              if (onUpdateUser) onUpdateUser({ ...user, documentsStatus: 'PENDING' as any });
              alert("Documentos enviados com sucesso!");
          } catch (e) { alert("Erro ao enviar documentos."); } 
          finally { setIsUploading(false); }
      }, 2000);
  };

  const handlePurchase = async (item: StoreItem) => {
      if (user.ownedItems?.includes(item.id) && item.type === 'cosmetic') return;
      if (user.loyaltyPoints < item.cost) { alert("Pontos insuficientes!"); return; }
      if (confirm(`Comprar ${item.name} por ${item.cost} pontos?`)) {
          try {
              const res = await DatabaseService.purchaseItem(user.id, item.id, item.cost);
              if (onUpdateUser) {
                  onUpdateUser({ ...user, loyaltyPoints: res.newPoints, ownedItems: res.ownedItems });
              }
              alert(`${item.name} adquirido com sucesso!`);
          } catch (e: any) { alert(e.message || "Erro na compra."); }
      }
  };

  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar p-3 md:p-6 animate-slide-up pb-0 relative">
      {/* AVATAR MODAL */}
      {isAvatarModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-2xl p-5 relative shadow-2xl overflow-y-auto max-h-[80vh] no-scrollbar">
                  <button onClick={() => setIsAvatarModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><XCircle size={20} /></button>
                  <h3 className="text-lg font-bold text-white mb-4">Escolha seu Avatar</h3>
                  <h4 className="text-[10px] text-slate-500 uppercase font-bold mb-2 tracking-widest">Padrão</h4>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                      {FREE_AVATARS.map((opt) => (
                          <button key={opt.id} onClick={() => handleAvatarSelect(opt.id)} className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all hover:scale-105 ${user.avatarId === opt.id ? 'bg-slate-800 border-casino-gold shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'bg-slate-950 border-white/5 hover:border-white/20'}`}>
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${opt.bg} text-white shadow-lg`}>{opt.icon}</div>
                              <span className="text-[9px] font-bold text-slate-300 uppercase truncate w-full text-center">{opt.name}</span>
                          </button>
                      ))}
                  </div>
                  <h4 className="text-[10px] text-yellow-500 uppercase font-bold mb-2 tracking-widest flex items-center gap-1"><Star size={10}/> Premium</h4>
                  <div className="grid grid-cols-4 gap-3">
                      {STORE_ITEMS.filter(i => i.id.startsWith('avatar_')).map((item) => {
                          const style = getPremiumAvatarIcon(item.id);
                          const isOwned = user.ownedItems?.includes(item.id);
                          return (
                            <button key={item.id} onClick={() => handleAvatarSelect(item.id)} className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${user.avatarId === item.id ? 'bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : isOwned ? 'bg-slate-900 border-white/10 hover:border-white/30' : 'bg-slate-950/50 border-white/5 opacity-70 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${style.bg} text-white shadow-lg relative`}>{style.icon}{!isOwned && (<div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center"><Lock size={14} className="text-white"/></div>)}</div>
                                <span className="text-[9px] font-bold text-slate-300 uppercase truncate w-full text-center">{item.name}</span>
                            </button>
                          );
                      })}
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-4xl mx-auto space-y-4">
        {/* COMPACT HEADER */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-white/10 shadow-xl w-full flex flex-col md:flex-row">
           <div className="absolute inset-0 bg-gradient-to-r from-casino-purple via-indigo-900 to-slate-900 opacity-80 z-0"></div>
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 z-0"></div>
           <div className="relative z-10 p-5 md:p-6 flex flex-col md:flex-row items-center gap-5 w-full">
              <div className="relative group cursor-pointer shrink-0" onClick={() => setIsAvatarModalOpen(true)}>
                  <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-slate-900/50 flex items-center justify-center shadow-2xl relative z-10 overflow-hidden bg-gradient-to-br ${currentAvatar.bg}`}>
                      <div className="text-white drop-shadow-md transform group-hover:scale-110 transition-transform duration-300">{currentAvatar.icon}</div>
                  </div>
              </div>
              <div className="flex-1 text-center md:text-left w-full min-w-0">
                  <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight break-words">{user.fullName}</h1>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                      <span className="bg-black/30 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-white/5 whitespace-nowrap">@{user.username}</span>
                      {user.isVerified ? <span className="flex items-center gap-1 text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20 text-[10px] font-bold whitespace-nowrap"><CheckCircle size={10} /> Verificado</span> : <span className="flex items-center gap-1 text-red-400 bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20 text-[10px] font-bold whitespace-nowrap"><AlertCircle size={10} /> Não Verificado</span>}
                  </div>
                  
                  {/* MINI HALL OF FAME */}
                  {trophyShowcase.length > 0 && (
                      <div className="mt-3 flex items-center justify-center md:justify-start gap-1.5">
                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-widest mr-1">Top</span>
                          {trophyShowcase.map(trophy => (
                              <div key={trophy.id} className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs relative group cursor-help ${trophy.rarity === 'legendary' ? 'bg-yellow-900/40 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]' : trophy.rarity === 'rare' ? 'bg-blue-900/40 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`} title={trophy.name}>
                                  {trophy.icon}
                                  {trophy.rarity === 'legendary' && <div className="absolute -top-1 -right-1 text-yellow-500 drop-shadow-md"><Crown size={8} fill="currentColor"/></div>}
                              </div>
                          ))}
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

        {/* TABS COMPACTAS */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[ { id: 'profile', icon: <UserIcon size={14} />, label: 'Perfil' }, { id: 'missions', icon: <Target size={14} />, label: 'Missões' }, { id: 'trophies', icon: <TrophyIcon size={14} />, label: 'Conquistas' }, { id: 'store', icon: <ShoppingBag size={14} />, label: 'Loja' } ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap border ${activeTab === tab.id ? 'bg-white text-black border-white shadow-sm scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>{tab.icon} {tab.label}</button>
            ))}
        </div>

        <div className="min-h-[350px]">
            {activeTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
                    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl h-full">
                         <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 pb-2 border-b border-white/5"><Hash size={16} className="text-purple-500"/> Dados Pessoais</h3>
                         <div className="space-y-3">
                            <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><Mail size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">Email</p><p className="text-xs font-medium text-slate-200">{user.email || "Não informado"}</p></div></div>
                            <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><FileText size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">CPF (Segurança)</p><p className="text-xs font-medium text-slate-200 font-mono tracking-wider">{maskedCpf}</p></div></div>
                            <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><Calendar size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">Data de Nascimento</p><p className="text-xs font-medium text-slate-200">{user.birthDate || "Não informado"}</p></div></div>
                         </div>
                    </div>
                    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5"><h3 className="text-base font-bold text-white flex items-center gap-2"><Shield size={16} className="text-green-500"/> Verificação</h3><span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${user.isVerified ? 'bg-green-600/20 text-green-400 border-green-500/50' : user.documentsStatus === 'PENDING' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50' : 'bg-red-600/20 text-red-400 border-red-500/50'}`}>{user.isVerified ? 'VERIFICADO' : user.documentsStatus === 'PENDING' ? 'EM ANÁLISE' : 'NÃO VERIFICADO'}</span></div>
                        {!user.isVerified && user.documentsStatus !== 'PENDING' && (
                            <div className="space-y-4 flex-1 flex flex-col justify-between animate-fade-in">
                                <div className="bg-slate-950/40 p-3 rounded-xl border border-white/5 space-y-2"><p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Dicas para aprovação:</p><div className="flex gap-2"><div className="flex-1 space-y-1"><div className="flex items-center gap-2 text-[10px] text-slate-300"><Check size={10} className="text-green-500" /> Sem plástico</div><div className="flex items-center gap-2 text-[10px] text-slate-300"><Check size={10} className="text-green-500" /> Legível</div></div><div className="flex-1 space-y-1"><div className="flex items-center gap-2 text-[10px] text-slate-400"><X size={10} className="text-red-500" /> Tremida</div><div className="flex items-center gap-2 text-[10px] text-slate-400"><X size={10} className="text-red-500" /> Cortada</div></div></div></div>
                                <div><div className="flex gap-2 mb-3"><button className="flex-1 h-16 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Upload size={16} className="group-hover:text-white transition-colors"/><span className="text-[8px] font-bold group-hover:text-white transition-colors">DOCUMENTO</span></button><button className="flex-1 h-16 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Camera size={16} className="group-hover:text-white transition-colors"/><span className="text-[8px] font-bold group-hover:text-white transition-colors">SELFIE</span></button></div><Button fullWidth onClick={handleVerifyRequest} disabled={isUploading} variant="primary" size="sm">{isUploading ? 'Enviando...' : 'ENVIAR ANÁLISE'}</Button></div>
                            </div>
                        )}
                        {user.documentsStatus === 'PENDING' && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-3 p-4 opacity-80 animate-pulse"><div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center"><FileText size={24} className="text-yellow-500"/></div><div><h4 className="text-white font-bold text-sm">Documentos em Análise</h4><p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Nossa equipe de segurança está validando seus dados. <br/><span className="text-yellow-500">Tempo estimado: até 24 horas.</span></p></div></div>)}
                        {user.isVerified && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-3 p-4 animate-fade-in"><div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)]"><CheckCircle size={32} className="text-green-500"/></div><div><h4 className="text-lg font-bold text-white">Conta Verificada!</h4><p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Você tem acesso total a saques instantâneos.</p></div></div>)}
                    </div>
                </div>
            )}
            {activeTab === 'missions' && (
                <div className="animate-fade-in space-y-3">
                    <div className="bg-slate-900 border border-white/10 rounded-xl p-2.5 flex items-center justify-between shadow-lg"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Clock size={14} /></div><div><h3 className="font-bold text-white text-[10px] uppercase tracking-wide">Reset Diário</h3></div></div><div className="bg-black/50 px-2 py-0.5 rounded border border-white/5 font-mono font-bold text-blue-400 text-xs tracking-widest shadow-inner">{timeToReset || "00:00:00"}</div></div>
                    <div className="grid grid-cols-1 gap-3">
                        {user.missions && user.missions.length > 0 ? (user.missions.map((mission) => {
                            const displayCurrent = Math.floor(mission.current);
                            const displayTarget = Math.floor(mission.target);
                            return (<div key={mission.id} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${mission.completed ? 'bg-green-900/10 border-green-500/30 opacity-60' : 'bg-slate-900 border-white/10'}`}><div className="flex-1"><h4 className={`font-bold text-sm ${mission.completed ? 'text-green-400 line-through' : 'text-white'}`}>{mission.description}</h4><div className="flex gap-2 text-[10px] mt-1"><span className="text-yellow-500 font-bold flex items-center gap-1"><Coins size={8}/> {Math.floor(mission.rewardPoints)} Pontos</span></div><div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (displayCurrent / displayTarget) * 100)}%` }}></div></div></div><div className="ml-3 text-right"><span className="text-base font-black text-slate-500">{displayCurrent}/{displayTarget}</span></div></div>)
                        })) : (<div className="text-center p-8 bg-slate-900/50 rounded-xl border border-white/5 text-slate-500 text-xs">Nenhuma missão ativa hoje. Volte amanhã!</div>)}
                    </div>
                </div>
            )}
            {activeTab === 'trophies' && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-fade-in">
                    {TROPHY_MAP.map(trophy => { 
                        const isUnlocked = user.unlockedTrophies?.includes(trophy.id); 
                        const rarityBorder = { legendary: 'border-yellow-500', rare: 'border-blue-500', common: 'border-white/10' };
                        const rarityText = { legendary: 'text-yellow-500', rare: 'text-blue-400', common: 'text-slate-500' };
                        
                        return (
                            <div key={trophy.id} className={`p-3 rounded-xl border text-center relative overflow-hidden group transition-all duration-300 ${isUnlocked ? `bg-gradient-to-br from-slate-800 to-slate-950 ${rarityBorder[trophy.rarity] || 'border-white/10'} shadow-lg hover:-translate-y-1` : 'bg-slate-950 border-white/5 opacity-50 grayscale'}`}>
                                <div className="absolute top-1 right-1 flex flex-col items-end">
                                    {!isUnlocked && <Lock size={10} className="text-slate-600 mb-0.5"/>}
                                    {isUnlocked && trophy.rarity === 'legendary' && <Crown size={10} className="text-yellow-500 animate-pulse"/>}
                                </div>
                                <div className="text-2xl mb-2 filter drop-shadow-lg transform group-hover:scale-110 transition-transform duration-300">{trophy.icon}</div>
                                <h4 className={`font-bold text-xs leading-tight mb-0.5 ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>{trophy.name}</h4>
                                <span className={`text-[8px] uppercase font-bold tracking-widest ${rarityText[trophy.rarity]}`}>{trophy.rarity}</span>
                                <p className="text-[9px] text-slate-400 mt-1 leading-tight opacity-80">{trophy.description}</p>
                            </div>
                        ) 
                    })}
                </div>
            )}
            {activeTab === 'store' && (
                <div className="animate-fade-in space-y-6">
                     <section><div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-1"><Sparkles size={14} className="text-purple-400"/><h4 className="text-xs font-bold text-white uppercase tracking-wider">Avatares Premium</h4></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{STORE_ITEMS.filter(i => i.id.startsWith('avatar_')).map(item => { const isOwned = user.ownedItems?.includes(item.id); const style = getPremiumAvatarIcon(item.id); return (<div key={item.id} className="bg-slate-900 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-between group hover:border-purple-500/50 transition-all text-center relative overflow-hidden">{isOwned && <div className="absolute top-1 right-1 bg-green-500/20 text-green-400 p-0.5 rounded-full"><Check size={10}/></div>}<div className={`w-12 h-12 rounded-full bg-gradient-to-br ${style.bg} flex items-center justify-center text-white mb-2 shadow-lg group-hover:scale-110 transition-transform`}>{style.icon}</div><h4 className="font-bold text-white text-xs leading-tight mb-0.5">{item.name}</h4><p className="text-[9px] text-slate-400 mb-2">{item.description}</p><div className="mt-auto w-full">{isOwned ? (<button onClick={() => handleAvatarSelect(item.id)} className="w-full bg-white/5 hover:bg-white/10 text-white text-[9px] py-1.5 rounded-lg font-bold">EQUIPAR</button>) : (<button onClick={() => handlePurchase(item)} className="w-full bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-500/30 text-[9px] py-1.5 rounded-lg font-bold flex items-center justify-center gap-1"><Coins size={8}/> {item.cost}</button>)}</div></div>) })}</div></section>
                     <section><div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-1"><ShoppingBag size={14} className="text-blue-400"/><h4 className="text-xs font-bold text-white uppercase tracking-wider">Consumíveis</h4></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{STORE_ITEMS.filter(i => !i.id.startsWith('avatar_')).map(item => { const isOwned = user.ownedItems?.includes(item.id); return (<div key={item.id} className={`bg-slate-900 border rounded-xl p-3 flex items-center justify-between group transition-all ${isOwned ? 'border-green-500/30' : 'border-white/10 hover:border-casino-gold/30'}`}><div className="flex items-center gap-3"><div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl border border-white/5 relative">{item.type === 'cosmetic' ? '🎨' : '🧪'}{isOwned && <div className="absolute -top-1 -right-1 bg-green-500 text-black rounded-full p-0.5"><Check size={8} strokeWidth={4}/></div>}</div><div><h4 className={`font-bold text-xs transition-colors ${isOwned ? 'text-green-400' : 'text-white group-hover:text-casino-gold'}`}>{item.name}</h4><p className="text-[9px] text-slate-400">{item.description}</p></div></div><div className="text-right"><p className="text-sm font-bold text-yellow-500 flex items-center justify-end gap-1"><Coins size={10}/> {item.cost}</p><button onClick={() => handlePurchase(item)} disabled={isOwned && item.type === 'cosmetic'} className={`mt-1 text-[9px] px-2 py-1 rounded font-bold transition-colors ${isOwned && item.type === 'cosmetic' ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-white/10 hover:bg-white/20 text-white'}`}>{isOwned && item.type === 'cosmetic' ? 'ADQUIRIDO' : 'COMPRAR'}</button></div></div>); })}</div></section>
                </div>
            )}
        </div>
        
        <div className="w-full text-center py-6 text-slate-600 text-[9px] uppercase tracking-widest font-bold opacity-50 select-none">
            &copy; 2024 Cassino IA. Jogue com responsabilidade.
        </div>
      </div>
    </div>
  );
};
