
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { DatabaseService } from '../services/database';
import { Button } from './UI/Button';
import { Volume2, VolumeX, Sparkles, Gem, Flame, Crown, Zap, Gift, Citrus, Coins, Info, Lock, BrainCircuit, Activity, BarChart3, ShieldCheck, Repeat, Settings2, X, History as HistoryIcon, Play, Pause, Maximize2, Calendar, AlertCircle } from 'lucide-react';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';

interface TigerGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

const MIN_BET = 1;
const MAX_BET = 50;

// --- UTILS: BANKING GRADE VALIDATION ---
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

// --- TYPES ---
interface SpinHistoryItem {
    id: number;
    amount: number;
    win: number;
    multiplier: number;
    timestamp: Date;
}

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
            // Efeito de rolamento mecânico
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
            // Travamento seco (Click)
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
        }
        return null;
    } catch (e) { console.warn('Audio error'); return null; }
};

// --- 3D ANIMATED SYMBOLS ---

const TigerIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-yellow-500/30 blur-xl rounded-full animate-pulse group-hover:bg-yellow-500/50 transition-colors"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_15px_rgba(234,179,8,0.9)] z-10 scale-125 group-hover:scale-[1.35] transition-transform duration-300">🐯</div>
        <Crown size={14} className="absolute -top-3 left-1/2 -translate-x-1/2 text-yellow-300 fill-yellow-500 animate-bounce drop-shadow-md z-20" />
        <div className="absolute bottom-0 text-[7px] font-black text-yellow-300 tracking-widest uppercase bg-black/60 px-1.5 rounded-full border border-yellow-500/50 z-20">WILD</div>
    </div>
);

const CherryIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-pink-600/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_8px_rgba(236,72,153,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300">🍒</div>
    </div>
);

const BellIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-yellow-500/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_8px_rgba(234,179,8,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300 rotate-12">🔔</div>
    </div>
);

const CoinIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-yellow-600/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300">🪙</div>
    </div>
);

const MoneyBagIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-green-600/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_8px_rgba(34,197,94,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300">💰</div>
    </div>
);

const SevenIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-purple-600/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300 font-black text-purple-400">7️⃣</div>
    </div>
);

const DiamondIcon = () => (
    <div className="relative flex items-center justify-center w-full h-full group">
        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full opacity-60 group-hover:opacity-100 transition-opacity"></div>
        <div className="text-3xl md:text-4xl filter drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] z-10 scale-100 group-hover:scale-110 transition-transform duration-300 animate-[pulse_3s_infinite]">💎</div>
    </div>
);

// Configuration for symbols
const SYMBOLS: {[key: string]: { icon: React.ReactNode, bg: string, border: string, glow: string }} = {
    'orange': { icon: <CherryIcon />, bg: 'bg-gradient-to-br from-pink-950/80 to-slate-950', border: 'border-pink-500/30', glow: 'shadow-pink-500/20' },
    'firecracker': { icon: <BellIcon />, bg: 'bg-gradient-to-br from-yellow-950/80 to-slate-950', border: 'border-yellow-500/30', glow: 'shadow-yellow-500/20' },
    'envelope': { icon: <CoinIcon />, bg: 'bg-gradient-to-br from-yellow-900/50 to-slate-950', border: 'border-yellow-600/30', glow: 'shadow-yellow-600/20' },
    'bag': { icon: <MoneyBagIcon />, bg: 'bg-gradient-to-br from-green-950/80 to-slate-950', border: 'border-green-500/30', glow: 'shadow-green-500/20' },
    'statue': { icon: <SevenIcon />, bg: 'bg-gradient-to-br from-purple-950/80 to-slate-950', border: 'border-purple-500/30', glow: 'shadow-purple-500/20' },
    'jewel': { icon: <DiamondIcon />, bg: 'bg-gradient-to-br from-cyan-950/80 to-slate-950', border: 'border-cyan-500/30', glow: 'shadow-cyan-500/20' },
    'wild': { icon: <TigerIcon />, bg: 'bg-gradient-to-br from-yellow-600/30 via-yellow-900/30 to-black', border: 'border-yellow-400/50', glow: 'shadow-yellow-500/40' }
};

// --- SPINNING REEL COMPONENT (THE BLURRED STRIP) ---
// This creates the "Rotating Cylinder" effect by moving a strip of symbols downwards rapidly
const SpinningReel = () => {
    // Sequence of symbols for the blur effect
    const stripSymbols = ['wild', 'orange', 'firecracker', 'envelope', 'bag', 'statue', 'jewel', 'wild', 'orange', 'firecracker', 'envelope', 'bag', 'statue', 'jewel'];
    
    return (
        <div className="absolute inset-0 overflow-hidden flex flex-col items-center bg-slate-900/80 backdrop-blur-[1px] z-10">
            {/* 
               ANIMATION: moveY -50% to 0% 
               This simulates the reel spinning DOWNWARDS (Standard Slot Direction)
            */}
            <style>{`
                @keyframes reelSpinDown {
                    0% { transform: translateY(-50%); }
                    100% { transform: translateY(0%); } 
                }
                .reel-spin {
                    animation: reelSpinDown 0.2s linear infinite; 
                    will-change: transform;
                }
            `}</style>
            
            {/* Shadow Overlay for curvature depth */}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.6)_0%,transparent_30%,transparent_70%,rgba(0,0,0,0.6)_100%)] z-20 pointer-events-none"></div>
            
            {/* The Moving Strip */}
            <div className="w-full flex flex-col items-center reel-spin opacity-60 grayscale-[0.3]">
                {stripSymbols.map((sym, i) => (
                    <div key={i} className="h-[100px] w-full flex items-center justify-center py-2 scale-75 blur-[1px]">
                        {SYMBOLS[sym].icon}
                    </div>
                ))}
            </div>
        </div>
    );
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

// --- NEW COMPONENT: FULL HISTORY MODAL ---
interface FullHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    history: SpinHistoryItem[];
}

const FullHistoryModal: React.FC<FullHistoryModalProps> = ({ isOpen, onClose, history }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl relative shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-950/50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <HistoryIcon size={20} className="text-yellow-500" />
                        <h3 className="text-white font-bold text-lg">Histórico Completo</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                    {history.length === 0 && <div className="text-center text-slate-500 py-10">Nenhum registro encontrado.</div>}
                    {history.map((h) => (
                        <div key={h.id} className={`flex items-center justify-between p-3 rounded-xl border text-sm ${h.win > 0 ? 'bg-green-900/10 border-green-500/20' : 'bg-slate-950 border-white/5'}`}>
                             <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${h.win > 0 ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {h.win > 0 ? 'W' : 'L'}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-mono text-slate-400 text-xs">{h.timestamp.toLocaleTimeString()}</span>
                                    <span className="text-[10px] text-slate-600 font-bold uppercase">{h.timestamp.toLocaleDateString()}</span>
                                </div>
                             </div>
                             <div className="text-right">
                                 <div className={`font-bold text-base ${h.win > 0 ? 'text-green-400' : 'text-slate-500'}`}>{h.win > 0 ? `+${h.win.toFixed(2)}` : `-${h.amount.toFixed(2)}`}</div>
                                 {h.multiplier > 0 && <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">{h.multiplier.toFixed(2)}x</span>}
                             </div>
                        </div>
                    ))}
                </div>
                <div className="p-3 border-t border-white/5 bg-slate-950/50 rounded-b-2xl text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Exibindo últimos {history.length} giros</p>
                </div>
            </div>
        </div>
    );
}

// --- NEW COMPONENT: AUTO SPIN MODAL ---
interface AutoSpinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartAuto: (count: number, stopLoss: number, stopWin: number) => void;
    userBalance: number;
}

const AutoSpinModal: React.FC<AutoSpinModalProps> = ({ isOpen, onClose, onStartAuto, userBalance }) => {
    const [count, setCount] = useState(10);
    const [stopLossStr, setStopLossStr] = useState('');
    const [stopWinStr, setStopWinStr] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if(isOpen) {
            setStopLossStr('');
            setStopWinStr('');
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleInputChange = (value: string, setter: (v: string) => void) => {
        setError(null);
        if (value === '') { setter(''); return; }
        const sanitized = sanitizeCurrencyInput(value);
        setter(sanitized);
    };

    const handleBlur = (valueStr: string, setter: (v: string) => void, isLossField: boolean) => {
        if (valueStr === '') return;
        let val = parseFloat(valueStr);
        if (isNaN(val)) val = 0;
        if (isLossField && val > userBalance) {
            val = userBalance;
            setError(`Stop Loss ajustado ao saldo máximo (R$ ${userBalance.toFixed(2)})`);
        }
        setter(val > 0 ? val.toFixed(2) : '');
    };

    const handleSubmit = () => {
        const stopLoss = parseFloat(stopLossStr) || 0;
        const stopWin = parseFloat(stopWinStr) || 0;
        if (stopLoss > userBalance) { setError("Limite de perda excede seu saldo atual."); return; }
        onStartAuto(count, stopLoss, stopWin);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-900 border border-yellow-500/30 w-full max-w-sm rounded-2xl p-6 relative shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Settings2 className="text-yellow-500"/> Auto Spin</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Número de Giros</label>
                        <div className="grid grid-cols-4 gap-2">
                            {[10, 20, 50, 100].map(n => (
                                <button key={n} onClick={() => setCount(n)} className={`py-2 rounded-lg border text-sm font-bold ${count === n ? 'bg-yellow-600/20 border-yellow-500 text-yellow-400' : 'bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-700'}`}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Parar se Saldo Diminuir (R$)</label>
                        <input type="text" inputMode="decimal" value={stopLossStr} onChange={(e) => handleInputChange(e.target.value, setStopLossStr)} onBlur={() => handleBlur(stopLossStr, setStopLossStr, true)} placeholder="Sem limite" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-yellow-500 outline-none transition-colors" />
                        <div className="text-[10px] text-slate-500 mt-1 flex justify-between"><span>Max: R$ {userBalance.toFixed(2)}</span></div>
                    </div>
                    <div>
                         <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Parar se Ganho Único Exceder (R$)</label>
                         <input type="text" inputMode="decimal" value={stopWinStr} onChange={(e) => handleInputChange(e.target.value, setStopWinStr)} onBlur={() => handleBlur(stopWinStr, setStopWinStr, false)} placeholder="Sem limite" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                    {error && (<div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 p-2 rounded border border-red-500/20"><AlertCircle size={12} /> {error}</div>)}
                </div>
                <div className="mt-6 flex gap-3">
                    <Button fullWidth variant="secondary" onClick={onClose}>CANCELAR</Button>
                    <Button fullWidth variant="primary" onClick={handleSubmit}>INICIAR AUTO</Button>
                </div>
            </div>
        </div>
    );
};

// --- MODIFIED COMPONENT: MINI HISTORY TICKER ---
const MiniHistoryTicker = ({ history, onExpand }: { history: SpinHistoryItem[], onExpand: () => void }) => {
    const displayHistory = history.slice(0, 3);
    return (
        <div className="w-full xl:w-[280px] bg-slate-900/50 rounded-2xl border border-white/5 p-4 flex flex-col gap-2 shrink-0 overflow-hidden relative group h-[220px]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-1 shrink-0">
                <div className="flex items-center gap-2"><HistoryIcon size={16} className="text-slate-400"/><span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Recentes</span></div>
                <button onClick={onExpand} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-1 rounded-md hover:bg-white/10" title="Ver Histórico Completo"><Maximize2 size={14} /></button>
            </div>
            <div className="flex flex-col gap-2">
                {displayHistory.length === 0 && (<div className="flex flex-col items-center justify-center text-slate-600 opacity-50 py-10"><Calendar size={24} className="mb-2"/><span className="text-[10px] font-bold uppercase tracking-widest">Sem Registros</span></div>)}
                {displayHistory.map((h) => (
                    <div key={h.id} className={`flex items-center justify-between p-2 rounded-lg border text-xs animate-slide-up ${h.win > 0 ? 'bg-green-900/10 border-green-500/20' : 'bg-slate-950 border-white/5'}`}>
                         <div className="font-mono text-slate-400 text-[10px]">{h.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div>
                         <div className="flex items-center gap-2">
                             {h.multiplier > 0 && <span className="bg-yellow-500/20 text-yellow-500 px-1 rounded text-[10px] font-bold">{h.multiplier.toFixed(1)}x</span>}
                             <span className={`font-bold ${h.win > 0 ? 'text-green-400' : 'text-slate-500'}`}>{h.win > 0 ? `+${h.win.toFixed(2)}` : `-${h.amount.toFixed(2)}`}</span>
                         </div>
                    </div>
                ))}
            </div>
            {history.length > 3 && (<button onClick={onExpand} className="w-full text-[9px] text-slate-500 uppercase font-bold tracking-widest text-center hover:text-yellow-500 transition-colors mt-0">Ver Todos ({history.length})</button>)}
        </div>
    );
};


// --- MAIN COMPONENT ---

export const TigerGame: React.FC<TigerGameProps> = ({ user, updateUser }) => {
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
    const [autoSpinConfig, setAutoSpinConfig] = useState({ stopLoss: 0, stopWin: 0, initialBalance: 0 });
    const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);

    // History State
    const [history, setHistory] = useState<SpinHistoryItem[]>([]);
    const [showFullHistory, setShowFullHistory] = useState(false);

    const [showProvablyFair, setShowProvablyFair] = useState(false);
    const [serverSeedHash, setServerSeedHash] = useState('');
    
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

    // Helper to check and dispatch trophies
    const checkAchievements = (data: any) => {
        if (data.newTrophies && Array.isArray(data.newTrophies) && data.newTrophies.length > 0) {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: data.newTrophies }));
            const currentTrophies = user.unlockedTrophies || [];
            const updatedTrophies = [...new Set([...currentTrophies, ...data.newTrophies])];
            updateUser({ unlockedTrophies: updatedTrophies });
        }
    };

    // --- AUTO SPIN EFFECT LOOP ---
    useEffect(() => {
        if (!autoSpinActive) return;
        if (autoSpinCount <= 0) { stopAutoSpin(); return; }
        if (!isSpinning) {
             if (bet > user.balance) { setNotifyMsg("Saldo insuficiente. Auto Spin parado."); stopAutoSpin(); return; }
             if (autoSpinConfig.stopLoss > 0 && (autoSpinConfig.initialBalance - user.balance) >= autoSpinConfig.stopLoss) { setNotifyMsg("Limite de perda atingido. Auto Spin parado."); stopAutoSpin(); return; }
             const timer = setTimeout(() => { handleSpin(true); }, 1000); 
             return () => clearTimeout(timer);
        }
    }, [autoSpinActive, isSpinning, autoSpinCount, user.balance]);

    const stopAutoSpin = () => {
        setAutoSpinActive(false);
        setAutoSpinCount(0);
    };

    const handleStartAuto = (count: number, stopLoss: number, stopWin: number) => {
        setIsAutoModalOpen(false);
        if (count > 0) {
            setAutoSpinConfig({ stopLoss, stopWin, initialBalance: user.balance });
            setAutoSpinCount(count);
            setAutoSpinActive(true);
        }
    };

    const handleBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isSpinning || autoSpinActive) return;
        const raw = e.target.value;
        if (raw === '') { setBetInputValue(''); setBet(0); return; }
        const sanitized = sanitizeCurrencyInput(raw);
        setBetInputValue(sanitized);
        const parsed = parseFloat(sanitized);
        if (!isNaN(parsed)) { setBet(parsed); }
    };

    const handleBetBlur = () => {
        let val = parseFloat(betInputValue);
        if (isNaN(val)) val = MIN_BET;
        if (val < MIN_BET) val = MIN_BET;
        if (val > MAX_BET) val = MAX_BET;
        if (val > user.balance) val = Math.max(MIN_BET, user.balance);
        setBet(val);
        setBetInputValue(val.toFixed(2));
    };

    const adjustBet = (type: 'half' | 'double') => {
        if (isSpinning || autoSpinActive) return;
        let newVal = bet;
        if (type === 'half') newVal = Math.max(MIN_BET, Math.floor(bet / 2));
        if (type === 'double') newVal = Math.min(MAX_BET, bet * 2);
        if (newVal > user.balance) newVal = Math.max(MIN_BET, user.balance);
        setBet(newVal);
        setBetInputValue(newVal.toFixed(2));
    };

    const playSound = (type: 'spin_start' | 'stop' | 'win_small' | 'win_big' | 'multiplier') => {
        if (!soundEnabled) return;
        if (type === 'spin_start') {
            if (spinAudioRef.current) { try { spinAudioRef.current.stop(); } catch(e){} }
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
            // Tempo de giro para efeito mecânico
            const minSpinTime = 1200; 
            const startTime = Date.now();

            const response = await DatabaseService.tigerSpin(user.id, bet);
            
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
                if (isAuto && autoSpinConfig.stopWin > 0 && response.totalWin >= autoSpinConfig.stopWin) { stopAutoSpin(); setNotifyMsg(`Limite de ganho atingido (R$ ${response.totalWin}). Auto Spin parado.`); }
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

    return (
        <div className="w-full h-full flex flex-col items-center relative overflow-hidden">
             <Notification message={notifyMsg} onClose={() => setNotifyMsg(null)} />
             <AutoSpinModal isOpen={isAutoModalOpen} onClose={() => setIsAutoModalOpen(false)} onStartAuto={handleStartAuto} userBalance={user.balance} />
             <FullHistoryModal isOpen={showFullHistory} onClose={() => setShowFullHistory(false)} history={history} />
             <ProvablyFairModal isOpen={showProvablyFair} onClose={() => setShowProvablyFair(false)} serverSeedHash={serverSeedHash} clientSeed={user.id} nonce={Date.now()} />

             <div className="absolute inset-0 bg-slate-950 -z-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-900/20 via-slate-950 to-black"></div>
                <div className="absolute top-10 left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-[80px] animate-pulse"></div>
                <div className="absolute bottom-10 right-10 w-60 h-60 bg-yellow-500/10 rounded-full blur-[100px] animate-pulse delay-700"></div>
            </div>

            <div className="absolute top-8 md:top-12 left-0 right-0 text-center z-20 pointer-events-none px-4 w-full overflow-visible">
                  <div className="inline-block relative px-4">
                         <div className="absolute inset-0 bg-yellow-500 blur-xl opacity-20 rounded-full"></div>
                         <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter italic drop-shadow-[0_4px_0_rgba(0,0,0,1)] whitespace-nowrap pr-8 py-2">
                             TIGRINHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-600">IA</span>
                         </h1>
                    </div>
            </div>

            <div className="flex-1 w-full max-w-[1600px] flex flex-col xl:flex-row items-center justify-center gap-8 relative p-4 min-h-0 pt-32 md:pt-28">
                
                <div className="hidden xl:flex w-[280px] flex-col gap-4 justify-start shrink-0">
                     <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                        <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                            <h3 className="text-yellow-500 font-bold flex items-center gap-2 uppercase tracking-widest text-sm"><Info size={16} /> Regras</h3>
                            <button onClick={() => setShowProvablyFair(true)} className="text-green-500 hover:text-green-400 transition-colors" title="Provably Fair"><ShieldCheck size={16} /></button>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-300">
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Linhas</span><span className="font-bold text-white">5 Fixas</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>RTP Teórico</span><span className="font-bold text-white">96.0%</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Volatilidade</span><span className="font-bold text-white">Média</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Max Win</span><span className="font-bold text-yellow-400">2500x</span></li>
                        </ul>
                    </div>
                    <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
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
                                    
                                    // Stagger the animation based on column index
                                    const staggerDelay = (i % 3) * 100;

                                    return (
                                        <div key={i} className={`relative rounded-xl border flex items-center justify-center overflow-hidden transition-all duration-300 ${conf.bg} ${conf.border} ${!isSpinning && isWinLine ? `ring-2 ring-yellow-400 ${conf.glow} scale-105 z-20 brightness-125` : ''}`}>
                                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                                            
                                            {isSpinning ? (
                                                <SpinningReel />
                                            ) : (
                                                <div 
                                                    className={`relative z-10 w-full h-full flex items-center justify-center ${isWinLine ? 'animate-bounce' : 'animate-[fadeIn_0.1s_ease-out]'}`}
                                                >
                                                    <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
                                                    {conf.icon}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {winAmount > bet * 5 && !isSpinning && (
                                <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden">
                                     <style>{`@keyframes explode { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(2); opacity: 0; } } .coin-particle { position: absolute; width: 10px; height: 10px; background: #fbbf24; border-radius: 50%; animation: explode 1s ease-out forwards; }`}</style>
                                     {[...Array(20)].map((_, i) => (<div key={i} className="coin-particle" style={{ left: '50%', top: '50%', transform: `rotate(${i * 18}deg) translate(100px)` }}></div>))}
                                     <div className="absolute inset-0 bg-yellow-500/10 animate-pulse"></div>
                                </div>
                            )}

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
                            <div className="flex-none bg-slate-950 rounded-xl p-1.5 flex flex-col items-center justify-between border border-white/5 w-24">
                                <span className="text-[8px] text-slate-500 uppercase font-bold mt-1">Aposta</span>
                                <input type="text" inputMode="decimal" value={betInputValue} onChange={handleBetChange} onBlur={handleBetBlur} disabled={isSpinning || autoSpinActive} className="w-full bg-transparent text-center font-bold text-white text-lg my-1 outline-none border-b border-white/10 focus:border-yellow-500 transition-colors" />
                                <div className="flex w-full gap-1">
                                    <button onClick={() => adjustBet('half')} disabled={isSpinning || autoSpinActive} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm h-6 disabled:opacity-50 transition-colors">½</button>
                                    <button onClick={() => adjustBet('double')} disabled={isSpinning || autoSpinActive} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm h-6 disabled:opacity-50 transition-colors">2x</button>
                                </div>
                            </div>
                            
                            <button onClick={() => autoSpinActive ? stopAutoSpin() : setIsAutoModalOpen(true)} className={`w-14 rounded-xl flex flex-col items-center justify-center border border-white/5 transition-all ${autoSpinActive ? 'bg-red-900/50 border-red-500 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`} disabled={isSpinning && !autoSpinActive}>
                                {autoSpinActive ? <Pause size={18} fill="currentColor"/> : <Repeat size={18} />}
                                <span className="text-[8px] font-bold mt-1 uppercase">{autoSpinActive ? autoSpinCount : 'AUTO'}</span>
                            </button>

                            <Button onClick={() => handleSpin(false)} disabled={isSpinning || autoSpinActive || bet > user.balance} className={`flex-1 h-auto text-xl rounded-xl border-b-4 border-yellow-700 active:border-b-0 active:translate-y-1 shadow-[0_0_30px_rgba(234,179,8,0.2)] ${isSpinning ? 'opacity-80 cursor-wait grayscale' : 'animate-pulse-gold'} disabled:opacity-50 disabled:grayscale`} variant="primary">
                                {isSpinning ? (<span className="flex items-center gap-2 text-sm"><Sparkles className="animate-spin" size={16}/> {autoSpinActive ? `AUTO (${autoSpinCount})` : 'GIRANDO'}</span>) : (<div className="flex flex-col items-center leading-none gap-1"><span>GIRAR</span></div>)}
                            </Button>
                        </div>
                    </div>
                    
                    <div className="xl:hidden w-full">
                         <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
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
