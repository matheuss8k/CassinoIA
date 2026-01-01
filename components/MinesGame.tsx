
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, GameStatus } from '../types';
import { DatabaseService } from '../services/database';
import { Button } from './UI/Button';
import { Diamond, Bomb, Volume2, VolumeX, Lock, Trophy, BrainCircuit, Scan, Sparkles, Info, X } from 'lucide-react';

interface MinesGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

interface Tile {
  id: number;
  isRevealed: boolean;
  content: 'unknown' | 'gem' | 'mine'; 
}

const MIN_BET = 1;
const MAX_BET = 100;
const MAX_PROFIT = 500;
const GRID_SIZE = 25;

export const MinesGame: React.FC<MinesGameProps> = ({ user, updateUser }) => {
  const [grid, setGrid] = useState<Tile[]>(Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' })));
  
  const [mineCount, setMineCount] = useState<number>(3);
  const [bet, setBet] = useState<number>(5);
  const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [profit, setProfit] = useState<number>(0);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [nextMultiplierPreview, setNextMultiplierPreview] = useState<number>(1.0);

  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [aiSuggestion, setAiSuggestion] = useState<number | null>(null);
  const [isAiScanning, setIsAiScanning] = useState<boolean>(false);
  const [cashoutWin, setCashoutWin] = useState<number | null>(null);
  const [loadingTileId, setLoadingTileId] = useState<number | null>(null);
  const gameOverTimeoutRef = useRef<number | null>(null);

  // --- RESTORE SESSION LOGIC ---
  useEffect(() => {
      if (user.activeGame && user.activeGame.type === 'MINES' && status === GameStatus.Idle) {
          // Restore game state from backend info
          const savedGame = user.activeGame;
          
          setBet(savedGame.bet);
          setMineCount(savedGame.minesCount || 3);
          setStatus(GameStatus.Playing);
          setCurrentMultiplier(savedGame.minesMultiplier || 1.0);
          
          // Reconstruct Grid
          const restoredGrid: Tile[] = Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' }));
          
          let revealedCount = 0;
          if (savedGame.minesRevealed) {
              savedGame.minesRevealed.forEach(idx => {
                  restoredGrid[idx].isRevealed = true;
                  restoredGrid[idx].content = 'gem'; // We only store revealed gems safely
                  revealedCount++;
              });
          }
          setGrid(restoredGrid);
          setRevealedCount(revealedCount);
      }
  }, [user.activeGame]); 

  useEffect(() => {
    return () => {
        if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
      const remainingTiles = GRID_SIZE - revealedCount;
      const safeTiles = remainingTiles - mineCount;
      if (safeTiles > 0) {
          const prob = safeTiles / remainingTiles;
          const nextMult = (0.97 / prob) * currentMultiplier;
          setNextMultiplierPreview(nextMult);
      }
  }, [revealedCount, mineCount, currentMultiplier]);

  const currentWinValue = useMemo(() => {
    if (status !== GameStatus.Playing) return 0;
    if (profit > 0) return Math.floor(profit);
    if (revealedCount > 0 && currentMultiplier > 1.0) return Math.floor(bet * currentMultiplier);
    return 0;
  }, [status, profit, revealedCount, currentMultiplier, bet]);

  const playSound = (type: 'gem' | 'bomb' | 'click' | 'cashout' | 'scan') => {
    if (!soundEnabled) return;
  };

  const handleAskAi = () => {
      if (status !== GameStatus.Playing || isAiScanning) return;
      setIsAiScanning(true);
      setAiSuggestion(null);
      playSound('click');
      setTimeout(() => {
          const availableTiles = grid.filter(t => !t.isRevealed).map(t => t.id);
          if (availableTiles.length > 0) {
              const randomIndex = Math.floor(Math.random() * availableTiles.length);
              setAiSuggestion(availableTiles[randomIndex]);
              playSound('scan');
          }
          setIsAiScanning(false);
      }, 700);
  };

  const startGame = async () => {
    if (gameOverTimeoutRef.current) {
        clearTimeout(gameOverTimeoutRef.current);
        gameOverTimeoutRef.current = null;
    }
    setCashoutWin(null);
    setAiSuggestion(null);

    if (bet < MIN_BET) return alert(`Mínimo R$ ${MIN_BET.toFixed(2)}`);
    if (bet > MAX_BET) return alert(`Máximo R$ ${MAX_BET.toFixed(2)}`);
    if (bet > user.balance) return alert("Saldo insuficiente.");

    setIsProcessing(true);
    try {
        const response = await DatabaseService.minesStart(user.id, bet, mineCount);
        
        updateUser({ 
            balance: response.newBalance,
            loyaltyPoints: response.loyaltyPoints,
        });

        const newGrid = Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' as const }));
        setGrid(newGrid);
        
        setStatus(GameStatus.Playing);
        setRevealedCount(0);
        setProfit(0);
        setCurrentMultiplier(1.0);
        playSound('click');

    } catch (e: any) {
        alert(e.message || "Erro ao iniciar rodada.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleTileClick = async (index: number) => {
    if (status !== GameStatus.Playing || grid[index].isRevealed || isProcessing || loadingTileId !== null) return;

    setLoadingTileId(index);
    if (aiSuggestion !== null) setAiSuggestion(null);

    try {
        const result = await DatabaseService.minesReveal(user.id, index);

        const newGrid = [...grid];
        newGrid[index].isRevealed = true;

        if (result.outcome === 'BOMB') {
            newGrid[index].content = 'mine';
            setStatus(GameStatus.GameOver);
            playSound('bomb');
            
            // Sync on Loss
            if (result.newBalance !== undefined) {
                 updateUser({ 
                    balance: result.newBalance,
                    loyaltyPoints: result.loyaltyPoints,
                 });
            }

            if (result.mines) {
                result.mines.forEach((mineIdx: number) => {
                    newGrid[mineIdx].content = 'mine';
                    newGrid[mineIdx].isRevealed = true;
                });
            }
            gameOverTimeoutRef.current = window.setTimeout(() => {
                setStatus(GameStatus.Idle);
                gameOverTimeoutRef.current = null;
            }, 3000);
        } else {
            newGrid[index].content = 'gem';
            playSound('gem');
            setRevealedCount(prev => prev + 1);
            setProfit(result.profit);
            setCurrentMultiplier(result.multiplier);

            // Sync User Data even on Safe Reveal (Server now returns it)
            if (result.newBalance !== undefined) {
                updateUser({ 
                    balance: result.newBalance,
                    loyaltyPoints: result.loyaltyPoints,
                });
            }

            if (result.status === 'WIN_ALL') {
                 // Double check Sync on Win All
                 updateUser({ 
                    balance: result.newBalance,
                    loyaltyPoints: result.loyaltyPoints,
                 });
                 
                 setStatus(GameStatus.GameOver);
                 playSound('cashout');
                 setCashoutWin(result.profit);
                 setTimeout(() => setCashoutWin(null), 4000);
                 if (result.mines) {
                    result.mines.forEach((mineIdx: number) => {
                        newGrid[mineIdx].content = 'mine';
                        newGrid[mineIdx].isRevealed = true; 
                    });
                 }
                 gameOverTimeoutRef.current = window.setTimeout(() => {
                    setStatus(GameStatus.Idle);
                    setProfit(0);
                    gameOverTimeoutRef.current = null;
                }, 4000);
            }
        }
        setGrid(newGrid);

    } catch (error: any) {
        if (error.message && (error.message.includes("não encontrado") || error.message.includes("expirado") || error.message.includes("404"))) {
            alert("Sessão expirada. Reiniciando...");
            setStatus(GameStatus.Idle);
            setProfit(0);
            setGrid(Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' as const })));
        }
    } finally {
        setLoadingTileId(null);
    }
  };

  const handleCashout = async () => {
    if (status !== GameStatus.Playing || isProcessing || loadingTileId !== null) return;
    setIsProcessing(true);
    try {
        const result = await DatabaseService.minesCashout(user.id);
        
        updateUser({ 
            balance: result.newBalance,
            loyaltyPoints: result.loyaltyPoints,
        });

        playSound('cashout');
        const winValue = Math.floor(result.profit || currentWinValue);
        setCashoutWin(winValue);
        setStatus(GameStatus.Idle);
        setAiSuggestion(null);
        if (result.mines) {
             const finalGrid = [...grid];
             result.mines.forEach((mineIdx: number) => {
                 finalGrid[mineIdx].content = 'mine';
                 finalGrid[mineIdx].isRevealed = true;
             });
             setGrid(finalGrid);
        }
        setTimeout(() => { setProfit(0); setCashoutWin(null); }, 3000);
    } catch (e: any) {
        if (e.message && (e.message.includes("não encontrado") || e.message.includes("expirado"))) {
             setStatus(GameStatus.Idle);
             setProfit(0);
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const adjustBet = (type: 'half' | 'double' | 'max') => {
    if (status === GameStatus.Playing) return;
    if (type === 'half') setBet(Math.max(MIN_BET, Math.floor(bet / 2)));
    if (type === 'double') setBet(Math.min(Math.min(user.balance, MAX_BET), bet * 2));
    if (type === 'max') setBet(Math.min(user.balance, MAX_BET));
  };

  return (
    <div className="w-full min-h-[calc(100vh-80px)] flex flex-col items-center justify-center p-4 relative animate-fade-in pt-16 md:pt-20">
        <div className="absolute top-5 md:top-8 left-0 right-0 text-center z-20 pointer-events-none">
             <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                MINES <span className="text-casino-gold">IA</span>
            </h1>
        </div>

        {showInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-slate-900 border border-casino-gold/30 w-full max-w-sm rounded-2xl p-6 relative shadow-2xl shadow-casino-gold/10">
                    <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={24} /></button>
                    <h2 className="text-xl font-bold text-casino-gold mb-4 flex items-center gap-2"><Info size={20} /> Informações</h2>
                    <div className="space-y-4">
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-white/5">
                            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Limites</p>
                            <div className="flex justify-between items-center text-sm"><span className="text-white">Mínimo:</span><span className="font-mono font-bold text-white">R$ {MIN_BET.toFixed(2)}</span></div>
                            <div className="flex justify-between items-center text-sm mt-1"><span className="text-white">Máximo:</span><span className="font-mono font-bold text-white">R$ {MAX_BET.toFixed(2)}</span></div>
                        </div>
                    </div>
                    <Button fullWidth onClick={() => setShowInfo(false)} className="mt-6" variant="primary">ENTENDI</Button>
                </div>
            </div>
        )}

        <div className="flex flex-col-reverse xl:flex-row items-start justify-center gap-6 w-full max-w-[1400px] z-10">
            <div className="w-full max-w-md xl:w-[320px] bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-col gap-5 shadow-2xl shrink-0 h-auto xl:h-[600px] transition-all mx-auto xl:mx-0">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center text-red-500"><Bomb size={18} /></div>
                        <span className="font-bold text-white text-lg tracking-tight">Configuração</span>
                    </div>
                    <button onClick={() => setShowInfo(true)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-casino-gold transition-colors border border-white/5"><Info size={16} /></button>
                </div>

                <div className={`relative p-4 rounded-2xl border transition-all duration-300 overflow-hidden ${status === GameStatus.Playing ? 'bg-slate-900/90 border-casino-gold/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-slate-950/50 border-white/5'}`}>
                    {status === GameStatus.Playing && (<div className="absolute top-2 right-2 text-casino-gold animate-pulse drop-shadow-[0_0_5px_rgba(251,191,36,0.5)] z-20"><Lock size={14} /></div>)}
                    <div className="flex justify-between items-center mb-2">
                        <span className={`text-xs uppercase font-bold tracking-wider ${status === GameStatus.Playing ? 'text-white' : 'text-slate-400'}`}>{status === GameStatus.Playing ? 'Aposta em Jogo' : 'Valor da Aposta'}</span>
                        <span className="text-xs text-slate-500">Saldo: R$ {Math.floor(user.balance).toFixed(2)}</span>
                    </div>
                    
                    <div className="relative mb-3">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold ${status === GameStatus.Playing ? 'text-casino-gold' : 'text-slate-500'}`}>R$</span>
                        <input type="number" min={MIN_BET} max={MAX_BET} value={bet} onChange={(e) => { if (status !== GameStatus.Idle) return; const val = Math.floor(Number(e.target.value)); if (val >= 0) setBet(val); }} onBlur={() => { if (status === GameStatus.Idle) { if (bet < MIN_BET && bet !== 0) setBet(MIN_BET); if (bet > MAX_BET) setBet(MAX_BET); } }} disabled={status === GameStatus.Playing} className={`w-full border-2 rounded-xl py-3 pl-10 pr-4 font-bold outline-none transition-colors text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${status === GameStatus.Playing ? 'bg-black/40 border-casino-gold/30 text-casino-gold opacity-100' : 'bg-slate-900 border-slate-700 text-white focus:border-casino-gold'}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => adjustBet('half')} disabled={status === GameStatus.Playing} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-colors disabled:opacity-30">½</button>
                        <button onClick={() => adjustBet('double')} disabled={status === GameStatus.Playing} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-colors disabled:opacity-30">2x</button>
                    </div>
                </div>

                <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Número de Minas</span>
                        <span className="bg-red-900/30 text-red-400 text-xs px-2 py-0.5 rounded border border-red-500/30 font-bold">{mineCount}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-6">
                        {[1, 3, 5, 10].map(count => (<button key={count} onClick={() => status === GameStatus.Idle && setMineCount(count)} disabled={status === GameStatus.Playing} className={`py-2 rounded-xl text-sm font-bold border transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${mineCount === count ? 'bg-red-500 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}>{count}</button>))}
                    </div>
                    <input type="range" min="1" max="24" value={mineCount} onChange={(e) => status === GameStatus.Idle && setMineCount(Number(e.target.value))} disabled={status === GameStatus.Playing} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-50" />
                </div>

                <div className="mt-auto pt-4 border-t border-white/5">
                    {status === GameStatus.Idle || status === GameStatus.GameOver ? (
                        <Button fullWidth size="lg" variant="primary" onClick={startGame} disabled={isProcessing} className="h-16 text-xl shadow-[0_0_20px_rgba(251,191,36,0.2)] rounded-xl">{isProcessing ? 'INICIANDO...' : 'JOGAR'}</Button>
                    ) : (
                        <div className="space-y-3">
                             <div className="bg-slate-950/80 border border-green-500/30 p-3 rounded-xl flex items-center justify-between"><span className="text-xs text-slate-400 uppercase tracking-wider">Lucro Atual</span><span className="text-green-400 font-mono font-bold text-lg">R$ {currentWinValue.toFixed(2)}</span></div>
                             <Button fullWidth size="lg" variant="success" onClick={() => handleCashout()} disabled={isProcessing || loadingTileId !== null || revealedCount === 0} className="h-16 text-xl flex flex-col leading-none items-center justify-center gap-1 shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-pulse rounded-xl disabled:opacity-50 disabled:animate-none"><span>RETIRAR</span><span className="text-xs opacity-80 font-mono tracking-wider">R$ {currentWinValue.toFixed(2)}</span></Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 w-full max-w-[600px] aspect-square flex flex-col relative bg-slate-900/50 rounded-3xl border border-white/10 p-4 md:p-8 overflow-hidden backdrop-blur-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] mx-auto xl:mx-0">
                <div className="grid grid-cols-3 items-center mb-4 px-2 bg-slate-950/50 p-2 rounded-xl border border-white/5">
                     <div className="flex items-center gap-3 justify-self-start">
                         <div className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center border border-cyan-500/20"><Diamond size={16} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" /></div>
                         <div className="flex flex-col leading-none"><span className="text-[9px] text-slate-400 uppercase font-bold">Restantes</span><span className="text-white font-bold text-sm">{GRID_SIZE - mineCount - revealedCount}</span></div>
                     </div>
                     <div className={`justify-self-center transition-opacity duration-300 ${status === GameStatus.Playing ? 'opacity-100' : 'opacity-0'}`}>
                         <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-full border border-white/10 shadow-lg"><span className="text-[10px] text-slate-400 uppercase font-bold">Próximo</span><span className="text-casino-gold font-bold font-mono text-sm">{nextMultiplierPreview.toFixed(2)}x</span></div>
                     </div>
                     <button onClick={() => setSoundEnabled(!soundEnabled)} className="justify-self-end text-slate-500 hover:text-white transition-colors p-2">{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
                </div>
                
                <div className="flex-1 flex items-center justify-center">
                    <div className="grid grid-cols-5 gap-2 md:gap-3 w-full h-full">
                        {grid.map((tile, index) => {
                            const isSuggested = aiSuggestion === tile.id;
                            const isLocked = status !== GameStatus.Playing || tile.isRevealed || isProcessing || loadingTileId !== null;
                            return (
                                <button key={tile.id} disabled={isLocked} onClick={() => handleTileClick(index)} className={`relative w-full h-full rounded-xl transition-all duration-300 transform perspective-1000 group ${tile.isRevealed ? 'bg-slate-800 border-slate-700 cursor-default shadow-inner' : isSuggested ? 'bg-purple-900/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-10 scale-105 animate-pulse' : 'bg-gradient-to-br from-slate-700 to-slate-800 border-b-[4px] border-slate-950 hover:-translate-y-1 hover:brightness-110 cursor-pointer shadow-lg active:border-b-0 active:translate-y-0.5'} ${!isLocked && !tile.isRevealed && !isSuggested ? 'hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]' : ''} ${status === GameStatus.GameOver && tile.content === 'mine' && !tile.isRevealed ? 'opacity-50 grayscale' : ''} ${loadingTileId === tile.id ? 'animate-pulse scale-95 opacity-80' : ''} ${isLocked && !tile.isRevealed ? 'cursor-not-allowed opacity-90' : ''}`}>
                                    {isSuggested && !tile.isRevealed && (<div className="absolute inset-0 flex items-center justify-center animate-bounce"><div className="bg-purple-500/20 p-1.5 rounded-full border border-purple-500/50 backdrop-blur-sm"><Scan size={20} className="text-purple-300" /></div></div>)}
                                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${tile.isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                                        {tile.content === 'mine' ? (
                                            <div className="relative animate-bounce"><Bomb size={24} className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] md:w-8 md:h-8" />{status === GameStatus.GameOver && tile.isRevealed && (<div className="absolute inset-0 bg-red-500 blur-xl opacity-50 animate-pulse"></div>)}</div>
                                        ) : tile.content === 'gem' ? (
                                            <div className="relative animate-spin-slow"><Diamond size={24} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] md:w-8 md:h-8" /><div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30"></div></div>
                                        ) : null}
                                    </div>
                                    {!tile.isRevealed && (<div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none"><div className="w-6 h-6 rounded-full bg-white blur-md"></div></div>)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {status === GameStatus.GameOver && profit === 0 && !cashoutWin && (
                     <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                         <div className="bg-red-600/90 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-red-800 transform scale-125 animate-bounce backdrop-blur-sm"><h2 className="text-3xl font-black uppercase tracking-widest drop-shadow-md">BOOM!</h2></div>
                     </div>
                )}

                {cashoutWin !== null && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm bg-black/40 rounded-[2rem]">
                         <div className="relative">
                            <div className="absolute inset-0 bg-green-500 blur-[30px] opacity-10 rounded-full animate-pulse"></div>
                            <div className="bg-slate-900/95 border-2 border-green-500 p-6 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.3)] flex flex-col items-center gap-3 transform scale-100 animate-slide-up relative z-10 min-w-[250px]">
                                <div className="p-3 bg-green-500/20 rounded-full mb-1 ring-2 ring-green-500/10"><Trophy size={32} className="text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]" /></div>
                                <div className="text-center"><p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Você Sacou</p><p className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-lg">R$ <span className="text-transparent bg-clip-text bg-gradient-to-br from-green-400 to-emerald-600">{cashoutWin.toFixed(2)}</span></p></div>
                                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden"><div className="h-full bg-green-500 animate-[shine_2s_infinite]"></div></div>
                            </div>
                         </div>
                    </div>
                )}
            </div>

            <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0 h-[600px]">
                 <div className="w-full animate-slide-up h-full flex flex-col">
                    <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.1)] relative overflow-hidden group flex-1 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>
                        <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                            <h3 className="text-purple-400 font-bold flex items-center gap-2 uppercase tracking-widest text-sm animate-pulse"><BrainCircuit size={20} /> IA SCAN</h3>
                            <span className="text-[10px] text-slate-500 font-mono border border-slate-700 px-1 rounded bg-black/40">V.2.0</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                            {status === GameStatus.Idle && (<div className="text-center opacity-50 space-y-2"><Scan size={48} className="mx-auto text-slate-600" /><p className="text-xs text-slate-500 uppercase tracking-widest">Aguardando Rodada...</p></div>)}
                            {status === GameStatus.Playing && (
                                <>
                                    <div className="relative">
                                        <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${isAiScanning ? 'border-purple-500 animate-spin border-t-transparent' : 'border-purple-900/50 bg-purple-900/10'}`}><BrainCircuit size={40} className={`text-purple-400 ${isAiScanning ? 'animate-pulse' : ''}`} /></div>
                                        {!isAiScanning && (<div className="absolute -top-2 -right-2 text-purple-300 animate-bounce"><Sparkles size={16} /></div>)}
                                    </div>
                                    <div className="text-center space-y-1 my-2"><h4 className="text-white font-bold text-lg">{isAiScanning ? 'ANALISANDO...' : 'IA PRONTA'}</h4><p className="text-xs text-slate-400 max-w-[200px]">{isAiScanning ? 'Calculando probabilidades de campo seguro...' : 'A IA pode sugerir o próximo campo com maior probabilidade de segurança.'}</p></div>
                                    <Button onClick={handleAskAi} disabled={isAiScanning || aiSuggestion !== null} className={`w-full py-4 mt-auto border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all ${isAiScanning ? 'bg-purple-900/50 cursor-wait' : 'bg-gradient-to-r from-purple-900 to-indigo-900'}`}><div className="flex items-center justify-center gap-2">{isAiScanning ? (<span className="text-xs uppercase tracking-widest">Processando</span>) : (<><Scan size={18} /><span className="text-xs font-bold uppercase tracking-widest">ESCANEAR CAMPO</span></>)}</div></Button>
                                </>
                            )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 uppercase tracking-widest font-mono"><span>Sys: Online</span><span>Lat: 12ms</span></div>
                    </div>
                 </div>
            </div>
        </div>
    </div>
  );
};
