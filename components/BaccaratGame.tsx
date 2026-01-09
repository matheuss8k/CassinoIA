import React, { useState, useEffect } from 'react';
import { User, GameStatus } from '../types';
import { useBaccaratLogic, BaccaratBetType, BaccHistoryItem, RoadmapItem } from '../hooks/useBaccaratLogic';
import { CardComponent } from './CardComponent';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';
import { RotateCcw, Trash2, Coins, ChevronLeft, Trophy, Activity, Info, ShieldCheck, X, History as HistoryIcon, Lock, Calendar, BrainCircuit, Sparkles, Zap, BarChart3, Maximize2, Heart, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BaccaratGameProps {
    user: User;
    updateUser: (data: Partial<User>) => void;
}

// --- SUB-COMPONENTES VISUAIS ---

interface ChipBtnProps {
    val: number;
    selected: boolean;
    onClick: () => void;
}

const ChipBtn: React.FC<ChipBtnProps> = ({ val, selected, onClick }) => (
    <button 
        onClick={onClick}
        className={`
            relative w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black text-[10px] md:text-xs 
            shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-2 active:scale-95
            ${selected ? 'ring-2 ring-white scale-110 -translate-y-2 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'opacity-90 hover:opacity-100'}
            border-[3px] border-dashed
            ${val === 1 ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-300' : 
              val === 5 ? 'bg-gradient-to-br from-red-500 to-red-700 border-red-300' : 
              val === 10 ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-300' : 
              val === 25 ? 'bg-gradient-to-br from-purple-500 to-purple-700 border-purple-300' : 
              'bg-gradient-to-br from-orange-500 to-orange-700 border-orange-300'}
        `}
    >
        <span className="drop-shadow-md z-10">{val}</span>
        <div className="absolute inset-0 rounded-full bg-white/10 pointer-events-none"></div>
    </button>
);

const BetZone = ({ type, label, odds, amount, onClick, colorClass, winner, className = '', variant = 'main' }: { type: BaccaratBetType, label: string, odds: string, amount: number, onClick: () => void, colorClass: string, winner: boolean, className?: string, variant?: 'main' | 'side' }) => {
    const isRed = colorClass.includes('red') || colorClass.includes('rose');
    const isBlue = colorClass.includes('blue') || colorClass.includes('cyan');
    const isGreen = colorClass.includes('emerald');
    
    let borderColor = 'border-white/5';
    let activeBorder = 'group-hover:border-white/20';
    
    if (isRed) { borderColor = 'border-red-500/10'; activeBorder = 'group-hover:border-red-500/40'; }
    else if (isBlue) { borderColor = 'border-blue-500/10'; activeBorder = 'group-hover:border-blue-500/40'; }
    else if (isGreen) { borderColor = 'border-emerald-500/10'; activeBorder = 'group-hover:border-emerald-500/40'; }

    // Styles for Side Bets (Compact, Pill-shaped) vs Main Bets (Large, Card-like)
    // Alterado: variant='main' agora usa h-full para respeitar o pai e removemos min-heights exagerados
    const containerStyle = variant === 'side' 
        ? `h-8 md:h-10 rounded-full px-4 flex-row gap-2 shadow-sm hover:shadow-md ${winner ? 'bg-white/20 border-white ring-2 ring-white/50' : `bg-slate-900/80 ${borderColor} ${activeBorder}`}`
        : `flex-col justify-center h-full rounded-xl ${winner ? 'bg-white/20 border-white shadow-[inset_0_0_30px_rgba(255,255,255,0.2)] scale-[1.02] z-10' : `bg-slate-900/60 ${borderColor} ${activeBorder}`}`;

    return (
        <button 
            onClick={onClick}
            className={`
                relative transition-all duration-300 group select-none flex items-center overflow-hidden backdrop-blur-md border
                ${winner ? 'z-10' : 'hover:bg-white/5 active:scale-[0.98]'}
                ${containerStyle}
                ${className}
            `}
        >
            {/* Amount Badge */}
            {amount > 0 && (
                <div className={`absolute z-20 animate-bounce-in ${variant === 'side' ? '-top-2 -right-2' : 'top-1 right-1'}`}>
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-black text-[9px] md:text-[10px] px-1.5 py-0.5 rounded-full shadow-lg border border-yellow-300 flex items-center gap-1">
                        <Coins size={8} className="md:w-2.5 md:h-2.5" /> {amount}
                    </div>
                </div>
            )}

            {/* Content Layout */}
            {variant === 'side' ? (
                <>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${winner ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,1)]' : 'text-slate-400 group-hover:text-white'}`}>{label}</span>
                    <span className="text-[8px] font-mono text-yellow-500 bg-black/20 px-1.5 rounded border border-white/5">{odds}</span>
                    <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${colorClass} opacity-50`}></div>
                </>
            ) : (
                <div className="relative z-10 flex flex-col items-center justify-center gap-0.5 w-full px-1">
                    <span className={`text-[10px] md:text-sm font-black uppercase tracking-[0.15em] transition-colors ${winner ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'text-slate-300 group-hover:text-white'}`}>
                        {label}
                    </span>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border ${winner ? 'bg-white text-black border-white font-bold' : 'bg-black/20 text-slate-500 border-white/5 group-hover:border-white/10'}`}>
                        {odds}
                    </span>
                </div>
            )}

            {/* Background Effects for Main Bets */}
            {variant === 'main' && (
                <>
                    <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${colorClass} opacity-60 group-hover:opacity-100 transition-opacity duration-500`}></div>
                    <div className={`absolute inset-0 bg-gradient-to-b ${colorClass} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                </>
            )}
        </button>
    );
};

const ScoreBoard = ({ score, label, color }: { score: number, label: string, color: string }) => (
    <div className="flex flex-col items-center animate-fade-in">
        <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${color}`}>{label}</div>
        <div className={`
            w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center
            text-sm md:text-lg font-mono font-bold text-white shadow-inner relative overflow-hidden
        `}>
            {score}
        </div>
    </div>
);

// --- BACCARAT AI COMPONENT ---
const BaccaratAI = ({ roadmap, status }: { roadmap: RoadmapItem[], status: GameStatus }) => {
    const [prediction, setPrediction] = useState<'PLAYER' | 'BANKER' | 'WAITING'>('WAITING');
    const [confidence, setConfidence] = useState(0);
    const isScanning = status === GameStatus.Dealing;

    useEffect(() => {
        if (status === GameStatus.Idle) {
            // Simple Pattern Logic: Anti-trend (Gambler's Fallacy Simulator)
            const last = roadmap[0]?.winner;
            const newConf = Math.floor(Math.random() * (85 - 60) + 60);
            
            if (last === 'BANKER') setPrediction('PLAYER');
            else if (last === 'PLAYER') setPrediction('BANKER');
            else setPrediction(Math.random() > 0.5 ? 'BANKER' : 'PLAYER');
            
            setConfidence(newConf);
        }
    }, [roadmap, status]);

    return (
        <div className="w-full bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-purple-500/30 p-4 flex flex-col gap-4 shadow-[0_0_30px_rgba(168,85,247,0.1)] relative overflow-hidden group">
            {/* Scanning Effect Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-white/10 pb-2 relative z-10">
                <h3 className="text-purple-400 font-bold flex items-center gap-2 uppercase tracking-widest text-xs animate-pulse">
                    <BrainCircuit size={16} /> PREVISÃO IA
                </h3>
                <span className="text-[9px] text-slate-500 font-mono bg-black/30 px-1.5 rounded">V.1.0</span>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 min-h-[120px] relative z-10">
                {isScanning ? (
                    <>
                        <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                        <span className="text-[10px] text-purple-300 font-bold animate-pulse uppercase tracking-widest">Calculando...</span>
                    </>
                ) : (
                    <>
                        <div className="text-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mb-1 block">Sugestão</span>
                            <div className={`text-2xl font-black uppercase tracking-wider ${prediction === 'BANKER' ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : prediction === 'PLAYER' ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-slate-500'}`}>
                                {prediction === 'WAITING' ? 'AGUARDANDO' : prediction === 'PLAYER' ? 'JOGADOR' : 'BANCA'}
                            </div>
                        </div>
                        
                        <div className="w-full mt-2">
                            <div className="flex justify-between text-[9px] text-slate-500 mb-1 font-mono uppercase">
                                <span>Confiança</span>
                                <span className="text-purple-400 font-bold">{confidence}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000" style={{ width: `${confidence}%` }}></div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 text-center relative z-10">
                <p className="text-[9px] text-slate-500 leading-tight">
                    Baseado em <span className="text-white font-bold">{roadmap.length}</span> rodadas anteriores.
                </p>
            </div>
        </div>
    );
};

// --- HISTORY SIDEBAR COMPONENT ---
const MiniHistoryTicker = ({ history, onExpand }: { history: BaccHistoryItem[], onExpand: () => void }) => {
    const displayHistory = history.slice(0, 5); // Show top 5
    
    return (
        <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-3 flex flex-col gap-2 shrink-0 relative group min-h-[220px]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-1 shrink-0">
                <div className="flex items-center gap-2"><HistoryIcon size={14} className="text-casino-gold"/><span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Histórico</span></div>
                <button onClick={onExpand} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-1 rounded-md hover:bg-white/10" title="Ver Histórico Completo"><Maximize2 size={12} /></button>
            </div>
            <div className="flex flex-col gap-1.5 overflow-hidden">
                {displayHistory.length === 0 && (<div className="flex flex-col items-center justify-center text-slate-600 opacity-50 py-4"><Calendar size={20} className="mb-1"/><span className="text-[9px] font-bold uppercase tracking-widest">Sem Registros</span></div>)}
                {displayHistory.map((h) => {
                    const isWin = h.payout > h.bet;
                    const isPush = h.payout === h.bet && h.payout > 0;
                    
                    return (
                        <div key={h.id} className={`flex items-center justify-between p-1.5 rounded-lg border text-xs animate-slide-up ${isWin ? 'bg-green-900/10 border-green-500/20' : isPush ? 'bg-slate-800 border-white/10' : 'bg-red-900/5 border-red-500/10'}`}>
                             <div className="flex items-center gap-2">
                                 <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${h.winner === 'PLAYER' ? 'bg-blue-500 text-white' : h.winner === 'BANKER' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                     {h.winner[0]}
                                 </span>
                                 <span className="font-mono text-slate-400 text-[9px]">{h.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                             </div>
                             <div className={`font-bold font-mono text-[10px] flex flex-col items-end leading-none ${isWin ? 'text-green-400' : isPush ? 'text-slate-300' : 'text-red-400'}`}>
                                 <span>{isWin ? `+${(h.payout - h.bet).toFixed(2)}` : isPush ? 'PUSH' : `-${h.bet.toFixed(2)}`}</span>
                             </div>
                        </div>
                    );
                })}
            </div>
            {history.length > 5 && (<button onClick={onExpand} className="w-full text-[9px] text-slate-500 uppercase font-bold tracking-widest text-center hover:text-yellow-500 transition-colors mt-auto pt-1">Ver Todos ({history.length})</button>)}
        </div>
    );
};

const FullHistoryModal: React.FC<{ isOpen: boolean; onClose: () => void; history: BaccHistoryItem[] }> = ({ isOpen, onClose, history }) => {
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
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-white/5">
                    <div className="col-span-2">Resultado</div>
                    <div className="text-right">Aposta</div>
                    <div className="text-right">Retorno</div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
                    {history.length === 0 && <div className="text-center text-slate-500 py-10">Nenhum registro encontrado.</div>}
                    {history.map((h) => {
                         const profit = h.payout - h.bet;
                         const isWin = profit > 0;
                         const isPush = profit === 0 && h.payout > 0;
                         return (
                            <div key={h.id} className={`grid grid-cols-4 gap-2 items-center p-3 rounded-lg border text-sm transition-colors ${isWin ? 'bg-green-950/20 border-green-500/20 hover:bg-green-950/30' : isPush ? 'bg-slate-800 border-slate-700' : 'bg-red-900/10 border-red-500/10 hover:bg-red-900/20'}`}>
                                <div className="col-span-2 flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${h.winner === 'PLAYER' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : h.winner === 'BANKER' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
                                        {h.winner[0]}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-mono text-slate-300 text-xs">{h.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        <span className={`text-[9px] font-bold uppercase ${isWin ? 'text-green-500' : isPush ? 'text-slate-400' : 'text-red-500'}`}>
                                            {isWin ? 'LUCRO: ' + profit.toFixed(2) : isPush ? 'Empate' : 'Perda'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right font-mono text-slate-400 text-xs">{h.bet.toFixed(2)}</div>
                                <div className={`text-right font-mono font-bold text-xs ${isWin ? 'text-green-400' : isPush ? 'text-white' : 'text-red-400'}`}>{h.payout > 0 ? `+${h.payout.toFixed(2)}` : '0.00'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const BaccaratGame: React.FC<BaccaratGameProps> = ({ user, updateUser }) => {
    const {
        status, bets, gameState, roadmap, history, selectedChip, payout, loading, notifyMsg, totalBet, lastBets, serverSeedHash,
        setSelectedChip, placeBet, clearBets, rebet, deal, setNotifyMsg
    } = useBaccaratLogic(user, updateUser);

    const [showProvablyFair, setShowProvablyFair] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [showFullHistory, setShowFullHistory] = useState(false);

    // Helpers de visual
    const isPlayerWin = gameState.winner === 'PLAYER';
    const isBankerWin = gameState.winner === 'BANKER';
    const isTie = gameState.winner === 'TIE';

    return (
        <div className="w-full h-full flex flex-col items-center relative bg-[#0f172a] overflow-hidden text-white font-sans">
            <Notification message={notifyMsg} onClose={() => setNotifyMsg(null)} />
            
            <ProvablyFairModal 
                isOpen={showProvablyFair} 
                onClose={() => setShowProvablyFair(false)} 
                serverSeedHash={serverSeedHash} 
                clientSeed={user.id} 
                nonce={roadmap.length} 
            />

            <FullHistoryModal 
                isOpen={showFullHistory} 
                onClose={() => setShowFullHistory(false)} 
                history={history} 
            />

            {/* RULES MODAL (Mobile) */}
            {showRules && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in xl:hidden">
                    <div className="bg-slate-900 border border-casino-gold/30 w-full max-w-sm rounded-2xl p-6 relative shadow-2xl">
                        <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Info size={20} className="text-casino-gold"/> Regras</h3>
                        <ul className="space-y-2 text-xs text-slate-300">
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Player (Jogador)</span><span className="font-bold text-white">1:1</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Banker (Banca)</span><span className="font-bold text-white">0.95:1</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Tie (Empate)</span><span className="font-bold text-white">8:1</span></li>
                            <li className="flex justify-between border-b border-white/5 pb-2"><span>Par P. / Par B.</span><span className="font-bold text-yellow-400">11:1</span></li>
                            <li className="pt-2 text-slate-500">Objetivo: Somar 9 pontos. 10, J, Q, K valem 0. Ás vale 1.</li>
                        </ul>
                    </div>
                </div>
            )}
            
            {/* --- BACKGROUND FUTURISTA --- */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black z-0"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] z-0"></div>
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none"></div>

            {/* --- HEADER --- */}
            <div className="w-full max-w-7xl px-4 pt-4 pb-2 flex justify-between items-center z-20 shrink-0 relative">
                <Link to="/" className="w-10 h-10 rounded-xl bg-slate-800/50 hover:bg-slate-700 flex items-center justify-center border border-white/5 transition-colors text-slate-400 hover:text-white relative z-20">
                    <ChevronLeft size={20} />
                </Link>
                
                {/* Título Centralizado */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pt-2 whitespace-nowrap z-10 pointer-events-none">
                    <h1 className="text-2xl md:text-3xl font-black tracking-tighter italic bg-gradient-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent drop-shadow-sm">
                        BACCARAT <span className="text-[10px] not-italic text-slate-500 font-normal align-top ml-1">PRO</span>
                    </h1>
                </div>

                <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10 shadow-lg relative z-20">
                    <div className="p-1 bg-yellow-500/20 rounded-full"><Coins size={14} className="text-yellow-500" /></div>
                    <span className="text-sm font-mono font-bold text-white">R$ {user.balance.toFixed(2)}</span>
                </div>
            </div>

            <div className="flex-1 w-full flex flex-col items-center min-h-0 pt-2 md:pt-6 pb-4 px-4 overflow-y-auto no-scrollbar scroll-smooth">
                
                {/* --- MOBILE STATS BAR --- */}
                <div className="xl:hidden w-full max-w-[500px] mb-4 flex items-stretch gap-2 z-30 shrink-0 animate-slide-up">
                    <div className={`flex-1 rounded-xl p-2 flex flex-col justify-center items-center border shadow-lg transition-all duration-300 ${totalBet > 0 ? 'bg-gradient-to-br from-blue-900/40 to-red-900/40 border-white/20' : 'bg-slate-900 border-white/10'}`}>
                        <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Aposta Total</span>
                        <span className={`text-base font-black font-mono leading-none ${totalBet > 0 ? 'text-white' : 'text-slate-500'}`}>R$ {totalBet.toFixed(2)}</span>
                    </div>
                    <button onClick={() => setShowProvablyFair(true)} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-green-500 hover:text-green-400 hover:bg-slate-800 transition-colors">
                        <ShieldCheck size={16} />
                        <span className="text-[7px] font-bold uppercase mt-1">Fair</span>
                    </button>
                    <button onClick={() => setShowRules(true)} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <Info size={16} />
                        <span className="text-[7px] font-bold uppercase mt-1">Regras</span>
                    </button>
                </div>

                {/* --- MAIN LAYOUT (Sidebar + Table) --- */}
                <div className="w-full max-w-[1400px] flex items-center justify-center gap-4 xl:gap-6 flex-1 min-h-0">
                    
                    {/* --- LEFT SIDEBAR (Desktop Only) --- */}
                    <div className="hidden xl:flex w-[260px] flex-col gap-3 justify-center shrink-0 self-center transition-all duration-300 animate-fade-in">
                        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-md shrink-0">
                            <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                                <h3 className="text-casino-gold font-bold flex items-center gap-2 uppercase tracking-widest text-xs"><Info size={14} /> Regras</h3>
                                <button onClick={() => setShowProvablyFair(true)} className="text-green-500 hover:text-green-400 transition-colors bg-white/5 p-1 rounded-md" title="Provably Fair"><ShieldCheck size={14} /></button>
                            </div>
                            <ul className="space-y-2 text-[11px] text-slate-300">
                                <li className="flex justify-between border-b border-white/5 pb-1"><span>Jogador (Player)</span><span className="font-bold text-white">1:1</span></li>
                                <li className="flex justify-between border-b border-white/5 pb-1"><span>Banca (Banker)</span><span className="font-bold text-white">0.95:1</span></li>
                                <li className="flex justify-between border-b border-white/5 pb-1"><span>Empate (Tie)</span><span className="font-bold text-white">8:1</span></li>
                                <li className="flex justify-between border-b border-white/5 pb-1"><span>Pares (Pairs)</span><span className="font-bold text-yellow-400">11:1</span></li>
                            </ul>
                            <div className="mt-3 text-[10px] text-slate-500 leading-tight">
                                O objetivo é somar 9 pontos. Figuras valem 0.
                            </div>
                        </div>
                        
                        {/* Current Bet Display Desktop */}
                        <div className="h-[64px] w-full flex-none relative">
                            <div className={`absolute inset-0 rounded-2xl p-1 shadow-lg transition-all duration-300 ${totalBet > 0 ? 'bg-gradient-to-r from-blue-600 via-purple-500 to-red-600 animate-pulse-gold' : 'bg-slate-800 border border-white/5'}`}>
                                <div className="bg-slate-900 rounded-xl p-2 text-center relative overflow-hidden h-full flex flex-col justify-center">
                                    {totalBet > 0 && (<div className="absolute top-1.5 right-2 text-casino-gold"><Lock size={10} /></div>)}
                                    <div className="flex flex-col items-center">
                                        <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Aposta Total</div>
                                        <div className={`text-xl font-bold font-mono leading-tight ${totalBet > 0 ? 'text-white' : 'text-slate-500'}`}>R$ {totalBet.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* History Ticker */}
                        <MiniHistoryTicker history={history} onExpand={() => setShowFullHistory(true)} />
                    </div>

                    {/* --- CENTER GAME AREA --- */}
                    <div className="flex-1 w-full max-w-[800px] flex flex-col items-center relative">
                        
                        {/* CARDS AREA */}
                        <div className="w-full flex justify-between items-start gap-2 md:gap-12 mb-4 md:mb-8 min-h-[200px] md:min-h-[240px] relative">
                            {/* Linha Central Decorativa */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent -translate-x-1/2 hidden md:block"></div>
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

                            {/* PLAYER SIDE */}
                            <div className="flex-1 flex flex-col items-center md:items-end pr-0 md:pr-10 relative">
                                <div className="flex flex-col-reverse md:flex-row items-center gap-2 md:gap-4 mb-2 md:mb-4">
                                    {gameState.pHand.length > 0 && <ScoreBoard score={gameState.pScore} label="Pontos" color="text-cyan-400" />}
                                    <h3 className={`text-sm md:text-2xl font-black uppercase tracking-widest ${isPlayerWin ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'text-slate-400'}`}>Jogador</h3>
                                </div>
                                <div className="flex justify-center md:justify-end items-center relative h-28 md:h-40 perspective-1000">
                                    {gameState.pHand.length === 0 ? (
                                        <div className="w-20 h-28 md:w-28 md:h-40 rounded-xl border-2 border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                                            <span className="text-slate-700 text-[10px] md:text-xs font-bold uppercase">Espaço</span>
                                        </div>
                                    ) : (
                                        gameState.pHand.map((card, i) => (
                                            <div key={card.id} className="transform origin-bottom-right transition-transform hover:-translate-y-4 hover:z-20 duration-300" 
                                                style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                                                <CardComponent card={card} index={i} />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* VS BADGE */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 opacity-20 hidden md:block">
                                <span className="text-6xl font-black text-white italic">VS</span>
                            </div>

                            {/* BANKER SIDE */}
                            <div className="flex-1 flex flex-col items-center md:items-start pl-0 md:pl-10 relative">
                                <div className="flex flex-col-reverse md:flex-row-reverse items-center gap-2 md:gap-4 mb-2 md:mb-4">
                                    {gameState.bHand.length > 0 && <ScoreBoard score={gameState.bScore} label="Pontos" color="text-red-400" />}
                                    <h3 className={`text-sm md:text-2xl font-black uppercase tracking-widest ${isBankerWin ? 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)]' : 'text-slate-400'}`}>Banca</h3>
                                </div>
                                <div className="flex justify-center md:justify-start items-center relative h-28 md:h-40 perspective-1000">
                                    {gameState.bHand.length === 0 ? (
                                        <div className="w-20 h-28 md:w-28 md:h-40 rounded-xl border-2 border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                                            <span className="text-slate-700 text-[10px] md:text-xs font-bold uppercase">Espaço</span>
                                        </div>
                                    ) : (
                                        gameState.bHand.map((card, i) => (
                                            <div key={card.id} className="transform origin-bottom-left transition-transform hover:-translate-y-4 hover:z-20 duration-300" 
                                                style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                                                <CardComponent card={card} index={i} />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* GAME OVER MESSAGE - REDESIGNED: COMPACT FLOATING CARD */}
                        {status === GameStatus.GameOver && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce-in pointer-events-none w-full flex justify-center">
                                <div className={`
                                    relative px-8 py-6 rounded-3xl backdrop-blur-xl border-2 shadow-2xl flex flex-col items-center gap-2 min-w-[280px] overflow-hidden
                                    ${isPlayerWin 
                                        ? 'bg-blue-950/80 border-blue-400 shadow-[0_0_50px_rgba(59,130,246,0.6)]' 
                                        : isBankerWin 
                                            ? 'bg-red-950/80 border-red-400 shadow-[0_0_50px_rgba(239,68,68,0.6)]' 
                                            : 'bg-emerald-950/80 border-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.6)]'}
                                `}>
                                    <div className="absolute inset-0 bg-white/5 animate-pulse"></div>
                                    <h2 className={`relative text-3xl font-black italic tracking-tighter drop-shadow-lg uppercase whitespace-nowrap ${isPlayerWin ? 'text-blue-300' : isBankerWin ? 'text-red-300' : 'text-emerald-300'}`}>
                                        {isPlayerWin ? 'JOGADOR VENCEU' : isBankerWin ? 'BANCA VENCEU' : 'EMPATE'}
                                    </h2>
                                    {payout > 0 ? (
                                        <div className="bg-white text-black font-black text-xl px-4 py-1 rounded-full shadow-lg flex items-center gap-2 mt-1">
                                            <Coins size={18} fill="black" /> + R$ {payout.toFixed(2)}
                                        </div>
                                    ) : (
                                        <span className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">Sem Retorno</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- NOVA ÁREA DE APOSTAS REESTRUTURADA --- */}
                        <div className="w-full max-w-[720px] flex flex-col gap-2 mb-2 z-10">
                            
                            {/* LINHA 1: APOSTAS LATERAIS (PARES) */}
                            <div className="flex justify-between px-2 md:px-4">
                                <div className="w-[120px] md:w-[150px]">
                                    <BetZone type="PAIR_PLAYER" label="Par P.." odds="11:1" amount={bets.PAIR_PLAYER} onClick={() => placeBet('PAIR_PLAYER')} colorClass="from-cyan-900 to-cyan-700" winner={false} variant="side" />
                                </div>
                                <div className="w-[120px] md:w-[150px]">
                                    <BetZone type="PAIR_BANKER" label="Par B." odds="11:1" amount={bets.PAIR_BANKER} onClick={() => placeBet('PAIR_BANKER')} colorClass="from-rose-900 to-rose-700" winner={false} variant="side" />
                                </div>
                            </div>

                            {/* LINHA 2: APOSTAS PRINCIPAIS */}
                            <div className="flex w-full gap-2 md:gap-3 h-16 md:h-24 px-2">
                                {/* JOGADOR (ESQUERDA) */}
                                <div className="flex-1">
                                    <BetZone type="PLAYER" label="Jogador" odds="1:1" amount={bets.PLAYER} onClick={() => placeBet('PLAYER')} colorClass="from-blue-600 to-blue-800" winner={status === GameStatus.GameOver && isPlayerWin} className="w-full h-full" />
                                </div>
                                
                                {/* EMPATE (CENTRO - MENOR) */}
                                <div className="w-[22%] max-w-[100px]">
                                    <BetZone type="TIE" label="Empate" odds="8:1" amount={bets.TIE} onClick={() => placeBet('TIE')} colorClass="from-emerald-600 to-emerald-800" winner={status === GameStatus.GameOver && isTie} className="w-full h-full" />
                                </div>

                                {/* BANCA (DIREITA) */}
                                <div className="flex-1">
                                    <BetZone type="BANKER" label="Banca" odds="0.95:1" amount={bets.BANKER} onClick={() => placeBet('BANKER')} colorClass="from-red-600 to-red-800" winner={status === GameStatus.GameOver && isBankerWin} className="w-full h-full" />
                                </div>
                            </div>

                        </div>

                        {/* --- CONTROLES INFERIORES --- */}
                        <div className="w-full max-w-md flex flex-col gap-3 mx-auto">
                            <div className="flex justify-center gap-3 md:gap-5 py-6 overflow-x-auto no-scrollbar">
                                {[1, 5, 10, 25, 100].map(val => (
                                    <ChipBtn key={val} val={val} selected={selectedChip === val} onClick={() => setSelectedChip(val)} />
                                ))}
                            </div>

                            <div className="flex items-center justify-center gap-3 bg-slate-900/90 p-2 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl">
                                <button 
                                    onClick={clearBets} 
                                    disabled={loading || status !== GameStatus.Idle}
                                    className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-slate-800 hover:bg-red-900/30 border border-white/5 hover:border-red-500/50 flex items-center justify-center text-slate-400 hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
                                >
                                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                                </button>

                                <button 
                                    onClick={deal} 
                                    disabled={loading || totalBet === 0 || status !== GameStatus.Idle}
                                    className={`
                                        flex-1 h-12 md:h-14 rounded-xl font-black text-lg md:text-xl tracking-widest uppercase flex items-center justify-center gap-2
                                        transition-all duration-300 shadow-lg active:scale-95
                                        ${loading || totalBet === 0 || status !== GameStatus.Idle 
                                            ? 'bg-slate-800 text-slate-600 border border-white/5 cursor-not-allowed' 
                                            : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] border-t border-emerald-400'}
                                    `}
                                >
                                    {loading ? (
                                        <Activity className="animate-spin" />
                                    ) : (
                                        <>
                                            <span>APOSTAR</span>
                                        </>
                                    )}
                                </button>

                                <button 
                                    onClick={rebet} 
                                    disabled={loading || !lastBets || status !== GameStatus.Idle}
                                    className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-slate-800 hover:bg-blue-900/30 border border-white/5 hover:border-blue-500/50 flex items-center justify-center text-slate-400 hover:text-blue-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
                                >
                                    <RotateCcw size={20} className="group-hover:-rotate-180 transition-transform duration-500" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* --- RIGHT SIDEBAR (AI) --- */}
                    <div className="hidden xl:flex w-[260px] flex-col gap-4 justify-center shrink-0 self-center transition-all duration-300">
                        <BaccaratAI roadmap={roadmap} status={status} />
                    </div>

                </div>
            </div>

            {/* --- ROADMAP FOOTER (Bead Plate Style) --- */}
            <div className="w-full h-14 md:h-16 bg-slate-950 border-t border-white/10 flex items-center px-4 overflow-x-auto no-scrollbar shrink-0 z-30">
                <div className="flex items-center gap-2 mr-4 shrink-0 opacity-50">
                    <Trophy size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Roadmap</span>
                </div>
                <div className="flex gap-1.5 h-full items-center">
                    {roadmap.length === 0 && <span className="text-xs text-slate-600">Nenhum resultado recente.</span>}
                    {roadmap.map((item, i) => (
                        <div 
                            key={i} 
                            className={`
                                w-6 h-6 md:w-8 md:h-8 rounded-full border flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm relative
                                ${item.winner === 'PLAYER' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 
                                  item.winner === 'BANKER' ? 'bg-red-500/20 border-red-500 text-red-400' : 
                                  'bg-emerald-500/20 border-emerald-500 text-emerald-400'}
                            `}
                        >
                            {item.winner === 'PLAYER' ? 'P' : item.winner === 'BANKER' ? 'B' : 'T'}
                            {(item.pair === 'PLAYER' || item.pair === 'BOTH') && <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full border border-black"></div>}
                            {(item.pair === 'BANKER' || item.pair === 'BOTH') && <div className="absolute top-0 left-0 w-2 h-2 bg-red-500 rounded-full border border-black"></div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};