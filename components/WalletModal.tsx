import React, { useState } from 'react';
import { Button } from './UI/Button';
import { X, ArrowDownCircle, ArrowUpCircle, DollarSign } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onTransaction: (amount: number, type: 'deposit' | 'withdraw') => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose, currentBalance, onTransaction }) => {
  const [amount, setAmount] = useState<string>('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');

  if (!isOpen) return null;

  const handleTransaction = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    
    if (mode === 'withdraw' && val > currentBalance) {
      alert("Saldo insuficiente!");
      return;
    }

    onTransaction(val, mode);
    setAmount('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-casino-gold/30 w-full max-w-md rounded-2xl p-6 relative shadow-2xl shadow-casino-gold/10">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <DollarSign className="text-casino-gold" /> Carteira
        </h2>

        <div className="bg-slate-800 rounded-xl p-4 mb-6 text-center border border-slate-700">
          <p className="text-slate-400 text-sm mb-1">Saldo Atual</p>
          <p className="text-3xl font-bold text-white">R$ {currentBalance.toFixed(2)}</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('deposit')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 font-semibold transition-colors ${mode === 'deposit' ? 'bg-casino-green text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            <ArrowDownCircle size={18} /> Depositar
          </button>
          <button
            onClick={() => setMode('withdraw')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 font-semibold transition-colors ${mode === 'withdraw' ? 'bg-casino-red text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            <ArrowUpCircle size={18} /> Sacar
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-2 text-sm">Valor (R$)</label>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-casino-gold"
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
             {[50, 100, 200, 500].map(val => (
               <button 
                key={val} 
                onClick={() => setAmount(val.toString())}
                className="bg-slate-800 hover:bg-slate-700 text-xs py-2 rounded border border-slate-700 text-slate-300"
               >
                 +{val}
               </button>
             ))}
          </div>

          <Button fullWidth onClick={handleTransaction} variant={mode === 'deposit' ? 'success' : 'danger'}>
            Confirmar {mode === 'deposit' ? 'Depósito' : 'Saque'}
          </Button>
        </div>
      </div>
    </div>
  );
};
