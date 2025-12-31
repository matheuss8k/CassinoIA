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

  // Background style
  const bgStyle = {
    backgroundImage: `
      radial-gradient(circle at 15% 50%, rgba(88, 28, 135, 0.15) 0%, transparent 25%),
      radial-gradient(circle at 85% 30%, rgba(251, 191, 36, 0.1) 0%, transparent 25%)
    `
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white font-sans overflow-hidden flex flex-col" style={bgStyle}>
      {/* Navbar (Only if logged in) */}
      {user && (
        <nav className="h-16 border-b border-white/10 bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-40">
           <div className="flex items-center gap-4">
             {currentView !== 'dashboard' && (
                <button 
                  onClick={() => setCurrentView('dashboard')}
                  className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors"
                  title="Voltar ao Lobby"
                >
                    <ChevronLeft size={20} />
                </button>
             )}
             
             <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-casino-gold to-yellow-600 flex items-center justify-center font-bold text-black shadow-lg shadow-yellow-500/20">
                 IA
               </div>
               <span className="font-bold hidden sm:block">CASSINO IA</span>
             </div>
           </div>

           <div className="flex items-center gap-4">
             <button 
                onClick={() => setIsWalletOpen(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-1.5 rounded-full border border-casino-gold/30 transition-all group"
             >
                <div className="bg-casino-green w-2 h-2 rounded-full animate-pulse"></div>
                <span className="font-mono font-bold text-casino-gold group-hover:text-white transition-colors">
                  R$ {user.balance.toFixed(2)}
                </span>
                <Wallet size={16} className="text-slate-400 group-hover:text-white" />
             </button>

             <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                    <UserIcon size={16} />
                </div>
                <span className="text-sm font-medium hidden sm:block text-slate-300">{user.username}</span>
             </div>
             
             <button 
               onClick={handleLogout}
               className="p-2 text-slate-500 hover:text-red-400 transition-colors"
               title="Sair"
             >
               <LogOut size={20} />
             </button>
           </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="flex-grow relative flex flex-col">
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
      <footer className="text-center py-2 text-slate-600 text-xs">
        &copy; 2024 Cassino IA. Jogue com responsabilidade.
      </footer>
    </div>
  );
};

export default App;