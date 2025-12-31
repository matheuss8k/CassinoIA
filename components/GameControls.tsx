import React from 'react';
import { Button } from './UI/Button';
import { GameStatus } from '../types';
import { Timer, RotateCcw, Trash2 } from 'lucide-react';

interface GameControlsProps {
  status: GameStatus;
  currentBet: number;
  balance: number;
  onBet: (amount: number) => void;
  onDeal: () => void;
  onHit: () => void;
  onStand: () => void;
  onReset: () => void;
  timeLeft?: number; // Betting countdown
  decisionTime?: number; // Decision countdown (Hit/Stand)
  lastBet?: number; // Previous round bet
}

export const GameControls: React.FC<GameControlsProps> = ({
  status,
  currentBet,
  balance,
  onBet,
  onDeal,
  onHit,
  onStand,
  onReset,
  timeLeft,
  decisionTime,
  lastBet
}) => {
  const chips = [1, 3, 5];

  if (status === GameStatus.Idle || status === GameStatus.Betting) {
    return (
      <div className="flex flex-col items-center gap-0.5 animate-slide-up bg-black/70 p-3 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl min-w-[300px]">
        {/* Chips Row & Utilities */}
        <div className="flex gap-4 justify-center items-center mb-0">
          {chips.map((chip) => (
            <button
              key={chip}
              disabled={balance < chip}
              onClick={() => onBet(chip)}
              className="relative group transition-transform hover:-translate-y-1 disabled:opacity-30 disabled:hover:translate-y-0 active:scale-95"
            >
              <div className={`
                w-10 h-10 sm:w-14 sm:h-14 rounded-full border-[4px] border-dashed flex items-center justify-center font-black text-white shadow-xl
                ${chip === 1 ? 'bg-blue-600 border-blue-400 text-sm sm:text-lg' : ''}
                ${chip === 3 ? 'bg-green-600 border-green-400 text-sm sm:text-lg' : ''}
                ${chip === 5 ? 'bg-red-600 border-red-400 text-sm sm:text-lg' : ''}
              `}>
                {chip}
              </div>
              <div className="absolute inset-0 rounded-full shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] pointer-events-none"></div>
            </button>
          ))}
          
          {/* Utilities Column */}
          <div className="flex flex-col gap-2">
               {/* Re-bet Button */}
               {lastBet !== undefined && lastBet > 0 && (
                 <button 
                    onClick={() => onBet(lastBet)}
                    disabled={balance < lastBet}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-30 group relative"
                    title={`Repetir aposta de R$ ${lastBet}`}
                 >
                    <RotateCcw size={14} />
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Repetir ({lastBet})
                    </span>
                 </button>
               )}

               {/* Clear Button (Smaller now) */}
               <button 
                 onClick={() => onBet(0)}
                 className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900 border-2 border-red-900/50 flex items-center justify-center text-red-400 hover:bg-red-900/20 transition-colors group relative"
                 title="Limpar aposta"
               >
                 <Trash2 size={14} />
                 <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Limpar
                 </span>
               </button>
          </div>
        </div>
        
        {/* Info Row: Bet Amount - Compacted */}
        <div className="flex items-center gap-2 my-1">
           <span className="text-[10px] text-slate-400 uppercase tracking-widest">Aposta:</span>
           <span className="text-xl font-bold text-casino-gold leading-none">R$ {currentBet.toFixed(2)}</span>
        </div>

        {/* Action Button without Timer */}
        <div className="w-full max-w-[320px]">
             <div className="relative w-full">
                <Button 
                    onClick={onDeal} 
                    size="md" 
                    variant={currentBet > 0 ? "success" : "secondary"}
                    fullWidth
                    disabled={currentBet === 0}
                    className="shadow-casino-gold/10 shadow-lg border-b-2 relative transition-all"
                >
                    <span className="relative z-10 flex items-center gap-2 justify-center whitespace-nowrap">
                       {currentBet > 0 ? 'JOGAR AGORA' : 'FAÇA SUA APOSTA'}
                    </span>
                </Button>
             </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.Playing) {
    return (
      <div className="relative flex flex-col items-center justify-center">
        
        <div className="flex gap-4 justify-center items-center bg-black/60 p-3 pr-5 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl">
          <Button onClick={onHit} variant="primary" size="md" className="min-w-[100px] text-lg font-black shadow-xl hover:-translate-y-1">
            PEDIR
          </Button>
          <Button onClick={onStand} variant="danger" size="md" className="min-w-[100px] text-lg font-black shadow-xl hover:-translate-y-1">
            PARAR
          </Button>

          {/* Decision Timer - Side Positioned */}
          {decisionTime !== undefined && (
            <div className="flex flex-col items-center justify-center ml-2 border-l border-white/10 pl-4">
              <div className="relative">
                 <Timer size={20} className={`mb-1 ${decisionTime <= 3 ? 'text-red-500 animate-pulse' : 'text-casino-gold'}`} />
                 {/* Circular Progress Indicator Ring (CSS based) */}
                 <svg className="absolute -top-1 -left-1 w-[28px] h-[28px] rotate-[-90deg]">
                    <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-800" />
                    <circle 
                        cx="14" cy="14" r="12" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        fill="transparent" 
                        className={decisionTime <= 3 ? 'text-red-500' : 'text-casino-gold'}
                        strokeDasharray={75}
                        strokeDashoffset={75 - (75 * decisionTime) / 10}
                        strokeLinecap="round"
                    />
                 </svg>
              </div>
              <span className={`text-xs font-mono font-bold leading-none ${decisionTime <= 3 ? 'text-red-500' : 'text-slate-300'}`}>
                {decisionTime}s
              </span>
            </div>
          )}
        </div>
        
      </div>
    );
  }

  return null;
};