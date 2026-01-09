
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './UI/Button';
import { Trophy, Gem, Crown, BrainCircuit, Search, Play, Star, ChevronRight, LayoutGrid, Zap, Heart, Flame, ArrowRight } from 'lucide-react';
import { User } from '../types';
import { DatabaseService } from '../services/database';

interface GameOption {
  id: string;
  path: string;
  name: string;
  provider: string; 
  description: string;
  image: string;
  active: boolean;
  badge?: string;
  category: 'casino' | 'slots' | 'fast';
}

interface DashboardProps {
    user: User;
    updateUser: (u: User) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, updateUser }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'casino' | 'slots' | 'fast' | 'favorites'>('all');
  const [bannerIndex, setBannerIndex] = useState(0);
  
  // Banner Rotation Logic
  useEffect(() => {
      const interval = setInterval(() => {
          setBannerIndex(prev => (prev === 0 ? 1 : 0));
      }, 8000); 
      return () => clearInterval(interval);
  }, []);

  // Use user.favorites directly from the persistent user object
  const favorites = user.favorites || [];

  const toggleFavorite = async (gameId: string) => {
      // Optimistic UI Update
      const isAlreadyFav = favorites.includes(gameId);
      const newFavs = isAlreadyFav ? favorites.filter(id => id !== gameId) : [...favorites, gameId];
      
      updateUser({ ...user, favorites: newFavs });

      try {
          // Backend Sync
          await DatabaseService.toggleFavorite(user.id, gameId);
      } catch (error) {
          // Revert on error
          console.error("Failed to toggle favorite", error);
          updateUser({ ...user, favorites: favorites }); // Revert to original
      }
  };

  const allGames: GameOption[] = [
    {
      id: 'tigrinho',
      path: '/tigrinho',
      name: 'FORTUNE TIGER',
      provider: 'AI SOFT',
      description: 'Volatilidade Alta',
      image: '/assets/tiger.png',
      active: true,
      badge: 'HOT',
      category: 'slots'
    },
    {
      id: 'blackjack',
      path: '/blackjack',
      name: 'BLACKJACK',
      provider: 'CARD MASTER',
      description: 'RTP 99.5%',
      image: '/assets/blackjack.png',
      active: true,
      badge: 'LIVE',
      category: 'casino'
    },
    {
      id: 'mines',
      path: '/mines',
      name: 'MINES',
      provider: 'ORIGINALS',
      description: 'Estratégia Pura',
      image: '/assets/mines.png',
      active: true,
      badge: 'POPULAR',
      category: 'fast'
    },
    {
      id: 'baccarat',
      path: '/baccarat',
      name: 'BACCARAT',
      provider: 'CARD MASTER',
      description: 'Punto Banco',
      image: '/assets/baccarat.png',
      active: true,
      badge: 'NEW',
      category: 'casino'
    },
    {
      id: 'aviator',
      path: '/aviator',
      name: 'AVIATOR',
      provider: 'SPRIBE',
      description: 'Crash Game',
      image: '/assets/aviator.png',
      active: false,
      badge: 'CRASH',
      category: 'fast'
    },
    {
      id: 'roulette',
      path: '/roulette',
      name: 'ROULETTE',
      provider: 'CASINO ROYAL',
      description: 'Clássico Europeu',
      image: '/assets/roulette.png',
      active: false,
      category: 'casino'
    }
  ];

  const handlePlay = (game: GameOption) => {
      if (game.active) {
          navigate(game.path);
      }
  };

  const favoriteGamesList = allGames.filter(g => favorites.includes(g.id));
  const sidebarFeatured = allGames.filter(g => g.active || g.badge).slice(0, 5);

  const renderGameCard = (game: GameOption) => {
    const isFav = favorites.includes(game.id);
    return (
        <div 
            key={game.id}
            onClick={() => handlePlay(game)}
            className={`
                group relative w-full aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_30px_-10px_rgba(0,0,0,0.5)] border border-white/5 bg-slate-900
                ${game.active ? 'opacity-100' : 'opacity-60 grayscale'}
            `}
        >
            <div className="absolute inset-0 bg-slate-900">
               <img 
                  src={game.image} 
                  alt={game.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement?.classList.add('bg-gradient-to-br', 'from-slate-800', 'to-slate-900');
                  }}
               />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-95"></div>
            
            {game.badge && (
                <div className="absolute top-2 left-2 z-40">
                    <div className="bg-white/90 backdrop-blur-sm text-black text-[8px] lg:text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg uppercase tracking-wider flex items-center gap-1">
                        {game.badge === 'HOT' && <Flame size={8} fill="black" />}
                        {game.badge}
                    </div>
                </div>
            )}

            <button 
                onClick={(e) => { e.stopPropagation(); toggleFavorite(game.id); }}
                className="absolute top-2 right-2 z-40 w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-red-500 transition-all border border-white/10 hover:scale-110 active:scale-95 group-active:scale-95"
            >
                <Heart size={10} className={`lg:w-4 lg:h-4 ${isFav ? "text-red-500" : ""}`} fill={isFav ? "currentColor" : "none"} />
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-3 lg:p-4 z-20 flex flex-col justify-end">
                <span className="text-[8px] lg:text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5 font-mono drop-shadow-md opacity-80">
                    {game.provider}
                </span>
                <h3 className="text-sm lg:text-base font-black text-white uppercase leading-none drop-shadow-lg tracking-tight mb-0.5 group-hover:text-yellow-100 transition-colors">
                    {game.name}
                </h3>
            </div>
            
            {game.active && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-yellow-500 text-black flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.6)] transform scale-50 group-hover:scale-100 transition-all duration-300 hover:bg-yellow-400 hover:scale-110">
                        <Play size={20} className="lg:w-8 lg:h-8" fill="black" />
                    </div>
                </div>
            )}
        </div>
    );
  };

  const renderGameSection = (title: string, icon: React.ReactNode, games: GameOption[], emptyMsg: string = "Nenhum jogo encontrado.") => (
      <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-3 px-1">
               <div className="text-casino-gold drop-shadow-md">
                   {icon}
               </div>
               <h3 className="text-base lg:text-lg font-bold text-white uppercase tracking-tight">{title}</h3>
          </div>
          {games.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                  {games.map(renderGameCard)}
              </div>
          ) : (
              <div className="py-6 text-center border border-dashed border-white/5 rounded-xl bg-slate-900/30">
                  <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">{emptyMsg}</p>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
        
        {/* --- LEFT SIDEBAR (COMPACT) --- */}
        <aside className="hidden xl:flex flex-col w-64 h-full bg-slate-950 border-r border-white/5 px-4 pt-5 pb-2 shrink-0 z-20 shadow-2xl">
            <div className="relative mb-5 flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                    type="text" 
                    placeholder="Buscar jogos..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-3 pl-10 pr-3 text-sm text-white focus:border-casino-gold outline-none transition-colors font-medium placeholder:text-slate-600"
                />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 mb-4 pr-1">
                {favoriteGamesList.length > 0 && (
                    <div className="space-y-1.5 animate-fade-in">
                        <div className="flex items-center gap-2 px-2 mb-1.5 text-slate-400">
                            <Heart size={14} className="text-red-500 fill-red-500" />
                            <span className="text-xs lg:text-sm font-bold uppercase tracking-widest">Favoritos</span>
                        </div>
                        {favoriteGamesList.map(game => (
                             <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-900 border border-transparent hover:border-white/5 transition-all group text-left"
                            >
                                <img src={game.image} alt="" className="w-8 h-8 rounded-md object-cover shadow-md bg-slate-800" />
                                <span className="text-sm lg:text-[15px] font-bold text-slate-400 group-hover:text-white truncate flex-1 transition-colors">{game.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 px-2 mb-1.5 text-slate-500">
                        <Star size={14} className="text-casino-gold" />
                        <span className="text-xs lg:text-sm font-bold uppercase tracking-widest">Destaques</span>
                    </div>
                    {sidebarFeatured.map(game => {
                        return (
                            <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                disabled={!game.active}
                                className={`
                                    w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all group border text-left relative overflow-hidden
                                    ${game.active ? 'hover:bg-slate-900 border-transparent hover:border-white/5 cursor-pointer' : 'opacity-40 cursor-default border-transparent'}
                                `}
                            >
                                <div className={`w-9 h-9 rounded-md bg-slate-900 border border-white/5 shadow-inner shrink-0 group-hover:scale-105 transition-transform overflow-hidden`}>
                                    <img src={game.image} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <span className={`text-sm lg:text-[15px] font-bold truncate ${game.active ? 'text-slate-300 group-hover:text-white' : 'text-slate-600'}`}>{game.name}</span>
                                    <span className="text-[10px] text-slate-500 truncate font-medium">
                                        {game.badge ? <span className="text-casino-gold">{game.badge}</span> : 'Popular'}
                                    </span>
                                </div>
                                {game.active && <ChevronRight size={14} className="text-slate-600 group-hover:text-white transition-colors" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mt-auto flex-none mb-2">
                <div className="p-4 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-900 relative overflow-hidden group cursor-pointer hover:shadow-lg transition-all shadow-purple-900/20">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm"><Crown size={14} className="text-white" /></div>
                            <h4 className="text-white font-bold text-sm lg:text-base leading-tight">Clube VIP</h4>
                        </div>
                        <p className="text-xs lg:text-sm text-purple-100 mb-2 leading-tight opacity-90">Bônus exclusivos e suporte.</p>
                        <button onClick={() => navigate('/profile')} className="w-full py-2 bg-white text-purple-900 text-xs lg:text-sm font-black rounded-md uppercase tracking-wider hover:bg-purple-50 transition-colors">Ver Benefícios</button>
                    </div>
                </div>
            </div>

        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 h-full overflow-y-auto no-scrollbar px-4 py-4 lg:px-8 lg:py-6 animate-slide-up scroll-smooth">
            <div className="max-w-7xl mx-auto">
                
                {/* 
                   HERO BANNER - REMADE FOR MAX IMPACT
                */}
                {searchTerm === '' && (
                    <div className="w-full mb-8 relative group rounded-3xl shadow-2xl overflow-hidden aspect-[16/9] md:aspect-[21/6] lg:max-h-[320px] max-h-[260px] bg-slate-900 border border-white/10 ring-1 ring-white/5">
                        
                        {/* BANNER 1: TIGRINHO NEON JACKPOT */}
                        <div className={`absolute inset-0 transition-opacity duration-1000 ${bannerIndex === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                            <img 
                                src="/assets/banner-tiger.png" 
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] scale-105"
                                alt="Tiger"
                                onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?q=80&w=2068&auto=format&fit=crop"; }}
                            />
                            {/* Overlay Vibrante */}
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-950/90 via-purple-900/60 to-transparent"></div>
                            
                            <div className="relative z-20 h-full flex flex-col justify-center px-6 md:px-10 lg:px-16 max-w-xl lg:max-w-3xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-yellow-500/50 backdrop-blur-md w-fit mb-3 animate-slide-up shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>
                                    <span className="text-[9px] lg:text-[10px] font-black text-yellow-400 uppercase tracking-widest">Jackpot Ativo</span>
                                </div>
                                
                                <div className="backdrop-blur-sm bg-black/20 p-2 -ml-2 rounded-xl border border-white/5">
                                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-1 leading-[0.9] tracking-tighter drop-shadow-2xl animate-slide-up" style={{ animationDelay: '100ms' }}>
                                        TIGRINHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-500 to-red-500 filter drop-shadow-[0_2px_10px_rgba(234,179,8,0.5)]">CYBER MAX</span>
                                    </h1>
                                </div>

                                <p className="text-slate-100 text-xs md:text-sm lg:text-base mt-3 mb-6 font-bold leading-relaxed max-w-sm lg:max-w-lg drop-shadow-lg animate-slide-up" style={{ animationDelay: '200ms' }}>
                                    O algoritmo mais volátil do mercado. Multiplicadores insanos de <span className="text-yellow-300 font-black text-lg bg-black/50 px-1 rounded">2500x</span> aguardam.
                                </p>
                                
                                <div className="flex gap-3 animate-slide-up" style={{ animationDelay: '300ms' }}>
                                    <Button onClick={() => navigate('/tigrinho')} variant="primary" size="sm" className="px-8 py-4 shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-105 transition-transform rounded-xl text-xs lg:text-sm border-t border-yellow-300 font-black tracking-wider">
                                        JOGAR AGORA <Play size={16} fill="currentColor" className="ml-2"/>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* BANNER 2: VIP QUANTUM */}
                        <div className={`absolute inset-0 transition-opacity duration-1000 ${bannerIndex === 1 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                            <img 
                                src="/assets/banner-vip.png" 
                                className="absolute inset-0 w-full h-full object-cover object-[center_30%] scale-105"
                                alt="VIP"
                                onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=1965&auto=format&fit=crop"; }}
                            />
                            {/* Overlay Deep Tech */}
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-950/95 via-purple-900/70 to-transparent"></div>

                            <div className="relative z-20 h-full flex flex-col justify-center px-6 md:px-10 lg:px-16 max-w-xl lg:max-w-3xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-cyan-500/50 backdrop-blur-md w-fit mb-3 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                    <Crown size={12} className="text-cyan-400 fill-cyan-400 animate-pulse"/><span className="text-[9px] lg:text-[10px] font-black text-cyan-400 uppercase tracking-widest">Sinais Premium</span>
                                </div>
                                
                                <div className="backdrop-blur-sm bg-black/20 p-2 -ml-2 rounded-xl border border-white/5">
                                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-1 leading-[0.9] tracking-tighter drop-shadow-2xl">
                                        REDE NEURAL <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 filter drop-shadow-[0_2px_10px_rgba(6,182,212,0.5)]">QUANTUM 4.0</span>
                                    </h1>
                                </div>

                                <p className="text-indigo-100 text-xs md:text-sm lg:text-base mt-3 mb-6 font-bold leading-relaxed max-w-sm lg:max-w-lg drop-shadow-lg">
                                    Acesso privilegiado à tecnologia preditiva. Aumente sua precisão com nossa <span className="text-cyan-300 font-black bg-black/50 px-1 rounded">IA de Elite</span>.
                                </p>
                                
                                <div className="flex gap-3">
                                    <button onClick={() => navigate('/profile')} className="py-3 px-8 rounded-xl bg-white text-black font-black text-[10px] lg:text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:bg-cyan-50 transition-all active:scale-95 flex items-center gap-2 hover:scale-105 border-b-4 border-slate-300">
                                        ACESSAR VIP <ArrowRight size={14}/>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CAROUSEL INDICATORS */}
                        <div className="absolute bottom-4 left-6 md:left-10 lg:left-16 flex gap-2 z-30">
                            <button onClick={() => setBannerIndex(0)} className={`h-1.5 rounded-full transition-all duration-500 ${bannerIndex === 0 ? 'bg-yellow-500 w-10 shadow-[0_0_15px_rgba(234,179,8,1)]' : 'bg-white/20 w-3 hover:bg-white/40'}`}></button>
                            <button onClick={() => setBannerIndex(1)} className={`h-1.5 rounded-full transition-all duration-500 ${bannerIndex === 1 ? 'bg-cyan-500 w-10 shadow-[0_0_15px_rgba(6,182,212,1)]' : 'bg-white/20 w-3 hover:bg-white/40'}`}></button>
                        </div>
                    </div>
                )}

                {/* Filters Header - Compacto */}
                <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4 relative z-30 pt-2 px-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-white/5 shadow-inner">
                            {filter === 'casino' ? <Trophy className="text-casino-gold" size={20} /> : filter === 'slots' ? <Gem className="text-purple-400" size={20} /> : filter === 'fast' ? <Zap className="text-blue-400" size={20} /> : filter === 'favorites' ? <Heart className="text-red-500" size={20} /> : <LayoutGrid className="text-slate-200" size={20} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white leading-none tracking-tight">
                                {searchTerm ? `Busca: "${searchTerm}"` : filter === 'all' ? 'Lobby' : filter === 'favorites' ? 'Favoritos' : filter === 'casino' ? 'Mesa' : filter === 'slots' ? 'Slots' : 'Rápido'}
                            </h2>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">Selecione uma categoria.</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setFilter('all')} className={`px-5 py-2 rounded-lg text-xs lg:text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'all' ? 'bg-white text-black border-white' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Todos</button>
                            <button onClick={() => setFilter('favorites')} className={`px-5 py-2 rounded-lg text-xs lg:text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap flex items-center gap-1.5 shadow-sm ${filter === 'favorites' ? 'bg-red-600 text-white border-red-500 shadow-red-900/20' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}><Heart size={12} fill="currentColor"/> Favoritos</button>
                            <button onClick={() => setFilter('fast')} className={`px-5 py-2 rounded-lg text-xs lg:text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'fast' ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/20' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Rápido</button>
                            <button onClick={() => setFilter('slots')} className={`px-5 py-2 rounded-lg text-xs lg:text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'slots' ? 'bg-purple-600 text-white border-purple-500 shadow-purple-900/20' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Slots</button>
                            <button onClick={() => setFilter('casino')} className={`px-5 py-2 rounded-lg text-xs lg:text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'casino' ? 'bg-yellow-600 text-white border-yellow-500 shadow-yellow-900/20' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Cassino</button>
                    </div>
                </div>

                {searchTerm ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).map(renderGameCard)}
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                             <div className="col-span-full text-center py-20 text-slate-500 flex flex-col items-center">
                                 <Search size={48} className="mb-4 opacity-20"/>
                                 Nenhum jogo encontrado para "{searchTerm}"
                             </div>
                         )}
                    </div>
                ) : filter !== 'all' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6 animate-fade-in">
                        {filter === 'favorites' 
                            ? (favoriteGamesList.length > 0 ? favoriteGamesList.map(renderGameCard) : <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-white/5 rounded-2xl bg-slate-900/20 text-sm">Você ainda não tem jogos favoritos.</div>)
                            : allGames.filter(g => g.category === filter).map(renderGameCard)
                        }
                    </div>
                ) : (
                    <div className="space-y-8">
                        {favoriteGamesList.length > 0 && renderGameSection("Meus Favoritos", <Heart size={20} className="text-red-500 fill-red-500" />, favoriteGamesList)}
                        {renderGameSection("Em Alta", <Flame size={20} className="text-orange-500" />, allGames.filter(g => g.badge === 'HOT' || g.badge === 'POPULAR'))}
                        {renderGameSection("Slots & Arcade", <Gem size={20} className="text-purple-400" />, allGames.filter(g => g.category === 'slots'))}
                        {renderGameSection("Jogos Rápidos", <Zap size={20} className="text-blue-400" />, allGames.filter(g => g.category === 'fast'))}
                        {renderGameSection("Mesa & Ao Vivo", <Trophy size={20} className="text-casino-gold" />, allGames.filter(g => g.category === 'casino'))}
                    </div>
                )}
            </div>
            
            <div className="w-full text-center py-10 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none border-t border-white/5 mt-10">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    </div>
  );
};
