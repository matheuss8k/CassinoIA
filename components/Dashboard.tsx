import React from 'react';
import { Button } from './UI/Button';
import { Spade, Dices, Club, Cat, Bomb, Rocket, Trophy, Gem } from 'lucide-react';

interface DashboardProps {
  onSelectGame: (gameId: string) => void;
}

interface GameOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  bg: string;
  badge?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectGame }) => {
  
  const casinoGames: GameOption[] = [
    {
      id: 'blackjack',
      name: 'Blackjack IA',
      description: 'Clássico 21. Conte com a ajuda da nossa IA para tomar as melhores decisões!',
      icon: <Spade size={40} className="text-casino-gold" />,
      active: true,
      bg: 'bg-gradient-to-br from-slate-900 to-slate-800',
      badge: 'POPULAR'
    },
    {
      id: 'baccarat',
      name: 'Baccarat IA',
      description: 'Clássico Punto Banco. Conte com a ajuda da nossa IA para prever o vencedor!',
      icon: <Club size={40} className="text-slate-400" />,
      active: false,
      bg: 'bg-slate-900/50 grayscale'
    },
    {
      id: 'roulette',
      name: 'Roleta',
      description: 'Aposte na sorte e nos números.',
      icon: <Dices size={40} className="text-slate-400" />,
      active: false,
      bg: 'bg-slate-900/50 grayscale'
    }
  ];

  const arcadeGames: GameOption[] = [
    {
      id: 'tigrinho',
      name: 'Fortune Tiger',
      description: 'O famoso jogo do tigrinho. Multiplicadores insanos esperam por você!',
      icon: <Cat size={40} className="text-orange-500" />,
      active: false,
      bg: 'bg-slate-900/50 grayscale'
    },
    {
      id: 'aviator',
      name: 'Aviãozinho',
      description: 'Decole para lucros altos! Retire sua aposta antes que o avião exploda.',
      icon: <Rocket size={40} className="text-purple-500" />,
      active: false,
      bg: 'bg-slate-900/50 grayscale',
      badge: 'CRASH'
    },
    {
      id: 'mines',
      name: 'Mines',
      description: 'Encontre os diamantes e evite as bombas escondidas no campo.',
      icon: <Bomb size={40} className="text-red-500" />,
      active: false,
      bg: 'bg-slate-900/50 grayscale'
    }
  ];

  const renderGameCard = (game: GameOption) => (
    <div 
        key={game.id}
        className={`
        relative rounded-2xl p-6 border border-white/5 overflow-hidden group transition-all duration-300 flex flex-col items-center text-center
        ${game.active ? 'hover:border-casino-gold/50 hover:shadow-2xl hover:shadow-casino-gold/10 active:scale-95 cursor-pointer' : 'opacity-70 cursor-not-allowed'}
        ${game.bg}
        `}
        onClick={() => game.active && onSelectGame(game.id)}
    >
        {game.badge && (
        <div className={`absolute top-0 right-0 text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg ${game.active ? 'bg-casino-gold' : 'bg-slate-500'}`}>
            {game.badge}
        </div>
        )}
        
        <div className="mb-4">
            <div className={`
                w-16 h-16 rounded-full flex items-center justify-center bg-black/30 border border-white/5
                ${game.active ? 'shadow-[0_0_20px_rgba(251,191,36,0.15)]' : ''}
            `}>
                {game.icon}
            </div>
        </div>

        <h3 className="text-lg font-bold text-white mb-1">{game.name}</h3>
        <p className="text-slate-400 text-xs mb-4 min-h-[2.5rem] flex items-center justify-center px-2">{game.description}</p>

        <div className="w-full mt-auto">
        {game.active ? (
            <Button 
                fullWidth 
                variant="primary" 
                size="md"
                className="shadow-lg shadow-yellow-900/20 py-4"
                onClick={(e) => { e.stopPropagation(); onSelectGame(game.id); }}
            >
                JOGAR
            </Button>
        ) : (
            <Button 
                fullWidth 
                variant="secondary" 
                size="md" 
                className="py-4"
                disabled
            >
                EM BREVE
            </Button>
        )}
        </div>
    </div>
  );

  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar px-4 py-4 animate-slide-up">
      <div className="max-w-6xl mx-auto pb-20">
        
        {/* Section 1: Casino Classics */}
        <div className="mb-8">
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="p-2 bg-casino-gold/20 rounded-lg">
                    <Trophy className="text-casino-gold" size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white leading-none">Cassino Ao Vivo</h2>
                    <p className="text-slate-400 text-xs mt-1">Mesas clássicas e estratégicas</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {casinoGames.map(renderGameCard)}
            </div>
        </div>

        {/* Section 2: Slots & Arcade */}
        <div>
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Gem className="text-purple-400" size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white leading-none">Slots & Arcade</h2>
                    <p className="text-slate-400 text-xs mt-1">Jogos rápidos e alta volatilidade</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {arcadeGames.map(renderGameCard)}
            </div>
        </div>

      </div>
    </div>
  );
};