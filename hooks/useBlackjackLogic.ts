
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, GameStatus, GameResult, User, SideBets } from '../types';
import { calculateScore } from '../services/gameLogic';
import { DatabaseService } from '../services/database';

// --- TYPES ---
export interface BjHistoryItem {
    id: number;
    bet: number;
    payout: number;
    result: GameResult;
    timestamp: Date;
}

// --- CONSTANTS ---
export const MIN_BET = 1;
export const MAX_BET = 100;

// --- AUDIO SYSTEM ---
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
                osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(); osc.stop(now + 0.1); break;
            case 'card':
                osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(); osc.stop(now + 0.05); break;
            case 'win':
                osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now + 0.1); osc.frequency.setValueAtTime(659, now + 0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.6); osc.start(); osc.stop(now + 0.6); break;
            case 'lose':
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.start(); osc.stop(now + 0.3); break;
            case 'alert':
                osc.type = 'square'; osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.start(); osc.stop(now + 0.3); break;
        }
    } catch (e) { console.warn("Audio error"); }
};

export const useBlackjackLogic = (user: User, updateUser: (data: Partial<User>) => void) => {
    // Game State
    const [playerHand, setPlayerHand] = useState<Card[]>([]);
    const [dealerHand, setDealerHand] = useState<Card[]>([]);
    const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
    const [bet, setBet] = useState<number>(0);
    const [lastBet, setLastBet] = useState<number>(0); 
    const [result, setResult] = useState<GameResult>(GameResult.None);
    
    // Side Bets & Insurance
    const [sideBets, setSideBets] = useState<SideBets>({ perfectPairs: 0, dealerBust: 0 });
    const [insuranceBet, setInsuranceBet] = useState<number>(0); 
    const [accumulatedWin, setAccumulatedWin] = useState<number>(0); 
    
    // System State
    const [isProcessing, setIsProcessing] = useState(false);
    const [decisionTimer, setDecisionTimer] = useState<number>(10);
    const [fatalError, setFatalError] = useState<boolean>(false);
    const [showProvablyFair, setShowProvablyFair] = useState(false);
    const [serverSeedHash, setServerSeedHash] = useState('');
    const [history, setHistory] = useState<BjHistoryItem[]>([]);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
    
    const isMounted = useRef(true);
    const hasRestored = useRef(false);
    const statusRef = useRef<GameStatus>(GameStatus.Idle);

    // --- COMPUTED ---
    const totalBetInGame = useMemo(() => bet + sideBets.perfectPairs + sideBets.dealerBust + insuranceBet, [bet, sideBets, insuranceBet]);
    const playerScore = useMemo(() => calculateScore(playerHand), [playerHand]);
    const dealerScore = useMemo(() => calculateScore(dealerHand), [dealerHand]);
    const isDealerHidden = dealerHand.some(c => c.isHidden);

    const displayPayout = useMemo(() => {
        if (status !== GameStatus.GameOver) return 0;
        let p = 0;
        if (result === GameResult.Blackjack) p = bet * 2.5;
        else if (result === GameResult.PlayerWin) p = bet * 2;
        else if (result === GameResult.Push) p = bet;
        return p + accumulatedWin;
    }, [status, result, bet, accumulatedWin]);

    // --- LIFECYCLE ---
    useEffect(() => {
        isMounted.current = true;
        statusRef.current = status;
        
        // Timer Logic
        let timer: number;
        if (status === GameStatus.Playing && !fatalError) {
            if (decisionTimer > 0) {
                timer = window.setTimeout(() => setDecisionTimer(prev => prev - 1), 1000);
            } else {
                handleStand();
            }
        }
        return () => {
            isMounted.current = false;
            clearTimeout(timer);
        };
    }, [status, decisionTimer, fatalError]); // Dependências do Effect principal

    // Cleanup: Punish on Leave
    useEffect(() => {
        return () => {
            // Se o jogo estiver ativo ao sair do componente, PUNIR
            if (statusRef.current === GameStatus.Dealing || statusRef.current === GameStatus.Playing || statusRef.current === GameStatus.Insurance) {
                console.log("Abandoning game - Forfeiting...");
                DatabaseService.forfeitGame('BLACKJACK').catch(e => console.error("Forfeit failed", e));
            }
        };
    }, []);

    // Session Restore
    useEffect(() => {
        if (hasRestored.current) return;
        hasRestored.current = true;

        if (user.activeGame && user.activeGame.type === 'BLACKJACK') {
            console.log("Stale game detected on load. Punishing...");
            DatabaseService.forfeitGame('BLACKJACK').then((data: any) => {
                if (data.newBalance !== undefined) updateUser({ balance: data.newBalance });
                setNotifyMsg("Você abandonou a partida anterior. Derrota registrada.");
                setStatus(GameStatus.Idle);
            }).catch(e => console.error(e));
        }
    }, []);

    // --- HELPERS ---
    const playSound = useCallback((type: 'chip' | 'card' | 'win' | 'lose' | 'alert') => {
        if (isMounted.current) playSynthSound(type);
    }, []);

    const getGameUpdates = (data: any): Partial<User> => {
        const updates: Partial<User> = {};
        if (data.newTrophies && Array.isArray(data.newTrophies) && data.newTrophies.length > 0) {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: data.newTrophies }));
            updates.unlockedTrophies = [...new Set([...(user.unlockedTrophies || []), ...data.newTrophies])];
        }
        if (data.completedMissions && Array.isArray(data.completedMissions) && data.completedMissions.length > 0) {
            window.dispatchEvent(new CustomEvent('mission-completed', { detail: data.completedMissions }));
        }
        if (data.missions && Array.isArray(data.missions)) {
            updates.missions = data.missions;
        }
        if (data.newBalance !== undefined) updates.balance = data.newBalance;
        if (data.loyaltyPoints !== undefined) updates.loyaltyPoints = data.loyaltyPoints;
        
        return updates;
    };

    // --- ACTIONS ---
    const handleForceReload = () => window.location.reload();

    const initializeGame = useCallback(() => {
        setPlayerHand([]);
        setDealerHand([]);
        setStatus(GameStatus.Idle);
        setResult(GameResult.None);
        setBet(0);
        setSideBets({ perfectPairs: 0, dealerBust: 0 });
        setInsuranceBet(0); 
        setAccumulatedWin(0); 
        setIsProcessing(false);
        setFatalError(false);
    }, []);

    const handleBet = useCallback((amount: number) => {
        if (isProcessing || fatalError) return;
        if (amount === 0) { setBet(0); setSideBets({ perfectPairs: 0, dealerBust: 0 }); return; }
        const potentialBet = bet + amount;
        
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
            if (action === 'clear') { next = 0; } 
            else if (action === 'double') { next = prev[type] * 2; if (next === 0) next = 5; } 
            else { next = prev[type] === 0 ? 5 : prev[type] === 5 ? 10 : 0; }
            
            if (next > 50) next = 50; 
            if (user.balance < (bet + next - prev[type])) {
                setNotifyMsg("Saldo insuficiente para aposta lateral.");
                return prev;
            }
            playSound('chip');
            return { ...prev, [type]: next };
        });
    }, [bet, user.balance, playSound]);

    const endGame = (res: GameResult) => {
        setResult(res);
        if (res === GameResult.PlayerWin || res === GameResult.Blackjack) playSound('win');
        else if (res === GameResult.DealerWin || res === GameResult.Bust) playSound('lose');

        let mainPayout = 0;
        if (res === GameResult.Blackjack) mainPayout = bet * 2.5;
        else if (res === GameResult.PlayerWin) mainPayout = bet * 2;
        else if (res === GameResult.Push) mainPayout = bet;
        
        const totalPayout = mainPayout + accumulatedWin;
        const totalCost = bet + sideBets.perfectPairs + sideBets.dealerBust + insuranceBet;

        const historyItem: BjHistoryItem = {
            id: Date.now(),
            bet: totalCost,
            payout: totalPayout,
            result: res,
            timestamp: new Date()
        };
        setHistory(prev => [historyItem, ...prev].slice(0, 50));

        setStatus(GameStatus.GameOver);
        setIsProcessing(false);

        // Sync final state safely
        setTimeout(async () => {
            if (!isMounted.current) return;
            try {
                const syncData = await DatabaseService.syncUser(user.id);
                updateUser(syncData);
            } catch(e) {}
        }, 1000);

        setTimeout(() => {
          if (!isMounted.current) return;
          setPlayerHand([]);
          setDealerHand([]);
          setBet(0);
          setSideBets({ perfectPairs: 0, dealerBust: 0 });
          setInsuranceBet(0);
          setAccumulatedWin(0);
          setStatus(GameStatus.Idle);
        }, 3500); 
    };

    const dealCards = async () => {
        const totalBet = bet + sideBets.perfectPairs + sideBets.dealerBust;
        if (bet === 0 || isProcessing || fatalError) return;
        if (bet < MIN_BET) return;
        if (totalBet > user.balance) return setNotifyMsg("Saldo insuficiente.");

        setIsProcessing(true); 
        playSound('chip');
        updateUser({ balance: user.balance - totalBet });

        try {
            const data: any = await DatabaseService.blackjackDeal(user.id, bet, sideBets);
            if (!isMounted.current) return;

            const updates = getGameUpdates(data);
            updateUser(updates);
            
            setStatus(GameStatus.Dealing);
            setLastBet(bet);
            setResult(GameResult.None);
            setInsuranceBet(0);
            setAccumulatedWin(data.sideBetWin || 0);
            setIsProcessing(false); 
            if (data.publicSeed) setServerSeedHash(data.publicSeed);

            const pHand = data.playerHand;
            const dHand = data.dealerHand;
            setPlayerHand([]);
            setDealerHand([]);

            const dealSequence = async () => {
                 if (!isMounted.current) return;
                 playSound('card'); setPlayerHand([pHand[0]]); await new Promise(r => setTimeout(r, 500));
                 if (!isMounted.current) return;
                 setDealerHand([dHand[0]]); playSound('card'); await new Promise(r => setTimeout(r, 500));
                 if (!isMounted.current) return;
                 setPlayerHand([pHand[0], pHand[1]]); playSound('card'); await new Promise(r => setTimeout(r, 500));
                 if (!isMounted.current) return;
                 setDealerHand([dHand[0], dHand[1]]); playSound('card');

                 if (data.status === 'GAME_OVER') {
                     await new Promise(r => setTimeout(r, 500));
                     if (!isMounted.current) return;
                     if (data.dealerHand[1].isHidden === false && dHand[1].isHidden === true) setDealerHand(data.dealerHand);
                     endGame(data.result);
                 } else if (data.status === 'INSURANCE') {
                     await new Promise(r => setTimeout(r, 500));
                     if (!isMounted.current) return;
                     setStatus(GameStatus.Insurance);
                     playSound('alert');
                 } else {
                     setDecisionTimer(10);
                     setStatus(GameStatus.Playing);
                 }
            };
            dealSequence();
        } catch (error: any) {
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
                setInsuranceBet(cost); 
                updateUser({ balance: user.balance - cost }); 
            }
            const data: any = await DatabaseService.blackjackInsurance(user.id, buy);
            if (!isMounted.current) return;
            setIsProcessing(false);
            
            const updates = getGameUpdates(data);
            updateUser(updates);

            if (data.insuranceWin) setAccumulatedWin(prev => prev + data.insuranceWin);
            
            if (data.status === 'GAME_OVER') {
                setDealerHand(data.dealerHand);
                endGame(data.result);
            } else {
                setStatus(GameStatus.Playing);
                setDecisionTimer(10);
            }
        } catch (e: any) {
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
            
            const updates = getGameUpdates(data);
            updateUser(updates);

            setPlayerHand(data.playerHand);
            playSound('card');
            
            if (data.status === 'GAME_OVER') {
                 setDealerHand(data.dealerHand);
                 endGame(data.result);
            }
        } catch (e: any) { 
            console.error("Critical Hit Error", e);
            setFatalError(true);
            setNotifyMsg("Erro crítico de sincronização.");
        } 
    };

    const handleStand = async () => {
        if (isProcessing || fatalError) return;
        setIsProcessing(true);
        try {
            const data: any = await DatabaseService.blackjackStand(user.id);
            if (!isMounted.current) return;
            setIsProcessing(false);
            
            const updates = getGameUpdates(data);
            // Stand returns final balance immediately, so we update here
            updateUser(updates);

            setStatus(GameStatus.DealerTurn);
            if (data.sideBetWin) setAccumulatedWin(prev => prev + data.sideBetWin);

            const animateDealerTurn = async () => {
                 const finalDealerHand = data.dealerHand;
                 let currentDealer = [...dealerHand];
                 if (currentDealer.length >= 2) {
                      currentDealer[1] = finalDealerHand[1]; 
                      setDealerHand([...currentDealer]);     
                      await new Promise(r => setTimeout(r, 400));
                      if (!isMounted.current) return;
                 }
                 for (let i = currentDealer.length; i < finalDealerHand.length; i++) {
                      currentDealer.push(finalDealerHand[i]);
                      setDealerHand([...currentDealer]);
                      playSound('card');
                      await new Promise(r => setTimeout(r, 400));
                      if (!isMounted.current) return;
                 }
                 endGame(data.result);
            }
            animateDealerTurn();
        } catch (e) { 
            setFatalError(true);
            setNotifyMsg("Erro de comunicação.");
            setIsProcessing(false); 
        }
    };

    return {
        // State
        playerHand, dealerHand, status, bet, lastBet, result, sideBets, insuranceBet,
        isProcessing, decisionTimer, fatalError, showProvablyFair, serverSeedHash,
        history, showFullHistory, notifyMsg,
        
        // Computed
        totalBetInGame, playerScore, dealerScore, isDealerHidden, displayPayout,
        
        // Setters
        setShowProvablyFair, setShowFullHistory, setNotifyMsg,
        
        // Actions
        handleForceReload, initializeGame, handleBet, handleSideBetAction,
        dealCards, handleInsurance, handleHit, handleStand
    };
};
