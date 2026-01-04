
import React from 'react';
import { GameStatus } from '../types';
import { RotateCcw, Trash2, Hand, ThumbsUp, Heart, Skull, Play, ShieldCheck, X } from 'lucide-react';

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
  
  // Side Bets
  sideBets?: { perfectPairs: number; dealerBust: number };
  onSideBetAction?: (type: 'perfectPairs' | 'dealerBust', action: 'toggle' | 'double' | 'clear') => void;
  
  // Insurance
  onInsurance?: (buy: boolean) => void;
  insuranceBet?: number; 
}

export const GameControls: React.FC<GameControlsProps> = ({
  status,
  currentBet,
  balance,
  onBet,
  onDeal,
  onHit,
  onStand,
  decisionTime,
  lastBet,
  sideBets,
  onSideBetAction,
  onInsurance,
  insuranceBet = 0
}) => {
  const chips = [1, 5, 10, 25, 50];

  if (status === GameStatus.GameOver) return null;

  const sideBetTotal = (sideBets?.perfectPairs || 0) + (sideBets?.dealerBust || 0);
  const totalDisplay = currentBet + sideBetTotal;

  // --- ESTADO: SEGURO (INSURANCE) ---
  if (status === GameStatus.Insurance) {
      return (
        <div className="w-[340px] animate-slide-up flex flex-col gap-3 p-5 bg-slate-900 rounded-2xl border-2 border-yellow-500/50 shadow-[0_0_40px_rgba(234,179,8,0.15)] z-50 pointer-events-auto">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                        <ShieldCheck size={24} className="text-yellow-500 animate-pulse" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span className="font-black text-base text-white uppercase tracking-wider">Seguro?</span>
                        <span className="text-[10px] text-yellow-500 font-bold">Dealer tem um Ás</span>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[9px] text-slate-400 uppercase font-bold mb-0.5">Custo</span>
                    <span className="font-mono font-bold text-white bg-slate-950/50 px-2 py-1 rounded text-xs border border-white/10">
                        R$ {(currentBet * 0.5).toFixed(2)}
                    </span>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-1">
                <button 
                    onClick={() => onInsurance && onInsurance(false)} 
                    className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 text-slate-300 font-bold text-xs uppercase transition-all hover:text-white"
                >
                    Recusar
                </button>
                <button 
                    onClick={() => onInsurance && onInsurance(true)} 
                    className="h-11 rounded-xl bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 border-b-4 border-yellow-800 active:border-b-0 active:translate-y-1 text-black font-black text-xs uppercase shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 transition-all"
                >
                    <ShieldCheck size={14} className="text-black" /> Aceitar
                </button>
            </div>
        </div>
      );
  }

  // --- ESTADO: APOSTA (IDLE / BETTING) ---
  if (status === GameStatus.Idle || status === GameStatus.Betting) {
    return (
      <div className="flex flex-col items-center gap-4 w-[360px] animate-fade-in pointer-events-auto">
        
        {/* SIDE BETS ROW - CENTRALIZAÇÃO ABSOLUTA */}
        {sideBets && onSideBetAction && (
          <div className="flex items-center justify-center gap-2 w-full">
            
            {/* PERFECT PAIRS CONTAINER */}
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onSideBetAction('perfectPairs', 'toggle')}
                className={`transition-all duration-300 flex items-center justify-center gap-2 px-3 rounded-xl border shadow-md backdrop-blur-md w-[155px] h-[48px] group active:scale-95 ${sideBets.perfectPairs > 0 ? 'bg-purple-600/90 border-purple-400 text-white shadow-purple-500/30' : 'bg-slate-900/80 border-white/5 text-slate-400 hover:bg-slate-800'}`}
              >
                <Heart size={16} fill={sideBets.perfectPairs > 0 ? "currentColor" : "none"} className="shrink-0" />
                <div className="flex flex-col leading-none items-center">
                  <span className="text-[9px] font-black uppercase tracking-wider">Par Perfeito</span>
                  {sideBets.perfectPairs > 0 && (
                    <span className="text-[10px] font-mono font-bold mt-0.5 text-purple-200">R$ {sideBets.perfectPairs}</span>
                  )}
                </div>
              </button>
              {sideBets.perfectPairs > 0 && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => onSideBetAction('perfectPairs', 'double')} className="w-5 h-5 bg-slate-800 border border-white/10 rounded flex items-center justify-center text-[7px] font-black text-purple-300 hover:bg-purple-600 hover:text-white transition-colors">2X</button>
                  <button onClick={() => onSideBetAction('perfectPairs', 'clear')} className="w-5 h-5 bg-slate-800 border border-white/10 rounded flex items-center justify-center text-slate-500 hover:bg-red-600 hover:text-white transition-colors"><Trash2 size={10}/></button>
                </div>
              )}
            </div>

            {/* DEALER BUST CONTAINER */}
            <div className="flex items-center gap-1">
              {sideBets.dealerBust > 0 && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => onSideBetAction('dealerBust', 'double')} className="w-5 h-5 bg-slate-800 border border-white/10 rounded flex items-center justify-center text-[7px] font-black text-red-300 hover:bg-red-600 hover:text-white transition-colors">2X</button>
                  <button onClick={() => onSideBetAction('dealerBust', 'clear')} className="w-5 h-5 bg-slate-800 border border-white/10 rounded flex items-center justify-center text-slate-500 hover:bg-red-900 hover:text-white transition-colors"><Trash2 size={10}/></button>
                </div>
              )}
              <button 
                onClick={() => onSideBetAction('dealerBust', 'toggle')}
                className={`transition-all duration-300 flex items-center justify-center gap-2 px-3 rounded-xl border shadow-md backdrop-blur-md w-[155px] h-[48px] group active:scale-95 ${sideBets.dealerBust > 0 ? 'bg-red-600/90 border-red-400 text-white shadow-red-500/30' : 'bg-slate-900/80 border-white/5 text-slate-400 hover:bg-slate-800'}`}
              >
                <div className="flex flex-col leading-none items-center">
                  <span className="text-[9px] font-black uppercase tracking-wider">Banca Estoura</span>
                  {sideBets.dealerBust > 0 && (
                    <span className="text-[10px] font-mono font-bold mt-0.5 text-red-200">R$ {sideBets.dealerBust}</span>
                  )}
                </div>
                <Skull size={16} className="shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* CHIPS ROW - TAMANHO HARMONIZADO */}
        <div className="flex items-center justify-center gap-2 h-10 mt-1">
          {chips.map((chip) => (
            <button
              key={chip}
              disabled={balance < chip}
              onClick={() => onBet(chip)}
              className="group transition-all duration-300 hover:-translate-y-1 active:scale-90 disabled:opacity-30 disabled:grayscale"
            >
              <div className={`
                w-10 h-10 rounded-full border-[2.5px] border-dashed shadow-md flex items-center justify-center font-black text-[10px] relative overflow-hidden
                ${chip === 1 ? 'bg-blue-600 border-blue-300 text-white' : ''}
                ${chip === 5 ? 'bg-red-600 border-red-300 text-white' : ''}
                ${chip === 10 ? 'bg-green-600 border-green-300 text-white' : ''}
                ${chip === 25 ? 'bg-purple-600 border-purple-300 text-white' : ''}
                ${chip === 50 ? 'bg-orange-600 border-orange-300 text-white' : ''}
              `}>
                <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-white/10 pointer-events-none"></div>
                <span className="z-10 drop-shadow-md">{chip}</span>
              </div>
            </button>
          ))}
        </div>

        {/* FOOTER CONTROLS - REFINADOS E COMPACTOS */}
        <div className="flex flex-col items-center gap-3 w-full">
            {/* TOTAL INDICATOR */}
            <div className="bg-black/80 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-xl flex items-center gap-3 shadow-2xl">
                <span className="text-[7px] text-slate-500 uppercase tracking-widest font-black">Total</span>
                <span className="text-base font-mono font-bold text-casino-gold leading-none">R$ {totalDisplay.toFixed(2)}</span>
            </div>

            {/* MAIN ACTIONS BAR */}
            <div className="flex items-center gap-4">
                <button 
                  onClick={() => onBet(0)} 
                  disabled={currentBet === 0} 
                  className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 text-slate-500 hover:text-white hover:bg-red-950/30 hover:border-red-900/50 flex items-center justify-center transition-all disabled:opacity-20 active:scale-90"
                >
                  <Trash2 size={16} />
                </button>

                <button 
                    onClick={onDeal} 
                    disabled={currentBet === 0}
                    className={`w-14 h-14 rounded-full border-[3px] shadow-2xl flex items-center justify-center transition-all duration-500 active:scale-95 ${currentBet > 0 ? 'bg-gradient-to-b from-green-400 to-green-700 border-green-300 text-white hover:shadow-green-500/30 scale-105' : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'}`}
                >
                    <Play size={24} fill="currentColor" className={currentBet > 0 ? "animate-pulse ml-0.5" : "ml-0.5"} />
                </button>

                <button 
                  onClick={() => lastBet && onBet(lastBet)} 
                  disabled={!lastBet || balance < lastBet} 
                  className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 text-slate-500 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all disabled:opacity-20 active:scale-90"
                >
                  <RotateCcw size={16} />
                </button>
            </div>
        </div>
      </div>
    );
  }

  // --- ESTADO: JOGANDO (PLAYING) ---
  if (status === GameStatus.Playing) {
    return (
      <div className="w-[280px] animate-slide-up flex flex-col items-center gap-3">
            <div className="flex justify-center gap-4 items-center w-full">
                <button onClick={onStand} className="flex-1 h-14 bg-gradient-to-b from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 rounded-xl border-b-[3px] border-red-900 active:border-b-0 active:translate-y-0.5 transition-all shadow-lg flex flex-col items-center justify-center">
                    <Hand className="text-white" size={18} />
                    <span className="text-[8px] font-black text-white uppercase tracking-widest mt-1">Parar</span>
                </button>

                {decisionTime !== undefined && (
                    <div className="relative flex items-center justify-center w-11 h-11 shrink-0">
                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle cx="22" cy="22" r="18" stroke="currentColor" strokeWidth="2.5" fill="transparent" className="text-slate-800" />
                            <circle cx="22" cy="22" r="18" stroke="currentColor" strokeWidth="2.5" fill="transparent" strokeDasharray={113} strokeDashoffset={113 - (113 * decisionTime) / 10} className={`transition-all duration-1000 ease-linear ${decisionTime <= 3 ? 'text-red-500' : 'text-casino-gold'}`} strokeLinecap="round" />
                        </svg>
                        <span className={`text-base font-mono font-bold ${decisionTime <= 3 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{decisionTime}</span>
                    </div>
                )}

                <button onClick={onHit} className="flex-1 h-14 bg-gradient-to-b from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 rounded-xl border-b-[3px] border-green-900 active:border-b-0 active:translate-y-0.5 transition-all shadow-lg flex flex-col items-center justify-center">
                    <ThumbsUp className="text-white" size={18} />
                    <span className="text-[8px] font-black text-white uppercase tracking-widest mt-1">Pedir</span>
                </button>
            </div>
      </div>
    );
  }

  return null;
};
