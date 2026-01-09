import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, GameStatus, Card } from '../types';
import { DatabaseService } from '../services/database';

export interface BaccaratState {
    pHand: Card[];
    bHand: Card[];
    pScore: number;
    bScore: number;
    winner: 'PLAYER' | 'BANKER' | 'TIE' | null;
}

export type BaccaratBetType = 'PLAYER' | 'BANKER' | 'TIE' | 'PAIR_PLAYER' | 'PAIR_BANKER';

export interface RoadmapItem {
    winner: 'PLAYER' | 'BANKER' | 'TIE';
    score: string; // "P8-B6"
    pair: 'NONE' | 'PLAYER' | 'BANKER' | 'BOTH';
}

export interface BaccHistoryItem {
    id: number;
    winner: 'PLAYER' | 'BANKER' | 'TIE';
    bet: number;
    payout: number;
    timestamp: Date;
}

const MIN_BET = 1;
const MAX_BET = 500;

// Audio Helper (Simpler version of existing ones)
const playSound = (type: 'chip' | 'card' | 'win' | 'tie') => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'chip') {
            osc.frequency.setValueAtTime(1200, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(); osc.stop(now + 0.1);
        } else if (type === 'card') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(); osc.stop(now + 0.1);
        } else if (type === 'win') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(); osc.stop(now + 0.5);
        }
    } catch (e) {}
};

export const useBaccaratLogic = (user: User, updateUser: (data: Partial<User>) => void) => {
    const [status, setStatus] = useState<GameStatus>(GameStatus.Idle);
    const [bets, setBets] = useState<Record<BaccaratBetType, number>>({
        PLAYER: 0, BANKER: 0, TIE: 0, PAIR_PLAYER: 0, PAIR_BANKER: 0
    });
    const [lastBets, setLastBets] = useState<Record<BaccaratBetType, number> | null>(null);
    const [gameState, setGameState] = useState<BaccaratState>({
        pHand: [], bHand: [], pScore: 0, bScore: 0, winner: null
    });
    const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
    const [history, setHistory] = useState<BaccHistoryItem[]>([]);
    const [selectedChip, setSelectedChip] = useState(5);
    const [payout, setPayout] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
    const [serverSeedHash, setServerSeedHash] = useState<string>(''); // Added for Provably Fair

    const isMounted = useRef(true);

    const totalBet = useMemo(() => Object.values(bets).reduce((a: number, b: number) => a + b, 0), [bets]);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const placeBet = (type: BaccaratBetType) => {
        if (status !== GameStatus.Idle) return;
        const newTotal = totalBet + selectedChip;
        if (newTotal > user.balance) {
            setNotifyMsg("Saldo insuficiente");
            return;
        }
        if (newTotal > MAX_BET) {
            setNotifyMsg(`Limite máximo da mesa é R$ ${MAX_BET}`);
            return;
        }
        playSound('chip');
        setBets(prev => ({ ...prev, [type]: prev[type] + selectedChip }));
    };

    const clearBets = () => {
        if (status !== GameStatus.Idle) return;
        setBets({ PLAYER: 0, BANKER: 0, TIE: 0, PAIR_PLAYER: 0, PAIR_BANKER: 0 });
    };

    const rebet = () => {
        if (status !== GameStatus.Idle || !lastBets) return;
        const lastTotal = Object.values(lastBets).reduce((a: number, b: number) => a + b, 0);
        if (lastTotal > user.balance) {
            setNotifyMsg("Saldo insuficiente para repetir");
            return;
        }
        setBets(lastBets);
        playSound('chip');
    };

    const deal = async () => {
        if (totalBet === 0 || loading) return;
        setLoading(true);
        setLastBets(bets);
        
        // Deduz saldo visualmente
        const currentBalance = user.balance;
        updateUser({ balance: currentBalance - totalBet });

        try {
            const data: any = await DatabaseService.baccaratDeal(user.id, bets);
            if (!isMounted.current) return;

            setLoading(false);
            setStatus(GameStatus.Dealing);
            setGameState({ pHand: [], bHand: [], pScore: 0, bScore: 0, winner: null });
            
            // Set Public Hash for Provably Fair immediately
            if (data.publicSeed) { // Assuming backend sends publicSeed in the response
                 setServerSeedHash(data.publicSeed);
            } else if (data.serverSeed) {
                 // Fallback if backend sends raw seed (should not happen in prod, but safe handle)
                 setServerSeedHash("Hash Protegido"); 
            }

            // Animation Sequence
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
            
            // Reveal Cards
            const finalPHand = data.pHand;
            const finalBHand = data.bHand;
            
            // Initial 2 cards
            playSound('card');
            setGameState(prev => ({ ...prev, pHand: [finalPHand[0]] }));
            await delay(600);
            playSound('card');
            setGameState(prev => ({ ...prev, bHand: [finalBHand[0]] }));
            await delay(600);
            playSound('card');
            setGameState(prev => ({ ...prev, pHand: [finalPHand[0], finalPHand[1]] }));
            await delay(600);
            playSound('card');
            setGameState(prev => ({ ...prev, bHand: [finalBHand[0], finalBHand[1]] }));
            await delay(800);

            // Third Card Player
            if (finalPHand.length > 2) {
                playSound('card');
                setGameState(prev => ({ ...prev, pHand: finalPHand }));
                await delay(800);
            }

            // Third Card Banker
            if (finalBHand.length > 2) {
                playSound('card');
                setGameState(prev => ({ ...prev, bHand: finalBHand }));
                await delay(800);
            }

            setGameState({
                pHand: finalPHand,
                bHand: finalBHand,
                pScore: data.pScore,
                bScore: data.bScore,
                winner: data.winner
            });

            setPayout(data.payout);
            updateUser({ balance: data.newBalance });
            
            if (data.payout > 0) playSound('win');

            // Update Roadmap
            setRoadmap(prev => {
                const newItem: RoadmapItem = {
                    winner: data.winner,
                    score: `P${data.pScore}-B${data.bScore}`,
                    pair: 'NONE' // Simplified for demo
                };
                return [newItem, ...prev].slice(0, 48);
            });

            // Update History (Sidebar)
            setHistory(prev => {
                const newItem: BaccHistoryItem = {
                    id: Date.now(),
                    winner: data.winner,
                    bet: totalBet,
                    payout: data.payout,
                    timestamp: new Date()
                };
                return [newItem, ...prev].slice(0, 20);
            });

            setStatus(GameStatus.GameOver);
            setTimeout(() => {
                if (isMounted.current) {
                    setStatus(GameStatus.Idle);
                    setBets({ PLAYER: 0, BANKER: 0, TIE: 0, PAIR_PLAYER: 0, PAIR_BANKER: 0 });
                }
            }, 3000);

        } catch (e: any) {
            setLoading(false);
            setNotifyMsg("Erro na rodada");
            updateUser({ balance: currentBalance }); // Refund visual
        }
    };

    return {
        status, bets, gameState, roadmap, history, selectedChip, payout, loading, notifyMsg, totalBet, lastBets, serverSeedHash,
        setSelectedChip, placeBet, clearBets, rebet, deal, setNotifyMsg
    };
};