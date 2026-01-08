
import React, { useMemo } from 'react';
import { Card, GameStatus } from '../types';
import { getBasicStrategyHint } from '../services/gameLogic';
import { BrainCircuit, Zap, Scan, Sparkles, ChevronRight } from 'lucide-react';

interface AISuggestionProps {
  playerHand: Card[];
  dealerHand: Card[];
  status: GameStatus;
  variant?: 'full' | 'compact';
}

export const AISuggestion: React.FC<AISuggestionProps> = ({ playerHand, dealerHand, status, variant = 'full' }) => {
  
  const suggestion = useMemo(() => {
    return getBasicStrategyHint(playerHand, dealerHand);
  }, [playerHand, dealerHand]);

  // Fake confidence percentage for immersion
  const confidence = useMemo(() => Math.floor(Math.random() * (99 - 85) + 85), [playerHand]);

  const isHit = suggestion.action === 'HIT';
  const actionText = isHit ? 'PEDIR' : 'PARAR';
  
  // A IA está ativa apenas quando é a vez do jogador
  const isPlayerTurn = status === GameStatus.Playing;
  // Verifica se o jogo está acontecendo (Dealing, Playing, DealerTurn)
  const isGameActive = status === GameStatus.Dealing || status === GameStatus.Playing || status === GameStatus.DealerTurn;

  // --- MODO COMPACTO (MOBILE) ---
  if (variant === 'compact') {
      if (!isGameActive && status !== GameStatus.GameOver) return null; // Não mostra nada se estiver ocioso no mobile

      return (
        <div className="w-full max-w-[500px] mx-auto animate-slide-up mb-2">
            <div className={`
                flex items-center justify-between px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-lg transition-all duration-300
                ${!isPlayerTurn 
                    ? 'bg-slate-900/80 border-slate-700 opacity-80' 
                    : isHit 
                        ? 'bg-gradient-to-r from-green-900/40 to-slate-900/90 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]' 
                        : 'bg-gradient-to-r from-red-900/40 to-slate-900/90 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                }
            `}>
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full ${isPlayerTurn ? 'bg-purple-500/20 text-purple-400 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
                        <BrainCircuit size={16} />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Sugestão IA</span>
                        {isPlayerTurn ? (
                            <span className="text-[10px] text-slate-300 flex items-center gap-1">
                                Confiança: <span className="text-purple-400 font-mono">{confidence}%</span>
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-500">Aguardando vez...</span>
                        )}
                    </div>
                </div>

                {isPlayerTurn && (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <span className={`text-base font-black tracking-widest ${isHit ? 'text-green-400' : 'text-red-400'}`}>
                                {actionText}
                            </span>
                        </div>
                        <div className={`p-1 rounded-full border ${isHit ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>
                            {isHit ? <Sparkles size={12} fill="currentColor" /> : <div className="w-3 h-3 rounded-sm bg-red-500" />}
                        </div>
                    </div>
                )}
            </div>
        </div>
      );
  }

  // --- MODO FULL (DESKTOP) ---
  return (
    <div className="w-full animate-slide-up h-full flex flex-col">
      <div className={`
        bg-slate-900/90 border border-purple-500/30 rounded-3xl p-4 md:p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.1)] relative overflow-hidden group flex-1 flex flex-col justify-between min-h-[280px] xl:min-h-[500px] transition-all
      `}>
        
        {/* Scanning Effect Overlay (Purple) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>

        {/* Header - Mines Style */}
        <div className="flex items-center justify-between mb-4 md:mb-6 border-b border-white/10 pb-2 md:pb-4">
            <h3 className="text-purple-400 font-bold flex items-center gap-2 uppercase tracking-widest text-xs md:text-sm animate-pulse">
                <BrainCircuit size={18} /> IA SCAN
            </h3>
            <span className="text-[9px] md:text-[10px] text-slate-500 font-mono border border-slate-700 px-1 rounded bg-black/40">V.2.0</span>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 md:gap-4">
            {isPlayerTurn ? (
                <>
                    {/* Action Box */}
                    <div className="relative w-full">
                        <div className={`
                            flex flex-col items-center justify-center py-4 md:py-6 rounded-2xl border-2 mb-2 md:mb-4 transition-all duration-300 animate-fade-in relative z-10
                            ${isHit 
                                ? 'bg-green-900/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' 
                                : 'bg-red-900/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                            }
                        `}>
                            <span className="text-[10px] md:text-xs text-slate-400 uppercase tracking-widest mb-1 md:mb-2 font-bold">Recomendação</span>
                            <div className={`text-4xl md:text-5xl font-black tracking-wider drop-shadow-lg ${isHit ? 'text-green-400' : 'text-red-400'}`}>
                                {actionText}
                            </div>
                            
                            {/* Decorative element */}
                            <div className="absolute top-2 right-2 opacity-50">
                                <Sparkles size={16} className={isHit ? 'text-green-400' : 'text-red-400'} />
                            </div>
                        </div>
                    </div>

                    {/* Reason & Stats */}
                    <div className="w-full space-y-3 md:space-y-4 animate-slide-up">
                        <div className="bg-slate-950/50 p-2 md:p-3 rounded-xl border border-white/5">
                            <div className="flex items-start gap-2 md:gap-3">
                                <div className="mt-1">
                                    <Zap size={14} className="text-purple-400" />
                                </div>
                                <p className="text-xs md:text-sm text-slate-300 leading-tight font-medium">
                                    {suggestion.reason}
                                </p>
                            </div>
                        </div>
                        
                        {/* Probability Bar */}
                        <div>
                            <div className="flex justify-between text-[9px] md:text-[10px] text-slate-500 mb-1 font-mono uppercase tracking-wider">
                                <span>Confiança da IA</span>
                                <span className="text-purple-400 font-bold">{confidence}%</span>
                            </div>
                            <div className="h-1.5 md:h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
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
                // Idle State / Processing State
                <div className="flex flex-col items-center justify-center gap-3 md:gap-4 opacity-80 py-4">
                    <div className="relative">
                        <div className={`w-16 h-16 md:w-24 md:h-24 rounded-full border-4 flex items-center justify-center transition-all ${isGameActive ? 'border-purple-500 border-t-transparent animate-spin bg-purple-900/20' : 'border-purple-900/50 bg-purple-900/10'}`}>
                            <BrainCircuit size={32} className={`text-purple-500/50 ${isGameActive ? 'animate-pulse' : ''} md:w-10 md:h-10`} />
                        </div>
                        {isGameActive && <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>}
                    </div>
                    
                    <div className="text-center space-y-1">
                        <h4 className="text-slate-300 font-bold text-xs md:text-sm tracking-wide">
                            {status === GameStatus.DealerTurn ? 'VEZ DA BANCA' : 
                             status === GameStatus.Dealing ? 'DISTRIBUINDO...' : 
                             status === GameStatus.GameOver ? 'RODADA FINALIZADA' : 'AGUARDANDO RODADA'}
                        </h4>
                        <p className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest">
                             {isGameActive ? 'Monitorando mesa...' : 'Sistema em Standby'}
                        </p>
                    </div>
                </div>
            )}
        </div>

        {/* Footer - Mines Style */}
        <div className="mt-4 md:mt-6 pt-2 md:pt-3 border-t border-white/5 flex justify-between items-center text-[8px] md:text-[9px] text-slate-600 uppercase tracking-widest font-mono">
            <span>Sys: Online</span>
            <span>Lat: 12ms</span>
        </div>

      </div>
    </div>
  );
};
