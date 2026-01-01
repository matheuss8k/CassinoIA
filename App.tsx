
import React, { useState, useEffect, useRef } from 'react';
import { User } from './types';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { BlackjackGame } from './components/BlackjackGame';
import { MinesGame } from './components/MinesGame';
import { UserProfile } from './components/UserProfile';
import { WalletModal } from './components/WalletModal';
import { DatabaseService } from './services/database';
import { User as UserIcon, LogOut, Wallet, ChevronLeft, TrendingUp, TrendingDown, Bot, Crown, Skull, Ghost, Zap, Sword, Glasses } from 'lucide-react';

// Configuration for Avatar rendering in Navbar (Miniature)
const getNavbarAvatar = (id: string) => {
    switch (id) {
        // Free Avatars
        case '1': return { icon: <UserIcon size={16} />, bg: 'from-slate-700 to-slate-800' };
        case '2': return { icon: <Bot size={16} />, bg: 'from-cyan-900 to-cyan-700' };
        case '3': return { icon: <Skull size={16} />, bg: 'from-red-900 to-red-700' };
        case '4': return { icon: <Ghost size={16} />, bg: 'from-purple-900 to-purple-700' };
        case '5': return { icon: <Sword size={16} />, bg: 'from-orange-900 to-orange-700' };
        case '6': return { icon: <Zap size={16} />, bg: 'from-yellow-700 to-yellow-500' };
        case '7': return { icon: <Glasses size={16} />, bg: 'from-emerald-900 to-emerald-700' };
        case '8': return { icon: <Crown size={16} />, bg: 'from-pink-900 to-pink-700' };
        
        // Premium Avatars
        case 'avatar_rich': return { icon: <span className="text-xs font-black text-white">$</span>, bg: 'from-yellow-600 to-yellow-900' };
        case 'avatar_alien': return { icon: <span className="text-xs">👽</span>, bg: 'from-green-600 to-emerald-900' };
        case 'avatar_robot_gold': return { icon: <Bot size={16} className="text-yellow-200" />, bg: 'from-yellow-500 to-orange-600' };
        case 'avatar_dragon': return { icon: <Zap size={16} className="text-red-200" />, bg: 'from-red-600 to-purple-900' };
        
        // Default
        default: return { icon: <UserIcon size={16} />, bg: 'from-slate-700 to-slate-800' };
    }
};

// Componente de Saldo com efeito Count-Up
const BalanceDisplay = ({ balance, onClick }: { balance: number, onClick: () => void }) => {
  const [displayValue, setDisplayValue] = useState(balance);
  const [trend, setTrend] = useState<'up' | 'down' | 'neutral'>('neutral');
  const previousBalanceRef = useRef(balance);

  useEffect(() => {
    if (previousBalanceRef.current === balance) return;
    const start = displayValue;
    const end = balance;
    const change = end - start;
    if (change > 0) setTrend('up');
    else if (change < 0) setTrend('down');

    const duration = 1500;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 5);
      const current = start + (change * ease);
      setDisplayValue(current);
      if (progress < 1) requestAnimationFrame(animate);
      else {
        setDisplayValue(end);
        setTimeout(() => setTrend('neutral'), 500);
        previousBalanceRef.current = end;
      }
    };
    requestAnimationFrame(animate);
  }, [balance]);

  return (
    <button 
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 group overflow-hidden
        ${trend === 'up' ? 'border-green-500/50 bg-green-900/20 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 
          trend === 'down' ? 'border-red-500/50 bg-red-900/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 
          'border-casino-gold/30 bg-slate-900/80 hover:border-casino-gold hover:shadow-[0_0_10px_rgba(251,191,36,0.2)]'}
      `}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-150%] group-hover:animate-shine pointer-events-none" />
      <div className={`
        relative w-2 h-2 rounded-full flex items-center justify-center transition-colors duration-300
        ${trend === 'up' ? 'bg-green-500 shadow-[0_0_6px_#22c55e]' : 
          trend === 'down' ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 
          'bg-casino-gold shadow-[0_0_4px_#fbbf24]'}
      `}>
        {trend === 'up' && <TrendingUp size={6} className="text-black animate-fade-in" />}
        {trend === 'down' && <TrendingDown size={6} className="text-white animate-fade-in" />}
      </div>
      <div className="flex flex-col items-end leading-none">
        <span className="text-[8px] text-slate-400 font-bold tracking-widest uppercase mb-px">Saldo</span>
        <span className={`
          font-mono text-sm md:text-base font-bold tracking-tight transition-colors duration-200 tabular-nums
          ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-white'}
        `}>
          R$ {displayValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className={`
        ml-1 p-1 rounded transition-colors duration-300
        ${trend === 'up' ? 'bg-green-500/20 text-green-400' : 
          trend === 'down' ? 'bg-red-500/20 text-red-400' : 
          'bg-slate-800 text-casino-gold group-hover:bg-casino-gold group-hover:text-black'}
      `}>
        <Wallet size={14} />
      </div>
    </button>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'blackjack' | 'mines' | 'profile'>('dashboard');
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // --- SESSION PERSISTENCE LOGIC ---
  useEffect(() => {
    const checkSession = async () => {
        const storedId = localStorage.getItem('casino_userId');
        if (storedId) {
            try {
                // Now sync returns the full user object (thanks to server update)
                const restoredUser = await DatabaseService.syncUser(storedId);
                
                // Data Integrity check similar to login
                if (restoredUser.vipLevel === undefined) restoredUser.vipLevel = 0;
                
                setUser(restoredUser);
                
                // If user had an active game, route them there
                if (restoredUser.activeGame && restoredUser.activeGame.type !== 'NONE') {
                    if (restoredUser.activeGame.type === 'BLACKJACK') setCurrentView('blackjack');
                    if (restoredUser.activeGame.type === 'MINES') setCurrentView('mines');
                }
            } catch (error) {
                console.warn("Session expired or invalid", error);
                localStorage.removeItem('casino_userId'); // Clean invalid session
            }
        }
        setIsCheckingSession(false);
    };
    
    checkSession();
  }, []);

  const handleLogin = (userData: User) => {
    // Ensure VIP Level is not undefined on login
    if (userData.vipLevel === undefined) userData.vipLevel = 0;
    
    // SAVE SESSION
    localStorage.setItem('casino_userId', userData.id);
    
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('casino_userId');
    setUser(null);
    setCurrentView('dashboard');
  };

  const handleGameSelection = (gameId: string) => {
    if (gameId === 'blackjack') setCurrentView('blackjack');
    else if (gameId === 'mines') setCurrentView('mines');
  };

  const handleTransaction = async (amount: number, type: 'deposit' | 'withdraw') => {
    if (!user) return;
    const newBalance = type === 'deposit' ? user.balance + amount : user.balance - amount;
    setUser({ ...user, balance: newBalance });
    await DatabaseService.updateBalance(user.id, newBalance);
  };
  
  // Robust User Update Callback
  const handleUpdateUser = (updatedData: Partial<User>) => {
      if (!user) return;
      
      const nextUser = { ...user, ...updatedData };
      
      // Data Integrity Guards - Prevent regressions to undefined or 0 if data missing
      if (updatedData.vipLevel !== undefined) nextUser.vipLevel = updatedData.vipLevel;
      else nextUser.vipLevel = user.vipLevel || 0;

      if (!nextUser.email && user.email) nextUser.email = user.email;
      if (!nextUser.cpf && user.cpf) nextUser.cpf = user.cpf;
      if (!nextUser.birthDate && user.birthDate) nextUser.birthDate = user.birthDate;

      setUser(nextUser as User);
  };

  // Loading Screen for Session Check
  if (isCheckingSession) {
      return (
          <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white">
              <div className="w-16 h-16 border-4 border-casino-gold border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500 text-xs uppercase tracking-widest font-bold animate-pulse">Recuperando Sessão...</p>
          </div>
      );
  }

  // Get current avatar configuration for rendering
  const avatarConfig = user ? getNavbarAvatar(user.avatarId) : null;

  return (
    <div className="h-screen w-full bg-slate-950 text-white font-sans overflow-hidden flex flex-col relative">
      {user && (
        <nav className="h-16 flex-none border-b border-white/10 bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-40">
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
             
             <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
               <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-casino-gold to-yellow-600 flex items-center justify-center font-bold text-black shadow-lg shadow-yellow-500/20">
                 IA
               </div>
               <span className="font-bold hidden sm:block">CASSINO IA</span>
             </div>
           </div>

           <div className="flex items-center gap-4">
             <BalanceDisplay balance={user.balance} onClick={() => setIsWalletOpen(true)} />

             <button 
                onClick={() => setCurrentView('profile')}
                className={`flex items-center gap-2 p-1.5 rounded-lg transition-all group border border-transparent
                  ${currentView === 'profile' ? 'bg-slate-800 border-white/10' : 'hover:bg-slate-800/50'}
                `}
                title="Meu Perfil"
             >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all bg-gradient-to-br ${avatarConfig?.bg || 'from-slate-700 to-slate-800'} text-white shadow-md border border-white/10`}>
                    {avatarConfig?.icon}
                </div>
                <span className={`text-sm font-medium hidden sm:block transition-colors 
                  ${currentView === 'profile' ? 'text-white' : 'text-slate-300 group-hover:text-white'}
                `}>
                  {user.username}
                </span>
             </button>
             
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

      <main className="flex-1 relative w-full overflow-y-auto no-scrollbar flex flex-col z-10">
        {!user ? (
          <AuthForm onLogin={handleLogin} />
        ) : (
           <>
            {currentView === 'dashboard' && <Dashboard onSelectGame={handleGameSelection} />}
            {currentView === 'blackjack' && <BlackjackGame user={user} updateUser={handleUpdateUser} />}
            {currentView === 'mines' && <MinesGame user={user} updateUser={handleUpdateUser} />}
            {currentView === 'profile' && <UserProfile user={user} onUpdateUser={handleUpdateUser} />}
           </>
        )}
      </main>

      {user && (
        <WalletModal 
          isOpen={isWalletOpen} 
          onClose={() => setIsWalletOpen(false)}
          currentBalance={user.balance}
          onTransaction={handleTransaction}
          isVerified={user.isVerified}
          onGoToProfile={() => { setIsWalletOpen(false); setCurrentView('profile'); }}
        />
      )}
      
      <footer className="flex-none text-center py-2 text-slate-600 text-xs z-10">
        &copy; 2024 Cassino IA. Jogue com responsabilidade.
      </footer>
    </div>
  );
};

export default App;
