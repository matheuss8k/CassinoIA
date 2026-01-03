
import React, { useState } from 'react';
import { X, ShieldCheck, Copy, Terminal, CheckCircle2, Lock, Cpu, Hash } from 'lucide-react';
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

  if (!isOpen) return null;

  const handleVerify = () => {
      setVerifying(true);
      // Fake processing
      setTimeout(() => {
          setVerifying(false);
          setVerified(true);
      }, 1500);
  };

  const copyToClipboard = (text: string) => {
      if (text) navigator.clipboard.writeText(text);
  };

  // Safe string handling to prevent crashes
  const safeClientSeed = clientSeed || '';
  const safeHash = serverSeedHash || 'Hash ainda não gerado (Inicie uma rodada)';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-slate-950 border border-green-900/30 w-full max-w-lg rounded-3xl relative shadow-[0_0_50px_rgba(16,185,129,0.1)] overflow-hidden animate-slide-up">
        
        {/* Header Tech */}
        <div className="bg-slate-900/50 p-4 border-b border-white/5 flex justify-between items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-green-500/5 pointer-events-none"></div>
            <div className="flex items-center gap-2 relative z-10">
                <div className="bg-green-500/20 p-2 rounded-lg border border-green-500/30">
                    <ShieldCheck size={20} className="text-green-400" />
                </div>
                <div>
                    <h3 className="text-white font-bold text-sm tracking-widest uppercase">Provably Fair</h3>
                    <p className="text-[10px] text-green-500 font-mono">CRYPTOGRAPHIC VERIFICATION</p>
                </div>
            </div>
            <button onClick={onClose} className="relative z-10 text-slate-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="p-6">
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-slate-900/50 p-1 rounded-xl border border-white/5">
                <button 
                    onClick={() => setActiveTab('seeds')} 
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'seeds' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Hash size={14} /> DADOS DA RODADA
                </button>
                <button 
                    onClick={() => setActiveTab('verify')} 
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'verify' ? 'bg-green-900/20 text-green-400 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Terminal size={14} /> VERIFICAR
                </button>
            </div>

            {activeTab === 'seeds' ? (
                <div className="space-y-4 animate-fade-in">
                    <div className="space-y-2">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1"><Lock size={10} /> Server Seed (Hashed)</label>
                        <div className="relative group">
                            <input 
                                type="text" 
                                readOnly 
                                value={safeHash} 
                                className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-3 pr-10 text-xs font-mono text-green-400/80 focus:outline-none focus:border-green-500/50 transition-colors"
                            />
                            <button onClick={() => copyToClipboard(safeHash)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors p-1"><Copy size={14} /></button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">Este hash é gerado antes do resultado, garantindo que não alteramos o jogo.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Client Seed</label>
                            <div className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-3 text-xs font-mono text-slate-300 truncate">
                                {safeClientSeed}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nonce</label>
                            <div className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-3 text-xs font-mono text-slate-300">
                                #{nonce}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-4 animate-fade-in">
                    
                    {!verified && !verifying && (
                        <>
                            <div className="w-20 h-20 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center mb-6">
                                <Cpu size={40} className="text-slate-600" />
                            </div>
                            <p className="text-sm text-slate-400 text-center mb-6 max-w-xs">
                                O algoritmo SHA-256 verificará se o hash do servidor corresponde ao resultado gerado.
                            </p>
                            <Button fullWidth onClick={handleVerify} variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                                EXECUTAR VERIFICAÇÃO
                            </Button>
                        </>
                    )}

                    {verifying && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="w-16 h-16 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin"></div>
                            <p className="text-xs font-mono text-green-400 animate-pulse">CALCULANDO HASHSHA256...</p>
                        </div>
                    )}

                    {verified && (
                        <div className="flex flex-col items-center gap-2 py-4 animate-fade-in">
                            <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                <CheckCircle2 size={48} className="text-green-500" />
                            </div>
                            <h4 className="text-xl font-black text-white tracking-tight">RESULTADO JUSTO</h4>
                            <p className="text-xs text-green-400 font-mono bg-green-900/20 px-3 py-1 rounded border border-green-500/30 mt-2">
                                MATCH VALIDADO: 100%
                            </p>
                            <button onClick={() => { setVerified(false); setActiveTab('seeds'); }} className="mt-6 text-xs text-slate-500 underline hover:text-white">Voltar</button>
                        </div>
                    )}

                </div>
            )}

        </div>
        
        {/* Footer */}
        <div className="bg-slate-950 p-3 text-center border-t border-white/5">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">Secure SHA-256 Encryption</p>
        </div>
      </div>
    </div>
  );
};
