
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User, GameStatus } from '../types';
import { DatabaseService } from '../services/database';

// --- TYPES & CONSTANTS ---
export interface Tile {
  id: number;
  isRevealed: boolean;
  content: 'unknown' | 'gem' | 'mine'; 
}

const MIN_BET = 1;
const MAX_BET = 100;
const GRID_SIZE = 25;

const MINES_MULTIPLIERS: { [key: number]: number[] } = {
    1: [1.01, 1.05, 1.10, 1.15, 1.21, 1.27, 1.34, 1.42, 1.51, 1.60, 1.71, 1.83, 1.97, 2.13, 2.31, 2.52, 2.77, 3.08, 3.46, 3.96, 4.62, 5.54, 6.93, 9.24],
    2: [1.06, 1.13, 1.21, 1.30, 1.40, 1.52, 1.65, 1.81, 1.99, 2.20, 2.45, 2.75, 3.11, 3.56, 4.13, 4.85, 5.82, 7.16, 9.09, 12.01, 16.82, 25.72, 45.01],
    3: [1.11, 1.22, 1.36, 1.52, 1.71, 1.95, 2.24, 2.61, 3.08, 3.69, 4.51, 5.63, 7.23, 9.58, 13.18, 18.98, 28.98, 47.96, 88.73, 192.25, 576.75],
    5: [1.21, 1.45, 1.77, 2.21, 2.83, 3.73, 5.06, 7.11, 10.39, 15.87, 25.56, 43.82, 81.38, 167.31, 390.39, 1093.09, 4153.74, 24922.44],
    10: [1.58, 2.64, 4.58, 8.39, 16.32, 34.27, 78.33, 198.44, 578.78, 2025.75, 9115.86, 60772.43]
};

const getMinesMultiplierPreview = (minesCount: number, nextRevealedCount: number): number => {
    if (MINES_MULTIPLIERS[minesCount]) {
        if (nextRevealedCount <= 0) return 1.0;
        const index = nextRevealedCount - 1;
        if (index < MINES_MULTIPLIERS[minesCount].length) {
            return MINES_MULTIPLIERS[minesCount][index];
        }
    }
    // Fallback calculation logic
    let multiplier = 1.0;
    const houseEdge = 0.97;
    for (let i = 0; i < nextRevealedCount; i++) {
        const tilesLeft = 25 - i;
        const safeLeft = 25 - minesCount - i;
        if (safeLeft <= 0) break;
        multiplier *= (1 / (safeLeft / tilesLeft));
    }
    return parseFloat((multiplier * houseEdge).toFixed(2));
};

// --- AUDIO SYSTEM ---
let audioCtx: AudioContext | null = null;

const playSynthSound = (type: 'gem' | 'bomb' | 'click' | 'cashout' | 'scan') => {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

        const ctx = audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'gem') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(); osc.stop(now + 0.15);
        } else if (type === 'bomb') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.5); gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.start(); osc.stop(now + 0.5);
        } else if (type === 'cashout') {
             osc.type = 'square'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1); osc.frequency.setValueAtTime(783.99, now + 0.2); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.4); osc.start(); osc.stop(now + 0.4);
        } else if (type === 'click') {
             osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.02, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); osc.start(); osc.stop(now + 0.05);
        } else if (type === 'scan') {
             osc.type = 'sine'; osc.frequency.setValueAtTime(1000, now); osc.frequency.linearRampToValueAtTime(500, now + 0.2); gain.gain.setValueAtTime(0.02, now); gain.gain.linearRampToValueAtTime(0, now + 0.2); osc.start(); osc.stop(now + 0.2);
        }
    } catch (e) { console.warn('Audio not supported'); }
};

// --- HOOK ---
export const useMinesLogic = (user: User, updateUser: (data: Partial<User>) => void) => {
    // Game State
    const [grid, setGrid] = useState<Tile[]>(Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' })));
    const [mineCount, setMineCount] = useState<number>(3);
    const [bet, setBet] = useState<number>(5);
    const [betInput, setBetInput] = useState<string>("5.00");
    const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
    const [revealedCount, setRevealedCount] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [profit, setProfit] = useState<number>(0);
    const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
    const [fatalError, setFatalError] = useState<boolean>(false);
    const [serverSeedHash, setServerSeedHash] = useState<string>('');
    const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

    // AI & Visuals State
    const [aiSuggestion, setAiSuggestion] = useState<number | null>(null);
    const [isAiScanning, setIsAiScanning] = useState<boolean>(false);
    const [cashoutWin, setCashoutWin] = useState<number | null>(null);
    const [lossPopup, setLossPopup] = useState<boolean>(false);
    const [loadingTileId, setLoadingTileId] = useState<number | null>(null);

    const gameOverTimeoutRef = useRef<number | null>(null);
    const isMounted = useRef(true);
    const hasRestored = useRef(false);

    // --- COMPUTED ---
    const nextMultiplierPreview = useMemo(() => 
        getMinesMultiplierPreview(mineCount, revealedCount + 1), 
    [mineCount, revealedCount]);

    const currentWinValue = useMemo(() => {
        if (status !== GameStatus.Playing) return 0;
        if (profit > 0) return profit;
        if (revealedCount > 0 && currentMultiplier > 1.0) return bet * currentMultiplier;
        return 0;
    }, [status, profit, revealedCount, currentMultiplier, bet]);

    // --- LIFECYCLE ---
    useEffect(() => {
        isMounted.current = true;
        return () => { 
            isMounted.current = false; 
            if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
        };
    }, []);

    // Helper: Achievements
    const checkAchievements = (data: any) => {
        if (data.newTrophies && Array.isArray(data.newTrophies) && data.newTrophies.length > 0) {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: data.newTrophies }));
            updateUser({ unlockedTrophies: [...new Set([...(user.unlockedTrophies || []), ...data.newTrophies])] });
        }
    };

    // Helper: Sound
    const playSound = useCallback((type: 'gem' | 'bomb' | 'click' | 'cashout' | 'scan') => {
        if (soundEnabled && isMounted.current) playSynthSound(type);
    }, [soundEnabled]);

    // Session Restore
    useEffect(() => {
        if (hasRestored.current) return;
        hasRestored.current = true;

        if (user.activeGame && user.activeGame.type === 'MINES') {
            const savedGame = user.activeGame;
            setBet(savedGame.bet);
            setBetInput(savedGame.bet.toFixed(2));
            setMineCount(savedGame.minesCount || 3);
            setStatus(GameStatus.Playing);
            setCurrentMultiplier(savedGame.minesMultiplier || 1.0);
            if (savedGame.publicSeed) setServerSeedHash(savedGame.publicSeed);

            const restoredGrid: Tile[] = Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' }));
            let rCount = 0;
            if (savedGame.minesRevealed) {
                savedGame.minesRevealed.forEach(idx => {
                    restoredGrid[idx].isRevealed = true;
                    restoredGrid[idx].content = 'gem'; 
                    rCount++;
                });
            }
            setGrid(restoredGrid);
            setRevealedCount(rCount);
        }
    }, []);

    // Popup Cleanup
    useEffect(() => {
        if (cashoutWin !== null || lossPopup) {
            const timer = setTimeout(() => {
                if(isMounted.current) {
                    setCashoutWin(null);
                    setLossPopup(false);
                }
            }, 2000); 
            return () => clearTimeout(timer);
        }
    }, [cashoutWin, lossPopup]);

    // --- ACTIONS ---
    const handleForceReload = () => window.location.reload();

    const handleBetChange = useCallback((val: string) => {
        if (status !== GameStatus.Idle || fatalError) return;
        if (val === '' || /^\d+(\.\d{0,2})?$/.test(val)) {
            setBetInput(val);
            const numVal = parseFloat(val);
            if (!isNaN(numVal)) setBet(numVal);
            else setBet(0);
        }
    }, [status, fatalError]);

    const handleBetBlur = useCallback(() => {
        let numVal = parseFloat(betInput);
        if (isNaN(numVal)) numVal = MIN_BET;
        if (numVal < MIN_BET) numVal = MIN_BET;
        if (numVal > MAX_BET) numVal = MAX_BET;
        setBet(numVal);
        setBetInput(numVal.toFixed(2));
    }, [betInput]);

    const adjustBet = useCallback((type: 'half' | 'double') => {
        if (status !== GameStatus.Idle || fatalError) return;
        let newVal = type === 'half' ? bet / 2 : bet * 2;
        if (newVal < MIN_BET) newVal = MIN_BET;
        if (newVal > MAX_BET) newVal = MAX_BET;
        if (newVal > user.balance) newVal = Math.max(MIN_BET, user.balance);
        newVal = Math.floor(newVal * 100) / 100;
        setBet(newVal);
        setBetInput(newVal.toFixed(2));
    }, [bet, status, user.balance, fatalError]);

    const handleAskAi = useCallback(() => {
        if (status !== GameStatus.Playing || isAiScanning || fatalError) return;
        setIsAiScanning(true);
        setAiSuggestion(null);
        playSound('click');
        setTimeout(() => {
            if(!isMounted.current) return;
            const availableTiles = grid.filter(t => !t.isRevealed).map(t => t.id);
            if (availableTiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableTiles.length);
                setAiSuggestion(availableTiles[randomIndex]);
                playSound('scan');
            }
            setIsAiScanning(false);
        }, 700);
    }, [status, isAiScanning, fatalError, grid, playSound]);

    const startGame = async () => {
        if (gameOverTimeoutRef.current) { clearTimeout(gameOverTimeoutRef.current); gameOverTimeoutRef.current = null; }
        setCashoutWin(null); setLossPopup(false); setAiSuggestion(null); setFatalError(false);

        if (bet < MIN_BET) return setNotifyMsg(`Mínimo: R$ ${MIN_BET.toFixed(2)}`);
        if (bet > MAX_BET) return setNotifyMsg(`Máximo: R$ ${MAX_BET.toFixed(2)}`);
        if (bet > user.balance) return setNotifyMsg("Saldo insuficiente.");

        setIsProcessing(true); playSound('click');
        const currentBalance = user.balance;
        updateUser({ balance: currentBalance - bet });

        try {
            const response: any = await DatabaseService.minesStart(user.id, bet, mineCount);
            if(!isMounted.current) return;

            setStatus(GameStatus.Playing);
            updateUser({ balance: response.newBalance, loyaltyPoints: response.loyaltyPoints });
            if (response.publicSeed) setServerSeedHash(response.publicSeed);

            setGrid(Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' })));
            setRevealedCount(0);
            setProfit(0);
            setCurrentMultiplier(1.0);
        } catch (e: any) {
            updateUser({ balance: currentBalance });
            setNotifyMsg(e.message || "Erro ao iniciar rodada.");
            setStatus(GameStatus.Idle);
        } finally {
            if(isMounted.current) setIsProcessing(false);
        }
    };

    const handleTileClick = async (index: number) => {
        if (status !== GameStatus.Playing || grid[index].isRevealed || isProcessing || loadingTileId !== null || fatalError) return;
        setLoadingTileId(index);
        if (aiSuggestion !== null) setAiSuggestion(null);

        try {
            const result = await DatabaseService.minesReveal(user.id, index);
            if(!isMounted.current) return;
            checkAchievements(result);

            const newGrid = [...grid];
            newGrid[index].isRevealed = true;

            if (result.outcome === 'BOMB') {
                newGrid[index].content = 'mine';
                setStatus(GameStatus.GameOver);
                playSound('bomb');
                setLossPopup(true);
                if (result.newBalance !== undefined) updateUser({ balance: result.newBalance, loyaltyPoints: result.loyaltyPoints });
                if (result.mines) {
                    result.mines.forEach((mineIdx: number) => {
                        newGrid[mineIdx].content = 'mine';
                        newGrid[mineIdx].isRevealed = true;
                    });
                }
                gameOverTimeoutRef.current = window.setTimeout(() => {
                    if(isMounted.current) setStatus(GameStatus.Idle);
                    gameOverTimeoutRef.current = null;
                }, 2000);
            } else {
                newGrid[index].content = 'gem';
                playSound('gem');
                setRevealedCount(prev => prev + 1);
                setProfit(result.profit);
                setCurrentMultiplier(result.multiplier);
                if (result.newBalance !== undefined) updateUser({ balance: result.newBalance, loyaltyPoints: result.loyaltyPoints });

                if (result.status === 'WIN_ALL') {
                    setStatus(GameStatus.GameOver);
                    playSound('cashout');
                    setCashoutWin(result.profit);
                    if (result.mines) {
                        result.mines.forEach((mineIdx: number) => {
                            newGrid[mineIdx].content = 'mine';
                            newGrid[mineIdx].isRevealed = true; 
                        });
                    }
                    gameOverTimeoutRef.current = window.setTimeout(() => {
                        if(isMounted.current) { setStatus(GameStatus.Idle); setProfit(0); }
                        gameOverTimeoutRef.current = null;
                    }, 3000);
                }
            }
            setGrid(newGrid);
        } catch (error: any) {
            if (error.message && (error.message.includes("não encontrado") || error.message.includes("expirado"))) {
                setNotifyMsg("Sessão expirada.");
                setStatus(GameStatus.Idle);
                setGrid(Array.from({ length: GRID_SIZE }, (_, i) => ({ id: i, isRevealed: false, content: 'unknown' })));
            } else {
                setFatalError(true);
                setNotifyMsg("Erro crítico.");
            }
        } finally {
            if(isMounted.current) setLoadingTileId(null);
        }
    };

    const handleCashout = async () => {
        if (status !== GameStatus.Playing || isProcessing || loadingTileId !== null || fatalError) return;
        setIsProcessing(true);
        try {
            const result = await DatabaseService.minesCashout(user.id);
            if(!isMounted.current) return;
            checkAchievements(result);
            updateUser({ balance: result.newBalance, loyaltyPoints: result.loyaltyPoints });
            playSound('cashout');
            
            const winValue = result.profit || currentWinValue; 
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
            setTimeout(() => { if(isMounted.current) setProfit(0); }, 2000);
        } catch (e: any) {
            if (e.message && (e.message.includes("não encontrado") || e.message.includes("expirado"))) {
                setStatus(GameStatus.Idle); setProfit(0);
            }
            setNotifyMsg(e.message || "Erro ao realizar saque.");
        } finally {
            if(isMounted.current) setIsProcessing(false);
        }
    };

    return {
        grid, mineCount, bet, betInput, status, revealedCount, isProcessing, soundEnabled, profit, currentMultiplier, fatalError, serverSeedHash, notifyMsg,
        aiSuggestion, isAiScanning, cashoutWin, lossPopup, loadingTileId, nextMultiplierPreview, currentWinValue,
        GRID_SIZE, MIN_BET, MAX_BET,
        actions: {
            setMineCount, setSoundEnabled, setNotifyMsg,
            handleForceReload, handleBetChange, handleBetBlur, adjustBet,
            startGame, handleTileClick, handleCashout, handleAskAi
        }
    };
};
