import React, { useMemo } from 'react';
import { Card, GameStatus } from '../types';
import { getBasicStrategyHint } from '../services/gameLogic';
import { BrainCircuit, Zap, Scan, Sparkles } from 'lucide-react';

interface AISuggestionProps {
  playerHand: Card[];
  dealerHand: Card[];
  status: GameStatus;
}

export const AISuggestion: React.FC<AISuggestionProps> = ({ playerHand, dealerHand, status }) => {
  
  const suggestion = useMemo(() => {
    return getBasicStrategyHint(playerHand, dealerHand);
  }, [playerHand, dealerHand]);

  // Fake confidence percentage for immersion
  const confidence = useMemo(() => Math.floor(Math.random() * (99 - 85) + 85), [playerHand]);

  const isHit = suggestion.action === 'HIT';
  const actionText = isHit ? 'PEDIR' : 'PARAR';
  
  // Só mostra a sugestão ativa se estiver jogando
  const isActive = status === GameStatus.Playing;

  return (
    <div className="w-full animate-slide-up h-full flex flex-col">
      <div className={`
        bg-slate-900/90 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.1)] relative overflow-hidden group flex-1 flex flex-col justify-between min-h-[500px]
      `}>
        
        {/* Scanning Effect Overlay (Purple) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>

        {/* Header - Mines Style */}
        <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <h3 className="text-purple-400 font-bold flex items-center gap-2 uppercase tracking-widest text-sm animate-pulse">
                <BrainCircuit size={20} /> IA SCAN
            </h3>
            <span className="text-[10px] text-slate-500 font-mono border border-slate-700 px-1 rounded bg-black/40">V.2.0</span>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
            {isActive ? (
                <>
                    {/* Action Box */}
                    <div className="relative w-full">
                        <div className={`
                            flex flex-col items-center justify-center py-6 rounded-2xl border-2 mb-4 transition-all duration-300 animate-fade-in relative z-10
                            ${isHit 
                                ? 'bg-green-900/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' 
                                : 'bg-red-900/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                            }
                        `}>
                            <span className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">Recomendação</span>
                            <div className={`text-5xl font-black tracking-wider drop-shadow-lg ${isHit ? 'text-green-400' : 'text-red-400'}`}>
                                {actionText}
                            </div>
                            
                            {/* Decorative element */}
                            <div className="absolute top-2 right-2 opacity-50">
                                <Sparkles size={16} className={isHit ? 'text-green-400' : 'text-red-400'} />
                            </div>
                        </div>
                    </div>

                    {/* Reason & Stats */}
                    <div className="w-full space-y-4 animate-slide-up">
                        <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5">
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    <Zap size={16} className="text-purple-400" />
                                </div>
                                <p className="text-sm text-slate-300 leading-tight font-medium">
                                    {suggestion.reason}
                                </p>
                            </div>
                        </div>
                        
                        {/* Probability Bar */}
                        <div>
                            <div className="flex justify-between text-[10px] text-slate-500 mb-1.5 font-mono uppercase tracking-wider">
                                <span>Confiança da IA</span>
                                <span className="text-purple-400 font-bold">{confidence}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
                                <div 
                                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(168,85,247,0.5)] relative"
                                    style={{ width: `${confidence}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-[shine_1s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                // Idle State - Mines Style Visuals
                <div className="flex flex-col items-center justify-center gap-4 opacity-80">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full border-4 border-purple-900/50 bg-purple-900/10 flex items-center justify-center">
                            <BrainCircuit size={40} className="text-purple-500/50" />
                        </div>
                        <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>
                    </div>
                    
                    <div className="text-center space-y-1">
                        <h4 className="text-slate-300 font-bold text-sm tracking-wide">AGUARDANDO RODADA</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Sistema em Standby</p>
                    </div>
                </div>
            )}
        </div>

        {/* Footer - Mines Style */}
        <div className="mt-6 pt-3 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 uppercase tracking-widest font-mono">
            <span>Sys: Online</span>
            <span>Lat: 12ms</span>
        </div>

      </div>
    </div>
  );
};