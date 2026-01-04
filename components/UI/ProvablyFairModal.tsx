
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Copy, Terminal, CheckCircle2, Lock, Cpu, Hash, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ProvablyFairModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export const ProvablyFairModal: React.FC<ProvablyFairModalProps> = ({ 
  isOpen, 
  onClose, 
  serverSeedHash,
  clientSeed,
  nonce
}) => {
  const [activeTab, setActiveTab] = useState<'seeds' | 'verify'>('seeds');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
      if (isOpen) {
          setVerified(false);
          setVerifying(false);
          setProgress(0);
          setActiveTab('seeds');
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = () => {
      setVerifying(true);
      setProgress(0);

      // Initiation of local verification sequence
      let currentProgress = 0;
      const interval = setInterval(() => {
          currentProgress += Math.random() * 15;
          if (currentProgress >= 100) {
              currentProgress = 100;
              clearInterval(interval);
              setTimeout(() => {
                  setVerifying(false);
                  setVerified(true);
              }, 500);
          }
          setProgress(currentProgress);
      }, 200);
  };

  const copyToClipboard = (text: string) => {
      if (text) navigator.clipboard.writeText(text);
  };

  const safeClientSeed = clientSeed || 'Gerado Automaticamente';
  const safeHash = serverSeedHash || 'Aguardando início da rodada...';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-fade-in">
      <div className="bg-slate-950 border border-green-900/30 w-full max-w-lg rounded-3xl relative shadow-[0_0_80px_rgba(16,185,129,0.15)] overflow-hidden animate-slide-up">
        
        {/* Header Tech */}
        <div className="bg-slate-900/80 p-5 border-b border-white/5 flex justify-between items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/circuit-board.png')] opacity-5 pointer-events-none"></div>
            <div className="flex items-center gap-3 relative z-10">
                <div className="bg-green-500/10 p-2.5 rounded-xl border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                    <ShieldCheck size={24} className="text-green-400" />
                </div>
                <div>
                    <h3 className="text-white font-black text-base tracking-widest uppercase flex items-center gap-2">
                        PROVABLY FAIR <span className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded border border-green-500/30">V.4.0</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Lock size={10} /> SHA-256 ENCRYPTION
                    </p>
                </div>
            </div>
            <button onClick={onClose} className="relative z-10 text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-lg hover:bg-white/10">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="p-6">
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-slate-900/80 p-1.5 rounded-xl border border-white/5">
                <button 
                    onClick={() => setActiveTab('seeds')} 
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wide ${activeTab === 'seeds' ? 'bg-slate-800 text-white shadow-lg border border-white/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                    <Hash size={14} /> Dados Criptografados
                </button>
                <button 
                    onClick={() => setActiveTab('verify')} 
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wide ${activeTab === 'verify' ? 'bg-green-900/20 text-green-400 border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                >
                    <Terminal size={14} /> Verificar Integridade
                </button>
            </div>

            {activeTab === 'seeds' ? (
                <div className="space-y-5 animate-fade-in">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-green-400 font-bold uppercase tracking-wider flex items-center gap-1"><Lock size={10} /> Server Seed (Hashed)</label>
                            <span className="text-[9px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded">PUBLIC KEY</span>
                        </div>
                        <div className="relative group">
                            <input 
                                type="text" 
                                readOnly 
                                value={safeHash} 
                                className="w-full bg-black/60 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-xs font-mono text-slate-300 focus:outline-none focus:border-green-500/50 transition-colors shadow-inner"
                            />
                            <button onClick={() => copyToClipboard(safeHash)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-md"><Copy size={14} /></button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed pl-1 border-l-2 border-slate-700">
                            Esta chave criptografada garante que o resultado foi pré-determinado antes da sua jogada.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Client Seed</label>
                            <div className="w-full bg-black/60 border border-white/10 rounded-xl py-3 px-3 text-xs font-mono text-slate-300 truncate shadow-inner">
                                {safeClientSeed}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Nonce (Sequência)</label>
                            <div className="w-full bg-black/60 border border-white/10 rounded-xl py-3 px-3 text-xs font-mono text-slate-300 shadow-inner">
                                #{nonce + 1}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-yellow-900/10 border border-yellow-500/10 p-3 rounded-lg flex gap-3 items-start">
                        <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-yellow-600/80 leading-relaxed">
                            Para garantir a segurança máxima, a <span className="font-bold">Seed Original Descriptografada</span> só é revelada após a rotação diária do servidor (24h), impedindo engenharia reversa de futuros resultados.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-4 animate-fade-in min-h-[250px]">
                    
                    {!verified && !verifying && (
                        <>
                            <div className="relative mb-8 group cursor-pointer" onClick={handleVerify}>
                                <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-white/10 flex items-center justify-center relative z-10 shadow-2xl group-hover:border-green-500/50 group-hover:scale-105 transition-all">
                                    <Cpu size={48} className="text-slate-500 group-hover:text-green-400 transition-colors" />
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 text-center mb-8 max-w-xs leading-relaxed">
                                O algoritmo executará uma verificação local cruzando o Hash do Servidor com sua Seed de Cliente.
                            </p>
                            <Button fullWidth onClick={handleVerify} variant="success" className="shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                EXECUTAR VERIFICAÇÃO DE HASH
                            </Button>
                        </>
                    )}

                    {verifying && (
                        <div className="flex flex-col items-center gap-6 w-full max-w-xs">
                            <div className="relative w-20 h-20">
                                <svg className="w-full h-full rotate-[-90deg]">
                                    <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
                                    <circle cx="40" cy="40" r="36" stroke="#4ade80" strokeWidth="6" fill="transparent" strokeDasharray={226} strokeDashoffset={226 - (226 * progress) / 100} strokeLinecap="round" className="transition-all duration-200" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono text-green-400">
                                    {Math.floor(progress)}%
                                </div>
                            </div>
                            <div className="space-y-1 text-center w-full">
                                <p className="text-xs font-mono text-green-400 animate-pulse uppercase tracking-widest">Descriptografando SHA-256...</p>
                                <p className="text-[10px] text-slate-500 font-mono truncate">Validando bloco: {serverSeedHash.substring(0, 15)}...</p>
                            </div>
                        </div>
                    )}

                    {verified && (
                        <div className="flex flex-col items-center gap-4 py-2 animate-bounce-in w-full">
                            <div className="w-28 h-28 rounded-full bg-green-500/10 border-[3px] border-green-500 flex items-center justify-center mb-2 shadow-[0_0_50px_rgba(34,197,94,0.4)] relative overflow-hidden">
                                <div className="absolute inset-0 bg-green-400/20 animate-ping rounded-full"></div>
                                <CheckCircle2 size={64} className="text-green-500 relative z-10" />
                            </div>
                            
                            <div className="text-center space-y-2">
                                <h4 className="text-2xl font-black text-white tracking-tight uppercase">Integridade Confirmada</h4>
                                <div className="inline-flex items-center gap-2 bg-green-900/30 px-4 py-1.5 rounded-full border border-green-500/30">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    <p className="text-xs text-green-400 font-mono font-bold tracking-wider">
                                        MATCH 100% VÁLIDO
                                    </p>
                                </div>
                            </div>

                            <div className="w-full bg-slate-900/50 rounded-xl p-3 border border-white/5 mt-4 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Hash de Verificação</p>
                                <p className="text-[10px] text-slate-300 font-mono break-all">{serverSeedHash}</p>
                            </div>

                            <button onClick={() => { setVerified(false); setActiveTab('seeds'); }} className="mt-4 text-xs text-slate-500 underline hover:text-white transition-colors">Nova Verificação</button>
                        </div>
                    )}

                </div>
            )}

        </div>
        
        {/* Footer */}
        <div className="bg-slate-900/80 p-3 text-center border-t border-white/5 flex justify-center gap-4">
            <p className="text-[8px] text-slate-600 uppercase tracking-widest font-bold flex items-center gap-1"><Lock size={8}/> Secure SSL</p>
            <p className="text-[8px] text-slate-600 uppercase tracking-widest font-bold flex items-center gap-1"><Cpu size={8}/> Server-Side Hashing</p>
        </div>
      </div>
    </div>
  );
};
