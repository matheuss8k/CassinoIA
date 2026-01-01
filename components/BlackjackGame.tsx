
import React, { useState, useEffect } from 'react';
import { Card, GameStatus, GameResult, User } from '../types';
import { calculateScore } from '../services/gameLogic';
import { CardComponent } from './CardComponent';
import { GameControls } from './GameControls';
import { AISuggestion } from './AISuggestion';
import { DatabaseService } from '../services/database'; 
import { Info, Lock } from 'lucide-react';

interface BlackjackGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

const MIN_BET = 1;
const MAX_BET = 50;

const ScoreBadge = ({ score, label, hidden }: { score: number, label: string, hidden?: boolean }) => (
    <div className="mt-2 flex flex-col items-center animate-fade-in z-20">
        <div className="bg-slate-900 border border-casino-gold/50 px-3 py-0.5 md:px-4 md:py-1 rounded-full shadow-lg flex items-center gap-2">
            <span className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
            <span className="text-xs md:text-sm font-bold text-casino-gold font-mono">
                {hidden ? '?' : score}
            </span>
        </div>
    </div>
);

const GhostSlot = () => (
    <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/5 flex items-center justify-center mx-1">
        <div className="w-6 h-6 rounded-full bg-white/5"></div>
    </div>
);

const CoinRain = () => {
    const coins = new Array(50).fill(0);
    return (
        <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden rounded-[2rem] md:rounded-[3rem]">
            <style>
                {`@keyframes coinFall { 0% { transform: translateY(-100px) rotate(0deg); opacity: 1; } 100% { transform: translateY(800px) rotate(720deg); opacity: 0; } }`}
            </style>
            {coins.map((_, i) => {
                const left = Math.random() * 100;
                const delay = Math.random() * 2;
                const duration = 1.5 + Math.random() * 2;
                const size = 15 + Math.random() * 15;
                return (
                    <div key={i} className="absolute rounded-full bg-gradient-to-br from-yellow-200 via-yellow-500 to-yellow-700 border border-yellow-100 flex items-center justify-center text-yellow-900 font-bold shadow-md"
                        style={{ left: `${left}%`, top: '-30px', width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.6}px`, animation: `coinFall ${duration}s linear infinite`, animationDelay: `${delay}s`, opacity: 0 }}>
                        $
                    </div>
                )
            })}
        </div>
    )
}

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ user, updateUser }) => {
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
  const [bet, setBet] = useState<number>(0);
  const [lastBet, setLastBet] = useState<number>(0); 
  const [result, setResult] = useState<GameResult>(GameResult.None);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [bettingTimer, setBettingTimer] = useState<number>(10);
  const [decisionTimer, setDecisionTimer] = useState<number>(10);

  // --- RESTORE SESSION LOGIC ---
  useEffect(() => {
      if (user.activeGame && user.activeGame.type === 'BLACKJACK' && status === GameStatus.Idle) {
          const game = user.activeGame;
          // Restore Hand without animation
          setBet(game.bet);
          if (game.bjPlayerHand) setPlayerHand(game.bjPlayerHand);
          if (game.bjDealerHand) {
              // Ensure we hide the hole card if status is playing
              const visibleDealer = (game.bjStatus === 'PLAYING')
                 ? [game.bjDealerHand[0], { ...game.bjDealerHand[1], isHidden: true }]
                 : game.bjDealerHand;
              setDealerHand(visibleDealer);
          }
          setStatus(GameStatus.Playing);
      }
  }, [user.activeGame]);

  useEffect(() => {
    let timer: number;
    if (status === GameStatus.Idle) {
      if (bettingTimer > 0) {
        timer = window.setTimeout(() => setBettingTimer(prev => prev - 1), 1000);
      } else {
        if (bet >= MIN_BET) dealCards();
        else setBettingTimer(10);
      }
    }
    return () => clearTimeout(timer);
  }, [bettingTimer, bet, status]);

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

  const playSound = (type: 'chip' | 'card' | 'win' | 'lose') => {};

  const initializeGame = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setStatus(GameStatus.Idle);
    setResult(GameResult.None);
    setBet(0);
    setBettingTimer(10);
    setIsProcessing(false);
  };

  const handleBet = (amount: number) => {
    if (isProcessing) return;
    if (amount === 0) { setBet(0); return; }
    const potentialBet = bet + amount;
    if (potentialBet > MAX_BET) {
        if (bet < MAX_BET && user.balance >= (MAX_BET - bet)) {
             setBet(MAX_BET); setBettingTimer(10); playSound('chip');
        }
        return;
    }
    if (potentialBet <= user.balance) {
      setBet(potentialBet); setBettingTimer(10); playSound('chip');
    } else {
      alert("Saldo insuficiente.");
    }
  };

  const dealCards = async () => {
    if (bet === 0 || isProcessing) return;
    if (bet < MIN_BET || bet > user.balance) return;

    setIsProcessing(true); 

    try {
        const data = await DatabaseService.blackjackDeal(user.id, bet);
        setIsProcessing(false); 
        
        updateUser({ 
            balance: data.newBalance,
            loyaltyPoints: data.loyaltyPoints,
        });

        setLastBet(bet);
        setResult(GameResult.None);
        setStatus(GameStatus.Dealing);
        
        const pHand = data.playerHand;
        const dHand = data.dealerHand;

        setPlayerHand([]);
        setDealerHand([]);

        await new Promise(r => setTimeout(r, 550));
        setPlayerHand([pHand[0]]); playSound('card');
        
        await new Promise(r => setTimeout(r, 550));
        setDealerHand([dHand[0]]); playSound('card');
        
        await new Promise(r => setTimeout(r, 550));
        setPlayerHand([pHand[0], pHand[1]]); playSound('card');
        
        await new Promise(r => setTimeout(r, 550));
        setDealerHand([dHand[0], dHand[1]]); playSound('card');

        if (data.status === 'GAME_OVER') {
            await new Promise(r => setTimeout(r, 600));
            if (data.dealerHand[1].isHidden === false && dHand[1].isHidden === true) {
                setDealerHand(data.dealerHand);
            }
            endGame(data.result);
        } else {
            setDecisionTimer(10);
            setStatus(GameStatus.Playing);
        }
        
    } catch (error) {
        console.error("Deal error:", error);
        alert("Erro ao conectar com o servidor.");
        setIsProcessing(false);
        setBet(0);
    }
  };

  const handleHit = async () => {
    if (status !== GameStatus.Playing || isProcessing) return;
    setDecisionTimer(10);
    setIsProcessing(true); 

    try {
        const data = await DatabaseService.blackjackHit(user.id);
        setIsProcessing(false);
        setPlayerHand(data.playerHand);
        playSound('card');

        if (data.newBalance !== undefined) {
             updateUser({ 
                balance: data.newBalance,
                loyaltyPoints: data.loyaltyPoints,
            });
        }

        if (data.status === 'GAME_OVER') {
             setDealerHand(data.dealerHand);
             endGame(data.result);
        }
    } catch (e) {
        console.error(e);
        setIsProcessing(false);
    } 
  };

  const handleStand = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
        const data = await DatabaseService.blackjackStand(user.id);
        setIsProcessing(false);
        setStatus(GameStatus.DealerTurn);

        const finalDealerHand = data.dealerHand;
        const currentDealer = [...dealerHand];
        
        if (currentDealer.length >= 2) {
             currentDealer[1] = finalDealerHand[1]; 
             setDealerHand([...currentDealer]);     
             await new Promise(r => setTimeout(r, 800));
        }

        for (let i = currentDealer.length; i < finalDealerHand.length; i++) {
             currentDealer.push(finalDealerHand[i]);
             setDealerHand([...currentDealer]);
             playSound('card');
             await new Promise(r => setTimeout(r, 900));
        }

        updateUser({ 
            balance: data.newBalance,
            loyaltyPoints: data.loyaltyPoints,
        });
        
        endGame(data.result);

    } catch (e) {
        console.error(e);
        setIsProcessing(false);
    }
  };

  const endGame = (res: GameResult) => {
    setResult(res);
    if (res === GameResult.PlayerWin || res === GameResult.Blackjack) playSound('win');
    else if (res === GameResult.DealerWin || res === GameResult.Bust) playSound('lose');

    setStatus(GameStatus.GameOver);
    setIsProcessing(false);

    // Final Sync to catch any last millisecond updates from backend logic
    setTimeout(async () => {
        try {
            const syncData = await DatabaseService.syncUser(user.id);
            updateUser(syncData);
        } catch(e) { console.error("Sync failed", e); }
    }, 1000);

    setTimeout(() => {
      setPlayerHand([]);
      setDealerHand([]);
      setBet(0);
      setStatus(GameStatus.Idle);
      setBettingTimer(10);
    }, 4500); 
  };

  const playerScore = calculateScore(playerHand);
  const dealerScore = calculateScore(dealerHand);
  const isDealerHidden = dealerHand.some(c => c.isHidden);
  
  const showWinAnimation = status === GameStatus.GameOver && (
      result === GameResult.Blackjack || 
      (result === GameResult.PlayerWin && playerScore === 21)
  );
  
  const showBetInfo = bet > 0;

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
      <div className="absolute top-5 md:top-8 left-0 right-0 text-center z-20 pointer-events-none">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
              BLACKJACK <span className="text-casino-gold">IA</span>
          </h1>
      </div>

      <div className="flex-1 w-full max-w-[1600px] flex items-center justify-center gap-2 xl:gap-8 relative p-2 md:p-4 min-h-0 pt-16 md:pt-20">
        <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
             <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-casino-gold font-bold flex items-center gap-2 mb-4 uppercase tracking-widest text-sm"><Info size={16} /> Regras</h3>
                <ul className="space-y-3 text-sm text-slate-300">
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Apostas</span><span className="font-bold text-white">R$ {MIN_BET} - R$ {MAX_BET}</span></li>
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Blackjack</span><span className="font-bold text-white">Paga 3:2</span></li>
                    <li className="flex justify-between border-b border-white/5 pb-2"><span>Dealer</span><span className="font-bold text-white">Para no 17</span></li>
                </ul>
            </div>
            <div className={`transition-all duration-300 transform ${showBetInfo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
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
                        <GameControls status={status} currentBet={bet} lastBet={lastBet} balance={user.balance} onBet={handleBet} onDeal={dealCards} onHit={handleHit} onStand={handleStand} onReset={initializeGame} timeLeft={bettingTimer} />
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
