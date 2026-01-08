import React, { useState } from 'react';
import { User, GameStatus } from '../types';
import { Button } from './UI/Button';
import { Diamond, Bomb, Volume2, VolumeX, Lock, Trophy, BrainCircuit, Scan, Sparkles, Info, X, Skull, Loader2, ShieldCheck, WifiOff, RefreshCcw } from 'lucide-react';
import { Notification } from './UI/Notification';
import { ProvablyFairModal } from './UI/ProvablyFairModal';
import { useMinesLogic } from '../hooks/useMinesLogic';

interface MinesGameProps {
  user: User;
  updateUser: (data: Partial<User>) => void;
}

export const MinesGame: React.FC<MinesGameProps> = ({ user, updateUser }) => {
  // HOOK DE LÓGICA (Controller)
  const {
      grid, mineCount, bet, betInput, status, revealedCount, isProcessing, soundEnabled, profit, currentMultiplier, fatalError, serverSeedHash, notifyMsg,
      aiSuggestion, isAiScanning, cashoutWin, lossPopup, loadingTileId, nextMultiplierPreview, currentWinValue,
      GRID_SIZE, MIN_BET, MAX_BET,
      actions
  } = useMinesLogic(user, updateUser);

  // Estados puramente visuais (UI Modals)
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showProvablyFair, setShowProvablyFair] = useState<boolean>(false);

  // --- FATAL ERROR MODAL ---
  if (fatalError) {
      return (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                      <WifiOff size={32} className="text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-white mb-2 uppercase">Erro de Sincronização</h2>
                  <p className="text-slate-400 text-sm mb-6">
                      Houve uma falha na comunicação com o servidor de jogo. Para sua segurança, a mesa precisa ser recarregada.
                  </p>
                  <Button fullWidth onClick={actions.handleForceReload} variant="danger" className="py-4">
                      <RefreshCcw size={18} className="mr-2" /> RECARREGAR MESA
                  </Button>
              </div>
          </div>
      );
  }

  return (
    <div className="w-full min-h-[calc(100vh-80px)] flex flex-col items-center p-4 relative animate-fade-in pt-28 md:pt-36 pb-8 overflow-y-auto no-scrollbar">
        <Notification message={notifyMsg} onClose={() => actions.setNotifyMsg(null)} />
        
        {/* Provably Fair Modal */}
        <ProvablyFairModal 
            isOpen={showProvablyFair} 
            onClose={() => setShowProvablyFair(false)}
            serverSeedHash={serverSeedHash}
            clientSeed={user.id}
            nonce={revealedCount}
        />

        <div className="absolute top-6 md:top-10 left-0 right-0 text-center z-20 pointer-events-none">
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

        {/* --- MOBILE AI BAR (Compact - Igual Blackjack Mobile) --- */}
        <div className="xl:hidden w-full max-w-[500px] mb-4 z-30 animate-slide-up">
            <div className={`flex items-center justify-between p-2 rounded-xl border backdrop-blur-md transition-all ${isAiScanning ? 'bg-purple-900/40 border-purple-500/50' : 'bg-slate-900/80 border-white/10'}`}>
                <div className="flex items-center gap-3 pl-2">
                    <BrainCircuit size={20} className={isAiScanning ? "text-purple-400 animate-pulse" : "text-slate-500"} />
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">IA Scanner</span>
                        <span className="text-[9px] text-slate-500">{isAiScanning ? 'Calculando...' : 'Pronto'}</span>
                    </div>
                </div>
                <Button 
                    onClick={actions.handleAskAi} 
                    disabled={status !== GameStatus.Playing || isAiScanning || aiSuggestion !== null}
                    size="sm"
                    variant="secondary"
                    className={`h-9 px-4 text-[10px] font-bold uppercase tracking-widest ${isAiScanning ? 'opacity-50 cursor-wait' : ''}`}
                >
                    {isAiScanning ? <Loader2 className="animate-spin" size={14} /> : <div className="flex items-center gap-1"><Scan size={14} /> Escanear</div>}
                </Button>
            </div>
        </div>

        {/* CONTAINER PRINCIPAL - AGORA COMPACTO E CENTRALIZADO VERTICALMENTE */}
        <div className="flex flex-col-reverse xl:flex-row items-center xl:items-center justify-center gap-4 xl:gap-6 w-full xl:w-auto z-10">
            
            {/* PAINEL ESQUERDO (APOSTAS) - 240px/280px */}
            <div className="w-full max-w-[500px] xl:max-w-none xl:w-[240px] 2xl:w-[280px] bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 md:p-6 flex flex-col gap-4 shadow-2xl shrink-0 transition-all duration-300">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center text-red-500"><Bomb size={18} /></div>
                        <span className="font-bold text-white text-lg tracking-tight">Configuração</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowProvablyFair(true)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-green-500 hover:text-green-400 transition-colors border border-white/5" title="Provably Fair"><ShieldCheck size={16} /></button>
                        <button onClick={() => setShowInfo(true)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-casino-gold transition-colors border border-white/5"><Info size={16} /></button>
                    </div>
                </div>

                <div className={`relative p-4 rounded-2xl border transition-all duration-300 overflow-hidden ${status === GameStatus.Playing ? 'bg-slate-900/90 border-casino-gold/60 shadow-[0_0_20px_rgba(251,191,36,0.15)]' : 'bg-slate-950/50 border-white/5'}`}>
                    {status === GameStatus.Playing && (<div className="absolute top-2 right-2 text-casino-gold animate-pulse drop-shadow-[0_0_5px_rgba(251,191,36,0.5)] z-20"><Lock size={14} /></div>)}
                    <div className="flex justify-between items-center mb-2">
                        <span className={`text-xs uppercase font-bold tracking-wider ${status === GameStatus.Playing ? 'text-white' : 'text-slate-400'}`}>{status === GameStatus.Playing ? 'Aposta em Jogo' : 'Valor da Aposta'}</span>
                        <span className="text-xs text-slate-500">Saldo: R$ {Math.floor(user.balance).toFixed(2)}</span>
                    </div>
                    
                    <div className="relative mb-3">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold ${status === GameStatus.Playing ? 'text-casino-gold' : 'text-slate-500'}`}>R$</span>
                        <input 
                            type="text" 
                            inputMode="decimal"
                            value={betInput} 
                            onChange={(e) => actions.handleBetChange(e.target.value)} 
                            onBlur={actions.handleBetBlur}
                            disabled={status === GameStatus.Playing} 
                            className={`w-full border-2 rounded-xl py-3 pl-10 pr-4 font-bold outline-none transition-colors text-lg ${status === GameStatus.Playing ? 'bg-black/40 border-casino-gold/30 text-casino-gold opacity-100' : 'bg-slate-900 border-slate-700 text-white focus:border-casino-gold'}`} 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => actions.adjustBet('half')} disabled={status === GameStatus.Playing} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-colors disabled:opacity-30">½</button>
                        <button onClick={() => actions.adjustBet('double')} disabled={status === GameStatus.Playing} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-colors disabled:opacity-30">2x</button>
                    </div>
                </div>

                <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 flex-1 flex flex-col justify-center min-h-[140px]">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Número de Minas</span>
                        <span className="bg-red-900/30 text-red-400 text-xs px-2 py-0.5 rounded border border-red-500/30 font-bold">{mineCount}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-4">
                        {[1, 3, 5, 10].map(count => (<button key={count} onClick={() => status === GameStatus.Idle && actions.setMineCount(count)} disabled={status === GameStatus.Playing} className={`py-2 rounded-xl text-sm font-bold border transition-all relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${mineCount === count ? 'bg-red-500 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}>{count}</button>))}
                    </div>
                    <input type="range" min="1" max="24" value={mineCount} onChange={(e) => status === GameStatus.Idle && actions.setMineCount(Number(e.target.value))} disabled={status === GameStatus.Playing} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-50" />
                </div>

                <div className="mt-auto pt-2 border-t border-white/5">
                    {status === GameStatus.Idle || status === GameStatus.GameOver ? (
                        <Button fullWidth size="lg" variant="primary" onClick={actions.startGame} disabled={isProcessing || cashoutWin !== null} className="h-14 md:h-16 text-lg md:text-xl shadow-[0_0_20px_rgba(251,191,36,0.2)] rounded-xl">{isProcessing ? 'INICIANDO...' : 'JOGAR'}</Button>
                    ) : (
                        <div className="space-y-3">
                             <div className="bg-slate-950/80 border border-green-500/30 p-3 rounded-xl flex items-center justify-between"><span className="text-xs text-slate-400 uppercase tracking-wider">Lucro Atual</span><span className="text-green-400 font-mono font-bold text-lg">R$ {currentWinValue.toFixed(2)}</span></div>
                             <Button fullWidth size="lg" variant="success" onClick={actions.handleCashout} disabled={isProcessing || loadingTileId !== null || revealedCount === 0} className="h-14 md:h-16 text-lg md:text-xl flex flex-col leading-none items-center justify-center gap-1 shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-pulse rounded-xl disabled:opacity-50 disabled:animate-none"><span>RETIRAR</span><span className="text-xs opacity-80 font-mono tracking-wider">R$ {currentWinValue.toFixed(2)}</span></Button>
                        </div>
                    )}
                </div>
            </div>

            {/* CENTRO (GRID DO JOGO) - SEM flex-1 e SEM mx-auto no desktop */}
            <div className="w-full max-w-[500px] md:max-w-[550px] aspect-square flex flex-col relative bg-slate-900/50 rounded-3xl border border-white/10 p-4 overflow-hidden backdrop-blur-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] shrink-0 mx-auto xl:mx-0">
                <div className="grid grid-cols-3 items-center mb-4 px-2 bg-slate-950/50 p-2 rounded-xl border border-white/5 shrink-0">
                     <div className="flex items-center gap-3 justify-self-start">
                         <div className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center border border-cyan-500/20"><Diamond size={16} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" /></div>
                         <div className="flex flex-col leading-none"><span className="text-[9px] text-slate-400 uppercase font-bold">Restantes</span><span className="text-white font-bold text-sm">{GRID_SIZE - mineCount - revealedCount}</span></div>
                     </div>
                     <div className={`justify-self-center transition-opacity duration-300 ${status === GameStatus.Playing ? 'opacity-100' : 'opacity-0'}`}>
                         <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-full border border-white/10 shadow-lg"><span className="text-[10px] text-slate-400 uppercase font-bold">Próximo</span><span className="text-casino-gold font-bold font-mono text-sm">{nextMultiplierPreview.toFixed(2)}x</span></div>
                     </div>
                     <button onClick={() => actions.setSoundEnabled(!soundEnabled)} className="justify-self-end text-slate-500 hover:text-white transition-colors p-2">{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
                </div>
                
                <div className="flex-1 flex items-center justify-center w-full h-full min-h-0">
                    <div className="grid grid-cols-5 gap-2 md:gap-3 w-full h-full">
                        {grid.map((tile, index) => {
                            const isSuggested = aiSuggestion === tile.id;
                            const isLocked = status !== GameStatus.Playing || tile.isRevealed || isProcessing || loadingTileId !== null;
                            const isLoading = loadingTileId === tile.id;
                            return (
                                <button key={tile.id} disabled={isLocked} onClick={() => actions.handleTileClick(index)} className={`relative w-full h-full rounded-xl transition-all duration-300 transform perspective-1000 group ${tile.isRevealed ? 'bg-slate-800 border-slate-700 cursor-default shadow-inner' : isSuggested ? 'bg-purple-900/40 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-10 scale-105 animate-pulse' : 'bg-gradient-to-br from-slate-700 to-slate-800 border-b-[4px] border-slate-950 hover:-translate-y-1 hover:brightness-110 cursor-pointer shadow-lg active:border-b-0 active:translate-y-0.5'} ${!isLocked && !tile.isRevealed && !isSuggested ? 'hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]' : ''} ${status === GameStatus.GameOver && tile.content === 'mine' && !tile.isRevealed ? 'opacity-50 grayscale' : ''} ${isLoading ? 'scale-90 opacity-80 ring-2 ring-white/20' : ''} ${isLocked && !tile.isRevealed && !isLoading ? 'cursor-not-allowed opacity-90' : ''}`}>
                                    {isSuggested && !tile.isRevealed && !isLoading && (<div className="absolute inset-0 flex items-center justify-center animate-bounce"><div className="bg-purple-500/20 p-1.5 rounded-full border border-purple-500/50 backdrop-blur-sm"><Scan size={20} className="text-purple-300" /></div></div>)}
                                    {isLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Loader2 className="animate-spin text-white/50" size={24} />
                                        </div>
                                    )}
                                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${tile.isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                                        {tile.content === 'mine' ? (
                                            <div className="relative animate-bounce"><Bomb size={24} className="text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] md:w-8 md:h-8" />{status === GameStatus.GameOver && tile.isRevealed && (<div className="absolute inset-0 bg-red-500 blur-xl opacity-50 animate-pulse"></div>)}</div>
                                        ) : tile.content === 'gem' ? (
                                            <div className="relative animate-spin-slow"><Diamond size={24} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] md:w-8 md:h-8" /><div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30"></div></div>
                                        ) : null}
                                    </div>
                                    {!tile.isRevealed && !isLoading && (<div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none"><div className="w-6 h-6 rounded-full bg-white blur-md"></div></div>)}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {cashoutWin !== null && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm bg-black/40 rounded-[2rem]">
                         <div className="relative pointer-events-none">
                            <div className="absolute inset-0 bg-green-500 blur-[30px] opacity-10 rounded-full animate-pulse"></div>
                            <div className="bg-slate-900/95 border-2 border-green-500 p-4 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.3)] flex flex-col items-center gap-2 transform scale-100 animate-slide-up relative z-10 min-w-[220px]">
                                <div className="p-3 bg-green-500/20 rounded-full mb-1 ring-2 ring-green-500/10"><Trophy size={28} className="text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]" /></div>
                                <div className="text-center"><p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Você Sacou</p><p className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-lg">R$ <span className="text-transparent bg-clip-text bg-gradient-to-br from-green-400 to-emerald-600">{cashoutWin.toFixed(2)}</span></p></div>
                                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden"><div className="h-full bg-green-500 animate-[shine_2s_infinite]"></div></div>
                            </div>
                         </div>
                    </div>
                )}
                {lossPopup && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm bg-black/40 rounded-[2rem]">
                         <div className="relative pointer-events-none">
                            <div className="absolute inset-0 bg-red-500 blur-[30px] opacity-10 rounded-full animate-pulse"></div>
                            <div className="bg-slate-900/95 border-2 border-red-500 p-4 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.3)] flex flex-col items-center gap-2 transform scale-100 animate-slide-up relative z-10 min-w-[220px]">
                                <div className="p-3 bg-red-500/20 rounded-full mb-1 ring-2 ring-red-500/10"><Skull size={28} className="text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" /></div>
                                <div className="text-center"><p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Fim de Jogo</p><p className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-lg text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-red-600">DERROTA</p></div>
                                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden"><div className="h-full bg-red-500 animate-[shine_2s_infinite]"></div></div>
                            </div>
                         </div>
                    </div>
                )}
            </div>

            {/* PAINEL DIREITO (IA) - 240px/280px */}
            <div className="hidden xl:flex w-[240px] 2xl:w-[280px] flex-col gap-4 justify-center shrink-0 transition-all duration-300">
                 <div className="w-full animate-slide-up h-full flex flex-col">
                    <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.1)] relative overflow-hidden group flex-1 flex flex-col min-h-[500px]">
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
                                    
                                    <Button 
                                        onClick={actions.handleAskAi} 
                                        disabled={isAiScanning || aiSuggestion !== null} 
                                        variant="secondary"
                                        className={`w-full py-4 mt-auto border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all ${isAiScanning ? 'bg-purple-900/50 cursor-wait' : 'bg-gradient-to-r from-purple-900 to-indigo-900 text-white'}`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {isAiScanning ? (<span className="text-xs uppercase tracking-widest">Processando</span>) : (<><Scan size={18} /><span className="text-xs font-bold uppercase tracking-widest">ESCANEAR CAMPO</span></>)}
                                        </div>
                                    </Button>
                                </>
                            )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[9px] text-slate-600 uppercase tracking-widest font-mono"><span>Sys: Online</span><span>Lat: 12ms</span></div>
                    </div>
                 </div>
            </div>
        </div>
        
        <div className="w-full text-center py-8 text-slate-600 text-[10px] uppercase tracking-widest font-bold opacity-50 select-none">
            &copy; 2024 Cassino IA. Jogue com responsabilidade.
        </div>
    </div>
  );
};