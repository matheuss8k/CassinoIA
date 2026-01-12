
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Coins, Info, ShieldCheck, History as HistoryIcon, X, Maximize2, Calendar, Trophy } from 'lucide-react';
import { User, GameStatus } from '../types';
import { useUser } from '../contexts/UserContext';
import { ProvablyFairModal } from './UI/ProvablyFairModal';
import { Notification } from './UI/Notification';

interface GameLayoutProps {
    title: string;
    badge?: string;
    gameId: string;
    children: React.ReactNode;
    
    // Slots de Layout
    leftPanel?: React.ReactNode;
    rightPanel?: React.ReactNode;
    mobileStats?: React.ReactNode; // Barra de status específica mobile
    
    // Dados para os Modais Padrão
    rulesContent?: React.ReactNode;
    history?: any[]; // Tipo genérico para aceitar históricos diferentes
    
    // Provably Fair Data
    serverSeedHash?: string;
    clientSeed?: string;
    nonce?: number;
    
    notifyMsg?: string | null;
    onCloseNotify?: () => void;
}

// Sub-componente de Histórico Genérico para Sidebar
const SidebarHistory = ({ history }: { history: any[] }) => {
    const [expanded, setExpanded] = useState(false);
    const displayItems = history.slice(0, 5);

    if (!history || history.length === 0) return null;

    return (
        <div className="w-full bg-slate-900/50 rounded-2xl border border-white/5 p-4 flex flex-col gap-2 shrink-0 overflow-hidden relative group min-h-[150px]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-1 shrink-0">
                <div className="flex items-center gap-2">
                    <HistoryIcon size={14} className="text-slate-400"/>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Recentes</span>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                {displayItems.length === 0 && <span className="text-xs text-slate-500 text-center py-4">Sem registros</span>}
                {displayItems.map((h, i) => {
                    const isWin = (h.payout || h.win) > (h.bet || h.amount);
                    const amount = h.payout || h.win || 0;
                    return (
                        <div key={h.id || i} className={`flex items-center justify-between p-2 rounded-lg border text-xs ${isWin ? 'bg-green-900/10 border-green-500/20' : 'bg-slate-950 border-white/5'}`}>
                             <span className="font-mono text-slate-400 text-[10px]">{h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                             <span className={`font-bold ${isWin ? 'text-green-400' : 'text-slate-500'}`}>{isWin ? `+${(amount - (h.bet || h.amount)).toFixed(2)}` : `-${(h.bet || h.amount).toFixed(2)}`}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const GameLayout: React.FC<GameLayoutProps> = ({
    title,
    badge,
    children,
    leftPanel,
    rightPanel,
    mobileStats,
    rulesContent,
    history = [],
    serverSeedHash = '',
    clientSeed = '',
    nonce = 0,
    notifyMsg,
    onCloseNotify
}) => {
    const { user } = useUser();
    const [showRules, setShowRules] = useState(false);
    const [showFair, setShowFair] = useState(false);

    if (!user) return null;

    return (
        <div className="w-full h-full flex flex-col items-center relative overflow-hidden bg-[#0f172a] text-white font-sans">
            
            {/* --- GLOBAL OVERLAYS --- */}
            {notifyMsg && onCloseNotify && <Notification message={notifyMsg} onClose={onCloseNotify} />}
            
            <ProvablyFairModal 
                isOpen={showFair} 
                onClose={() => setShowFair(false)} 
                serverSeedHash={serverSeedHash} 
                clientSeed={clientSeed || user.id} 
                nonce={nonce} 
            />

            {/* Modal de Regras (Mobile/Desktop) */}
            {showRules && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-casino-gold/30 w-full max-w-sm rounded-2xl p-6 relative shadow-2xl">
                        <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Info size={20} className="text-casino-gold"/> Regras</h3>
                        <div className="space-y-2 text-xs text-slate-300">
                            {rulesContent || <p>Regras não disponíveis.</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* --- BACKGROUND --- */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black z-0 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] z-0 pointer-events-none"></div>

            {/* --- HEADER --- */}
            <div className="w-full max-w-[1600px] px-4 pt-4 pb-2 flex justify-between items-center z-20 shrink-0 relative">
                <Link to="/" className="w-10 h-10 rounded-xl bg-slate-800/50 hover:bg-slate-700 flex items-center justify-center border border-white/5 transition-colors text-slate-400 hover:text-white relative z-20">
                    <ChevronLeft size={20} />
                </Link>
                
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pt-2 whitespace-nowrap z-10 pointer-events-none">
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter italic bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-sm uppercase">
                        {title} <span className="text-[10px] md:text-xs not-italic text-casino-gold font-bold align-top ml-1 bg-yellow-500/10 px-1 rounded border border-yellow-500/20">{badge || 'IA'}</span>
                    </h1>
                </div>

                <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10 shadow-lg relative z-20">
                    <div className="p-1 bg-yellow-500/20 rounded-full"><Coins size={14} className="text-yellow-500" /></div>
                    <span className="text-sm font-mono font-bold text-white">R$ {user.balance.toFixed(2)}</span>
                </div>
            </div>

            {/* --- MAIN SCROLLABLE AREA --- */}
            <div className="flex-1 w-full flex flex-col items-center min-h-0 pt-2 md:pt-6 pb-4 px-4 overflow-y-auto no-scrollbar scroll-smooth">
                
                {/* Mobile Stats Bar (Inserted via prop) */}
                <div className="xl:hidden w-full max-w-[500px] mb-4 flex items-stretch gap-2 z-30 shrink-0 animate-slide-up">
                    {mobileStats}
                    <button onClick={() => setShowFair(true)} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-green-500 hover:text-green-400 hover:bg-slate-800 transition-colors">
                        <ShieldCheck size={16} />
                        <span className="text-[7px] font-bold uppercase mt-1">Fair</span>
                    </button>
                    <button onClick={() => setShowRules(true)} className="w-12 bg-slate-900 border border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <Info size={16} />
                        <span className="text-[7px] font-bold uppercase mt-1">Regras</span>
                    </button>
                </div>

                {/* --- 3-COLUMN LAYOUT --- */}
                <div className="w-full max-w-[1500px] flex items-start justify-center gap-4 xl:gap-6 flex-1 min-h-0">
                    
                    {/* LEFT PANEL (Rules/History/Config) */}
                    <div className={`hidden xl:flex w-[260px] flex-col gap-4 shrink-0 transition-all duration-300 animate-fade-in ${!leftPanel && !history.length ? 'hidden' : ''}`}>
                        
                        {/* Regras (Default se não houver leftPanel custom) */}
                        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-md shrink-0">
                            <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                                <h3 className="text-casino-gold font-bold flex items-center gap-2 uppercase tracking-widest text-xs"><Info size={14} /> Regras</h3>
                                <button onClick={() => setShowFair(true)} className="text-green-500 hover:text-green-400 transition-colors bg-white/5 p-1 rounded-md" title="Provably Fair"><ShieldCheck size={14} /></button>
                            </div>
                            <div className="text-[11px] text-slate-300 space-y-2">
                                {rulesContent || <p>Regras padrão do cassino aplicam-se.</p>}
                            </div>
                        </div>

                        {/* Custom Left Panel Content */}
                        {leftPanel}

                        {/* Default History (se não houver painel esquerdo customizado cobrindo isso) */}
                        <SidebarHistory history={history} />
                    </div>

                    {/* CENTER PANEL (Game) */}
                    <div className="flex-1 w-full max-w-[800px] flex flex-col items-center relative z-10 min-h-[400px]">
                        {children}
                    </div>

                    {/* RIGHT PANEL (AI/Stats) */}
                    <div className={`hidden xl:flex w-[260px] flex-col gap-4 shrink-0 transition-all duration-300 animate-fade-in ${!rightPanel ? 'hidden' : ''}`}>
                        {rightPanel}
                    </div>

                </div>
            </div>
            
            {/* Footer */}
            <div className="w-full text-center py-4 text-slate-600 text-[9px] uppercase tracking-widest font-bold opacity-50 select-none">
                &copy; 2024 Cassino IA. Jogue com responsabilidade.
            </div>
        </div>
    );
};
