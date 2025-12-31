import React, { useState } from 'react';
import { User } from './types';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { BlackjackGame } from './components/BlackjackGame';
import { WalletModal } from './components/WalletModal';
import { DatabaseService } from './services/database';
import { User as UserIcon, LogOut, Wallet, ChevronLeft } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'blackjack'>('dashboard');

  const handleLogin = (userData: User) => {
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('dashboard');
  };

  const handleGameSelection = (gameId: string) => {
    if (gameId === 'blackjack') {
      setCurrentView('blackjack');
    }
  };

  const handleTransaction = async (amount: number, type: 'deposit' | 'withdraw') => {
    if (!user) return;
    const newBalance = type === 'deposit' 
      ? user.balance + amount 
      : user.balance - amount;
    
    // Update local state
    setUser({ ...user, balance: newBalance });
    // Sync with DB
    await DatabaseService.updateBalance(user.id, newBalance);
  };

  const updateBalance = async (newBalance: number) => {
    if (!user) return;
    setUser({ ...user, balance: newBalance });
    await DatabaseService.updateBalance(user.id, newBalance);
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-white font-sans overflow-hidden flex flex-col relative">
      
      {/* GLOBAL BACKGROUND LAYER - Fixo atrás de tudo (z-0) */}
      <div 
        className="fixed inset-0 pointer-events-none z-0" 
        style={{
          background: `
            radial-gradient(circle at 0% 50%, rgba(88, 28, 135, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 100% 0%, rgba(251, 191, 36, 0.02) 0%, transparent 30%) 
          `
          /* Gold reduzido para 0.02 (2%) e movido para o canto superior direito para não atrapalhar o texto */
        }}
      />

      {/* Navbar (Only if logged in) */}
      {user && (
        <nav className="h-14 flex-none border-b border-white/5 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between relative z-50">
           <div className="flex items-center gap-4">
             {currentView !== 'dashboard' && (
                <button 
                  onClick={() => setCurrentView('dashboard')}
                  className="bg-slate-800 p-1.5 rounded-full hover:bg-slate-700 transition-colors"
                  title="Voltar ao Lobby"
                >
                    <ChevronLeft size={18} />
                </button>
             )}
             
             <div className="flex items-center gap-2">
               <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-casino-gold to-yellow-600 flex items-center justify-center font-bold text-black shadow-lg shadow-yellow-500/20 text-xs">
                 IA
               </div>
               <span className="font-bold hidden sm:block text-sm tracking-wider">CASSINO IA</span>
             </div>
           </div>

           <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsWalletOpen(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full border border-casino-gold/20 transition-all group"
             >
                <div className="bg-casino-green w-1.5 h-1.5 rounded-full animate-pulse"></div>
                <span className="font-mono font-bold text-casino-gold group-hover:text-white transition-colors text-sm">
                  R$ {user.balance.toFixed(2)}
                </span>
                <Wallet size={14} className="text-slate-400 group-hover:text-white" />
             </button>

             <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                    <UserIcon size={14} />
                </div>
                <span className="text-sm font-medium hidden sm:block text-slate-300">{user.username}</span>
             </div>
             
             <button 
               onClick={handleLogout}
               className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
               title="Sair"
             >
               <LogOut size={18} />
             </button>
           </div>
        </nav>
      )}

      {/* Main Content - Z-10 garante que o conteúdo fique sobre o background */}
      <main className="flex-1 relative w-full overflow-hidden flex flex-col z-10">
        {!user ? (
          <AuthForm onLogin={handleLogin} />
        ) : (
           <>
            {currentView === 'dashboard' && <Dashboard onSelectGame={handleGameSelection} />}
            {currentView === 'blackjack' && <BlackjackGame user={user} updateBalance={updateBalance} />}
           </>
        )}
      </main>

      {/* Wallet Modal */}
      {user && (
        <WalletModal 
          isOpen={isWalletOpen} 
          onClose={() => setIsWalletOpen(false)}
          currentBalance={user.balance}
          onTransaction={handleTransaction}
        />
      )}
      
      {/* Footer */}
      <div className="absolute bottom-1 right-2 text-slate-700 text-[9px] pointer-events-none z-10 opacity-30">
         v1.0.1
      </div>
    </div>
  );
};

export default App;