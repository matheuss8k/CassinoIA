import React, { useMemo } from 'react';
import { Card } from '../types';
import { getBasicStrategyHint } from '../services/gameLogic';
import { BrainCircuit, Zap } from 'lucide-react';

interface AISuggestionProps {
  playerHand: Card[];
  dealerHand: Card[];
}

export const AISuggestion: React.FC<AISuggestionProps> = ({ playerHand, dealerHand }) => {
  
  const suggestion = useMemo(() => {
    return getBasicStrategyHint(playerHand, dealerHand);
  }, [playerHand, dealerHand]);

  // Fake confidence percentage for immersion
  const confidence = useMemo(() => Math.floor(Math.random() * (98 - 85) + 85), [playerHand]);

  const isHit = suggestion.action === 'HIT';
  const actionText = isHit ? 'PEDIR' : 'PARAR';

  return (
    <div className="w-full animate-slide-up">
      <div className="bg-slate-900/90 border border-casino-gold/30 rounded-2xl p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(251,191,36,0.1)] relative overflow-hidden group">
        
        {/* Scanning Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-casino-gold/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
            <h3 className="text-casino-gold font-bold flex items-center gap-2 uppercase tracking-widest text-sm animate-pulse">
                <BrainCircuit size={18} /> SUGESTÃO DA IA
            </h3>
            <span className="text-[10px] text-slate-500 font-mono border border-slate-700 px-1 rounded">V.1.0</span>
        </div>

        {/* Action Box */}
        <div className={`
            flex flex-col items-center justify-center py-4 rounded-xl border-2 mb-4 transition-colors duration-300
            ${isHit 
                ? 'bg-blue-900/30 border-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.3)]' 
                : 'bg-red-900/30 border-red-500 shadow-[inset_0_0_20px_rgba(239,68,68,0.3)]'
            }
        `}>
            <span className="text-xs text-slate-400 uppercase tracking-widest mb-1">Recomendação</span>
            <div className={`text-4xl font-black tracking-wider drop-shadow-lg ${isHit ? 'text-blue-400' : 'text-red-400'}`}>
                {actionText}
            </div>
        </div>

        {/* Reason & Stats */}
        <div className="space-y-3">
            <div className="flex items-start gap-2">
                <Zap size={14} className="text-casino-gold mt-1 shrink-0" />
                <p className="text-sm text-slate-300 leading-tight">
                    {suggestion.reason}
                </p>
            </div>
            
            {/* Fake Probability Bar */}
            <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                    <span>PROBABILIDADE</span>
                    <span className="text-casino-gold">{confidence}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-casino-gold to-yellow-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${confidence}%` }}
                    ></div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};