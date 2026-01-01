import React from 'react';
import { Button } from './UI/Button';
import { GameStatus } from '../types';
import { RotateCcw, Trash2, Hand, ThumbsUp } from 'lucide-react';

interface GameControlsProps {
  status: GameStatus;
  currentBet: number;
  balance: number;
  onBet: (amount: number) => void;
  onDeal: () => void;
  onHit: () => void;
  onStand: () => void;
  onReset: () => void;
  timeLeft?: number;
  decisionTime?: number;
  lastBet?: number;
}

export const GameControls: React.FC<GameControlsProps> = ({
  status,
  currentBet,
  balance,
  onBet,
  onDeal,
  onHit,
  onStand,
  timeLeft,
  decisionTime,
  lastBet
}) => {
  const chips = [1, 5, 10, 25, 50];

  // --- ESTADO: APOSTA (IDLE / BETTING) ---
  if (status === GameStatus.Idle || status === GameStatus.Betting) {
    return (
      <div className="w-[280px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl animate-slide-up relative z-50">
        
        {/* Top Row: Tools & Display */}
        <div className="flex items-center gap-2 mb-3">
            {/* Rebet (Compact) */}
            <button 
                onClick={() => lastBet && onBet(lastBet)}
                disabled={!lastBet || balance < lastBet}
                className="w-8 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-20"
                title="Repetir"
            >
                <RotateCcw size={14} />
            </button>

            {/* Display (Compact) */}
            <div className="flex-1 h-10 bg-black/60 rounded-lg border border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">Aposta</div>
                <div className="text-base font-mono font-bold text-casino-gold leading-none">
                    R$ {currentBet.toFixed(2)}
                </div>
                {/* Scanline subtle */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-20 pointer-events-none"></div>
            </div>

            {/* Clear (Compact) */}
            <button 
                onClick={() => onBet(0)}
                disabled={currentBet === 0}
                className="w-8 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-red-900/70 hover:text-red-500 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-20"
                title="Limpar"
            >
                <Trash2 size={14} />
            </button>
        </div>

        {/* Middle Row: Chips (Compact & Centered) */}
        <div className="flex justify-center gap-1.5 mb-3">
            {chips.map((chip) => (
                <button
                    key={chip}
                    disabled={balance < chip}
                    onClick={() => onBet(chip)}
                    className="relative group transition-transform hover:-translate-y-1 active:scale-95 disabled:opacity-30 disabled:grayscale"
                >
                    <div className={`
                        w-10 h-10 rounded-full border-[3px] border-dashed flex items-center justify-center font-black text-white shadow-lg text-xs
                        ${chip === 1 ? 'bg-blue-600 border-blue-400' : ''}
                        ${chip === 5 ? 'bg-red-600 border-red-400' : ''}
                        ${chip === 10 ? 'bg-green-600 border-green-400' : ''}
                        ${chip === 25 ? 'bg-purple-600 border-purple-400' : ''}
                        ${chip === 50 ? 'bg-orange-600 border-orange-400' : ''}
                    `}>
                        {chip}
                    </div>
                </button>
            ))}
        </div>

        {/* Bottom Row: Action Button */}
        <Button 
            onClick={onDeal} 
            size="md" 
            variant={currentBet > 0 ? "success" : "secondary"}
            fullWidth
            disabled={currentBet === 0}
            className="h-10 text-sm font-black tracking-widest shadow-lg rounded-xl flex items-center justify-center"
        >
            {currentBet > 0 ? 'JOGAR' : 'APOSTAR'}
        </Button>
      </div>
    );
  }

  // --- ESTADO: JOGANDO (PLAYING) ---
  if (status === GameStatus.Playing) {
    return (
      <div className="w-[280px] animate-slide-up flex justify-center gap-3">
         
            {/* Stand Button */}
            <button 
                onClick={onStand}
                className="flex-1 h-14 bg-red-600 hover:bg-red-500 rounded-xl border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all shadow-lg flex flex-col items-center justify-center gap-1"
            >
                <Hand className="text-white" size={18} />
                <span className="text-[10px] font-black text-white uppercase tracking-wider">Parar</span>
            </button>

            {/* Decision Timer (Compact Center) */}
            {decisionTime !== undefined && (
                <div className="flex flex-col items-center justify-center w-14 h-14 bg-slate-900/90 rounded-full border-2 border-slate-700 shadow-xl shrink-0">
                     <span className={`text-lg font-mono font-bold leading-none ${decisionTime <= 3 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {decisionTime}
                    </span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase">SEC</span>
                </div>
            )}

            {/* Hit Button */}
            <button 
                onClick={onHit}
                className="flex-1 h-14 bg-green-600 hover:bg-green-500 rounded-xl border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all shadow-lg flex flex-col items-center justify-center gap-1"
            >
                <ThumbsUp className="text-white" size={18} />
                <span className="text-[10px] font-black text-white uppercase tracking-wider">Pedir</span>
            </button>
      </div>
    );
  }

  return null;
};