
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, GameStatus, GameResult, User, SideBets, Suit, Rank } from '../types';
import { calculateScore } from '../services/gameLogic';
import { CardComponent } from './CardComponent';
import { GameControls } from './GameControls';
import { AISuggestion } from './AISuggestion';
import { DatabaseService } from '../services/database'; 
import { Info, Lock, ShieldCheck, History as HistoryIcon, Maximize2, Calendar, X, ShieldAlert, Heart, Skull, TrendingUp, TrendingDown, WifiOff, RefreshCcw } from 'lucide-react';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';
import { Button } from './UI/Button';

interface BlackjackGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

// --- HISTORY INTERFACE ---
interface BjHistoryItem {
    id: number;
    bet: number;
    payout: number;
    result: GameResult;
    timestamp: Date;
}

const MIN_BET = 1;
const MAX_BET = 100; // Increased Limit

// --- AUDIO SYSTEM (Singleton Optimized) ---
let audioCtx: AudioContext | null = null;

const playSynthSound = (type: 'chip' | 'card' | 'win' | 'lose' | 'alert') => {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (!audioCtx) return;

        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

        const ctx = audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        switch (type) {
            case 'chip':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1);
                break;
            case 'card':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(); osc.stop(now + 0.05);
                break;
            case 'win':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554, now + 0.1);
                osc.frequency.setValueAtTime(659, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.6);
                osc.start(); osc.stop(now + 0.6);
                break;
            case 'lose':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(); osc.stop(now + 0.3);
                break;
            case 'alert':
                osc.type = 'square';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.setValueAtTime(800, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(); osc.stop(now + 0.3);
                break;
        }
    } catch (e) { console.warn("Audio error"); }
};

// --- PURE COMPONENTS (Extracted for Performance) ---

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

// Memoized to prevent recalculating random positions on every render
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
    // Show only top 3 items
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
        <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-3 flex flex-col gap-2 shrink-0 relative group min-h-[160px]">
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
                
                {/* Header Row */}
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
                                <div className="text-right font-mono text-slate-400 text-xs">
                                    {h.bet.toFixed(2)}
                                </div>
                                <div className={`text-right font-mono font-bold text-xs ${isWin ? 'text-green-400' : isPush ? 'text-white' : 'text-slate-600'}`}>
                                    {h.payout > 0 ? `+${h.payout.toFixed(2)}` : '-'}
                                </div>
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
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
  const [bet, setBet] = useState<number>(0);
  const [lastBet, setLastBet] = useState<number>(0); 
  const [result, setResult] = useState<GameResult>(GameResult.None);
  
  // Side Bets State
  const [sideBets, setSideBets] = useState<SideBets>({ perfectPairs: 0, dealerBust: 0 });
  const [insuranceBet, setInsuranceBet] = useState<number>(0); // Track if insurance bought
  const [accumulatedWin, setAccumulatedWin] = useState<number>(0); // Track side bet winnings locally
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [decisionTimer, setDecisionTimer] = useState<number>(10);
  const [fatalError, setFatalError] = useState<boolean>(false); // NEW: Fatal Error State
  
  const [showProvablyFair, setShowProvablyFair] = useState(false);
  const [serverSeedHash, setServerSeedHash] = useState('');

  // History State
  const [history, setHistory] = useState<BjHistoryItem[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  
  const isMounted = useRef(true);
  const hasRestored = useRef(false);
  const statusRef = useRef<GameStatus>(GameStatus.Idle); // For cleanup callback

  // Computed Total Bet for Display (Sidebar) - ALWAYS visible and accurate
  const totalBetInGame = useMemo(() => {
      return bet + sideBets.perfectPairs + sideBets.dealerBust + insuranceBet;
  }, [bet, sideBets, insuranceBet]);

  useEffect(() => {
      isMounted.current = true;
      statusRef.current = status;
  }, [status]);

  // Helper to check and dispatch trophies
  const checkAchievements = (data: any) => {
      if (data.newTrophies && Array.isArray(data.newTrophies) && data.newTrophies.length > 0) {
          window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: data.newTrophies }));
          // Update local user state immediately
          const currentTrophies = user.unlockedTrophies || [];
          const updatedTrophies = [...new Set([...currentTrophies, ...data.newTrophies])];
          updateUser({ unlockedTrophies: updatedTrophies });
      }
  };

  // Cleanup: PUNISH ON LEAVE
  useEffect(() => {
      return () => {
          isMounted.current = false;
          // Se o jogo estiver ativo ao sair do componente, PUNIR
          if (statusRef.current === GameStatus.Dealing || statusRef.current === GameStatus.Playing || statusRef.current === GameStatus.Insurance) {
              console.log("Abandoning game - Forfeiting...");
              DatabaseService.forfeitGame('BLACKJACK').catch(e => console.error("Forfeit failed", e));
          }
      };
  }, []);

  // Restore Session
  useEffect(() => {
      if (hasRestored.current) return;
      hasRestored.current = true;

      if (user.activeGame && user.activeGame.type === 'BLACKJACK') {
          // PUNIR SE DETECTAR JOGO PRESO NO RELOAD (F5)
          // O usuário pediu especificamente: "ao voltar no jogo ainda fica a partida rolando, ela precisa ser finalizada e punir"
          console.log("Stale game detected on load. Punishing...");
          DatabaseService.forfeitGame('BLACKJACK').then((data: any) => {
              if (data.newBalance !== undefined) updateUser({ balance: data.newBalance });
              setNotifyMsg("Você abandonou a partida anterior. Derrota registrada.");
              setStatus(GameStatus.Idle);
          }).catch(e => console.error(e));
          
          return; // Não restaura, mata o jogo.
      }
  }, []); // Run once

  // Timer Logic
  useEffect(() => {
    let timer: number;
    if (status === GameStatus.Playing && !fatalError) {
      if (decisionTimer > 0) {
        timer = window.setTimeout(() => setDecisionTimer(prev => prev - 1), 1000);
      } else {
        handleStand();
      }
    }
    return () => clearTimeout(timer);
  }, [decisionTimer, status, fatalError]);

  const handleForceReload = () => {
      window.location.reload();
  };

  const playSound = useCallback((type: 'chip' | 'card' | 'win' | 'lose' | 'alert') => {
      if (isMounted.current) playSynthSound(type);
  }, []);

  const initializeGame = useCallback(() => {
    setPlayerHand([]);
    setDealerHand([]);
    setStatus(GameStatus.Idle);
    setResult(GameResult.None);
    setBet(0);
    setSideBets({ perfectPairs: 0, dealerBust: 0 });
    setInsuranceBet(0); // Reset Insurance
    setAccumulatedWin(0); // Reset Win Accumulator
    setIsProcessing(false);
    setFatalError(false);
  }, []);

  const handleBet = useCallback((amount: number) => {
    if (isProcessing || fatalError) return;
    if (amount === 0) { setBet(0); setSideBets({ perfectPairs: 0, dealerBust: 0 }); return; }
    const potentialBet = bet + amount;
    
    // Check main bet against MAX_BET, but allow flexibility
    if (potentialBet > MAX_BET) {
        if (bet < MAX_BET && user.balance >= (MAX_BET - bet)) {
             setBet(MAX_BET); playSound('chip');
        } else {
             setNotifyMsg(`Limite máximo da aposta principal é R$ ${MAX_BET}`);
        }
        return;
    }
    if (potentialBet <= user.balance) {
      setBet(potentialBet); playSound('chip');
    } else {
      setNotifyMsg("Saldo insuficiente para esta aposta.");
    }
  }, [bet, isProcessing, user.balance, playSound, fatalError]);

  const handleSideBetAction = useCallback((type: 'perfectPairs' | 'dealerBust', action: 'toggle' | 'double' | 'clear') => {
      if (bet === 0) { setNotifyMsg("Faça uma aposta principal primeiro."); return; }
      
      setSideBets(prev => {
          let next = prev[type];
          
          if (action === 'clear') {
              next = 0;
          } else if (action === 'double') {
              next = prev[type] * 2;
              if (next === 0) next = 5; // Start if zero
          } else { // Toggle
              next = prev[type] === 0 ? 5 : prev[type] === 5 ? 10 : 0;
          }
          
          // Limit individual side bet
          if (next > 50) next = 50; 

          if (user.balance < (bet + next - prev[type])) {
              setNotifyMsg("Saldo insuficiente para aposta lateral.");
              return prev;
          }
          
          playSound('chip');
          return { ...prev, [type]: next };
      });
  }, [bet, user.balance, playSound]);

  const dealCards = async () => {
    const totalBet = bet + sideBets.perfectPairs + sideBets.dealerBust;
    if (bet === 0 || isProcessing || fatalError) return;
    if (bet < MIN_BET) return;
    if (totalBet > user.balance) return setNotifyMsg("Saldo insuficiente.");

    setIsProcessing(true); 
    playSound('chip');
    
    // Optimistic Update
    updateUser({ balance: user.balance - totalBet });

    try {
        const data: any = await DatabaseService.blackjackDeal(user.id, bet, sideBets);
        if (!isMounted.current) return;

        checkAchievements(data);

        setStatus(GameStatus.Dealing);
        setLastBet(bet);
        setResult(GameResult.None);
        setInsuranceBet(0); // Reset for new game
        setAccumulatedWin(data.sideBetWin || 0); // Capture Perfect Pairs Win from Backend
        setIsProcessing(false); 
        
        // Update Seed
        if (data.publicSeed) setServerSeedHash(data.publicSeed);

        updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });

        const pHand = data.playerHand;
        const dHand = data.dealerHand;

        setPlayerHand([]);
        setDealerHand([]);

        // Sequential Deal Animation - OPTIMIZED SPEED (500ms intervals for slower distribution)
        const dealSequence = async () => {
             if (!isMounted.current) return;
             playSound('card'); 
             setPlayerHand([pHand[0]]); 
             await new Promise(r => setTimeout(r, 500));
             
             if (!isMounted.current) return;
             setDealerHand([dHand[0]]); playSound('card');
             await new Promise(r => setTimeout(r, 500));
             
             if (!isMounted.current) return;
             setPlayerHand([pHand[0], pHand[1]]); playSound('card');
             await new Promise(r => setTimeout(r, 500));
             
             if (!isMounted.current) return;
             // Only deal the visible part of dealer's second card (which is usually hidden back)
             // But we set the object with isHidden: true from the response
             setDealerHand([dHand[0], dHand[1]]); playSound('card');

             if (data.status === 'GAME_OVER') {
                 await new Promise(r => setTimeout(r, 500));
                 if (!isMounted.current) return;
                 // Reveal dealer hole card if needed
                 if (data.dealerHand[1].isHidden === false && dHand[1].isHidden === true) {
                     setDealerHand(data.dealerHand);
                 }
                 endGame(data.result);
             } else if (data.status === 'INSURANCE') {
                 // INSURANCE PATH: Force status update and halt
                 await new Promise(r => setTimeout(r, 500));
                 if (!isMounted.current) return;
                 setStatus(GameStatus.Insurance);
                 playSound('alert');
                 // DO NOT proceed to Playing state here
             } else {
                 // REGULAR PLAY PATH
                 setDecisionTimer(10);
                 setStatus(GameStatus.Playing);
             }
        };
        dealSequence();
        
    } catch (error: any) {
        // SAFETY ROLLBACK: Force Sync instead of manual calculation
        DatabaseService.syncUser(user.id).then(u => updateUser(u)).catch(() => {});
        setNotifyMsg(error.message || "Erro ao conectar com o servidor.");
        setIsProcessing(false);
        setStatus(GameStatus.Idle);
        setBet(0);
    }
  };

  const handleInsurance = async (buy: boolean) => {
      setIsProcessing(true);
      const cost = bet * 0.5;

      try {
          if (buy) {
              setInsuranceBet(cost); // Visually update total immediately
              updateUser({ balance: user.balance - cost }); 
          }

          // Use o novo endpoint corrigido
          const data: any = await DatabaseService.blackjackInsurance(user.id, buy);
          if (!isMounted.current) return;
          setIsProcessing(false);
          
          checkAchievements(data);

          if (data.newBalance !== undefined) updateUser({ balance: data.newBalance });
          
          // Accumulate Insurance Win if any
          if (data.insuranceWin) {
              setAccumulatedWin(prev => prev + data.insuranceWin);
          }
          
          if (data.status === 'GAME_OVER') {
              // Dealer had blackjack
              setDealerHand(data.dealerHand);
              endGame(data.result);
          } else {
              // Continued playing
              setStatus(GameStatus.Playing);
              setDecisionTimer(10);
          }
      } catch (e: any) {
          // SAFETY ROLLBACK
          if (buy) {
              setInsuranceBet(0);
              DatabaseService.syncUser(user.id).then(u => updateUser(u)).catch(() => {});
          }
          setNotifyMsg(e.message || "Erro no seguro.");
          setIsProcessing(false);
      }
  };

  const handleHit = async () => {
    if (status !== GameStatus.Playing || isProcessing || fatalError) return;
    setDecisionTimer(10);
    setIsProcessing(true); 

    try {
        const data = await DatabaseService.blackjackHit(user.id);
        if (!isMounted.current) return;

        setIsProcessing(false);
        
        checkAchievements(data);

        // NOW we update state and play sound (Response First)
        setPlayerHand(data.playerHand);
        playSound('card');

        if (data.newBalance !== undefined) updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });

        if (data.status === 'GAME_OVER') {
             setDealerHand(data.dealerHand);
             endGame(data.result);
        }
    } catch (e: any) { 
        // FATAL ROLLBACK VISUAL
        console.error("Critical Hit Error", e);
        setFatalError(true);
        setNotifyMsg("Erro crítico de sincronização.");
        // We don't just revert the card, we stop the game visually.
    } 
  };

  const handleStand = async () => {
    if (isProcessing || fatalError) return;
    setIsProcessing(true);
    try {
        const data: any = await DatabaseService.blackjackStand(user.id);
        if (!isMounted.current) return;

        setIsProcessing(false);
        
        checkAchievements(data);

        setStatus(GameStatus.DealerTurn);
        
        // Capture Dealer Bust Win
        if (data.sideBetWin) {
            setAccumulatedWin(prev => prev + data.sideBetWin);
        }

        const animateDealerTurn = async () => {
             const finalDealerHand = data.dealerHand;
             let currentDealer = [...dealerHand];
             
             // Reveal Hole Card
             if (currentDealer.length >= 2) {
                  currentDealer[1] = finalDealerHand[1]; 
                  setDealerHand([...currentDealer]);     
                  await new Promise(r => setTimeout(r, 400));
                  if (!isMounted.current) return;
             }

             // Deal remaining cards - ACCELERATED (400ms)
             for (let i = currentDealer.length; i < finalDealerHand.length; i++) {
                  currentDealer.push(finalDealerHand[i]);
                  setDealerHand([...currentDealer]);
                  playSound('card');
                  await new Promise(r => setTimeout(r, 400));
                  if (!isMounted.current) return;
             }

             updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });
             endGame(data.result);
        }
        animateDealerTurn();

    } catch (e) { 
        setFatalError(true);
        setNotifyMsg("Erro de comunicação.");
        setIsProcessing(false); 
    }
  };

  const endGame = (res: GameResult) => {
    setResult(res);
    if (res === GameResult.PlayerWin || res === GameResult.Blackjack) playSound('win');
    else if (res === GameResult.DealerWin || res === GameResult.Bust) playSound('lose');

    // --- LOGIC FIX: TOTAL PAYOUT CALCULATION ---
    // Calculate Main Hand Payout
    let mainPayout = 0;
    if (res === GameResult.Blackjack) mainPayout = bet * 2.5;
    else if (res === GameResult.PlayerWin) mainPayout = bet * 2;
    else if (res === GameResult.Push) mainPayout = bet;
    
    // Total Payout = Main + Side Wins (Accumulated from Deal/Stand responses)
    const totalPayout = mainPayout + accumulatedWin;
    
    // Total Cost = Bet + Sides + Insurance
    const totalCost = bet + sideBets.perfectPairs + sideBets.dealerBust + insuranceBet;

    const historyItem: BjHistoryItem = {
        id: Date.now(),
        bet: totalCost, // Show total invested
        payout: totalPayout, // Show total returned
        result: res,
        timestamp: new Date()
    };
    setHistory(prev => [historyItem, ...prev].slice(0, 50));

    setStatus(GameStatus.GameOver);
    setIsProcessing(false);

    // Sync in background after delay
    setTimeout(async () => {
        if (!isMounted.current) return;
        try {
            const syncData = await DatabaseService.syncUser(user.id);
            updateUser(syncData);
        } catch(e) {}
    }, 1000);

    // Reset table
    setTimeout(() => {
      if (!isMounted.current) return;
      setPlayerHand([]);
      setDealerHand([]);
      setBet(0);
      setSideBets({ perfectPairs: 0, dealerBust: 0 });
      setInsuranceBet(0);
      setAccumulatedWin(0);
      setStatus(GameStatus.Idle);
    }, 3500); // Extended delay to read results
  };

  const playerScore = useMemo(() => calculateScore(playerHand), [playerHand]);
  const dealerScore = useMemo(() => calculateScore(dealerHand), [dealerHand]);
  const isDealerHidden = dealerHand.some(c => c.isHidden);
  
  // Calculate Payout for display only
  const displayPayout = useMemo(() => {
      if (status !== GameStatus.GameOver) return 0;
      let p = 0;
      if (result === GameResult.Blackjack) p = bet * 2.5;
      else if (result === GameResult.PlayerWin) p = bet * 2;
      else if (result === GameResult.Push) p = bet;
      return p + accumulatedWin;
  }, [status, result, bet, accumulatedWin]);

  const showWinAnimation = status === GameStatus.GameOver && (
      result === GameResult.Blackjack || 
      (result === GameResult.PlayerWin && playerScore === 21)
  );
  
  // --- FATAL ERROR MODAL ---
  if (fatalError) {
      return (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                      <WifiOff size={32} className="text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-white mb-2 uppercase">Erro de Sincronização</h2>
                  <p className="text-slate-400 text-sm mb-6">
                      Houve uma falha na comunicação com o servidor de jogo. Para sua segurança, a mesa precisa ser recarregada.
                  </p>
                  <Button fullWidth onClick={handleForceReload} variant="danger" className="py-4">
                      <RefreshCcw size={18} className="mr-2" /> RECARREGAR MESA
                  </Button>
              </div>
          </div>
      );
  }

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
      <Notification message={notifyMsg} onClose={() => setNotifyMsg(null)} />
      
      {/* Provably Fair Modal */}
      <ProvablyFairModal 
          isOpen={showProvablyFair} 
          onClose={() => setShowProvablyFair(false)}
          serverSeedHash={serverSeedHash}
          clientSeed={user.id}
          nonce={playerHand.length + dealerHand.length}
      />
      <FullHistoryModal isOpen={showFullHistory} onClose={() => setShowFullHistory(false)} history={history} />

      <div className="absolute top-5 md:top-8 left-0 right-0 text-center z-20 pointer-events-none">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
              BLACKJACK <span className="text-casino-gold">IA</span>
          </h1>
      </div>

      <div className="flex-1 w-full flex items-center justify-center min-h-0 pt-20 pb-8 px-4 overflow-y-auto no-scrollbar">
        
        {/* INNER GRID: Align Top items inside a Centered Page Container */}
        <div className="w-full max-w-[1600px] flex items-start justify-center gap-4 xl:gap-8">
            
            {/* --- LEFT SIDEBAR (Added self-center and justify-center) --- */}
            <div className="hidden xl:flex w-[280px] flex-col gap-3 justify-center shrink-0 self-center">
                {/* 1. Rules Panel */}
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

                {/* 2. Status Panel (Fixed Height Wrapper Reduced to 64px) */}
                <div className="h-[64px] w-full flex-none relative">
                    <div className={`absolute inset-0 rounded-2xl p-1 shadow-lg transition-all duration-300 ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'bg-gradient-to-br from-casino-gold to-yellow-600 animate-pulse-gold' : 'bg-slate-800 border border-white/5'}`}>
                        <div className="bg-slate-900 rounded-xl p-2 text-center relative overflow-hidden h-full flex flex-col justify-center">
                            {(status !== GameStatus.Idle && status !== GameStatus.GameOver) && (<div className="absolute top-1.5 right-2 text-casino-gold"><Lock size={10} /></div>)}
                            <div className="flex flex-col items-center">
                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">{status === GameStatus.Idle || status === GameStatus.GameOver ? 'Sua Aposta' : 'Aposta em Jogo'}</div>
                                <div className={`text-xl font-bold font-mono leading-tight ${status !== GameStatus.Idle && status !== GameStatus.GameOver ? 'text-yellow-400' : 'text-white'}`}>
                                    {/* FIXED: ALWAYS show Total Bet (Main + Side + Insurance) */}
                                    R$ {totalBetInGame.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. History Ticker (3 Rows) */}
                <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
            </div>

            {/* --- MAIN TABLE AREA (Reduced Dimensions) --- */}
            <div className="relative w-full flex-1 max-w-[780px] aspect-[3/4] sm:aspect-[4/3] max-h-[65vh] bg-casino-felt rounded-[2rem] md:rounded-[3rem] border-[8px] md:border-[12px] border-slate-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.7),0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between z-10 transition-all duration-300">
                {showWinAnimation && <CoinRain />}
                {/* BACKGROUND TEXT REMOVED */}

                {/* Side Bets Visual Chips - Repositioned to Right Side Vertical */}
                {/* AJUSTE: Removido GameOver para ocultar durante o resultado */}
                {(status === GameStatus.Playing || status === GameStatus.Dealing || status === GameStatus.Insurance) && (sideBets.perfectPairs > 0 || sideBets.dealerBust > 0) && (
                    <div className="absolute bottom-[20%] right-4 flex flex-col gap-4 items-end pointer-events-none z-0">
                        {sideBets.perfectPairs > 0 && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <span className="text-[8px] text-purple-300 font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded backdrop-blur-md">Par Perfeito</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-10 h-10 rounded-full border-2 border-purple-500 bg-purple-900/60 flex items-center justify-center text-white shadow-[0_4px_15px_rgba(168,85,247,0.4)] animate-pulse">
                                        <Heart size={14} fill="currentColor" />
                                    </div>
                                    <span className="text-[9px] font-black text-white drop-shadow-md -mt-2 bg-slate-900 px-1.5 rounded-full border border-purple-500/50 z-10">R${sideBets.perfectPairs}</span>
                                </div>
                            </div>
                        )}
                        {sideBets.dealerBust > 0 && (
                            <div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '100ms' }}>
                                <span className="text-[8px] text-red-300 font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded backdrop-blur-md">Banca Estoura</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-10 h-10 rounded-full border-2 border-red-500 bg-red-900/60 flex items-center justify-center text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)] animate-pulse">
                                        <Skull size={16} />
                                    </div>
                                    <span className="text-[9px] font-black text-white drop-shadow-md -mt-2 bg-slate-900 px-1.5 rounded-full border border-red-500/50 z-10">R${sideBets.dealerBust}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {status === GameStatus.GameOver && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fade-in">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                        {(result === GameResult.PlayerWin || result === GameResult.Blackjack) ? (
                            <div className="relative flex items-center justify-center scale-75 md:scale-100 z-10">
                                <div className="absolute w-[300px] h-[300px] bg-gradient-to-r from-yellow-500/0 via-yellow-500/10 to-yellow-500/0 animate-[spin_4s_linear_infinite] rounded-full blur-xl"></div>
                                <div className="relative">
                                    <div className="bg-black/90 border-2 border-yellow-500 px-8 py-4 rounded-3xl shadow-[0_0_50px_rgba(234,179,8,0.6)] animate-pulse relative z-20 min-w-[200px] text-center flex flex-col items-center">
                                        <span className="text-yellow-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 drop-shadow-md">{result === GameResult.Blackjack ? 'BLACKJACK PAYOUT' : 'VOCÊ VENCEU'}</span>
                                        <p className="text-3xl md:text-4xl font-black text-white tracking-tighter drop-shadow-xl">+ R$ {displayPayout.toFixed(2)}</p>
                                        <div className="w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mt-2"></div>
                                    </div>
                                </div>
                            </div>
                        ) : result === GameResult.Push ? (
                            <div className="bg-slate-800/90 border-4 border-slate-500 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-95 text-center">
                                <h2 className="text-3xl md:text-4xl font-black text-slate-300">EMPATE</h2>
                                {displayPayout > 0 && <p className="text-sm text-slate-400 mt-1 font-mono">Retorno: R$ {displayPayout.toFixed(2)}</p>}
                            </div>
                        ) : (
                            <div className="bg-red-900/80 border-4 border-red-600 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-95 grayscale-[0.2]"><h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg">A BANCA VENCEU</h2></div>
                        )}
                    </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-start pt-6 md:pt-10 relative z-10 min-h-0">
                    <div className="relative mb-2">
                        <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-75 md:scale-100 origin-top"><GhostSlot /><GhostSlot /></div>
                        <div className="flex justify-center gap-2 relative scale-90 md:scale-100 origin-top">
                            {dealerHand.map((card, i) => (<CardComponent key={card.id} card={card} index={i} />))}
                        </div>
                    </div>
                    {dealerHand.length > 0 && (<ScoreBadge score={dealerScore} label="Banca" hidden={isDealerHidden} />)}
                </div>

                <div className="flex-none flex justify-center items-center w-full px-4 py-6 z-40 min-h-[120px] relative">
                    {isProcessing && (<div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl cursor-wait"><div className="w-8 h-8 border-4 border-casino-gold border-t-transparent rounded-full animate-spin drop-shadow-lg"></div></div>)}
                    {/* AJUSTE: Adicionada verificação estrita do status para não renderizar nada no GameOver */}
                    {status !== GameStatus.GameOver && (
                        <div className={`animate-fade-in scale-90 md:scale-100 transition-opacity duration-300 ${status === GameStatus.Dealing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                            <GameControls 
                                status={status} 
                                currentBet={bet} 
                                lastBet={lastBet} 
                                balance={user.balance} 
                                onBet={handleBet} 
                                onDeal={dealCards} 
                                onHit={handleHit} 
                                onStand={handleStand} 
                                onReset={initializeGame} 
                                decisionTime={decisionTimer}
                                sideBets={sideBets}
                                onSideBetAction={handleSideBetAction}
                                onInsurance={handleInsurance}
                                insuranceBet={insuranceBet}
                            />
                        </div>
                    )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-end pb-6 md:pb-10 relative z-10 min-h-0">
                    <div className="relative mb-2">
                        <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-75 md:scale-100 origin-bottom"><GhostSlot /><GhostSlot /></div>
                        <div className="flex justify-center gap-2 relative scale-90 md:scale-100 origin-bottom">
                            {playerHand.map((card, i) => (<CardComponent key={card.id} card={card} index={i} />))}
                        </div>
                    </div>
                    {playerHand.length > 0 && (<ScoreBadge score={playerScore} label="Você" />)}
                </div>
            </div>

            {/* --- RIGHT SIDEBAR (Centered Vertically) --- */}
            <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0 self-center">
                <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} />
            </div>
        </div>
      </div>
      
      <div className="xl:hidden absolute bottom-2 right-2 z-50 scale-75 origin-bottom-right opacity-90">
         <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} />
      </div>
    </div>
  );
};
