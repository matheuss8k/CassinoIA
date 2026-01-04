
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './UI/Button';
import { Trophy, Gem, Crown, BrainCircuit, Search, Play, Star, ChevronRight, LayoutGrid, Zap, Heart, Flame, Cpu } from 'lucide-react';

interface GameOption {
  id: string;
  path: string;
  name: string;
  provider: string; 
  description: string;
  image: string; // Changed from icon (ReactNode) to image (URL string)
  active: boolean;
  badge?: string;
  category: 'casino' | 'slots' | 'fast';
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'casino' | 'slots' | 'fast' | 'favorites'>('all');
  const [bannerIndex, setBannerIndex] = useState(0);
  
  // Banner Rotation Logic
  useEffect(() => {
      const interval = setInterval(() => {
          setBannerIndex(prev => (prev === 0 ? 1 : 0));
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  // Favorites State (Persisted)
  const [favorites, setFavorites] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem('casino_favorites');
          return saved ? JSON.parse(saved) : [];
      } catch { return []; }
  });

  const toggleFavorite = (gameId: string) => {
      setFavorites(prev => {
          const newFavs = prev.includes(gameId) 
              ? prev.filter(id => id !== gameId) 
              : [...prev, gameId];
          localStorage.setItem('casino_favorites', JSON.stringify(newFavs));
          return newFavs;
      });
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
    },
    {
      id: 'baccarat',
      path: '/baccarat',
      name: 'BACCARAT',
      provider: 'CARD MASTER',
      description: 'Punto Banco',
      image: '/assets/baccarat.png',
      active: false,
      category: 'casino'
    }
  ];

  const handlePlay = (game: GameOption) => {
      if (game.active) {
          navigate(game.path);
      }
  };

  // Logic for sidebar lists
  const favoriteGamesList = allGames.filter(g => favorites.includes(g.id));
  const sidebarFeatured = allGames.filter(g => g.active || g.badge).slice(0, 5);

  const renderGameCard = (game: GameOption) => {
    const isFav = favorites.includes(game.id);
    return (
        <div 
            key={game.id}
            onClick={() => handlePlay(game)}
            className={`
                group relative w-full aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] border border-white/10
                ${game.active ? 'opacity-100' : 'opacity-60 grayscale'}
            `}
        >
            {/* FULL COVER IMAGE */}
            <div className="absolute inset-0 bg-slate-900">
               <img 
                  src={game.image} 
                  alt={game.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  onError={(e) => {
                      // Fallback visual if image fails
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement?.classList.add('bg-gradient-to-br', 'from-slate-800', 'to-slate-900');
                  }}
               />
            </div>
            
            {/* GRADIENT OVERLAY (Bottom to Top) - Ensures text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90 transition-opacity group-hover:opacity-100"></div>
            
            {/* BADGE (Top Left) - High Z-Index */}
            {game.badge && (
                <div className="absolute top-2 left-2 z-40">
                    <div className="bg-white/90 backdrop-blur-sm text-black text-[9px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-wider flex items-center gap-1">
                        {game.badge === 'HOT' && <Flame size={8} fill="black" />}
                        {game.badge}
                    </div>
                </div>
            )}

            {/* FAVORITE BUTTON (Top Right) - High Z-Index */}
            <button 
                onClick={(e) => { e.stopPropagation(); toggleFavorite(game.id); }}
                className="absolute top-2 right-2 z-40 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-red-500 transition-all border border-white/10 hover:scale-110 active:scale-95 group-active:scale-95"
            >
                <Heart size={12} fill={isFav ? "currentColor" : "none"} className={isFav ? "text-red-500" : ""} />
            </button>

            {/* INFO AREA (Bottom) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 z-20 flex flex-col justify-end">
                <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5 font-mono drop-shadow-md">
                    {game.provider}
                </span>
                <h3 className="text-xl font-black text-white uppercase leading-none drop-shadow-lg tracking-tight mb-1 group-hover:text-yellow-100 transition-colors">
                    {game.name}
                </h3>
            </div>
            
            {/* HOVER PLAY ICON OVERLAY */}
            {game.active && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
                    <div className="w-14 h-14 rounded-full bg-yellow-500 text-black flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.6)] transform scale-50 group-hover:scale-100 transition-all duration-300 hover:bg-yellow-400 hover:scale-110">
                        <Play size={24} fill="black" className="ml-1" />
                    </div>
                </div>
            )}
        </div>
    );
  };

  const renderGameSection = (title: string, icon: React.ReactNode, games: GameOption[], emptyMsg: string = "Nenhum jogo encontrado.") => (
      <div className="mb-10 animate-fade-in">
          <div className="flex items-center gap-2 mb-4 px-1">
               <div className="text-casino-gold drop-shadow-md">
                   {icon}
               </div>
               <h3 className="text-lg font-bold text-white uppercase tracking-tight">{title}</h3>
          </div>
          {games.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                  {games.map(renderGameCard)}
              </div>
          ) : (
              <div className="py-8 text-center border border-dashed border-white/5 rounded-2xl bg-slate-900/30">
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{emptyMsg}</p>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
        
        {/* --- LEFT SIDEBAR (GAME LIST) --- */}
        <aside className="hidden lg:flex flex-col w-64 h-full bg-slate-950 border-r border-white/5 px-4 pt-6 pb-2 shrink-0 z-20 shadow-2xl">
            
            {/* Search Input */}
            <div className="relative mb-6 flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                    type="text" 
                    placeholder="Buscar jogos..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white focus:border-casino-gold outline-none transition-colors font-medium placeholder:text-slate-600"
                />
            </div>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 mb-4 pr-1">
                
                {/* FAVORITES */}
                {favoriteGamesList.length > 0 && (
                    <div className="space-y-2 animate-fade-in">
                        <div className="flex items-center gap-2 px-2 mb-2 text-slate-400">
                            <Heart size={12} className="text-red-500 fill-red-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Meus Favoritos</span>
                        </div>
                        {favoriteGamesList.map(game => (
                             <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-900 border border-transparent hover:border-white/5 transition-all group text-left"
                            >
                                <img src={game.image} alt="" className="w-8 h-8 rounded-lg object-cover shadow-md bg-slate-800" />
                                <span className="text-xs font-bold text-slate-400 group-hover:text-white truncate flex-1 transition-colors">{game.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* FEATURED / ALL LIST */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2 mb-2 text-slate-500">
                        <Star size={12} className="text-casino-gold" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Destaques</span>
                    </div>
                    {sidebarFeatured.map(game => {
                        return (
                            <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                disabled={!game.active}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group border text-left relative overflow-hidden
                                    ${game.active ? 'hover:bg-slate-900 border-transparent hover:border-white/5 cursor-pointer' : 'opacity-40 cursor-default border-transparent'}
                                `}
                            >
                                <div className={`w-10 h-10 rounded-lg bg-slate-900 border border-white/5 shadow-inner shrink-0 group-hover:scale-105 transition-transform overflow-hidden`}>
                                    <img src={game.image} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <span className={`text-xs font-bold truncate ${game.active ? 'text-slate-300 group-hover:text-white' : 'text-slate-600'}`}>{game.name}</span>
                                    <span className="text-[9px] text-slate-500 truncate font-medium">
                                        {game.badge ? <span className="text-casino-gold">{game.badge}</span> : 'Popular'}
                                    </span>
                                </div>
                                {game.active && <ChevronRight size={14} className="text-slate-600 group-hover:text-white transition-colors" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Promo Banner Small */}
            <div className="mt-auto flex-none mb-2">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-900 relative overflow-hidden group cursor-pointer hover:shadow-lg transition-all shadow-purple-900/20">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm"><Crown size={16} className="text-white" /></div>
                            <h4 className="text-white font-bold text-sm leading-tight">Clube VIP</h4>
                        </div>
                        <p className="text-[10px] text-purple-100 mb-3 leading-tight opacity-90">Bônus exclusivos e suporte prioritário.</p>
                        <button className="w-full py-2 bg-white text-purple-900 text-[10px] font-black rounded-lg uppercase tracking-wider hover:bg-purple-50 transition-colors">Ver Benefícios</button>
                    </div>
                </div>
            </div>

        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 h-full overflow-y-auto no-scrollbar px-4 py-4 animate-slide-up scroll-smooth">
            <div className="max-w-7xl mx-auto">
                
                {/* HERO BANNER CAROUSEL (TIGRINHO + VIP IA) */}
                {searchTerm === '' && (
                    <div className="w-full mb-10 relative group">
                        
                        {/* BANNER 1: TIGRINHO IA */}
                        <div className={`transition-all duration-700 ease-in-out absolute inset-0 ${bannerIndex === 0 ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 -translate-x-10 z-0 pointer-events-none'}`}>
                            <div className="w-full rounded-[2rem] p-[1px] shadow-[0_0_60px_-15px_rgba(234,179,8,0.3)] bg-gradient-to-r from-yellow-600 via-orange-400 to-yellow-600 relative overflow-hidden">
                                
                                <div className="bg-slate-950 rounded-[1.9rem] relative overflow-hidden h-[240px] md:h-[280px] flex items-center justify-between px-8 md:px-12 border border-white/5">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-yellow-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3"></div>
                                    
                                    <div className="relative z-20 max-w-xl flex flex-col justify-center h-full py-4">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-900/40 border border-yellow-500/30 mb-3 backdrop-blur-md shadow-[0_0_15px_rgba(234,179,8,0.1)] w-fit">
                                            <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                                            </span>
                                            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1">IA 3.0 <span className="opacity-50">|</span> LIVE</span>
                                        </div>
                                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-3 leading-none drop-shadow-2xl italic tracking-tight">
                                            TIGRINHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500">IA</span>
                                        </h1>
                                        <p className="text-slate-300 text-sm md:text-base mb-6 max-w-md font-medium leading-relaxed">
                                            Algoritmo preditivo de volatilidade em tempo real.
                                            <span className="block mt-1 text-yellow-500 font-bold flex items-center gap-1"><Zap size={14} fill="currentColor"/> RTP 98.5% Detectado.</span>
                                        </p>
                                        <div className="mt-1">
                                            <Button onClick={() => navigate('/tigrinho')} variant="primary" size="lg" className="px-8 shadow-xl shadow-yellow-900/30 hover:scale-105 transition-transform">
                                                JOGAR AGORA <Play size={16} fill="currentColor" className="ml-2"/>
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="relative h-full w-1/3 hidden md:flex items-center justify-center z-10 pointer-events-none">
                                        <div className="relative w-56 h-56 animate-[float_6s_ease-in-out_infinite]">
                                            <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 to-transparent rounded-full blur-3xl"></div>
                                            <div className="text-[140px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_40px_rgba(234,179,8,0.6)] filter contrast-125 saturate-150 scale-110">🐯</div>
                                            <div className="absolute inset-0 border border-yellow-500/30 rounded-full animate-[spin_10s_linear_infinite] border-t-transparent border-l-transparent shadow-[0_0_20px_rgba(234,179,8,0.1)]"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BANNER 2: VIP IA PREMIUM */}
                        <div className={`transition-all duration-700 ease-in-out relative ${bannerIndex === 1 ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-10 z-0 pointer-events-none absolute inset-0'}`}>
                             <div className="w-full rounded-[2rem] p-[1px] shadow-[0_0_60px_-15px_rgba(168,85,247,0.3)] bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 relative overflow-hidden">
                                <div className="bg-slate-950 rounded-[1.9rem] relative overflow-hidden h-[240px] md:h-[280px] flex items-center justify-between px-8 md:px-12 border border-white/5">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/circuit-board.png')] opacity-10"></div>
                                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] translate-y-1/2 translate-x-1/4"></div>
                                    <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px] -translate-y-1/2 -translate-x-1/3"></div>

                                    <div className="relative z-20 max-w-xl flex flex-col justify-center h-full py-4">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/40 border border-purple-500/30 mb-3 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.1)] w-fit">
                                            <Crown size={12} className="text-purple-400 fill-purple-400 animate-pulse"/>
                                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">MEMBRO ELITE</span>
                                        </div>
                                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-3 leading-none drop-shadow-2xl italic tracking-tight">
                                            IA VIP <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">4.0</span>
                                        </h1>
                                        <p className="text-slate-300 text-sm md:text-base mb-6 max-w-md font-medium leading-relaxed">
                                            Acesso a algoritmos preditivos de alta precisão.
                                            <span className="block mt-1 text-cyan-400 font-bold flex items-center gap-1"><Cpu size={14} /> Neural Engine: 99.8% Assertividade.</span>
                                        </p>
                                        <div className="mt-1">
                                            <button onClick={() => navigate('/profile')} className="py-3 px-8 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm uppercase tracking-wider shadow-[0_0_30px_rgba(168,85,247,0.3)] border border-purple-400/30 transition-all active:scale-95 flex items-center gap-2 hover:scale-105">
                                                VER PLANOS <ChevronRight size={16}/>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative h-full w-1/3 hidden md:flex items-center justify-center z-10 pointer-events-none">
                                         <div className="relative w-48 h-48 animate-[float_5s_ease-in-out_infinite_reverse]">
                                             <div className="absolute inset-0 bg-cyan-500/10 blur-3xl rounded-full"></div>
                                             <div className="w-full h-full border border-cyan-500/30 bg-slate-900/50 backdrop-blur-md rounded-2xl flex items-center justify-center transform rotate-12 relative overflow-hidden shadow-2xl">
                                                 <div className="absolute inset-0 bg-[linear-gradient(transparent,rgba(6,182,212,0.1),transparent)] animate-scan"></div>
                                                 <BrainCircuit size={80} className="text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
                                                 <div className="absolute bottom-4 left-4 text-[10px] font-mono text-cyan-500">CPU: 99%</div>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                             </div>
                        </div>

                        {/* Indicators */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-30">
                            <button onClick={() => setBannerIndex(0)} className={`h-1.5 rounded-full transition-all duration-300 ${bannerIndex === 0 ? 'bg-white w-8' : 'bg-white/20 w-2 hover:bg-white/40'}`}></button>
                            <button onClick={() => setBannerIndex(1)} className={`h-1.5 rounded-full transition-all duration-300 ${bannerIndex === 1 ? 'bg-white w-8' : 'bg-white/20 w-2 hover:bg-white/40'}`}></button>
                        </div>
                    </div>
                )}

                {/* Filters Header - STATIC POSITION (Removed sticky) */}
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-6 gap-6 relative z-30 pt-4 px-1">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-white/5 shadow-inner">
                            {filter === 'casino' ? <Trophy className="text-casino-gold" size={24} /> : filter === 'slots' ? <Gem className="text-purple-400" size={24} /> : filter === 'fast' ? <Zap className="text-blue-400" size={24} /> : filter === 'favorites' ? <Heart className="text-red-500" size={24} /> : <LayoutGrid className="text-slate-200" size={24} />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white leading-none tracking-tight">
                                {searchTerm ? `Busca: "${searchTerm}"` : filter === 'all' ? 'Lobby de Jogos' : filter === 'favorites' ? 'Meus Favoritos' : filter === 'casino' ? 'Mesa & Cartas' : filter === 'slots' ? 'Slots & Arcade' : 'Jogos Rápidos'}
                            </h2>
                            <p className="text-xs text-slate-500 font-medium mt-1">Selecione uma categoria para filtrar.</p>
                        </div>
                    </div>
                    
                    {/* Filter Buttons */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setFilter('all')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'all' ? 'bg-white text-black border-white scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Todos</button>
                            <button onClick={() => setFilter('favorites')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap flex items-center gap-2 shadow-sm ${filter === 'favorites' ? 'bg-red-600 text-white border-red-500 shadow-red-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}><Heart size={12} fill="currentColor"/> Favoritos</button>
                            <button onClick={() => setFilter('fast')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'fast' ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Rápido</button>
                            <button onClick={() => setFilter('slots')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'slots' ? 'bg-purple-600 text-white border-purple-500 shadow-purple-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Slots</button>
                            <button onClick={() => setFilter('casino')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'casino' ? 'bg-yellow-600 text-white border-yellow-500 shadow-yellow-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Cassino</button>
                    </div>
                </div>

                {/* Content Rendering */}
                {/* 1. If Searching: Show Flat List */}
                {searchTerm ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).map(renderGameCard)}
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                             <div className="col-span-full text-center py-20 text-slate-500 flex flex-col items-center">
                                 <Search size={48} className="mb-4 opacity-20"/>
                                 Nenhum jogo encontrado para "{searchTerm}"
                             </div>
                         )}
                    </div>
                ) : filter !== 'all' ? (
                    // 2. If Filtered (Tabs): Show Flat List of that category
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 animate-fade-in">
                        {filter === 'favorites' 
                            ? (favoriteGamesList.length > 0 ? favoriteGamesList.map(renderGameCard) : <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-white/5 rounded-3xl bg-slate-900/20">Você ainda não tem jogos favoritos.</div>)
                            : allGames.filter(g => g.category === filter).map(renderGameCard)
                        }
                    </div>
                ) : (
                    // 3. Default Lobby View: Sectioned
                    <div className="space-y-4">
                        {/* Favorites Section (Only if > 0) */}
                        {favoriteGamesList.length > 0 && renderGameSection(
                            "Meus Favoritos", 
                            <Heart size={20} className="text-red-500 fill-red-500" />, 
                            favoriteGamesList
                        )}

                        {/* Popular / Hot */}
                        {renderGameSection(
                            "Em Alta", 
                            <Flame size={20} className="text-orange-500" />, 
                            allGames.filter(g => g.badge === 'HOT' || g.badge === 'POPULAR')
                        )}

                        {/* Slots */}
                        {renderGameSection(
                            "Slots & Arcade", 
                            <Gem size={20} className="text-purple-400" />, 
                            allGames.filter(g => g.category === 'slots')
                        )}

                        {/* Fast Games */}
                        {renderGameSection(
                            "Jogos Rápidos", 
                            <Zap size={20} className="text-blue-400" />, 
                            allGames.filter(g => g.category === 'fast')
                        )}

                        {/* Casino */}
                        {renderGameSection(
                            "Mesa & Ao Vivo", 
                            <Trophy size={20} className="text-casino-gold" />, 
                            allGames.filter(g => g.category === 'casino')
                        )}
                    </div>
                )}
            </div>
            
            {/* Footer Injected Here */}
            <div className="w-full text-center py-12 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none border-t border-white/5 mt-12">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    </div>
  );
};
