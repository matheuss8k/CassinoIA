
import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '../types';
import { DatabaseService } from '../services/database';

// --- TYPES ---
export interface SpinHistoryItem {
    id: number;
    amount: number;
    win: number;
    multiplier: number;
    timestamp: Date;
}

export interface AutoSpinConfig {
    stopLoss: number;
    stopWin: number;
    initialBalance: number;
}

// --- UTILS ---
const sanitizeCurrencyInput = (value: string): string => {
    let sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) {
        sanitized = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 2) {
        sanitized = parts[0] + '.' + parts[1].slice(0, 2);
    }
    return sanitized;
};

// --- AUDIO SYSTEM ---
let audioCtx: AudioContext | null = null;

const playSynthSound = (type: 'spin_start' | 'stop' | 'win_small' | 'win_big' | 'multiplier'): OscillatorNode | null => {
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

        if (type === 'spin_start') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(150, now + 0.3);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0.02, now + 0.3);
            osc.start();
            
            const originalStop = osc.stop.bind(osc);
            osc.stop = (time?: number) => {
                const t = time || ctx.currentTime;
                gain.gain.cancelScheduledValues(t);
                gain.gain.setValueAtTime(gain.gain.value, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.05);
                try { originalStop(t + 0.05); } catch(e) {}
            };
            return osc; 
        } else if (type === 'stop') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(); osc.stop(now + 0.05);
        } else if (type === 'win_small') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.start(); osc.stop(now + 0.4);
        } else if (type === 'multiplier') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.5);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(); osc.stop(now + 0.5);
        } else if (type === 'win_big') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.1);
            osc.frequency.linearRampToValueAtTime(400, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(); osc.stop(now + 0.6);
        }
        return null;
    } catch (e) { console.warn('Audio error'); return null; }
};

export const useTigerLogic = (user: User, updateUser: (data: Partial<User>) => void) => {
    // Game State
    const [grid, setGrid] = useState<string[]>(Array(9).fill('orange'));
    const [bet, setBet] = useState<number>(5);
    const [betInputValue, setBetInputValue] = useState<string>('5.00');
    
    const [isSpinning, setIsSpinning] = useState<boolean>(false);
    const [winningLines, setWinningLines] = useState<number[]>([]);
    const [winAmount, setWinAmount] = useState<number>(0);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [isFullScreenWin, setIsFullScreenWin] = useState<boolean>(false);
    
    // Auto Spin State
    const [autoSpinActive, setAutoSpinActive] = useState(false);
    const [autoSpinCount, setAutoSpinCount] = useState(0);
    const [autoSpinConfig, setAutoSpinConfig] = useState<AutoSpinConfig>({ stopLoss: 0, stopWin: 0, initialBalance: 0 });
    const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);

    // History & System State
    const [history, setHistory] = useState<SpinHistoryItem[]>([]);
    const [serverSeedHash, setServerSeedHash] = useState('');
    const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

    const spinAudioRef = useRef<OscillatorNode | null>(null);
    const isMounted = useRef(true);

    const MIN_BET = 1;
    const MAX_BET = 50;

    // --- LIFECYCLE ---
    useEffect(() => {
        isMounted.current = true;
        return () => { 
            isMounted.current = false;
            stopSpinSound();
            if (audioCtx && audioCtx.state === 'running') {
                try { audioCtx.suspend(); } catch(e) {}
            }
        };
    }, []);

    // --- HELPERS ---
    const checkAchievements = (data: any) => {
        if (data.newTrophies && Array.isArray(data.newTrophies) && data.newTrophies.length > 0) {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: data.newTrophies }));
            const currentTrophies = user.unlockedTrophies || [];
            updateUser({ unlockedTrophies: [...new Set([...currentTrophies, ...data.newTrophies])] });
        }
    };

    const playSound = useCallback((type: 'spin_start' | 'stop' | 'win_small' | 'win_big' | 'multiplier') => {
        if (!soundEnabled) return;
        if (type === 'spin_start') {
            if (spinAudioRef.current) { try { spinAudioRef.current.stop(); } catch(e){} }
            const osc = playSynthSound('spin_start');
            spinAudioRef.current = osc;
        } else {
            playSynthSound(type);
        }
    }, [soundEnabled]);

    const stopSpinSound = useCallback(() => {
        if (spinAudioRef.current) {
            try { spinAudioRef.current.stop(); } catch(e){}
            spinAudioRef.current = null;
        }
    }, []);

    // --- AUTO SPIN LOOP ---
    useEffect(() => {
        if (!autoSpinActive) return;
        if (autoSpinCount <= 0) { stopAutoSpin(); return; }
        if (!isSpinning) {
             if (bet > user.balance) { setNotifyMsg("Saldo insuficiente. Auto Spin parado."); stopAutoSpin(); return; }
             if (autoSpinConfig.stopLoss > 0 && (autoSpinConfig.initialBalance - user.balance) >= autoSpinConfig.stopLoss) { setNotifyMsg("Limite de perda atingido. Auto Spin parado."); stopAutoSpin(); return; }
             const timer = setTimeout(() => { handleSpin(true); }, 800); // Faster auto spin loop
             return () => clearTimeout(timer);
        }
    }, [autoSpinActive, isSpinning, autoSpinCount, user.balance]); 

    // --- ACTIONS ---
    const stopAutoSpin = useCallback(() => {
        setAutoSpinActive(false);
        setAutoSpinCount(0);
    }, []);

    const handleStartAuto = useCallback((count: number, stopLoss: number, stopWin: number) => {
        setIsAutoModalOpen(false);
        if (count > 0) {
            setAutoSpinConfig({ stopLoss, stopWin, initialBalance: user.balance });
            setAutoSpinCount(count);
            setAutoSpinActive(true);
        }
    }, [user.balance]);

    const handleBetChange = useCallback((val: string) => {
        if (isSpinning || autoSpinActive) return;
        if (val === '') { setBetInputValue(''); setBet(0); return; }
        const sanitized = sanitizeCurrencyInput(val);
        setBetInputValue(sanitized);
        const parsed = parseFloat(sanitized);
        if (!isNaN(parsed)) { setBet(parsed); }
    }, [isSpinning, autoSpinActive]);

    const handleBetBlur = useCallback(() => {
        let val = parseFloat(betInputValue);
        if (isNaN(val)) val = MIN_BET;
        if (val < MIN_BET) val = MIN_BET;
        if (val > MAX_BET) val = MAX_BET;
        if (val > user.balance) val = Math.max(MIN_BET, user.balance);
        setBet(val);
        setBetInputValue(val.toFixed(2));
    }, [betInputValue, user.balance]);

    const adjustBet = useCallback((type: 'half' | 'double') => {
        if (isSpinning || autoSpinActive) return;
        let newVal = bet;
        if (type === 'half') newVal = Math.max(MIN_BET, Math.floor(bet / 2));
        if (type === 'double') newVal = Math.min(MAX_BET, bet * 2);
        if (newVal > user.balance) newVal = Math.max(MIN_BET, user.balance);
        setBet(newVal);
        setBetInputValue(newVal.toFixed(2));
    }, [bet, isSpinning, autoSpinActive, user.balance]);

    const handleSpin = async (isAuto = false) => {
        if (isSpinning) return;
        if (bet < MIN_BET) return setNotifyMsg(`Aposta mínima de R$ ${MIN_BET}`);
        if (bet > MAX_BET) return setNotifyMsg(`Aposta máxima de R$ ${MAX_BET}`);
        if (bet > user.balance) { if (isAuto) stopAutoSpin(); return setNotifyMsg("Saldo insuficiente para jogar."); }

        setIsSpinning(true);
        setWinningLines([]);
        setWinAmount(0);
        setIsFullScreenWin(false);
        playSound('spin_start');
        
        const currentBalance = user.balance;
        updateUser({ balance: currentBalance - bet });

        if (isAuto) { setAutoSpinCount(prev => prev - 1); }

        try {
            // Tempo de giro reduzido para 700ms para sensação mais ágil
            const minSpinTime = 700; 
            const startTime = Date.now();

            const response: any = await DatabaseService.tigerSpin(user.id, bet);
            
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minSpinTime - elapsedTime);

            await new Promise(r => setTimeout(r, remainingTime));

            if (!isMounted.current) return;

            stopSpinSound();
            setGrid(response.grid);
            if (response.publicSeed) setServerSeedHash(response.publicSeed);
            
            checkAchievements(response);

            updateUser({ balance: response.newBalance, loyaltyPoints: response.loyaltyPoints });
            playSound('stop');
            
            const newItem: SpinHistoryItem = { id: Date.now(), amount: bet, win: response.totalWin, multiplier: response.totalWin > 0 ? response.totalWin / bet : 0, timestamp: new Date() };
            setHistory(prev => [newItem, ...prev].slice(0, 50));

            if (response.totalWin > 0) {
                if(!isMounted.current) return;
                setWinningLines(response.winningLines);
                setWinAmount(response.totalWin);
                setIsFullScreenWin(response.isFullScreen);
                if (response.isFullScreen) playSound('multiplier');
                else playSound(response.totalWin > bet * 10 ? 'win_big' : 'win_small');
                if (isAuto && autoSpinConfig.stopWin > 0 && response.totalWin >= autoSpinConfig.stopWin) { 
                    stopAutoSpin(); 
                    setNotifyMsg(`Limite de ganho atingido (R$ ${response.totalWin}). Auto Spin parado.`); 
                }
            }
        } catch (e: any) {
            updateUser({ balance: currentBalance });
            stopSpinSound();
            if (isAuto) stopAutoSpin();
            setNotifyMsg(e.message || "Erro no giro.");
        } finally {
            if(isMounted.current) setIsSpinning(false);
        }
    };

    return {
        grid, bet, betInputValue, isSpinning, winningLines, winAmount, soundEnabled, isFullScreenWin,
        autoSpinActive, autoSpinCount, isAutoModalOpen, history, serverSeedHash, notifyMsg,
        MIN_BET, MAX_BET,
        actions: {
            setSoundEnabled, setIsAutoModalOpen, setNotifyMsg,
            handleBetChange, handleBetBlur, adjustBet,
            handleSpin, handleStartAuto, stopAutoSpin
        }
    };
};
