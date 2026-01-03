
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { DatabaseService } from '../services/database';
import { Button } from './UI/Button';
import { Volume2, VolumeX, Sparkles, Gem, Flame, Crown, Zap, Gift, Citrus, Coins, Info, Lock, BrainCircuit, Activity, BarChart3 } from 'lucide-react';
import { Notification } from './UI/Notification';

interface TigerGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

const MIN_BET = 1;
const MAX_BET = 50;

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
            osc.disconnect();
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600; 
            filter.Q.value = 1;
            osc.connect(filter);
            filter.connect(gain);
            osc.type = 'triangle'; 
            osc.frequency.setValueAtTime(100, now);
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 8; 
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 10; 
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.2);
            osc.start();
            
            // Clean up helper
            const originalStop = osc.stop.bind(osc);
            osc.stop = (time?: number) => {
                const t = time || ctx.currentTime;
                gain.gain.cancelScheduledValues(t);
                gain.gain.setValueAtTime(gain.gain.value, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.1);
                try { lfo.stop(t + 0.1); originalStop(t + 0.1); } catch(e) {}
            };
            return osc; 
        } else if (type === 'stop') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(); osc.stop(now + 0.1);
        } else if (type === 'win_small') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1108, now + 0.1); 
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.start(); osc.stop(now + 0.4);
        } else if (type === 'multiplier') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 1.0);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            osc.start(); osc.stop(now + 1.0);
        }
        return null;
    } catch (e) { console.warn('Audio error'); return null; }
};

// --- SYMBOLS ---
const TigerIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full">
        <div className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full animate-pulse"></div>
        <div className="text-4xl filter drop-shadow-[0_0_10px_rgba(234,179,8,0.8)] z-10 scale-125">🐯</div>
        <Crown size={16} className="absolute -top-3 left-1/2 -translate-x-1/2 text-yellow-300 fill-yellow-500 animate-bounce drop-shadow-md" />
        <div className="absolute bottom-0 text-[8px] font-black text-yellow-300 tracking-widest uppercase bg-black/60 px-2 rounded-full border border-yellow-500/50">WILD</div>
    </div>
);

const DiamondIcon = () => (
    <div className="relative">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-300 drop-shadow-[0_0_10px_cyan]">
            <path d="M6 3h12l4 6-10 13L2 9z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" />
        </svg>
        <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full"></div>
    </div>
);

const SYMBOLS: {[key: string]: { icon: React.ReactNode, bg: string, border: string, glow: string }} = {
    'orange': { icon: <Citrus size={36} className="text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]" />, bg: 'bg-gradient-to-br from-orange-900/40 to-black', border: 'border-orange-500/30', glow: 'shadow-orange-500/20' },
    'firecracker': { icon: <Flame size={36} className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />, bg: 'bg-gradient-to-br from-red-900/40 to-black', border: 'border-red-500/30', glow: 'shadow-red-500/20' },
    'envelope': { icon: <Gift size={36} className="text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />, bg: 'bg-gradient-to-br from-rose-900/40 to-black', border: 'border-rose-500/30', glow: 'shadow-rose-500/20' },
    'bag': { icon: <Coins size={36} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" />, bg: 'bg-gradient-to-br from-yellow-900/40 to-black', border: 'border-yellow-500/30', glow: 'shadow-yellow-500/20' },
    'statue': { icon: <Gem size={36} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />, bg: 'bg-gradient-to-br from-emerald-900/40 to-black', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' },
    'jewel': { icon: <DiamondIcon />, bg: 'bg-gradient-to-br from-cyan-900/40 to-black', border: 'border-cyan-500/30', glow: 'shadow-cyan-500/20' },
    'wild': { icon: <TigerIcon />, bg: 'bg-gradient-to-br from-yellow-600/50 via-yellow-900/50 to-black', border: 'border-yellow-400', glow: 'shadow-yellow-500/50' }
};

// --- MEMOIZED SUB-COMPONENTS ---

const PaylinesOverlay = React.memo(({ winningLines, isSpinning }: { winningLines: number[], isSpinning: boolean }) => {
    if (winningLines.length === 0 || isSpinning) return null;
    return (
        <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
            <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
            {winningLines.map(lineIdx => {
                let y1 = '50%', y2 = '50%';
                if (lineIdx === 0) { y1='16%'; y2='16%'; } // Top
                if (lineIdx === 2) { y1='84%'; y2='84%'; } // Bottom
                if (lineIdx === 3) { y1='10%'; y2='90%'; } // Diag \
                if (lineIdx === 4) { y1='90%'; y2='10%'; } // Diag /
                return (
                    <line key={lineIdx} x1="5%" y1={y1} x2="95%" y2={y2} stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" filter="url(#glow)" className="animate-pulse opacity-80" />
                );
            })}
        </svg>
    );
});

const TigerAI = React.memo(({ isSpinning }: { isSpinning: boolean }) => {
    const [volatility, setVolatility] = useState(94);
    const [status, setStatus] = useState("ANALISANDO PRÓX. CICLO");
    
    useEffect(() => {
        if(isSpinning) {
            setStatus("CALCULANDO RNG...");
            const interval = setInterval(() => {
                setVolatility(Math.floor(Math.random() * (99 - 40) + 40));
            }, 80);
            return () => clearInterval(interval);
        } else {
            setStatus("ANALISANDO PRÓX. CICLO");
            const nextRoundProb = Math.floor(Math.random() * (98 - 80) + 80);
            setVolatility(nextRoundProb);
        }
    }, [isSpinning]);

    return (
        <div className="w-full animate-slide-up h-full flex flex-col">
            <div className="bg-slate-900/90 border border-yellow-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(234,179,8,0.1)] relative overflow-hidden group flex-1 flex flex-col justify-between min-h-[500px]">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-500/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>
                <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                    <h3 className="text-yellow-400 font-bold flex items-center gap-2 uppercase tracking-widest text-sm animate-pulse">
                        <BrainCircuit size={20} /> RNG SCAN
                    </h3>
                    <span className="text-[10px] text-slate-500 font-mono border border-slate-700 px-1 rounded bg-black/40">V.3.1</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                        <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${isSpinning ? 'border-yellow-500 animate-spin border-t-transparent' : 'border-yellow-900/50 bg-yellow-900/10'}`}>
                            <Activity size={48} className={`text-yellow-400 ${isSpinning ? 'animate-pulse' : ''}`} />
                        </div>
                        {isSpinning && <div className="absolute inset-0 border-t-4 border-yellow-500 rounded-full animate-spin"></div>}
                    </div>
                    <div className="text-center space-y-2 mt-4">
                         <div className={`text-2xl font-black tracking-widest ${isSpinning ? 'text-yellow-400 animate-pulse' : 'text-slate-200'}`}>{volatility}%</div>
                         <div className="text-[10px] text-slate-500 uppercase tracking-widest">{isSpinning ? 'Calculando Probabilidade...' : 'Probabilidade Próx. Rodada'}</div>
                    </div>
                    <div className="w-full bg-slate-950/50 p-4 rounded-xl border border-white/5 mt-4">
                        <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-yellow-500"/><span className="text-xs font-bold text-slate-300">STATUS DA IA</span></div>
                        <div className="font-mono text-sm text-yellow-300 animate-pulse">{status}</div>
                    </div>
                </div>
                <div className="mt-6 pt-3 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 uppercase tracking-widest font-mono"><span>Server: BR-1</span><span>Ping: 14ms</span></div>
            </div>
        </div>
    );
});

// --- MAIN COMPONENT ---

export const TigerGame: React.FC<TigerGameProps> = ({ user, updateUser }) => {
    const [grid, setGrid] = useState<string[]>(Array(9).fill('orange'));
    const [bet, setBet] = useState<number>(5);
    const [isSpinning, setIsSpinning] = useState<boolean>(false);
    const [winningLines, setWinningLines] = useState<number[]>([]);
    const [winAmount, setWinAmount] = useState<number>(0);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [isFullScreenWin, setIsFullScreenWin] = useState<boolean>(false);
    
    const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

    const spinAudioRef = useRef<OscillatorNode | null>(null);
    const isMounted = useRef(true);

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

    const playSound = (type: 'spin_start' | 'stop' | 'win_small' | 'win_big' | 'multiplier') => {
        if (!soundEnabled) return;
        
        if (type === 'spin_start') {
            if (spinAudioRef.current) {
                try { spinAudioRef.current.stop(); } catch(e){}
            }
            const osc = playSynthSound('spin_start');
            spinAudioRef.current = osc;
        } else {
            playSynthSound(type);
        }
    };

    const stopSpinSound = () => {
        if (spinAudioRef.current) {
            try { spinAudioRef.current.stop(); } catch(e){}
            spinAudioRef.current = null;
        }
    };

    const handleSpin = async () => {
        if (isSpinning) return;
        if (bet < MIN_BET) return setNotifyMsg(`Aposta mínima de R$ ${MIN_BET}`);
        if (bet > MAX_BET) return setNotifyMsg(`Aposta máxima de R$ ${MAX_BET}`);
        if (bet > user.balance) return setNotifyMsg("Saldo insuficiente para jogar.");

        setIsSpinning(true);
        setWinningLines([]);
        setWinAmount(0);
        setIsFullScreenWin(false);
        playSound('spin_start');
        
        const currentBalance = user.balance;
        updateUser({ balance: currentBalance - bet });

        try {
            // REDUZIDO TEMPO MÍNIMO DE SPIN (1.8s -> 1.0s)
            const minSpinTime = 1000;
            const startTime = Date.now();

            const response = await DatabaseService.tigerSpin(user.id, bet);
            
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, minSpinTime - elapsedTime);

            await new Promise(r => setTimeout(r, remainingTime));

            if (!isMounted.current) return;

            stopSpinSound();
            setGrid(response.grid);
            
            updateUser({ balance: response.newBalance, loyaltyPoints: response.loyaltyPoints });

            playSound('stop');
            
            if (response.totalWin > 0) {
                // Feedback imediato sem delay
                if(!isMounted.current) return;
                setWinningLines(response.winningLines);
                setWinAmount(response.totalWin);
                setIsFullScreenWin(response.isFullScreen);
                
                if (response.isFullScreen) playSound('multiplier');
                else playSound(response.totalWin > bet * 10 ? 'win_big' : 'win_small');
            }
        } catch (e: any) {
            updateUser({ balance: currentBalance });
            stopSpinSound();
            setNotifyMsg(e.message || "Erro no giro.");
        } finally {
            if(isMounted.current) setIsSpinning(false);
        }
    };

    const showBetInfo = bet > 0;

    return (
        <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
             <Notification message={notifyMsg} onClose={() => setNotifyMsg(null)} />
             <div className="absolute inset-0 bg-slate-950 -z-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-900/20 via-slate-950 to-black"></div>
                <div className="absolute top-10 left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-[80px] animate-pulse"></div>
                <div className="absolute bottom-10 right-10 w-60 h-60 bg-yellow-500/10 rounded-full blur-[100px] animate-pulse delay-700"></div>
            </div>

            <div className="absolute top-5 md:top-8 left-0 right-0 text-center z-20 pointer-events-none px-4 w-full overflow-visible">
                  <div className="inline-block relative px-4">
                         <div className="absolute inset-0 bg-yellow-500 blur-xl opacity-20 rounded-full"></div>
                         <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter italic drop-shadow-[0_4px_0_rgba(0,0,0,1)] whitespace-nowrap pr-8 py-2">
                             TIGRINHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-600">IA</span>
                         </h1>
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-2 opacity-80">
                        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-yellow-500/50"></div>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-yellow-500/80 font-bold px-2 md:px-4">Premium Edition</span>
                        <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-yellow-500/50"></div>
                    </div>
            </div>

            <div className="flex-1 w-full max-w-[1600px] flex items-center justify-center gap-8 relative p-4 min-h-0 pt-20">
                <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
                     <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                        <h3 className="text-yellow-500 font-bold flex items-center gap-2 mb-4 uppercase tracking-widest text-sm"><Info size={16} /> Regras</h3>
                        <ul className="space-y-3 text-sm text-slate-300">
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Linhas</span><span className="font-bold text-white">5 Fixas</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>RTP Teórico</span><span className="font-bold text-white">96.0%</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Volatilidade</span><span className="font-bold text-white">Média</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Max Win</span><span className="font-bold text-yellow-400">2500x</span></li>
                        </ul>
                    </div>
                    <div className={`transition-all duration-300 transform ${showBetInfo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <div className={`rounded-2xl p-1 shadow-lg ${isSpinning ? 'bg-gradient-to-br from-yellow-500 to-yellow-700 animate-pulse-gold' : 'bg-slate-700'}`}>
                            <div className="bg-slate-900 rounded-xl p-4 text-center relative overflow-hidden">
                                {isSpinning && (<div className="absolute top-2 right-2 text-yellow-500"><Lock size={12} /></div>)}
                                <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">{isSpinning ? 'Aposta em Jogo' : 'Valor da Aposta'}</div>
                                <div className="text-2xl font-bold text-white">R$ {bet.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 w-full max-w-md flex flex-col gap-4">
                    <div className="bg-slate-900 rounded-[2rem] p-1.5 shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-yellow-600/50 relative overflow-hidden group">
                        <div className="absolute -inset-[2px] bg-gradient-to-b from-yellow-500 via-purple-500 to-yellow-500 opacity-30 rounded-[2.1rem] blur-sm group-hover:opacity-50 transition-opacity duration-1000"></div>
                        <div className="relative bg-black rounded-t-[1.5rem] p-3 flex justify-between items-center border-b border-white/5 overflow-hidden">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                            <div className="flex items-center gap-2 z-10"><Sparkles size={14} className="text-yellow-400 animate-pulse" /><span className="text-[10px] font-bold text-yellow-100 uppercase tracking-wider">Multiplicador Ativo</span></div>
                            <div className="flex items-center gap-2 z-10"><button onClick={() => setSoundEnabled(!soundEnabled)} className="text-slate-500 hover:text-white transition-colors">{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</button><div className="bg-yellow-500/20 border border-yellow-500/50 px-2 py-0.5 rounded text-yellow-300 text-xs font-bold shadow-[0_0_10px_rgba(234,179,8,0.2)]">2500X <span className="text-[8px] opacity-70">MAX</span></div></div>
                        </div>

                        <div className="bg-slate-950 p-3 relative h-[320px] overflow-hidden">
                            <div className="absolute inset-0 grid grid-cols-3 divide-x divide-white/5 pointer-events-none z-0"><div></div><div></div><div></div></div>
                            <PaylinesOverlay winningLines={winningLines} isSpinning={isSpinning} />
                            
                            <div className="grid grid-cols-3 gap-2 h-full relative z-10">
                                {grid.map((symbolId, i) => {
                                    const conf = SYMBOLS[symbolId] || SYMBOLS['orange'];
                                    const isWinLine = winningLines.some(lineIdx => [[0,1,2],[3,4,5],[6,7,8],[0,4,8],[2,4,6]][lineIdx].includes(i));
                                    return (
                                        <div key={i} className={`relative rounded-xl border flex items-center justify-center overflow-hidden transition-all duration-300 ${conf.bg} ${conf.border} ${isSpinning ? 'opacity-80 scale-95 blur-sm will-change-transform' : 'opacity-100 scale-100'} ${!isSpinning && isWinLine ? `ring-2 ring-yellow-400 ${conf.glow} scale-105 z-20 brightness-125` : ''}`}>
                                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                                            {isSpinning && <div className="absolute inset-0 flex flex-col items-center justify-center opacity-60"><div className="w-full h-full bg-gradient-to-b from-transparent via-white/10 to-transparent animate-pulse blur-md"></div></div>}
                                            <div className={`relative z-10 transform transition-transform duration-300 ${!isSpinning && isWinLine ? 'animate-bounce' : ''} ${isSpinning ? 'animate-[spin_0.1s_linear_infinite] blur-[2px] opacity-70 translate-y-10' : 'translate-y-0'}`}>{conf.icon}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {isFullScreenWin && !isSpinning && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                                    <div className="text-center relative">
                                        <div className="absolute inset-0 bg-yellow-500 blur-[60px] opacity-30 animate-pulse"></div>
                                        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_4px_10px_rgba(234,179,8,0.5)] transform scale-150 animate-bounce">10X</h2>
                                        <p className="text-white font-bold tracking-[0.5em] text-xs mt-4 uppercase animate-pulse">Super Multiplier</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="bg-slate-900 rounded-b-[1.5rem] h-2 border-t border-white/5"></div>
                    </div>

                    <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
                        <div className="flex justify-between items-center mb-4 bg-slate-950/50 p-2 rounded-xl border border-white/5">
                            <div className="text-left px-2"><span className="text-[9px] text-slate-500 uppercase font-bold block mb-0.5">Último Ganho</span><span className={`font-mono font-bold text-lg ${winAmount > 0 ? 'text-green-400 animate-pulse' : 'text-slate-300'}`}>{winAmount > 0 ? `R$ ${winAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}</span></div>
                            <div className="h-8 w-[1px] bg-white/10"></div>
                            <div className="text-right px-2"><span className="text-[9px] text-slate-500 uppercase font-bold block mb-0.5">Saldo</span><span className="font-mono font-bold text-white text-sm">R$ {user.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-none bg-slate-950 rounded-xl p-1.5 flex flex-col items-center justify-between border border-white/5 w-28">
                                <span className="text-[8px] text-slate-500 uppercase font-bold mt-1">Aposta (Max {MAX_BET})</span>
                                <input type="number" min={MIN_BET} max={MAX_BET} value={bet} onChange={(e) => !isSpinning && setBet(Math.min(MAX_BET, Math.max(0, parseInt(e.target.value) || 0)))} disabled={isSpinning} className="w-full bg-transparent text-center font-bold text-white text-lg my-1 outline-none border-b border-white/10 focus:border-yellow-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                                <div className="flex w-full gap-1"><button onClick={() => !isSpinning && setBet(Math.max(MIN_BET, Math.floor(bet / 2)))} disabled={isSpinning} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm h-6 disabled:opacity-50">½</button><button onClick={() => !isSpinning && setBet(Math.min(MAX_BET, bet * 2))} disabled={isSpinning} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm h-6 disabled:opacity-50">2x</button></div>
                            </div>
                            <Button onClick={handleSpin} disabled={isSpinning} className={`flex-1 h-auto text-xl rounded-xl border-b-4 border-yellow-700 active:border-b-0 active:translate-y-1 shadow-[0_0_30px_rgba(234,179,8,0.2)] ${isSpinning ? 'opacity-80 cursor-wait grayscale' : 'animate-pulse-gold'}`} variant="primary">{isSpinning ? (<span className="flex items-center gap-2 text-sm"><Sparkles className="animate-spin" size={16}/> GIRANDO</span>) : (<div className="flex flex-col items-center leading-none gap-1"><span>GIRAR</span><span className="text-[9px] opacity-60 font-normal tracking-wider">AUTO</span></div>)}</Button>
                        </div>
                    </div>
                </div>

                <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-center shrink-0">
                    <TigerAI isSpinning={isSpinning} />
                </div>
            </div>
            
            <div className="w-full text-center py-8 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    );
};
