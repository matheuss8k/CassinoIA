
import React, { useState, useEffect } from 'react';
import { User, Mission, Trophy, StoreItem } from '../types';
import { DatabaseService } from '../services/database';
import { User as UserIcon, Shield, Wallet, Trophy as TrophyIcon, Mail, Hash, Calendar, Star, Crown, Edit2, CheckCircle, XCircle, AlertCircle, Camera, Upload, Bot, Skull, Ghost, Sword, Zap, Glasses, Target, ShoppingBag, Coins, Gift, Lock, Unlock, FileText, Smartphone, Check, X, Clock, Sparkles } from 'lucide-react';
import { Button } from './UI/Button';

interface UserProfileProps {
  user: User;
  onUpdateUser?: (updatedUser: User) => void;
}

// Avatares Gratuitos (Padrão)
const FREE_AVATARS = [
    { id: '1', icon: <UserIcon size={32} />, name: 'Padrão', bg: 'from-slate-700 to-slate-800' },
    { id: '2', icon: <Bot size={32} />, name: 'Cyber Bot', bg: 'from-cyan-900 to-cyan-700' },
    { id: '3', icon: <Skull size={32} />, name: 'High Risk', bg: 'from-red-900 to-red-700' },
    { id: '4', icon: <Ghost size={32} />, name: 'Stealth', bg: 'from-purple-900 to-purple-700' },
    { id: '5', icon: <Sword size={32} />, name: 'Warrior', bg: 'from-orange-900 to-orange-700' },
    { id: '6', icon: <Zap size={32} />, name: 'Speed', bg: 'from-yellow-700 to-yellow-500' },
    { id: '7', icon: <Glasses size={32} />, name: 'Dealer', bg: 'from-emerald-900 to-emerald-700' },
    { id: '8', icon: <Crown size={32} />, name: 'King', bg: 'from-pink-900 to-pink-700' },
];

const STORE_ITEMS: StoreItem[] = [
    // Consumíveis e Cosméticos (Removido XP Boost)
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
        case 'avatar_rich': return { icon: <span className="text-2xl font-black text-white">$</span>, bg: 'from-yellow-600 to-yellow-900' };
        case 'avatar_alien': return { icon: <span className="text-2xl">👽</span>, bg: 'from-green-600 to-emerald-900' };
        case 'avatar_robot_gold': return { icon: <Bot size={32} className="text-yellow-200" />, bg: 'from-yellow-500 to-orange-600' };
        case 'avatar_dragon': return { icon: <Zap size={32} className="text-red-200" />, bg: 'from-red-600 to-purple-900' };
        default: return { icon: <Star size={32} />, bg: 'from-slate-700 to-slate-900' };
    }
};

const ALL_TROPHIES: Trophy[] = [
    { id: 'first_win', name: 'Primeira Vitória', description: 'Vença sua primeira mão de Blackjack', icon: '🏆' },
    { id: 'high_roller', name: 'High Roller', description: 'Faça uma aposta de R$ 500+', icon: '💎' },
    { id: 'sniper', name: 'Sniper', description: 'Acerte 20 casas no Mines', icon: '🎯' },
    { id: 'club_50', name: 'Clube dos 50', description: 'Jogue 50 partidas', icon: '🎰' },
    { id: 'bj_master', name: 'Mestre BJ', description: 'Consiga 10 Blackjacks naturais', icon: '♠️' },
    { id: 'rich_club', name: 'Magnata', description: 'Alcance saldo de R$ 5.000', icon: '💰' },
    { id: 'loyal_player', name: 'Fiel', description: 'Complete 30 missões diárias', icon: '🤝' },
];

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
    <div className="w-full h-full overflow-y-auto no-scrollbar p-4 md:p-8 animate-slide-up pb-0 relative">
      {/* AVATAR MODAL */}
      {isAvatarModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-3xl p-6 relative shadow-2xl overflow-y-auto max-h-[80vh] no-scrollbar">
                  <button onClick={() => setIsAvatarModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><XCircle /></button>
                  <h3 className="text-xl font-bold text-white mb-6">Escolha seu Avatar</h3>
                  <h4 className="text-xs text-slate-500 uppercase font-bold mb-3 tracking-widest">Padrão</h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mb-6">
                      {FREE_AVATARS.map((opt) => (
                          <button key={opt.id} onClick={() => handleAvatarSelect(opt.id)} className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all hover:scale-105 ${user.avatarId === opt.id ? 'bg-slate-800 border-casino-gold shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'bg-slate-950 border-white/5 hover:border-white/20'}`}>
                              <div className={`w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br ${opt.bg} text-white shadow-lg`}>{opt.icon}</div>
                              <span className="text-[10px] font-bold text-slate-300 uppercase truncate w-full text-center">{opt.name}</span>
                          </button>
                      ))}
                  </div>
                  <h4 className="text-xs text-yellow-500 uppercase font-bold mb-3 tracking-widest flex items-center gap-1"><Star size={12}/> Premium</h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                      {STORE_ITEMS.filter(i => i.id.startsWith('avatar_')).map((item) => {
                          const style = getPremiumAvatarIcon(item.id);
                          const isOwned = user.ownedItems?.includes(item.id);
                          return (
                            <button key={item.id} onClick={() => handleAvatarSelect(item.id)} className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${user.avatarId === item.id ? 'bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : isOwned ? 'bg-slate-900 border-white/10 hover:border-white/30' : 'bg-slate-950/50 border-white/5 opacity-70 grayscale hover:opacity-100 hover:grayscale-0'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br ${style.bg} text-white shadow-lg relative`}>{style.icon}{!isOwned && (<div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center"><Lock size={16} className="text-white"/></div>)}</div>
                                <span className="text-[10px] font-bold text-slate-300 uppercase truncate w-full text-center">{item.name}</span>
                            </button>
                          );
                      })}
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-white/10 shadow-2xl w-full flex flex-col md:flex-row">
           <div className="absolute inset-0 bg-gradient-to-r from-casino-purple via-indigo-900 to-slate-900 opacity-80 z-0"></div>
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 z-0"></div>
           <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8 w-full">
              <div className="relative group cursor-pointer shrink-0" onClick={() => setIsAvatarModalOpen(true)}>
                  <div className={`w-28 h-28 md:w-32 md:h-32 rounded-full border-4 border-slate-900/50 flex items-center justify-center shadow-2xl relative z-10 overflow-hidden bg-gradient-to-br ${currentAvatar.bg}`}>
                      <div className="text-white drop-shadow-md transform group-hover:scale-110 transition-transform duration-300">{currentAvatar.icon}</div>
                  </div>
              </div>
              <div className="flex-1 text-center md:text-left w-full min-w-0">
                  <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight break-words">{user.fullName}</h1>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                      <span className="bg-black/30 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-mono text-slate-300 border border-white/5 whitespace-nowrap">@{user.username}</span>
                      {user.isVerified ? <span className="flex items-center gap-1 text-green-400 bg-green-900/30 px-3 py-1 rounded-lg border border-green-500/20 text-xs font-bold whitespace-nowrap"><CheckCircle size={12} /> Verificado</span> : <span className="flex items-center gap-1 text-red-400 bg-red-900/30 px-3 py-1 rounded-lg border border-red-500/20 text-xs font-bold whitespace-nowrap"><AlertCircle size={12} /> Não Verificado</span>}
                  </div>
              </div>
              <div className="md:ml-auto shrink-0 mt-4 md:mt-0 w-full md:w-auto">
                  <div className="bg-black/30 backdrop-blur-md border border-casino-gold/30 p-3 rounded-xl flex items-center justify-center md:justify-start gap-3 w-full">
                      <div className="w-10 h-10 rounded-full bg-casino-gold/10 flex items-center justify-center text-casino-gold border border-casino-gold/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]"><Coins size={20} /></div>
                      <div className="text-left"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Pontos Loja</p><p className="text-xl font-bold text-white leading-none">{Math.floor(user.loyaltyPoints || 0)}</p></div>
                  </div>
              </div>
           </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {[ { id: 'profile', icon: <UserIcon size={16} />, label: 'Perfil' }, { id: 'missions', icon: <Target size={16} />, label: 'Missões' }, { id: 'trophies', icon: <TrophyIcon size={16} />, label: 'Conquistas' }, { id: 'store', icon: <ShoppingBag size={16} />, label: 'Loja' } ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap border ${activeTab === tab.id ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>{tab.icon} {tab.label}</button>
            ))}
        </div>

        <div className="min-h-[400px]">
            {activeTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl h-full">
                         <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 pb-2 border-b border-white/5"><Hash size={20} className="text-purple-500"/> Dados Pessoais</h3>
                         <div className="space-y-4">
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-2 bg-slate-800 rounded-lg text-slate-400"><Mail size={18}/></div><div><p className="text-[10px] text-slate-500 uppercase font-bold">Email</p><p className="text-sm font-medium text-slate-200">{user.email || "Não informado"}</p></div></div>
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-2 bg-slate-800 rounded-lg text-slate-400"><FileText size={18}/></div><div><p className="text-[10px] text-slate-500 uppercase font-bold">CPF (Segurança)</p><p className="text-sm font-medium text-slate-200 font-mono tracking-wider">{maskedCpf}</p></div></div>
                            <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-2 bg-slate-800 rounded-lg text-slate-400"><Calendar size={18}/></div><div><p className="text-[10px] text-slate-500 uppercase font-bold">Data de Nascimento</p><p className="text-sm font-medium text-slate-200">{user.birthDate || "Não informado"}</p></div></div>
                         </div>
                    </div>
                    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-2 border-b border-white/5"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Shield size={20} className="text-green-500"/> Verificação de Conta</h3><span className={`text-[10px] px-2 py-1 rounded font-bold border ${user.isVerified ? 'bg-green-600/20 text-green-400 border-green-500/50' : user.documentsStatus === 'PENDING' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50' : 'bg-red-600/20 text-red-400 border-red-500/50'}`}>{user.isVerified ? 'VERIFICADO' : user.documentsStatus === 'PENDING' ? 'EM ANÁLISE' : 'NÃO VERIFICADO'}</span></div>
                        {!user.isVerified && user.documentsStatus !== 'PENDING' && (
                            <div className="space-y-6 flex-1 flex flex-col justify-between animate-fade-in">
                                <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-3"><p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Critérios para aprovação rápida:</p><div className="flex gap-4"><div className="flex-1 space-y-2"><div className="flex items-center gap-2 text-xs text-slate-300"><Check size={14} className="text-green-500" /> Documento fora do plástico</div><div className="flex items-center gap-2 text-xs text-slate-300"><Check size={14} className="text-green-500" /> Boa iluminação e foco</div></div><div className="flex-1 space-y-2"><div className="flex items-center gap-2 text-xs text-slate-400"><X size={14} className="text-red-500" /> Fotos tremidas</div><div className="flex items-center gap-2 text-xs text-slate-400"><X size={14} className="text-red-500" /> Cortes ou reflexos</div></div></div></div>
                                <div><div className="flex gap-3 mb-4"><button className="flex-1 h-20 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Upload size={20} className="group-hover:text-white transition-colors"/><span className="text-[10px] font-bold group-hover:text-white transition-colors">UPLOAD DOCUMENTO</span></button><button className="flex-1 h-20 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Camera size={20} className="group-hover:text-white transition-colors"/><span className="text-[10px] font-bold group-hover:text-white transition-colors">TIRAR SELFIE</span></button></div><Button fullWidth onClick={handleVerifyRequest} disabled={isUploading} variant="primary">{isUploading ? 'Enviando Dados...' : 'ENVIAR PARA ANÁLISE'}</Button></div>
                            </div>
                        )}
                        {user.documentsStatus === 'PENDING' && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 p-8 opacity-80 animate-pulse"><div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center"><FileText size={32} className="text-yellow-500"/></div><div><h4 className="text-white font-bold text-lg">Documentos em Análise</h4><p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">Nossa equipe de segurança está validando seus dados. <br/><span className="text-yellow-500">Tempo estimado: até 24 horas.</span></p></div></div>)}
                        {user.isVerified && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 p-8 animate-fade-in"><div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)]"><CheckCircle size={40} className="text-green-500"/></div><div><h4 className="text-xl font-bold text-white">Conta Verificada!</h4><p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">Você tem acesso total a saques instantâneos e limites aumentados.</p></div></div>)}
                    </div>
                </div>
            )}
            {activeTab === 'missions' && (
                <div className="animate-fade-in space-y-4">
                    <div className="bg-slate-900 border border-white/10 rounded-xl p-3 flex items-center justify-between shadow-lg"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Clock size={16} /></div><div><h3 className="font-bold text-white text-xs uppercase tracking-wide">Reset Diário</h3></div></div><div className="bg-black/50 px-3 py-1 rounded border border-white/5 font-mono font-bold text-blue-400 text-sm tracking-widest shadow-inner">{timeToReset || "00:00:00"}</div></div>
                    <div className="grid grid-cols-1 gap-4">
                        {user.missions && user.missions.length > 0 ? (user.missions.map((mission) => {
                            // Logic for visual integers
                            const displayCurrent = Math.floor(mission.current);
                            const displayTarget = Math.floor(mission.target);
                            
                            return (<div key={mission.id} className={`p-5 rounded-2xl border flex items-center justify-between transition-all ${mission.completed ? 'bg-green-900/10 border-green-500/30 opacity-60' : 'bg-slate-900 border-white/10'}`}><div className="flex-1"><h4 className={`font-bold ${mission.completed ? 'text-green-400 line-through' : 'text-white'}`}>{mission.description}</h4><div className="flex gap-3 text-xs mt-1"><span className="text-yellow-500 font-bold flex items-center gap-1"><Coins size={10}/> {Math.floor(mission.rewardPoints)} Pontos</span></div><div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (displayCurrent / displayTarget) * 100)}%` }}></div></div></div><div className="ml-4 text-right"><span className="text-xl font-black text-slate-500">{displayCurrent}/{displayTarget}</span></div></div>)
                        })) : (<div className="text-center p-10 bg-slate-900/50 rounded-2xl border border-white/5 text-slate-500">Nenhuma missão ativa hoje. Volte amanhã!</div>)}
                    </div>
                </div>
            )}
            {activeTab === 'trophies' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
                    {ALL_TROPHIES.map(trophy => { const isUnlocked = user.unlockedTrophies?.includes(trophy.id); return (<div key={trophy.id} className={`p-4 rounded-2xl border text-center relative overflow-hidden group ${isUnlocked ? 'bg-gradient-to-br from-yellow-900/20 to-slate-900 border-yellow-500/30' : 'bg-slate-950 border-white/5 opacity-50 grayscale'}`}><div className="text-4xl mb-2 filter drop-shadow-lg transform group-hover:scale-110 transition-transform">{trophy.icon}</div><h4 className={`font-bold text-sm ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>{trophy.name}</h4><p className="text-[10px] text-slate-400 mt-1">{trophy.description}</p>{!isUnlocked && <div className="absolute top-2 right-2 text-slate-600"><Lock size={12}/></div>}</div>) })}
                </div>
            )}
            {activeTab === 'store' && (
                <div className="animate-fade-in space-y-8">
                     <section><div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2"><Sparkles size={16} className="text-purple-400"/><h4 className="text-sm font-bold text-white uppercase tracking-wider">Avatares Exclusivos</h4></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{STORE_ITEMS.filter(i => i.id.startsWith('avatar_')).map(item => { const isOwned = user.ownedItems?.includes(item.id); const style = getPremiumAvatarIcon(item.id); return (<div key={item.id} className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-between group hover:border-purple-500/50 transition-all text-center relative overflow-hidden">{isOwned && <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 p-1 rounded-full"><Check size={12}/></div>}<div className={`w-16 h-16 rounded-full bg-gradient-to-br ${style.bg} flex items-center justify-center text-white mb-3 shadow-lg group-hover:scale-110 transition-transform`}>{style.icon}</div><h4 className="font-bold text-white text-sm leading-tight mb-1">{item.name}</h4><p className="text-[10px] text-slate-400 mb-3">{item.description}</p><div className="mt-auto w-full">{isOwned ? (<button onClick={() => handleAvatarSelect(item.id)} className="w-full bg-white/5 hover:bg-white/10 text-white text-xs py-2 rounded-lg font-bold">EQUIPAR</button>) : (<button onClick={() => handlePurchase(item)} className="w-full bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-500/30 text-xs py-2 rounded-lg font-bold flex items-center justify-center gap-1"><Coins size={10}/> {item.cost}</button>)}</div></div>) })}</div></section>
                     <section><div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2"><ShoppingBag size={16} className="text-blue-400"/><h4 className="text-sm font-bold text-white uppercase tracking-wider">Itens & Consumíveis</h4></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{STORE_ITEMS.filter(i => !i.id.startsWith('avatar_')).map(item => { const isOwned = user.ownedItems?.includes(item.id); return (<div key={item.id} className={`bg-slate-900 border rounded-2xl p-4 flex items-center justify-between group transition-all ${isOwned ? 'border-green-500/30' : 'border-white/10 hover:border-casino-gold/30'}`}><div className="flex items-center gap-4"><div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-2xl border border-white/5 relative">{item.type === 'cosmetic' ? '🎨' : '🧪'}{isOwned && <div className="absolute -top-1 -right-1 bg-green-500 text-black rounded-full p-0.5"><Check size={10} strokeWidth={4}/></div>}</div><div><h4 className={`font-bold transition-colors ${isOwned ? 'text-green-400' : 'text-white group-hover:text-casino-gold'}`}>{item.name}</h4><p className="text-xs text-slate-400">{item.description}</p></div></div><div className="text-right"><p className="text-lg font-bold text-yellow-500 flex items-center justify-end gap-1"><Coins size={14}/> {item.cost}</p><button onClick={() => handlePurchase(item)} disabled={isOwned && item.type === 'cosmetic'} className={`mt-1 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${isOwned && item.type === 'cosmetic' ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-white/10 hover:bg-white/20 text-white'}`}>{isOwned && item.type === 'cosmetic' ? 'ADQUIRIDO' : 'COMPRAR'}</button></div></div>); })}</div></section>
                </div>
            )}
        </div>
        
        {/* Footer Injected Here */}
        <div className="w-full text-center py-8 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none">
            &copy; 2024 Cassino IA. Jogue com responsabilidade.
        </div>
      </div>
    </div>
  );
};
