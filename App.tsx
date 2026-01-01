
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { User } from './types';
import { AuthForm } from './components/AuthForm';
import { WalletModal } from './components/WalletModal';
import { DatabaseService } from './services/database';
import { User as UserIcon, LogOut, Wallet, ChevronLeft, TrendingUp, TrendingDown, Bot, Crown, Skull, Ghost, Zap, Sword, Glasses, Star, Users } from 'lucide-react';

// --- LAZY LOADING ---
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const BlackjackGame = lazy(() => import('./components/BlackjackGame').then(module => ({ default: module.BlackjackGame })));
const MinesGame = lazy(() => import('./components/MinesGame').then(module => ({ default: module.MinesGame })));
const UserProfile = lazy(() => import('./components/UserProfile').then(module => ({ default: module.UserProfile })));

// --- CONFIGURAÇÃO DE AVATAR (Navbar) ---
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

// Componente de Jogadores Online (Falso/Simulado mas Determinístico)
export const OnlinePlayersCounter = ({ compact = false }: { compact?: boolean }) => {
    const [count, setCount] = useState<number>(0);

    useEffect(() => {
        // Algoritmo Determinístico baseado no tempo
        // Garante que todos os usuários vejam praticamente o mesmo número ao mesmo tempo
        const calculateOnlineUsers = () => {
            const now = Date.now();
            // Onda lenta (Tendência diária/horária)
            const slowWave = Math.sin(now / 6000000); 
            // Onda média (Variação de minutos)
            const mediumWave = Math.cos(now / 200000);
            // Ruído rápido (Simula conexões/desconexões em tempo real)
            const fastNoise = Math.sin(now / 5000); 

            // Base: 3850 (Meio de 1200 e 6500)
            // Amplitude Total aprox: +/- 2650
            
            const base = 3850;
            const variation = (slowWave * 1500) + (mediumWave * 800) + (fastNoise * 50);
            
            const val = Math.floor(base + variation);
            // Clamp para garantir limites
            const finalVal = Math.max(1200, Math.min(6500, val));
            
            setCount(finalVal);
        };

        calculateOnlineUsers();
        // Atualiza a cada 15 segundos para parecer orgânico mas estável (Sincronizado com AuthForm)
        const interval = setInterval(calculateOnlineUsers, 15000);
        return () => clearInterval(interval);
    }, []);

    if (count === 0) return null;

    return (
        <div className={`flex items-center gap-2 ${compact ? 'bg-black/20 px-2 py-1 rounded-md' : 'bg-slate-800/50 px-3 py-1.5 rounded-full border border-white/5'}`}>
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </div>
            <div className="flex flex-col leading-none">
                <span className={`font-mono font-bold tabular-nums text-green-400 ${compact ? 'text-xs' : 'text-sm'}`}>
                    {count.toLocaleString('pt-BR')}
                </span>
                {!compact && <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Online</span>}
            </div>
            {!compact && <Users size={12} className="text-slate-500 ml-1" />}
        </div>
    );
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

// --- LAYOUT DA APLICAÇÃO (NAVBAR + CONTENT) ---
const AppLayout = ({ user, children, onLogout, onOpenWallet }: { user: User, children: React.ReactNode, onLogout: () => void, onOpenWallet: () => void }) => {
    const location = useLocation();
    const isDashboard = location.pathname === '/';
    const avatarConfig = getNavbarAvatar(user.avatarId);

    return (
        <div className="h-screen w-full bg-slate-950 text-white font-sans overflow-hidden flex flex-col relative">
            <nav className="h-16 flex-none border-b border-white/10 bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-4">
                    {!isDashboard && (
                        <Link to="/" className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors flex items-center justify-center" title="Voltar ao Lobby">
                            <ChevronLeft size={20} />
                        </Link>
                    )}
                    <Link to="/" className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-casino-gold to-yellow-600 flex items-center justify-center font-bold text-black shadow-lg shadow-yellow-500/20 group-hover:scale-105 transition-transform">IA</div>
                        <span className="font-bold hidden sm:block group-hover:text-casino-gold transition-colors">CASSINO IA</span>
                    </Link>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:block">
                        <OnlinePlayersCounter />
                    </div>
                    
                    <BalanceDisplay balance={user.balance} onClick={onOpenWallet} />
                    
                    <Link to="/profile" className={`flex items-center gap-2 p-1.5 rounded-lg transition-all group border border-transparent ${location.pathname === '/profile' ? 'bg-slate-800 border-white/10' : 'hover:bg-slate-800/50'}`} title="Meu Perfil">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all bg-gradient-to-br ${avatarConfig.bg} text-white shadow-md border border-white/10`}>{avatarConfig.icon}</div>
                        <span className={`text-sm font-medium hidden sm:block transition-colors ${location.pathname === '/profile' ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{user.username}</span>
                    </Link>
                    
                    <button onClick={onLogout} className="p-2 text-slate-500 hover:text-red-400 transition-colors" title="Sair"><LogOut size={20} /></button>
                </div>
            </nav>
            <main className="flex-1 relative w-full overflow-y-auto no-scrollbar flex flex-col z-10">
                <Suspense fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-50">
                        <div className="flex flex-col items-center gap-4">
                             <div className="w-12 h-12 border-4 border-casino-gold border-t-transparent rounded-full animate-spin"></div>
                             <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Jogo...</p>
                        </div>
                    </div>
                }>
                    {children}
                </Suspense>
            </main>
            <footer className="flex-none text-center py-2 text-slate-600 text-xs z-10 select-none">&copy; 2024 Cassino IA. Jogue com responsabilidade.</footer>
        </div>
    );
};

// --- WRAPPER PARA ROTAS PROTEGIDAS (DEFINIDO FORA PARA EVITAR REMOUNT) ---
interface ProtectedRouteProps {
    user: User | null;
    onLogout: () => void;
    onOpenWallet: () => void;
    children: React.ReactNode;
}
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ user, onLogout, onOpenWallet, children }) => {
    if (!user) return <Navigate to="/" replace />;
    return <AppLayout user={user} onLogout={onLogout} onOpenWallet={onOpenWallet}>{children}</AppLayout>;
};

// --- CONTEÚDO PRINCIPAL E ROTAS ---
const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  
  const navigate = useNavigate();
  const location = useLocation();

  // --- 1. Verificação de Sessão Inicial (F5) ---
  useEffect(() => {
    const checkSession = async () => {
        const storedId = localStorage.getItem('casino_userId');
        if (storedId) {
            try {
                const restoredUser = await DatabaseService.syncUser(storedId);
                if (restoredUser.vipLevel === undefined) restoredUser.vipLevel = 0;
                setUser(restoredUser);
            } catch (error) {
                console.warn("Session expired", error);
                localStorage.removeItem('casino_userId');
            }
        }
        setIsCheckingSession(false);
    };
    checkSession();
  }, []);

  // --- 2. Forçar Sincronização ao Sair de Jogos (Navegação SPA) ---
  useEffect(() => {
      // Se o usuário estiver logado e navegar para o dashboard ('/'), 
      // forçamos uma sincronização para ativar o "Auto-Forfeit" do servidor
      // caso ele tenha saído de um jogo via botão "Voltar" do navegador ou UI.
      if (user && location.pathname === '/') {
          const storedId = localStorage.getItem('casino_userId');
          if (storedId) {
              // Sincroniza silenciosamente para limpar jogos presos
              DatabaseService.syncUser(storedId).then(updatedUser => {
                  if (updatedUser) setUser(updatedUser);
              }).catch(e => console.error("Auto-Forfeit sync failed", e));
          }
      }
  }, [location.pathname]);

  const handleLogin = (userData: User) => {
    if (userData.vipLevel === undefined) userData.vipLevel = 0;
    localStorage.setItem('casino_userId', userData.id);
    setUser(userData);
    navigate('/');
  };

  const handleLogout = () => {
    localStorage.removeItem('casino_userId');
    setUser(null);
    navigate('/');
  };

  const handleUpdateUser = (updatedData: Partial<User>) => {
      if (!user) return;
      const nextUser = { ...user, ...updatedData };
      if (updatedData.vipLevel !== undefined) nextUser.vipLevel = updatedData.vipLevel;
      else nextUser.vipLevel = user.vipLevel || 0;
      setUser(nextUser as User);
  };

  const handleTransaction = async (amount: number, type: 'deposit' | 'withdraw') => {
    if (!user) return;
    const newBalance = type === 'deposit' ? user.balance + amount : user.balance - amount;
    setUser({ ...user, balance: newBalance });
    await DatabaseService.updateBalance(user.id, newBalance);
  };

  if (isCheckingSession) {
      return (
          <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white">
              <div className="w-16 h-16 border-4 border-casino-gold border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500 text-xs uppercase tracking-widest font-bold animate-pulse">Iniciando Sistema...</p>
          </div>
      );
  }

  return (
    <>
        <Routes>
            <Route path="/" element={!user ? <AuthForm onLogin={handleLogin} /> : <ProtectedRoute user={user} onLogout={handleLogout} onOpenWallet={() => setIsWalletOpen(true)}><Dashboard /></ProtectedRoute>} />
            
            <Route path="/blackjack" element={<ProtectedRoute user={user} onLogout={handleLogout} onOpenWallet={() => setIsWalletOpen(true)}><BlackjackGame user={user!} updateUser={handleUpdateUser} /></ProtectedRoute>} />
            <Route path="/mines" element={<ProtectedRoute user={user} onLogout={handleLogout} onOpenWallet={() => setIsWalletOpen(true)}><MinesGame user={user!} updateUser={handleUpdateUser} /></ProtectedRoute>} />
            
            <Route path="/profile" element={<ProtectedRoute user={user} onLogout={handleLogout} onOpenWallet={() => setIsWalletOpen(true)}><UserProfile user={user!} onUpdateUser={handleUpdateUser} /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {user && (
            <WalletModal 
                isOpen={isWalletOpen} 
                onClose={() => setIsWalletOpen(false)}
                currentBalance={user.balance}
                onTransaction={handleTransaction}
                isVerified={user.isVerified}
                onGoToProfile={() => { setIsWalletOpen(false); navigate('/profile'); }}
            />
        )}
    </>
  );
};

// --- APP ROOT ---
const App: React.FC = () => {
    return (
        <Router>
            <AppContent />
        </Router>
    );
};

export default App;
