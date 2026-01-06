
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './UI/Button';
import { Trophy, Gem, Crown, BrainCircuit, Search, Play, Star, ChevronRight, LayoutGrid, Zap, Heart, Flame, Cpu, ArrowRight } from 'lucide-react';

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

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'casino' | 'slots' | 'fast' | 'favorites'>('all');
  const [bannerIndex, setBannerIndex] = useState(0);
  
  // Banner Rotation Logic
  useEffect(() => {
      const interval = setInterval(() => {
          setBannerIndex(prev => (prev === 0 ? 1 : 0));
      }, 8000); // Aumentado para 8s para leitura confortável
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
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90 transition-opacity group-hover:opacity-100"></div>
            
            {game.badge && (
                <div className="absolute top-2 left-2 z-40">
                    <div className="bg-white/90 backdrop-blur-sm text-black text-[9px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-wider flex items-center gap-1">
                        {game.badge === 'HOT' && <Flame size={8} fill="black" />}
                        {game.badge}
                    </div>
                </div>
            )}

            <button 
                onClick={(e) => { e.stopPropagation(); toggleFavorite(game.id); }}
                className="absolute top-2 right-2 z-40 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-red-500 transition-all border border-white/10 hover:scale-110 active:scale-95 group-active:scale-95"
            >
                <Heart size={12} fill={isFav ? "currentColor" : "none"} className={isFav ? "text-red-500" : ""} />
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-4 z-20 flex flex-col justify-end">
                <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest mb-0.5 font-mono drop-shadow-md">
                    {game.provider}
                </span>
                <h3 className="text-xl font-black text-white uppercase leading-none drop-shadow-lg tracking-tight mb-1 group-hover:text-yellow-100 transition-colors">
                    {game.name}
                </h3>
            </div>
            
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

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 mb-4 pr-1">
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
                
                {/* 
                   ==========================================================================
                   HERO BANNER CAROUSEL - OTIMIZADO PARA 16:9 DA IA
                   Ajustado para ocupar menos altura vertical e encaixar imagens corretamente.
                   ==========================================================================
                */}
                {searchTerm === '' && (
                    <div className="w-full mb-8 relative group rounded-[2rem] shadow-2xl overflow-hidden aspect-[16/9] md:aspect-[21/7] lg:aspect-[21/6] min-h-[220px] border border-white/5 bg-slate-900">
                        
                        {/* BANNER 1: TIGRINHO IA */}
                        <div className={`absolute inset-0 transition-opacity duration-1000 ${bannerIndex === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                            {/* BACKGROUND IMAGE 
                                object-[center_25%] garante que o foco fique no terço superior (rosto do tigre)
                                quando o banner é cortado no desktop para ficar mais baixo.
                            */}
                            <img 
                                src="/assets/banner-tiger.png" 
                                className="absolute inset-0 w-full h-full object-cover object-[center_25%] scale-105"
                                alt="Tiger Background"
                                onError={(e) => {
                                    // Fallback caso a imagem local não exista ainda
                                    e.currentTarget.src = "https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?q=80&w=2068&auto=format&fit=crop";
                                }}
                            />
                            
                            {/* GRADIENT OVERLAYS (Crucial for readability) */}
                            {/* 1. Base Darkening */}
                            <div className="absolute inset-0 bg-slate-950/40"></div>
                            {/* 2. Left-to-Right Fade (Text Area) */}
                            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent"></div>
                            {/* 3. Bottom Fade */}
                            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-slate-950 to-transparent"></div>

                            {/* CONTENT */}
                            <div className="relative z-20 h-full flex flex-col justify-center px-6 md:px-12 max-w-2xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 backdrop-blur-md w-fit mb-3 animate-slide-up">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                                    </span>
                                    <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest">Live System V.3.0</span>
                                </div>
                                
                                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-3 leading-[0.9] tracking-tighter drop-shadow-2xl animate-slide-up" style={{ animationDelay: '100ms' }}>
                                    TIGRINHO <br/>
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500">IA PREDICT</span>
                                </h1>
                                
                                <p className="text-slate-300 text-xs md:text-sm mb-6 font-medium leading-relaxed max-w-md drop-shadow-md animate-slide-up hidden sm:block" style={{ animationDelay: '200ms' }}>
                                    Algoritmo exclusivo capaz de identificar momentos de alta volatilidade e distribuir multiplicadores de até <span className="text-yellow-400 font-bold">2500x</span>.
                                </p>
                                
                                <div className="flex gap-4 animate-slide-up" style={{ animationDelay: '300ms' }}>
                                    <Button onClick={() => navigate('/tigrinho')} variant="primary" size="md" className="px-6 shadow-xl shadow-yellow-900/20 hover:scale-105 transition-transform rounded-xl">
                                        JOGAR AGORA <Play size={14} fill="currentColor" className="ml-2"/>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* BANNER 2: VIP IA PREMIUM */}
                        <div className={`absolute inset-0 transition-opacity duration-1000 ${bannerIndex === 1 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                            {/* BACKGROUND IMAGE */}
                            <img 
                                src="/assets/banner-vip.png" 
                                className="absolute inset-0 w-full h-full object-cover object-[center_25%] scale-105"
                                alt="AI Background"
                                onError={(e) => {
                                    // Fallback caso a imagem local não exista ainda
                                    e.currentTarget.src = "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=1965&auto=format&fit=crop";
                                }}
                            />
                            
                            {/* GRADIENT OVERLAYS */}
                            <div className="absolute inset-0 bg-slate-950/30"></div>
                            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent"></div>

                            {/* CONTENT */}
                            <div className="relative z-20 h-full flex flex-col justify-center px-6 md:px-12 max-w-2xl">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 backdrop-blur-md w-fit mb-3">
                                    <Crown size={12} className="text-purple-400 fill-purple-400 animate-pulse"/>
                                    <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Membro Elite</span>
                                </div>
                                
                                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-3 leading-[0.9] tracking-tighter drop-shadow-2xl">
                                    IA NEURAL <br/>
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">NETWORK 4.0</span>
                                </h1>
                                
                                <p className="text-slate-300 text-xs md:text-sm mb-6 font-medium leading-relaxed max-w-md drop-shadow-md hidden sm:block">
                                    Acesso privilegiado a sinais de alta precisão. Nossa rede neural processa milhões de rodadas para encontrar padrões invisíveis.
                                </p>
                                
                                <div className="flex gap-4">
                                    <button onClick={() => navigate('/profile')} className="py-2.5 px-6 rounded-xl bg-white text-black font-black text-xs uppercase tracking-wider shadow-lg hover:bg-purple-50 transition-all active:scale-95 flex items-center gap-2 hover:scale-105">
                                        VER PLANOS <ArrowRight size={14}/>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CAROUSEL INDICATORS */}
                        <div className="absolute bottom-4 left-6 md:left-12 flex gap-2 z-30">
                            <button onClick={() => setBannerIndex(0)} className={`h-1.5 rounded-full transition-all duration-500 ${bannerIndex === 0 ? 'bg-yellow-500 w-8 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-white/20 w-2 hover:bg-white/40'}`}></button>
                            <button onClick={() => setBannerIndex(1)} className={`h-1.5 rounded-full transition-all duration-500 ${bannerIndex === 1 ? 'bg-purple-500 w-8 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'bg-white/20 w-2 hover:bg-white/40'}`}></button>
                        </div>
                    </div>
                )}

                {/* Filters Header */}
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
                    
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setFilter('all')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'all' ? 'bg-white text-black border-white scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Todos</button>
                            <button onClick={() => setFilter('favorites')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap flex items-center gap-2 shadow-sm ${filter === 'favorites' ? 'bg-red-600 text-white border-red-500 shadow-red-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}><Heart size={12} fill="currentColor"/> Favoritos</button>
                            <button onClick={() => setFilter('fast')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'fast' ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Rápido</button>
                            <button onClick={() => setFilter('slots')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'slots' ? 'bg-purple-600 text-white border-purple-500 shadow-purple-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Slots</button>
                            <button onClick={() => setFilter('casino')} className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap shadow-sm ${filter === 'casino' ? 'bg-yellow-600 text-white border-yellow-500 shadow-yellow-900/20 scale-105' : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white'}`}>Cassino</button>
                    </div>
                </div>

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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 animate-fade-in">
                        {filter === 'favorites' 
                            ? (favoriteGamesList.length > 0 ? favoriteGamesList.map(renderGameCard) : <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-white/5 rounded-3xl bg-slate-900/20">Você ainda não tem jogos favoritos.</div>)
                            : allGames.filter(g => g.category === filter).map(renderGameCard)
                        }
                    </div>
                ) : (
                    <div className="space-y-4">
                        {favoriteGamesList.length > 0 && renderGameSection(
                            "Meus Favoritos", 
                            <Heart size={20} className="text-red-500 fill-red-500" />, 
                            favoriteGamesList
                        )}

                        {renderGameSection(
                            "Em Alta", 
                            <Flame size={20} className="text-orange-500" />, 
                            allGames.filter(g => g.badge === 'HOT' || g.badge === 'POPULAR')
                        )}

                        {renderGameSection(
                            "Slots & Arcade", 
                            <Gem size={20} className="text-purple-400" />, 
                            allGames.filter(g => g.category === 'slots')
                        )}

                        {renderGameSection(
                            "Jogos Rápidos", 
                            <Zap size={20} className="text-blue-400" />, 
                            allGames.filter(g => g.category === 'fast')
                        )}

                        {renderGameSection(
                            "Mesa & Ao Vivo", 
                            <Trophy size={20} className="text-casino-gold" />, 
                            allGames.filter(g => g.category === 'casino')
                        )}
                    </div>
                )}
            </div>
            
            <div className="w-full text-center py-12 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none border-t border-white/5 mt-12">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    </div>
  );
};
