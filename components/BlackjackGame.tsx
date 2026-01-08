
import React, { useMemo } from 'react';
import { Card, GameStatus, GameResult, User, SideBets } from '../types';
import { CardComponent } from './CardComponent';
import { GameControls } from './GameControls';
import { AISuggestion } from './AISuggestion';
import { Info, Lock, ShieldCheck, History as HistoryIcon, Maximize2, Calendar, X, ShieldAlert, Heart, Skull, WifiOff, RefreshCcw } from 'lucide-react';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';
import { Button } from './UI/Button';
import { useBlackjackLogic, BjHistoryItem, MIN_BET, MAX_BET } from '../hooks/useBlackjackLogic';

interface BlackjackGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

// --- PURE COMPONENTS (Visual Helpers) ---

const ScoreBadge = React.memo(({ score, label, hidden }: { score: number, label: string, hidden?: boolean }) => (
    <div className="mt-2 flex flex-col items-center animate-fade-in z-20">
        <div className="bg-slate-900 border border-casino-gold/50 px-3 py-0.5 md:px-4 md:py-1 rounded-full shadow-lg flex items-center gap-2">
            <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
            <span className="text-xs md:text-sm font-bold text-casino-gold font-mono">
                {hidden ? '?' : score}
            </span>
        </div>
    </div>
));

const GhostSlot = React.memo(() => (
    <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/5 flex items-center justify-center mx-1">
        <div className="w-6 h-6 rounded-full bg-white/5"></div>
    </div>
));

const CoinRain = React.memo(() => {
    const coins = useMemo(() => new Array(50).fill(0).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 1.5 + Math.random() * 2,
        size: 15 + Math.random() * 15
    })), []);

    return (
        <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden rounded-[2rem] md:rounded-[3rem]">
            <style>
                {`@keyframes coinFall { 0% { transform: translateY(-100px) rotate(0deg); opacity: 1; } 100% { transform: translateY(800px) rotate(720deg); opacity: 0; } }`}
            </style>
            {coins.map((c, i) => (
                <div key={i} className="absolute rounded-full bg-gradient-to-br from-yellow-200 via-yellow-500 to-yellow-700 border border-yellow-100 flex items-center justify-center text-yellow-900 font-bold shadow-md"
                    style={{ 
                        left: `${c.left}%`, 
                        top: '-30px', 
                        width: `${c.size}px`, 
                        height: `${c.size}px`, 
                        fontSize: `${c.size * 0.6}px`, 
                        animation: `coinFall ${c.duration}s linear infinite`, 
                        animationDelay: `${c.delay}s`, 
                        opacity: 0 
                    }}>
                    $
                </div>
            ))}
        </div>
    );
});

// --- HISTORY COMPONENTS ---

const MiniHistoryTicker = ({ history, onExpand }: { history: BjHistoryItem[], onExpand: () => void }) => {
    const displayHistory = history.slice(0, 3);
    
    const getResultColor = (res: GameResult, profit: number) => {
        if (res === GameResult.Blackjack) return 'text-yellow-400';
        if (profit > 0) return 'text-green-400';
        if (profit === 0) return 'text-slate-400';
        return 'text-red-400';
    };

    const getResultBadge = (res: GameResult, profit: number) => {
        if (res === GameResult.Blackjack) return <span className="bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded text-[9px] font-bold border border-yellow-500/30">BJ</span>;
        if (profit > 0) return <span className="bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded text-[9px] font-bold border border-green-500/30">WIN</span>;
        if (profit === 0) return <span className="bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-500/30">PUSH</span>;
        return <span className="bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded text-[9px] font-bold border border-red-500/30">LOSE</span>;
    };

    return (
        <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-3 flex flex-col gap-2 shrink-0 relative group min-h-[160px] xl:min-h-[160px] min-h-0">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-1 shrink-0">
                <div className="flex items-center gap-2"><HistoryIcon size={14} className="text-casino-gold"/><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Histórico</span></div>
                <button onClick={onExpand} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-1 rounded-md hover:bg-white/10" title="Ver Histórico Completo"><Maximize2 size={12} /></button>
            </div>
            <div className="flex flex-col gap-1.5 overflow-hidden">
                {displayHistory.length === 0 && (<div className="flex flex-col items-center justify-center text-slate-600 opacity-50 py-4"><Calendar size={20} className="mb-1"/><span className="text-[9px] font-bold uppercase tracking-widest">Sem Registros</span></div>)}
                {displayHistory.map((h) => {
                    const profit = h.payout - h.bet;
                    return (
                        <div key={h.id} className={`flex items-center justify-between p-1.5 rounded-lg border text-xs animate-slide-up ${profit > 0 ? 'bg-green-900/10 border-green-500/10' : profit === 0 ? 'bg-slate-800/50 border-white/5' : 'bg-red-900/5 border-red-500/10'}`}>
                             <div className="flex items-center gap-2">
                                 {getResultBadge(h.result, profit)}
                                 <span className="font-mono text-slate-400 text-[9px]">{h.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                             </div>
                             <div className={`font-bold font-mono text-[10px] flex flex-col items-end leading-none ${getResultColor(h.result, profit)}`}>
                                 <span>{h.payout > 0 ? `+${h.payout.toFixed(2)}` : `-${h.bet.toFixed(2)}`}</span>
                                 {h.payout > 0 && <span className="text-[8px] opacity-70 font-medium text-slate-500">{profit > 0 ? 'Lucro' : 'Retorno'}</span>}
                             </div>
                        </div>
                    );
                })}
            </div>
            {history.length > 3 && (<button onClick={onExpand} className="w-full text-[9px] text-slate-500 uppercase font-bold tracking-widest text-center hover:text-yellow-500 transition-colors mt-auto pt-1">Ver Todos ({history.length})</button>)}
        </div>
    );
};

const FullHistoryModal: React.FC<{ isOpen: boolean; onClose: () => void; history: BjHistoryItem[] }> = ({ isOpen, onClose, history }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl relative shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-950/50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <HistoryIcon size={20} className="text-yellow-500" />
                        <h3 className="text-white font-bold text-lg">Histórico Detalhado</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
                </div>
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-white/5">
                    <div className="col-span-2">Resultado</div>
                    <div className="text-right">Aposta</div>
                    <div className="text-right">Retorno</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
                    {history.length === 0 && <div className="text-center text-slate-500 py-10">Nenhum registro encontrado.</div>}
                    {history.map((h) => {
                         const profit = h.payout - h.bet;
                         const isWin = profit > 0;
                         const isPush = profit === 0 && h.payout > 0;
                         return (
                            <div key={h.id} className={`grid grid-cols-4 gap-2 items-center p-3 rounded-lg border text-sm transition-colors ${isWin ? 'bg-green-950/20 border-green-500/20 hover:bg-green-950/30' : isPush ? 'bg-slate-800 border-slate-700' : 'bg-slate-950 border-white/5'}`}>
                                <div className="col-span-2 flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${h.result === GameResult.Blackjack ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' : isWin ? 'bg-green-500/20 text-green-400 border-green-500/30' : isPush ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-red-900/20 text-red-500 border-red-500/20'}`}>
                                        {h.result === GameResult.Blackjack ? 'BJ' : isWin ? 'WIN' : isPush ? 'PUSH' : 'LOSE'}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-mono text-slate-300 text-xs">{h.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        <span className={`text-[9px] font-bold uppercase ${isWin ? 'text-green-500' : 'text-slate-600'}`}>
                                            {isWin ? 'LUCRO: ' + profit.toFixed(2) : isPush ? 'Empate' : 'Perda'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right font-mono text-slate-400 text-xs">{h.bet.toFixed(2)}</div>
                                <div className={`text-right font-mono font-bold text-xs ${isWin ? 'text-green-400' : isPush ? 'text-white' : 'text-slate-600'}`}>{h.payout > 0 ? `+${h.payout.toFixed(2)}` : '-'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ user, updateUser }) => {
  // Use Custom Hook for Logic
  const {
      playerHand, dealerHand, status, bet, lastBet, result, sideBets, insuranceBet,
      isProcessing, decisionTimer, fatalError, showProvablyFair, serverSeedHash,
      history, showFullHistory, notifyMsg,
      totalBetInGame, playerScore, dealerScore, isDealerHidden, displayPayout,
      setShowProvablyFair, setShowFullHistory, setNotifyMsg,
      handleForceReload, initializeGame, handleBet, handleSideBetAction,
      dealCards, handleInsurance, handleHit, handleStand
  } = useBlackjackLogic(user, updateUser);

  const showWinAnimation = status === GameStatus.GameOver && (result === GameResult.Blackjack || (result === GameResult.PlayerWin && playerScore === 21));

  // --- FATAL ERROR MODAL ---
  if (fatalError) {
      return (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                      <WifiOff size={32} className="text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-white mb-2 uppercase">Erro de Sincronização</h2>
                  <p className="text-slate-400 text-sm mb-6">Houve uma falha na comunicação com o servidor de jogo. Para sua segurança, a mesa precisa ser recarregada.</p>
                  <Button fullWidth onClick={handleForceReload} variant="danger" className="py-4"><RefreshCcw size={18} className="mr-2" /> RECARREGAR MESA</Button>
              </div>
          </div>
      );
  }

  // --- MOBILE RULES MODAL (Simple Alert Replacement) ---
  const showMobileRules = () => {
      alert("Blackjack 3:2 | Dealer para no 17 | Seguro 2:1");
  };

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden bg-slate-950">
      <Notification message={notifyMsg} onClose={() => setNotifyMsg(null)} />
      <ProvablyFairModal isOpen={showProvablyFair} onClose={() => setShowProvablyFair(false)} serverSeedHash={serverSeedHash} clientSeed={user.id} nonce={playerHand.length + dealerHand.length} />
      <FullHistoryModal isOpen={showFullHistory} onClose={() => setShowFullHistory(false)} history={history} />

      <div className="absolute top-4 md:top-8 left-0 right-0 text-center z-20 pointer-events-none">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
              BLACKJACK <span className="text-casino-gold">IA</span>
          </h1>
      </div>

      <div className="flex-1 w-full flex flex-col items-center min-h-0 pt-16 md:pt-24 pb-4 px-4 overflow-y-auto no-scrollbar scroll-smooth">
        
        {/* --- MOBILE STATS BAR (NEW) --- */}
        <div className="xl:hidden w-full max-w-[500px] mb-2 flex items-stretch gap-2 z-30 shrink-0">
            <div className={`flex-1 rounded-xl p-2 flex flex-col justify-center items-center border shadow-lg transition-all duration-300 ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'bg-gradient-to-br from-casino-gold/20 to-yellow-900/20 border-yellow-500/50' : 'bg-slate-900 border-white/10'}`}>
                <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{status === GameStatus.Idle || status === GameStatus.GameOver ? 'Sua Aposta' : 'Em Jogo'}</span>
                <span className={`text-base font-black font-mono leading-none ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'text-yellow-400' : 'text-white'}`}>R$ {totalBetInGame.toFixed(2)}</span>
            </div>
            <button onClick={() => setShowProvablyFair(true)} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-green-500 hover:text-green-400 hover:bg-slate-800 transition-colors">
                <ShieldCheck size={16} />
                <span className="text-[7px] font-bold uppercase mt-1">Fair</span>
            </button>
            <button onClick={showMobileRules} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <Info size={16} />
                <span className="text-[7px] font-bold uppercase mt-1">Regras</span>
            </button>
        </div>

        {/* --- MOBILE AI COMPACT (Only visible on mobile/tablet) --- */}
        <div className="xl:hidden w-full max-w-[500px] shrink-0 z-30">
            <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} variant="compact" />
        </div>

        {/* 
            ADJUSTMENT HERE: 
            Reduced max-w from 1800px to [1200px -> 1500px] breakpoints. 
            This forces the sidebars to stick closer to the table on large screens.
        */}
        <div className="w-full max-w-[1200px] xl:max-w-[1350px] 2xl:max-w-[1500px] flex items-center justify-center gap-4 xl:gap-5 flex-1 min-h-0">
            {/* --- LEFT SIDEBAR (Desktop Only) --- */}
            {/* Responsive Width: 240px on XL, 280px on 2XL+ */}
            <div className="hidden xl:flex w-[240px] 2xl:w-[280px] flex-col gap-3 justify-center shrink-0 self-center transition-all duration-300">
                <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 backdrop-blur-md shrink-0">
                    <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                        <h3 className="text-casino-gold font-bold flex items-center gap-2 uppercase tracking-widest text-xs"><Info size={14} /> Regras</h3>
                        <button onClick={() => setShowProvablyFair(true)} className="text-green-500 hover:text-green-400 transition-colors bg-white/5 p-1 rounded-md" title="Provably Fair"><ShieldCheck size={14} /></button>
                    </div>
                    <ul className="space-y-1 text-[10px] text-slate-300">
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Apostas</span><span className="font-bold text-white">R$ {MIN_BET} - {MAX_BET}</span></li>
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Blackjack</span><span className="font-bold text-white">3:2</span></li>
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Dealer</span><span className="font-bold text-white">Para no 17</span></li>
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Seguro</span><span className="font-bold text-white">2:1</span></li>
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Par Perfeito</span><span className="font-bold text-yellow-400">Até 30:1</span></li>
                        <li className="flex justify-between border-b border-white/5 pb-0.5"><span>Banca Estoura</span><span className="font-bold text-yellow-400">2:1</span></li>
                    </ul>
                </div>
                <div className="h-[64px] w-full flex-none relative">
                    <div className={`absolute inset-0 rounded-2xl p-1 shadow-lg transition-all duration-300 ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'bg-gradient-to-br from-casino-gold to-yellow-600 animate-pulse-gold' : 'bg-slate-800 border border-white/5'}`}>
                        <div className="bg-slate-900 rounded-xl p-2 text-center relative overflow-hidden h-full flex flex-col justify-center">
                            {(status !== GameStatus.Idle && status !== GameStatus.GameOver) && (<div className="absolute top-1.5 right-2 text-casino-gold"><Lock size={10} /></div>)}
                            <div className="flex flex-col items-center">
                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">{status === GameStatus.Idle || status === GameStatus.GameOver ? 'Sua Aposta' : 'Aposta em Jogo'}</div>
                                <div className={`text-xl font-bold font-mono leading-tight ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'text-yellow-400' : 'text-white'}`}>R$ {totalBetInGame.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
            </div>

            {/* --- MAIN TABLE AREA (Responsive) --- */}
            {/* Added flex-1, min-w-0 and min-h-0 to allow proper shrinking/growing in flex container */}
            <div className="relative flex-1 w-full max-w-[500px] md:max-w-[900px] 2xl:max-w-[950px] min-w-[300px] xl:min-w-[500px] aspect-[3/5] sm:aspect-[3/4] md:aspect-[4/3] max-h-[60vh] md:max-h-[85vh] bg-casino-felt rounded-[1.5rem] md:rounded-[3rem] border-[6px] md:border-[12px] border-slate-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.7),0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between z-10 transition-all duration-300 mx-auto min-h-0 shrink-0">
                {showWinAnimation && <CoinRain />}
                
                {/* Side Bets Chips Visuals */}
                {(status === GameStatus.Playing || status === GameStatus.Dealing || status === GameStatus.Insurance) && (sideBets.perfectPairs > 0 || sideBets.dealerBust > 0) && (
                    <div className="absolute bottom-[20%] right-2 md:right-6 flex flex-col gap-2 md:gap-4 items-end pointer-events-none z-0">
                        {sideBets.perfectPairs > 0 && (<div className="flex items-center gap-2 animate-fade-in"><span className="text-[8px] text-purple-300 font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded backdrop-blur-md hidden sm:block">Par Perfeito</span><div className="flex flex-col items-center"><div className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-purple-500 bg-purple-900/60 flex items-center justify-center text-white shadow-[0_4px_15px_rgba(168,85,247,0.4)] animate-pulse"><Heart size={14} fill="currentColor" /></div><span className="text-[8px] md:text-[9px] font-black text-white drop-shadow-md -mt-2 bg-slate-900 px-1.5 rounded-full border border-purple-500/50 z-10">R${sideBets.perfectPairs}</span></div></div>)}
                        {sideBets.dealerBust > 0 && (<div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '100ms' }}><span className="text-[8px] text-red-300 font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded backdrop-blur-md hidden sm:block">Banca Estoura</span><div className="flex flex-col items-center"><div className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-red-500 bg-red-900/60 flex items-center justify-center text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)] animate-pulse"><Skull size={16} /></div><span className="text-[8px] md:text-[9px] font-black text-white drop-shadow-md -mt-2 bg-slate-900 px-1.5 rounded-full border border-red-500/50 z-10">R${sideBets.dealerBust}</span></div></div>)}
                    </div>
                )}

                {/* Game Over Overlay */}
                {status === GameStatus.GameOver && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fade-in">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                        {(result === GameResult.PlayerWin || result === GameResult.Blackjack) ? (
                            <div className="relative flex items-center justify-center scale-90 md:scale-100 z-10">
                                <div className="absolute w-[200px] h-[200px] md:w-[300px] md:h-[300px] bg-gradient-to-r from-yellow-500/0 via-yellow-500/10 to-yellow-500/0 animate-[spin_4s_linear_infinite] rounded-full blur-xl"></div>
                                <div className="relative"><div className="bg-black/90 border-2 border-yellow-500 px-6 py-4 md:px-8 rounded-3xl shadow-[0_0_50px_rgba(234,179,8,0.6)] animate-pulse relative z-20 min-w-[200px] text-center flex flex-col items-center"><span className="text-yellow-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] mb-1 drop-shadow-md">{result === GameResult.Blackjack ? 'BLACKJACK PAYOUT' : 'VOCÊ VENCEU'}</span><p className="text-2xl md:text-4xl font-black text-white tracking-tighter drop-shadow-xl">+ R$ {displayPayout.toFixed(2)}</p><div className="w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mt-2"></div></div></div>
                            </div>
                        ) : result === GameResult.Push ? (
                            <div className="bg-slate-800/90 border-4 border-slate-500 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-100 text-center"><h2 className="text-2xl md:text-4xl font-black text-slate-300">EMPATE</h2>{displayPayout > 0 && <p className="text-xs md:text-sm text-slate-400 mt-1 font-mono">Retorno: R$ {displayPayout.toFixed(2)}</p>}</div>
                        ) : (<div className="bg-red-900/80 border-4 border-red-600 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-100 grayscale-[0.2]"><h2 className="text-2xl md:text-4xl font-black text-white drop-shadow-lg">A BANCA VENCEU</h2></div>)}
                    </div>
                )}

                {/* Dealer Area */}
                <div className="flex-1 flex flex-col items-center justify-start pt-6 md:pt-10 relative z-10 min-h-0">
                    <div className="relative mb-2">
                        <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-90 md:scale-100 origin-top"><GhostSlot /><GhostSlot /></div>
                        <div className="flex justify-center gap-1 md:gap-2 relative scale-90 md:scale-100 origin-top flex-wrap max-w-full justify-center">
                            {dealerHand.map((card, i) => (<CardComponent key={card.id} card={card} index={i} />))}
                        </div>
                    </div>
                    {dealerHand.length > 0 && (<ScoreBadge score={dealerScore} label="Banca" hidden={isDealerHidden} />)}
                </div>

                {/* Controls Area (Middle/Bottom) */}
                <div className="flex-none flex justify-center items-center w-full px-2 py-4 z-40 min-h-[100px] md:min-h-[120px] relative">
                    {isProcessing && (<div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl cursor-wait"><div className="w-8 h-8 border-4 border-casino-gold border-t-transparent rounded-full animate-spin drop-shadow-lg"></div></div>)}
                    {status !== GameStatus.GameOver && (
                        <div className={`animate-fade-in w-full flex justify-center transition-opacity duration-300 ${status === GameStatus.Dealing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                            <GameControls status={status} currentBet={bet} lastBet={lastBet} balance={user.balance} onBet={handleBet} onDeal={dealCards} onHit={handleHit} onStand={handleStand} onReset={initializeGame} decisionTime={decisionTimer} sideBets={sideBets} onSideBetAction={handleSideBetAction} onInsurance={handleInsurance} insuranceBet={insuranceBet} />
                        </div>
                    )}
                </div>

                {/* Player Area */}
                <div className="flex-1 flex flex-col items-center justify-end pb-6 md:pb-10 relative z-10 min-h-0">
                    <div className="relative mb-2">
                        <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-90 md:scale-100 origin-bottom"><GhostSlot /><GhostSlot /></div>
                        <div className="flex justify-center gap-1 md:gap-2 relative scale-90 md:scale-100 origin-bottom flex-wrap max-w-full justify-center">
                            {playerHand.map((card, i) => (<CardComponent key={card.id} card={card} index={i} />))}
                        </div>
                    </div>
                    {playerHand.length > 0 && (<ScoreBadge score={playerScore} label="Você" />)}
                </div>
            </div>

            {/* --- RIGHT SIDEBAR (Desktop Only) --- */}
            {/* Responsive Width: 240px on XL, 280px on 2XL+ */}
            <div className="hidden xl:flex w-[240px] 2xl:w-[280px] flex-col gap-4 justify-center shrink-0 self-center transition-all duration-300">
                <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} />
            </div>
        </div>

        {/* --- MOBILE FOOTER CONTENT (HISTORY) --- */}
        <div className="xl:hidden w-full max-w-[500px] mt-4 flex flex-col gap-4 animate-slide-up pb-8">
            <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
        </div>

      </div>
    </div>
  );
};
