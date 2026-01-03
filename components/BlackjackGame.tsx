
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, GameStatus, GameResult, User } from '../types';
import { calculateScore } from '../services/gameLogic';
import { CardComponent } from './CardComponent';
import { GameControls } from './GameControls';
import { AISuggestion } from './AISuggestion';
import { DatabaseService } from '../services/database'; 
import { Info, Lock, ShieldCheck } from 'lucide-react';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';

interface BlackjackGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

const MIN_BET = 1;
const MAX_BET = 50;

// --- AUDIO SYSTEM (Singleton Optimized) ---
let audioCtx: AudioContext | null = null;

const playSynthSound = (type: 'chip' | 'card' | 'win' | 'lose') => {
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

// --- MAIN COMPONENT ---

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ user, updateUser }) => {
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
  const [bet, setBet] = useState<number>(0);
  const [lastBet, setLastBet] = useState<number>(0); 
  const [result, setResult] = useState<GameResult>(GameResult.None);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [decisionTimer, setDecisionTimer] = useState<number>(10);
  
  const [showProvablyFair, setShowProvablyFair] = useState(false);
  const [serverSeedHash, setServerSeedHash] = useState('');

  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  
  const isMounted = useRef(true);
  const hasRestored = useRef(false);

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  // Restore Session
  useEffect(() => {
      if (hasRestored.current) return;
      hasRestored.current = true;

      if (user.activeGame && user.activeGame.type === 'BLACKJACK') {
          const game = user.activeGame;
          setBet(game.bet);
          if (game.bjPlayerHand) setPlayerHand(game.bjPlayerHand);
          if (game.bjDealerHand) {
              const visibleDealer = (game.bjStatus === 'PLAYING')
                 ? [game.bjDealerHand[0], { ...game.bjDealerHand[1], isHidden: true }]
                 : game.bjDealerHand;
              setDealerHand(visibleDealer);
          }
          if (game.publicSeed) setServerSeedHash(game.publicSeed);
          setStatus(GameStatus.Playing);
      }
  }, []); // Run once

  // Timer Logic
  useEffect(() => {
    let timer: number;
    if (status === GameStatus.Playing) {
      if (decisionTimer > 0) {
        timer = window.setTimeout(() => setDecisionTimer(prev => prev - 1), 1000);
      } else {
        handleStand();
      }
    }
    return () => clearTimeout(timer);
  }, [decisionTimer, status]);

  const playSound = useCallback((type: 'chip' | 'card' | 'win' | 'lose') => {
      if (isMounted.current) playSynthSound(type);
  }, []);

  const initializeGame = useCallback(() => {
    setPlayerHand([]);
    setDealerHand([]);
    setStatus(GameStatus.Idle);
    setResult(GameResult.None);
    setBet(0);
    setIsProcessing(false);
  }, []);

  const handleBet = useCallback((amount: number) => {
    if (isProcessing) return;
    if (amount === 0) { setBet(0); return; }
    const potentialBet = bet + amount;
    
    if (potentialBet > MAX_BET) {
        if (bet < MAX_BET && user.balance >= (MAX_BET - bet)) {
             setBet(MAX_BET); playSound('chip');
        } else {
             setNotifyMsg(`Limite máximo da mesa é R$ ${MAX_BET}`);
        }
        return;
    }
    if (potentialBet <= user.balance) {
      setBet(potentialBet); playSound('chip');
    } else {
      setNotifyMsg("Saldo insuficiente para esta aposta.");
    }
  }, [bet, isProcessing, user.balance, playSound]);

  const dealCards = async () => {
    if (bet === 0 || isProcessing) return;
    if (bet < MIN_BET) return;
    if (bet > user.balance) return setNotifyMsg("Saldo insuficiente.");

    setIsProcessing(true); 
    // Feedback imediato sonoro
    playSound('chip');
    
    // Optimistic Update
    const currentBalance = user.balance;
    updateUser({ balance: currentBalance - bet });

    try {
        const data = await DatabaseService.blackjackDeal(user.id, bet);
        if (!isMounted.current) return;

        setStatus(GameStatus.Dealing);
        setLastBet(bet);
        setResult(GameResult.None);
        setIsProcessing(false); 
        
        // Update Seed
        if (data.publicSeed) setServerSeedHash(data.publicSeed);

        updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });

        const pHand = data.playerHand;
        const dHand = data.dealerHand;

        setPlayerHand([]);
        setDealerHand([]);

        // Sequential Deal Animation - ACELERADO (300ms em vez de 550ms)
        const dealSequence = async () => {
             if (!isMounted.current) return;
             playSound('card'); // Som imediato
             setPlayerHand([pHand[0]]); 
             await new Promise(r => setTimeout(r, 300));
             
             if (!isMounted.current) return;
             setDealerHand([dHand[0]]); playSound('card');
             await new Promise(r => setTimeout(r, 300));
             
             if (!isMounted.current) return;
             setPlayerHand([pHand[0], pHand[1]]); playSound('card');
             await new Promise(r => setTimeout(r, 300));
             
             if (!isMounted.current) return;
             setDealerHand([dHand[0], dHand[1]]); playSound('card');

             if (data.status === 'GAME_OVER') {
                 await new Promise(r => setTimeout(r, 400));
                 if (!isMounted.current) return;
                 // Reveal dealer hole card if needed
                 if (data.dealerHand[1].isHidden === false && dHand[1].isHidden === true) {
                     setDealerHand(data.dealerHand);
                 }
                 endGame(data.result);
             } else {
                 setDecisionTimer(10);
                 setStatus(GameStatus.Playing);
             }
        };
        dealSequence();
        
    } catch (error: any) {
        updateUser({ balance: currentBalance });
        setNotifyMsg(error.message || "Erro ao conectar com o servidor.");
        setIsProcessing(false);
        setStatus(GameStatus.Idle);
        setBet(0);
    }
  };

  const handleHit = async () => {
    if (status !== GameStatus.Playing || isProcessing) return;
    setDecisionTimer(10);
    setIsProcessing(true); 

    try {
        const data = await DatabaseService.blackjackHit(user.id);
        if (!isMounted.current) return;

        setIsProcessing(false);
        setPlayerHand(data.playerHand);
        playSound('card');

        if (data.newBalance !== undefined) updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });

        if (data.status === 'GAME_OVER') {
             setDealerHand(data.dealerHand);
             endGame(data.result);
        }
    } catch (e) { setIsProcessing(false); } 
  };

  const handleStand = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
        const data = await DatabaseService.blackjackStand(user.id);
        if (!isMounted.current) return;

        setIsProcessing(false);
        setStatus(GameStatus.DealerTurn);

        const animateDealerTurn = async () => {
             const finalDealerHand = data.dealerHand;
             let currentDealer = [...dealerHand];
             
             // Reveal Hole Card
             if (currentDealer.length >= 2) {
                  currentDealer[1] = finalDealerHand[1]; 
                  setDealerHand([...currentDealer]);     
                  await new Promise(r => setTimeout(r, 500));
                  if (!isMounted.current) return;
             }

             // Deal remaining cards - ACELERADO (600ms)
             for (let i = currentDealer.length; i < finalDealerHand.length; i++) {
                  currentDealer.push(finalDealerHand[i]);
                  setDealerHand([...currentDealer]);
                  playSound('card');
                  await new Promise(r => setTimeout(r, 600));
                  if (!isMounted.current) return;
             }

             updateUser({ balance: data.newBalance, loyaltyPoints: data.loyaltyPoints });
             endGame(data.result);
        }
        animateDealerTurn();

    } catch (e) { setIsProcessing(false); }
  };

  const endGame = (res: GameResult) => {
    setResult(res);
    if (res === GameResult.PlayerWin || res === GameResult.Blackjack) playSound('win');
    else if (res === GameResult.DealerWin || res === GameResult.Bust) playSound('lose');

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
      setStatus(GameStatus.Idle);
    }, 2500); 
  };

  const playerScore = useMemo(() => calculateScore(playerHand), [playerHand]);
  const dealerScore = useMemo(() => calculateScore(dealerHand), [dealerHand]);
  const isDealerHidden = dealerHand.some(c => c.isHidden);
  
  const showWinAnimation = status === GameStatus.GameOver && (
      result === GameResult.Blackjack || 
      (result === GameResult.PlayerWin && playerScore === 21)
  );
  
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

      <div className="absolute top-5 md:top-8 left-0 right-0 text-center z-20 pointer-events-none">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
              BLACKJACK <span className="text-casino-gold">IA</span>
          </h1>
      </div>

      <div className="flex-1 w-full max-w-[1600px] flex items-center justify-center gap-2 xl:gap-8 relative p-2 md:p-4 min-h-0 pt-16 md:pt-20">
        <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
             <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                    <h3 className="text-casino-gold font-bold flex items-center gap-2 uppercase tracking-widest text-sm"><Info size={16} /> Regras</h3>
                    <button onClick={() => setShowProvablyFair(true)} className="text-green-500 hover:text-green-400 transition-colors" title="Provably Fair"><ShieldCheck size={16} /></button>
                </div>
                <ul className="space-y-3 text-sm text-slate-300">
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Apostas</span><span className="font-bold text-white">R$ {MIN_BET} - R$ {MAX_BET}</span></li>
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Blackjack</span><span className="font-bold text-white">Paga 3:2</span></li>
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Dealer</span><span className="font-bold text-white">Para no 17</span></li>
                </ul>
            </div>
            <div className={`transition-all duration-300 transform ${bet > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className={`rounded-2xl p-1 shadow-lg ${status !== GameStatus.Idle ? 'bg-gradient-to-br from-casino-gold to-yellow-600 animate-pulse-gold' : 'bg-slate-700'}`}>
                    <div className="bg-slate-900 rounded-xl p-4 text-center relative overflow-hidden">
                        {status !== GameStatus.Idle && (<div className="absolute top-2 right-2 text-casino-gold"><Lock size={12} /></div>)}
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">{status === GameStatus.Idle ? 'Sua Aposta' : 'Aposta em Jogo'}</div>
                        <div className="text-2xl font-bold text-white">R$ {bet.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        </div>

        <div className="relative w-full flex-1 max-w-[800px] aspect-[3/4] sm:aspect-[4/3] max-h-full bg-casino-felt rounded-[2rem] md:rounded-[3rem] border-[8px] md:border-[12px] border-slate-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.7),0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between z-10 transition-all duration-300">
            {showWinAnimation && <CoinRain />}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-10 pointer-events-none text-center z-0">
                <div className="text-3xl md:text-5xl font-black text-black tracking-widest border-4 border-black px-4 py-2 md:px-8 md:py-4 rounded-xl transform -rotate-12 whitespace-nowrap flex gap-3">BJ <span className="text-casino-gold">IA</span></div>
            </div>

            {status === GameStatus.GameOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fade-in">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                    {(result === GameResult.PlayerWin || result === GameResult.Blackjack) ? (
                        <div className="relative flex items-center justify-center scale-75 md:scale-100 z-10">
                            <div className="absolute w-[300px] h-[300px] bg-gradient-to-r from-yellow-500/0 via-yellow-500/10 to-yellow-500/0 animate-[spin_4s_linear_infinite] rounded-full blur-xl"></div>
                            <div className="relative">
                                <div className="bg-black/90 border-2 border-yellow-500 px-8 py-3 rounded-full shadow-[0_0_30px_rgba(234,179,8,0.5)] animate-pulse relative z-20 min-w-[160px] text-center">
                                    <p className="text-xl md:text-2xl font-bold text-yellow-400 tracking-wider">+ R$ {(result === GameResult.Blackjack ? bet * 2.5 : bet * 2).toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    ) : result === GameResult.Push ? (
                        <div className="bg-slate-800/90 border-4 border-slate-500 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-95"><h2 className="text-3xl md:text-4xl font-black text-slate-300">EMPATE</h2></div>
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
                {(status === GameStatus.Idle || status === GameStatus.Betting || status === GameStatus.Dealing) && (
                    <div className="animate-fade-in scale-90 md:scale-100 transition-opacity duration-300" style={{ opacity: status === GameStatus.Dealing ? 0 : 1, pointerEvents: status === GameStatus.Dealing ? 'none' : 'auto' }}>
                        <GameControls status={status} currentBet={bet} lastBet={lastBet} balance={user.balance} onBet={handleBet} onDeal={dealCards} onHit={handleHit} onStand={handleStand} onReset={initializeGame} />
                    </div>
                )}
                {status === GameStatus.Playing && (
                    <div className="animate-fade-in scale-90 md:scale-100">
                        <GameControls status={status} currentBet={bet} balance={user.balance} onBet={handleBet} onDeal={dealCards} onHit={handleHit} onStand={handleStand} onReset={initializeGame} decisionTime={decisionTimer} />
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

        <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
             <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} />
        </div>
      </div>
      
      <div className="xl:hidden absolute bottom-2 right-2 z-50 scale-75 origin-bottom-right opacity-90">
         <AISuggestion playerHand={playerHand} dealerHand={dealerHand} status={status} />
      </div>
    </div>
  );
};
