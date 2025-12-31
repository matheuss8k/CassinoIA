import React, { useState, useEffect } from 'react';
import { Card, GameStatus, GameResult, User } from '../types';
import { createDeck, shuffleDeck, calculateScore } from '../services/gameLogic';
import { CardComponent } from './CardComponent';
import { GameControls } from './GameControls';
import { AISuggestion } from './AISuggestion';
import { DatabaseService } from '../services/database'; // Import DatabaseService
import { Info, Lock } from 'lucide-react';

interface BlackjackGameProps {
  user: User;
  updateBalance: (newBalance: number) => void;
}

// ScoreBadge
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

// Coin Rain Component com Keyframes Locais para garantir execução
const CoinRain = () => {
    // Array estático para desempenho
    const coins = new Array(50).fill(0);
    
    return (
        <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden rounded-[2rem] md:rounded-[3rem]">
            <style>
                {`
                @keyframes coinFall {
                    0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(800px) rotate(720deg); opacity: 0; }
                }
                `}
            </style>
            {coins.map((_, i) => {
                const left = Math.random() * 100;
                const delay = Math.random() * 2;
                const duration = 1.5 + Math.random() * 2; // Queda mais rápida e dinâmica
                const size = 15 + Math.random() * 15;
                
                return (
                    <div 
                        key={i}
                        className="absolute rounded-full bg-gradient-to-br from-yellow-200 via-yellow-500 to-yellow-700 border border-yellow-100 flex items-center justify-center text-yellow-900 font-bold shadow-md"
                        style={{
                            left: `${left}%`,
                            top: '-30px', // Começa logo acima da borda visível
                            width: `${size}px`,
                            height: `${size}px`,
                            fontSize: `${size * 0.6}px`,
                            animation: `coinFall ${duration}s linear infinite`,
                            animationDelay: `${delay}s`,
                            opacity: 0 // Começa invisível até a animação pegar
                        }}
                    >
                        $
                    </div>
                )
            })}
        </div>
    )
}

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ user, updateBalance }) => {
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
  const [bet, setBet] = useState<number>(0);
  const [lastBet, setLastBet] = useState<number>(0); 
  const [result, setResult] = useState<GameResult>(GameResult.None);
  const [message, setMessage] = useState<string>('');
  
  // State de Processamento (Blindagem UI)
  const [isProcessing, setIsProcessing] = useState(false);

  // Timers
  const [bettingTimer, setBettingTimer] = useState<number>(10);
  const [decisionTimer, setDecisionTimer] = useState<number>(10);

  // Betting Timer
  useEffect(() => {
    let timer: number;
    if (status === GameStatus.Idle) {
      if (bettingTimer > 0) {
        timer = window.setTimeout(() => setBettingTimer(prev => prev - 1), 1000);
      } else {
        if (bet > 0) {
           dealCards();
        } else {
           setBettingTimer(10);
        }
      }
    }
    return () => clearTimeout(timer);
  }, [bettingTimer, bet, status]);

  // Decision Timer
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

  const playSound = (type: 'chip' | 'card' | 'win' | 'lose') => {
    // Placeholder para sons reais
  };

  const initializeGame = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setStatus(GameStatus.Idle);
    setResult(GameResult.None);
    setMessage('');
    setBet(0);
    setBettingTimer(10);
    setIsProcessing(false);
  };

  const handleBet = (amount: number) => {
    if (isProcessing) return; // Prevent betting while processing

    if (amount === 0) {
      setBet(0);
      return;
    }
    
    if (bet + amount <= user.balance) {
      setBet(prev => prev + amount);
      setBettingTimer(10);
      playSound('chip');
    }
  };

  const dealCards = async () => {
    if (bet === 0 || isProcessing) return;
    
    if (bet > user.balance) {
      alert("Saldo insuficiente para iniciar a rodada.");
      return;
    }

    // BLINDAGEM: Inicia processamento, trava botões
    setIsProcessing(true);

    try {
        // BLINDAGEM: Deduz saldo no SERVIDOR PRIMEIRO
        // Se der F5 agora, o dinheiro já foi.
        const secureBalance = await DatabaseService.placeBet(user.id, bet);
        
        // Atualiza a UI com o novo saldo retornado pelo servidor
        updateBalance(secureBalance); 

        setLastBet(bet);
        setMessage('');
        setResult(GameResult.None);
        
        setStatus(GameStatus.Dealing);
        const newDeck = shuffleDeck(createDeck());
        const pHand: Card[] = [];
        const dHand: Card[] = [];

        // Animação das cartas (Só começa se o servidor confirmar a aposta)
        await new Promise(r => setTimeout(r, 400));
        pHand.push(newDeck.pop()!);
        setPlayerHand([...pHand]);
        setDeck(newDeck);
        playSound('card');

        await new Promise(r => setTimeout(r, 400));
        dHand.push(newDeck.pop()!);
        setDealerHand([...dHand]);
        setDeck(newDeck);
        playSound('card');

        await new Promise(r => setTimeout(r, 400));
        pHand.push(newDeck.pop()!);
        setPlayerHand([...pHand]);
        setDeck(newDeck);
        playSound('card');

        await new Promise(r => setTimeout(r, 400));
        const cardToHide = newDeck.pop()!;
        const hiddenCard = { ...cardToHide, isHidden: true };
        dHand.push(hiddenCard);
        setDealerHand([...dHand]);
        setDeck(newDeck);
        playSound('card');

        setDecisionTimer(10);
        setStatus(GameStatus.Playing);
        setIsProcessing(false); // Libera o jogo

    } catch (error) {
        console.error("Erro crítico na aposta:", error);
        alert("Erro ao processar aposta no servidor. Tente novamente.");
        setIsProcessing(false);
        setBet(0); // Reseta aposta visual em caso de falha
    }
  };

  const handleHit = () => {
    if (status !== GameStatus.Playing || isProcessing) return;
    
    setDecisionTimer(10);
    
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    const newHand = [...playerHand, card];
    
    setDeck(newDeck);
    setPlayerHand(newHand);
    playSound('card');

    if (calculateScore(newHand) > 21) {
      endGame(GameResult.Bust);
    }
  };

  const handleStand = () => {
    if (isProcessing) return;
    setStatus(GameStatus.DealerTurn);
  };

  useEffect(() => {
    if (status === GameStatus.DealerTurn) {
      const playDealer = async () => {
        let currentDeck = [...deck];
        let currentDealerHand = [...dealerHand];
        
        if (currentDealerHand.length >= 2) {
             const revealedCard = { ...currentDealerHand[1], isHidden: false };
             currentDealerHand[1] = revealedCard;
             setDealerHand([...currentDealerHand]);
             await new Promise(r => setTimeout(r, 600));
        }

        let dealerScore = calculateScore(currentDealerHand);

        while (dealerScore < 17) {
          const card = currentDeck.pop()!;
          currentDealerHand.push(card);
          setDealerHand([...currentDealerHand]);
          setDeck(currentDeck);
          dealerScore = calculateScore(currentDealerHand);
          playSound('card');
          await new Promise(r => setTimeout(r, 800));
        }

        determineWinner(currentDealerHand);
      };
      playDealer();
    }
  }, [status]);

  useEffect(() => {
      // Auto-stand on 21 (Natural or Hit)
      if (status === GameStatus.Playing) {
          const score = calculateScore(playerHand);
          if (score === 21) {
             handleStand(); 
          }
      }
  }, [status, playerHand]);


  const determineWinner = (finalDealerHand: Card[]) => {
    const pScore = calculateScore(playerHand);
    const dScore = calculateScore(finalDealerHand);

    const isPlayerBlackjack = pScore === 21 && playerHand.length === 2;
    const isDealerBlackjack = dScore === 21 && finalDealerHand.length === 2;

    // Dealer Estourou
    if (dScore > 21) {
        if (isPlayerBlackjack) endGame(GameResult.Blackjack);
        else endGame(GameResult.PlayerWin);
        return;
    }

    // Player Maior que Dealer
    if (pScore > dScore) {
        if (isPlayerBlackjack) endGame(GameResult.Blackjack);
        else endGame(GameResult.PlayerWin);
        return;
    }

    // Dealer Maior que Player
    if (dScore > pScore) {
        endGame(GameResult.DealerWin);
        return;
    }

    // Empate (Push)
    // Se scores iguais:
    if (isPlayerBlackjack && !isDealerBlackjack) {
        // Player tem BJ natural, dealer tem 21 montado
        endGame(GameResult.Blackjack);
    } else if (!isPlayerBlackjack && isDealerBlackjack) {
        // Dealer tem BJ natural, player tem 21 montado
        endGame(GameResult.DealerWin);
    } else {
        // Ambos iguais
        endGame(GameResult.Push);
    }
  };

  const endGame = async (res: GameResult) => {
    // BLINDAGEM: Trava interações durante finalização
    setIsProcessing(true);
    setResult(res);
    
    let payout = 0;
    if (res === GameResult.PlayerWin) {
      payout = bet * 2;
      setMessage('VOCÊ VENCEU!');
      playSound('win');
    } else if (res === GameResult.Blackjack) {
      payout = bet * 2.5;
      setMessage('BLACKJACK!');
      playSound('win');
    } else if (res === GameResult.Push) {
      payout = bet;
      setMessage('EMPATE');
    } else {
      setMessage('A BANCA VENCEU');
      playSound('lose');
    }

    // BLINDAGEM: Processa pagamento no servidor
    if (payout > 0) {
        try {
            const secureBalance = await DatabaseService.settleGame(user.id, payout);
            updateBalance(secureBalance);
        } catch (error) {
            console.error("Erro ao pagar prêmio:", error);
            // Em produção, isso iria para uma fila de 'retry' ou log de auditoria
        }
    }

    setStatus(GameStatus.GameOver);
    setIsProcessing(false);

    setTimeout(() => {
      setPlayerHand([]);
      setDealerHand([]);
      setMessage('');
      setBet(0);
      setStatus(GameStatus.Idle);
      setBettingTimer(10);
    }, 4500); // Tempo aumentado para curtir a animação
  };

  const playerScore = calculateScore(playerHand);
  const dealerScore = calculateScore(dealerHand);
  const isDealerHidden = dealerHand.some(c => c.isHidden);
  
  // Flag para acionar animação de vitória
  const showWinAnimation = status === GameStatus.GameOver && (
      result === GameResult.Blackjack || 
      (result === GameResult.PlayerWin && playerScore === 21)
  );
  
  // SOLICITAÇÃO ATENDIDA: Exibir info da aposta assim que houver aposta (> 0)
  // Ou se o jogo já estiver rolando (proteção para transição rápida)
  const showBetInfo = bet > 0;

  return (
    <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
      
      {/* Title - Reduced spacing to move things up (pt-2) */}
      <div className="flex-none pt-2 pb-2 text-center relative z-20">
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
              BLACKJACK <span className="text-casino-gold">IA</span>
          </h1>
      </div>

      {/* Main Container - Reduced gap */}
      <div className="flex-1 w-full max-w-[1600px] flex items-center justify-center gap-2 xl:gap-8 relative p-2 md:p-4 min-h-0">
        
        {/* Left Sidebar (Rules) - Relative in Flex on XL, Absolute on small */}
        <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
             <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-casino-gold font-bold flex items-center gap-2 mb-4 uppercase tracking-widest text-sm">
                    <Info size={16} /> Regras
                </h3>
                <ul className="space-y-3 text-sm text-slate-300">
                    <li className="flex justify-between border-b border-white/5 pb-2">
                        <span>Apostas</span>
                        <span className="font-bold text-white">1, 3, 5</span>
                    </li>
                    <li className="flex justify-between border-b border-white/5 pb-2">
                        <span>Blackjack</span>
                        <span className="font-bold text-white">Paga 3:2</span>
                    </li>
                    <li className="flex justify-between border-b border-white/5 pb-2">
                        <span>Dealer</span>
                        <span className="font-bold text-white">Para no 17</span>
                    </li>
                </ul>
            </div>
            
            {/* Bet Info - Agora aparece IMEDIATAMENTE ao apostar */}
            <div className={`transition-all duration-300 transform ${showBetInfo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className={`rounded-2xl p-1 shadow-lg ${status !== GameStatus.Idle ? 'bg-gradient-to-br from-casino-gold to-yellow-600 animate-pulse-gold' : 'bg-slate-700'}`}>
                    <div className="bg-slate-900 rounded-xl p-4 text-center relative overflow-hidden">
                        {status !== GameStatus.Idle && (
                            <div className="absolute top-2 right-2 text-casino-gold">
                                <Lock size={12} />
                            </div>
                        )}
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                            {status === GameStatus.Idle ? 'Sua Aposta' : 'Aposta em Jogo'}
                        </div>
                        <div className="text-2xl font-bold text-white">R$ {bet.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        </div>

        {/* CENTER TABLE */}
        <div className="relative w-full flex-1 max-w-[800px] aspect-[3/4] sm:aspect-[4/3] max-h-full bg-casino-felt rounded-[2rem] md:rounded-[3rem] border-[8px] md:border-[12px] border-slate-800 shadow-[inset_0_0_80px_rgba(0,0,0,0.7),0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between z-10 transition-all duration-300">
            
            {/* Coin Rain for Wins */}
            {showWinAnimation && <CoinRain />}

            {/* Table Logo Background */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-10 pointer-events-none text-center z-0">
                <div className="text-3xl md:text-5xl font-black text-black tracking-widest border-4 border-black px-4 py-2 md:px-8 md:py-4 rounded-xl transform -rotate-12 whitespace-nowrap flex gap-3">
                    BJ <span className="text-casino-gold">IA</span>
                </div>
            </div>

            {/* WIN OVERLAY - PERFECTLY CENTERED */}
            {status === GameStatus.GameOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fade-in">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                    
                    {(result === GameResult.PlayerWin || result === GameResult.Blackjack) ? (
                        <div className="relative flex items-center justify-center scale-75 md:scale-100 z-10">
                            <div className="absolute w-[300px] h-[300px] bg-gradient-to-r from-yellow-500/0 via-yellow-500/10 to-yellow-500/0 animate-[spin_4s_linear_infinite] rounded-full blur-xl"></div>
                            
                            <div className="relative">
                                <div className="bg-black/90 border-2 border-yellow-500 px-8 py-3 rounded-full shadow-[0_0_30px_rgba(234,179,8,0.5)] animate-pulse relative z-20 min-w-[160px] text-center">
                                    <p className="text-xl md:text-2xl font-bold text-yellow-400 tracking-wider">
                                        + R$ {(result === GameResult.Blackjack ? bet * 2.5 : bet * 2).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : result === GameResult.Push ? (
                        <div className="bg-slate-800/90 border-4 border-slate-500 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-95">
                            <h2 className="text-3xl md:text-4xl font-black text-slate-300">EMPATE</h2>
                        </div>
                    ) : (
                        <div className="bg-red-900/80 border-4 border-red-600 px-6 py-4 rounded-2xl shadow-2xl relative z-10 scale-90 md:scale-95 grayscale-[0.2]">
                            <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg">A BANCA VENCEU</h2>
                        </div>
                    )}
                </div>
            )}

            {/* Dealer Area (Top) */}
            <div className="flex-1 flex flex-col items-center justify-start pt-6 md:pt-10 relative z-10 min-h-0">
                <div className="relative mb-2">
                    <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-75 md:scale-100 origin-top">
                        <GhostSlot /><GhostSlot />
                    </div>
                    <div className="flex justify-center gap-2 relative scale-90 md:scale-100 origin-top">
                        {dealerHand.map((card, i) => (
                            <CardComponent key={card.id} card={card} index={i} />
                        ))}
                    </div>
                </div>
                {dealerHand.length > 0 && (
                    <ScoreBadge score={dealerScore} label="Banca" hidden={isDealerHidden} />
                )}
            </div>

            {/* Center Controls - Increased padding and min-height here */}
            <div className="flex-none flex justify-center items-center w-full px-4 py-6 z-40 min-h-[120px]">
                {/* Loader Overlay during server processing */}
                {isProcessing && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-3xl">
                        <div className="w-8 h-8 border-4 border-casino-gold border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {(status === GameStatus.Idle || status === GameStatus.Betting || status === GameStatus.Dealing) && (
                    <div className="animate-fade-in scale-90 md:scale-100 transition-opacity duration-300" style={{ opacity: status === GameStatus.Dealing ? 0 : 1 }}>
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
                            timeLeft={bettingTimer}
                        />
                    </div>
                )}

                {status === GameStatus.Playing && (
                        <div className="animate-fade-in scale-90 md:scale-100">
                            <GameControls 
                            status={status}
                            currentBet={bet}
                            balance={user.balance}
                            onBet={handleBet}
                            onDeal={dealCards}
                            onHit={handleHit}
                            onStand={handleStand}
                            onReset={initializeGame}
                            decisionTime={decisionTimer}
                        />
                        </div>
                )}
            </div>

            {/* Player Area (Bottom) */}
            <div className="flex-1 flex flex-col items-center justify-end pb-6 md:pb-10 relative z-10 min-h-0">
                <div className="relative mb-2">
                    <div className="absolute inset-0 flex justify-center opacity-30 pointer-events-none scale-75 md:scale-100 origin-bottom">
                        <GhostSlot /><GhostSlot />
                    </div>
                    <div className="flex justify-center gap-2 relative scale-90 md:scale-100 origin-bottom">
                        {playerHand.map((card, i) => (
                            <CardComponent key={card.id} card={card} index={i} />
                        ))}
                    </div>
                </div>
                
                {playerHand.length > 0 && (
                    <ScoreBadge score={playerScore} label="Você" />
                )}
            </div>
        </div>

        {/* Right Sidebar (AI) - Relative in Flex on XL, Absolute on small */}
        <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
             {status === GameStatus.Playing ? (
                 <AISuggestion playerHand={playerHand} dealerHand={dealerHand} />
             ) : (
                 // Placeholder to keep spacing symmetrical if AI is hidden (though opacity-0 preferred usually, here we keep structure)
                 <div className="w-full h-[200px]"></div> 
             )}
        </div>
      </div>
      
      {/* Mobile/Tablet AI Suggestion - Only visible on small screens */}
      {status === GameStatus.Playing && (
          <div className="xl:hidden absolute bottom-2 right-2 z-50 scale-75 origin-bottom-right opacity-90">
             <AISuggestion playerHand={playerHand} dealerHand={dealerHand} />
          </div>
      )}

    </div>
  );
};