
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './UI/Button';
import { Spade, Dices, Club, Bomb, Rocket, Trophy, Gem, Crown, BrainCircuit, Sparkles, Search, Play, Star, ChevronRight, LayoutGrid, Zap, Heart, Flame, Cpu, Lock } from 'lucide-react';

interface GameOption {
  id: string;
  path: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  bg: string;
  badge?: string;
  category: 'casino' | 'slots' | 'fast';
}

// --- ICONS (Large Versions for Cards) ---
function TigerIcon() {
    return (
        <div className="relative flex items-center justify-center w-full h-full">
            <div className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full animate-pulse"></div>
            <div className="text-4xl filter drop-shadow-[0_0_10px_rgba(234,179,8,0.8)] z-10 scale-125">
                🐯
            </div>
            <Crown size={16} className="absolute -top-3 left-1/2 -translate-x-1/2 text-yellow-300 fill-yellow-500 animate-bounce drop-shadow-md" />
            <div className="absolute bottom-0 text-[8px] font-black text-yellow-300 tracking-widest uppercase bg-black/60 px-2 rounded-full border border-yellow-500/50">WILD</div>
        </div>
    )
}

function BlackjackIcon() {
    return (
        <div className="relative flex items-center justify-center w-full h-full">
            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse"></div>
            <div className="relative z-10 transform transition-transform duration-500 group-hover:scale-110">
                <Spade size={42} className="text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]" />
            </div>
            <div className="absolute -top-1 -right-1 bg-white text-black text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-indigo-300 transform rotate-12 animate-pulse">A</div>
            <div className="absolute -bottom-1 -left-1 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-indigo-400 shadow-lg flex items-center gap-1">
                <BrainCircuit size={10} /> 21
            </div>
        </div>
    )
}

function MinesIcon() {
    return (
        <div className="relative flex items-center justify-center w-full h-full">
            <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full animate-pulse"></div>
            <div className="relative z-10 animate-[bounce_2s_infinite]">
                <Bomb size={42} className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            </div>
            <div className="absolute top-2 right-2">
                 <Sparkles size={16} className="text-yellow-400 animate-spin-slow" />
            </div>
            <div className="absolute bottom-0 text-[8px] font-black text-red-100 tracking-widest uppercase bg-red-900/80 px-2 rounded-full border border-red-500/50 shadow-[0_0_10px_red]">BOOM</div>
        </div>
    )
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
      name: 'Tigrinho IA',
      description: 'Análise de volatilidade e RTP em tempo real.',
      icon: <TigerIcon />,
      active: true,
      bg: 'bg-gradient-to-br from-slate-900 to-slate-800',
      badge: 'HOT',
      category: 'slots'
    },
    {
      id: 'blackjack',
      path: '/blackjack',
      name: 'Blackjack IA',
      description: 'Conte com a ajuda da IA para vencer a banca.',
      icon: <BlackjackIcon />,
      active: true,
      bg: 'bg-gradient-to-br from-slate-900 to-slate-800',
      badge: 'POPULAR',
      category: 'casino'
    },
    {
      id: 'mines',
      path: '/mines',
      name: 'Mines IA',
      description: 'Encontre os diamantes e evite as bombas.',
      icon: <MinesIcon />,
      active: true,
      bg: 'bg-gradient-to-br from-slate-900 to-slate-800',
      badge: 'RÁPIDO',
      category: 'fast'
    },
    {
      id: 'aviator',
      path: '/aviator',
      name: 'Aviãozinho',
      description: 'Decole para lucros altos antes de explodir.',
      icon: <Rocket size={40} className="text-purple-500" />,
      active: false,
      bg: 'bg-slate-900/20',
      badge: 'CRASH',
      category: 'fast'
    },
    {
      id: 'roulette',
      path: '/roulette',
      name: 'Roleta',
      description: 'Aposte na sorte e nos números.',
      icon: <Dices size={40} className="text-slate-400" />,
      active: false,
      bg: 'bg-slate-900/20',
      category: 'casino'
    },
    {
      id: 'baccarat',
      path: '/baccarat',
      name: 'Baccarat',
      description: 'Clássico Punto Banco.',
      icon: <Club size={40} className="text-slate-400" />,
      active: false,
      bg: 'bg-slate-900/20',
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
            className={`
            relative rounded-2xl p-6 border border-white/5 overflow-hidden group transition-all duration-300 flex flex-col items-center text-center
            ${game.active 
                ? 'hover:border-casino-gold/50 hover:shadow-2xl hover:shadow-casino-gold/10 active:scale-95 cursor-pointer opacity-100' 
                : 'opacity-60 hover:opacity-80 border-white/5 cursor-default grayscale-[0.5]'}
            ${game.bg}
            `}
            onClick={() => handlePlay(game)}
        >
            {/* Heart Toggle */}
            <button 
                onClick={(e) => { e.stopPropagation(); toggleFavorite(game.id); }}
                className={`absolute top-3 right-3 z-20 p-2 rounded-full transition-all ${isFav ? 'bg-red-500/20 text-red-500' : 'bg-black/20 text-slate-500 hover:text-white hover:bg-black/40'}`}
                title={isFav ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
            >
                <Heart size={16} fill={isFav ? "currentColor" : "none"} className={isFav ? "animate-pulse" : ""} />
            </button>

            {game.badge && (
            <div className={`absolute top-0 left-0 text-black text-[10px] font-bold px-2 py-0.5 rounded-br-lg z-10 ${game.active ? 'bg-casino-gold' : 'bg-slate-600 text-slate-300'}`}>
                {game.badge}
            </div>
            )}
            
            <div className="mb-4 relative">
                {/* Glow effect underneath icon */}
                {game.active && <div className="absolute inset-0 bg-white/5 blur-xl rounded-full scale-150 animate-pulse"></div>}
                <div className={`
                    w-16 h-16 rounded-full flex items-center justify-center bg-black/30 border border-white/5 relative z-10
                    ${game.active ? 'shadow-[0_0_20px_rgba(251,191,36,0.1)]' : ''}
                `}>
                    {game.icon}
                </div>
            </div>

            <h3 className="text-lg font-bold text-white mb-1">{game.name}</h3>
            <p className="text-slate-400 text-xs mb-4 min-h-[2.5rem] flex items-center justify-center px-2 line-clamp-2">{game.description}</p>

            <div className="w-full mt-auto">
            {game.active ? (
                <Button 
                    fullWidth 
                    variant="primary" 
                    size="md"
                    className="shadow-lg shadow-yellow-900/20 py-3 text-xs"
                    onClick={(e) => { e.stopPropagation(); handlePlay(game); }}
                >
                    JOGAR AGORA
                </Button>
            ) : (
                <div className="w-full py-3 rounded-lg border border-white/10 bg-slate-800/50 text-slate-400 text-xs font-bold tracking-widest uppercase select-none">
                    Em Breve
                </div>
            )}
            </div>
        </div>
    );
  };

  const renderGameSection = (title: string, icon: React.ReactNode, games: GameOption[], emptyMsg: string = "Nenhum jogo encontrado.") => (
      <div className="mb-10 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-casino-gold border border-white/5">
                   {icon}
               </div>
               <div className="flex items-baseline gap-2">
                   <h3 className="text-xl font-bold text-white uppercase tracking-tight">{title}</h3>
                   <span className="text-xs text-slate-500 font-bold">({games.length} Títulos)</span>
               </div>
          </div>
          {games.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {games.map(renderGameCard)}
              </div>
          ) : (
              <div className="py-8 text-center border border-dashed border-white/10 rounded-xl bg-slate-900/30">
                  <p className="text-slate-500 text-sm">{emptyMsg}</p>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
        
        {/* --- LEFT SIDEBAR (GAME LIST) --- */}
        <aside className="hidden lg:flex flex-col w-56 h-full bg-slate-900/50 border-r border-white/5 backdrop-blur-sm sticky top-0 px-3 pt-6 pb-2 shrink-0 z-20">
            
            {/* Search Input */}
            <div className="relative mb-4 flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-2 text-xs text-white focus:border-casino-gold outline-none transition-colors"
                />
            </div>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 mb-4">
                
                {/* FAVORITES (Moved to Top) */}
                {favoriteGamesList.length > 0 && (
                    <div className="space-y-1 animate-fade-in">
                        <div className="flex items-center gap-2 px-2 mb-2 text-slate-400">
                            <Heart size={12} className="text-red-500 fill-red-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Meus Favoritos</span>
                        </div>
                        {favoriteGamesList.map(game => (
                             <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-all group text-left"
                            >
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-slate-950 border border-white/5 text-xs">
                                   {game.id === 'tigrinho' ? '🐯' : game.id === 'blackjack' ? <Spade size={12} className="text-indigo-400"/> : game.id === 'mines' ? <Bomb size={12} className="text-red-500"/> : <Zap size={12} className="text-yellow-500"/>}
                                </div>
                                <span className="text-xs font-bold text-slate-300 group-hover:text-white truncate flex-1">{game.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* FEATURED / ALL LIST */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2 px-2 mb-2 text-slate-500">
                        <Star size={12} className="text-casino-gold" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Destaques</span>
                    </div>
                    {sidebarFeatured.map(game => {
                        let SmallIcon = <Sparkles size={18} />;
                        if (game.id === 'blackjack') SmallIcon = <Spade size={18} className="text-indigo-400" />;
                        if (game.id === 'tigrinho') SmallIcon = <span className="text-lg">🐯</span>;
                        if (game.id === 'mines') SmallIcon = <Bomb size={18} className="text-red-500" />;
                        if (game.id === 'aviator') SmallIcon = <Rocket size={18} className="text-purple-500" />;

                        return (
                            <button 
                                key={game.id}
                                onClick={() => handlePlay(game)}
                                disabled={!game.active}
                                className={`
                                    w-full flex items-center gap-2 px-2 py-3 rounded-xl transition-all group border border-transparent text-left
                                    ${game.active ? 'hover:bg-white/5 hover:border-white/5 cursor-pointer' : 'opacity-50 cursor-default'}
                                `}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-slate-950 border border-white/5 shadow-sm group-hover:scale-105 transition-transform shrink-0`}>
                                    {SmallIcon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className={`text-sm font-bold truncate ${game.active ? 'text-slate-200 group-hover:text-white' : 'text-slate-500'}`}>{game.name}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 truncate block font-medium opacity-70">
                                        {game.badge ? <span className="text-casino-gold">{game.badge}</span> : 'Jogar Agora'}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Promo Banner Small (Sticky Bottom - Flex None) */}
            <div className="mt-auto flex-none mb-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-white/10 relative overflow-hidden group cursor-pointer hover:shadow-lg transition-all">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><Crown size={12} className="text-yellow-400" /></div>
                            <h4 className="text-white font-bold text-xs leading-tight">Seja VIP</h4>
                        </div>
                        <p className="text-[9px] text-slate-300 mb-2 leading-tight">Limites altos e itens exclusivos.</p>
                        <span className="text-[9px] font-bold text-purple-300 flex items-center gap-1 bg-purple-900/30 px-2 py-1 rounded w-fit">VER PLANOS <ChevronRight size={8}/></span>
                    </div>
                </div>
            </div>

        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <div className="flex-1 h-full overflow-y-auto no-scrollbar px-4 py-4 animate-slide-up">
            <div className="max-w-6xl mx-auto">
                
                {/* HERO BANNER CAROUSEL (TIGRINHO + VIP IA) */}
                {searchTerm === '' && (
                    <div className="w-full mb-8 relative group">
                        
                        {/* BANNER 1: TIGRINHO IA */}
                        <div className={`transition-all duration-700 ease-in-out absolute inset-0 ${bannerIndex === 0 ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 -translate-x-10 z-0 pointer-events-none'}`}>
                            {/* Ajuste de Sombra: Centralizada e menos deslocada para baixo (shadow-[0_0_40px_-10px]) */}
                            <div className="w-full rounded-3xl p-[1px] shadow-[0_0_40px_-10px_rgba(234,179,8,0.4)] bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600 relative overflow-hidden">
                                
                                <div className="bg-slate-950 rounded-[1.4rem] relative overflow-hidden h-[200px] flex items-center justify-between px-6 md:px-10 border border-white/5">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-yellow-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3"></div>
                                    
                                    <div className="relative z-20 max-w-lg flex flex-col justify-center h-full py-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-900/30 border border-yellow-500/50 mb-2 backdrop-blur-md shadow-[0_0_15px_rgba(234,179,8,0.2)] w-fit">
                                            <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                                            </span>
                                            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1">IA 3.0 <span className="opacity-50">|</span> LIVE</span>
                                        </div>
                                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-2 leading-none drop-shadow-xl italic tracking-tight">
                                            TIGRINHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500">IA</span>
                                        </h1>
                                        <p className="text-slate-300 text-xs md:text-sm mb-3 max-w-md font-medium leading-tight">
                                            O único slot com algoritmo preditivo de volatilidade.
                                            <span className="block mt-1 text-yellow-500 font-bold flex items-center gap-1"><Zap size={12} fill="currentColor"/> RTP 98.5% Detectado Agora.</span>
                                        </p>
                                        <div className="mt-1">
                                            <Button onClick={() => navigate('/tigrinho')} variant="primary" size="sm" className="md:py-2 md:px-6 shadow-[0_0_30px_rgba(234,179,8,0.3)] border-yellow-400 hover:shadow-[0_0_50px_rgba(234,179,8,0.5)] transition-all duration-300 text-xs md:text-sm">
                                                ACESSAR TERMINAL <Play size={14} fill="currentColor" className="ml-1"/>
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="relative h-full w-1/3 flex items-center justify-center z-10 pointer-events-none">
                                        <div className="relative w-40 h-40 md:w-48 md:h-48 animate-[pulse_4s_ease-in-out_infinite]">
                                            <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/20 to-transparent rounded-full blur-3xl"></div>
                                            <div className="text-[80px] md:text-[100px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)] filter contrast-125 saturate-150 scale-110 animate-float">🐯</div>
                                            <div className="absolute inset-0 border border-yellow-500/30 rounded-full animate-[spin_10s_linear_infinite] border-t-transparent border-l-transparent shadow-[0_0_15px_rgba(234,179,8,0.1)]"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BANNER 2: VIP IA PREMIUM */}
                        <div className={`transition-all duration-700 ease-in-out relative ${bannerIndex === 1 ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-10 z-0 pointer-events-none absolute inset-0'}`}>
                             {/* Ajuste de Sombra: Centralizada e menos deslocada para baixo (shadow-[0_0_40px_-10px]) */}
                             <div className="w-full rounded-3xl p-[1px] shadow-[0_0_40px_-10px_rgba(168,85,247,0.4)] bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 relative overflow-hidden">
                                <div className="bg-slate-950 rounded-[1.4rem] relative overflow-hidden h-[200px] flex items-center justify-between px-6 md:px-10 border border-white/5">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/circuit-board.png')] opacity-10"></div>
                                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] translate-y-1/2 translate-x-1/4"></div>
                                    <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px] -translate-y-1/2 -translate-x-1/3"></div>

                                    <div className="relative z-20 max-w-lg flex flex-col justify-center h-full py-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/30 border border-purple-500/50 mb-2 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.2)] w-fit">
                                            <Crown size={12} className="text-purple-400 fill-purple-400 animate-pulse"/>
                                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">MEMBRO ELITE</span>
                                        </div>
                                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-2 leading-none drop-shadow-xl italic tracking-tight">
                                            IA VIP <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">4.0</span>
                                        </h1>
                                        <p className="text-slate-300 text-xs md:text-sm mb-3 max-w-md font-medium leading-tight">
                                            Acesso a algoritmos preditivos de alta precisão.
                                            <span className="block mt-1 text-cyan-400 font-bold flex items-center gap-1"><Cpu size={12} /> Neural Engine: 99.8% Assertividade.</span>
                                        </p>
                                        <div className="mt-1">
                                            <button onClick={() => navigate('/profile')} className="py-2 px-6 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(168,85,247,0.4)] border border-purple-400/30 transition-all active:scale-95 flex items-center gap-2">
                                                VER PLANOS <ChevronRight size={14}/>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative h-full w-1/3 flex items-center justify-center z-10 pointer-events-none">
                                         <div className="relative w-40 h-40 animate-float">
                                             <div className="absolute inset-0 bg-cyan-500/10 blur-3xl rounded-full"></div>
                                             <div className="w-full h-full border border-cyan-500/30 bg-slate-900/50 backdrop-blur-md rounded-2xl flex items-center justify-center transform rotate-12 relative overflow-hidden shadow-2xl">
                                                 <div className="absolute inset-0 bg-[linear-gradient(transparent,rgba(6,182,212,0.1),transparent)] animate-scan"></div>
                                                 <BrainCircuit size={64} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
                                                 <div className="absolute top-2 right-2 flex gap-1">
                                                     <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping"></div>
                                                 </div>
                                                 <div className="absolute bottom-2 left-2 text-[8px] font-mono text-cyan-600">CPU: 98%</div>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                             </div>
                        </div>

                        {/* Indicators */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
                            <button onClick={() => setBannerIndex(0)} className={`w-2 h-2 rounded-full transition-all duration-300 ${bannerIndex === 0 ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/50'}`}></button>
                            <button onClick={() => setBannerIndex(1)} className={`w-2 h-2 rounded-full transition-all duration-300 ${bannerIndex === 1 ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/50'}`}></button>
                        </div>
                    </div>
                )}

                {/* Filters Header */}
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-4 gap-4 sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 pt-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 rounded-lg">
                            {filter === 'casino' ? <Trophy className="text-casino-gold" size={24} /> : filter === 'slots' ? <Gem className="text-purple-400" size={24} /> : filter === 'fast' ? <Zap className="text-blue-400" size={24} /> : filter === 'favorites' ? <Heart className="text-red-500" size={24} /> : <LayoutGrid className="text-white" size={24} />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white leading-none">
                                {searchTerm ? `Busca: "${searchTerm}"` : filter === 'all' ? 'Lobby de Jogos' : filter === 'favorites' ? 'Meus Favoritos' : filter === 'casino' ? 'Mesa & Cartas' : filter === 'slots' ? 'Slots' : 'Jogos Rápidos'}
                            </h2>
                        </div>
                    </div>
                    
                    {/* Filter Buttons */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap ${filter === 'all' ? 'bg-white text-black border-white' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'}`}>Lobby</button>
                            <button onClick={() => setFilter('favorites')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap flex items-center gap-1 ${filter === 'favorites' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'}`}><Heart size={12} fill="currentColor"/> Favoritos</button>
                            <button onClick={() => setFilter('fast')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap ${filter === 'fast' ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'}`}>Rápido</button>
                            <button onClick={() => setFilter('slots')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap ${filter === 'slots' ? 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/20' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'}`}>Slots</button>
                            <button onClick={() => setFilter('casino')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap ${filter === 'casino' ? 'bg-casino-gold text-black border-casino-gold shadow-lg shadow-yellow-500/20' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'}`}>Cassino</button>
                    </div>
                </div>

                {/* Content Rendering */}
                {/* 1. If Searching: Show Flat List */}
                {searchTerm ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).map(renderGameCard)}
                         {allGames.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                             <div className="col-span-full text-center py-20 text-slate-500">Nenhum jogo encontrado para "{searchTerm}"</div>
                         )}
                    </div>
                ) : filter !== 'all' ? (
                    // 2. If Filtered (Tabs): Show Flat List of that category
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        {filter === 'favorites' 
                            ? (favoriteGamesList.length > 0 ? favoriteGamesList.map(renderGameCard) : <div className="col-span-full text-center py-20 text-slate-500 border border-dashed border-white/10 rounded-xl">Você ainda não tem jogos favoritos.</div>)
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
            <div className="w-full text-center py-8 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    </div>
  );
};
