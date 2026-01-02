
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Button } from './UI/Button';
import { ShieldCheck, UserPlus, LogIn, WifiOff, Loader2, BrainCircuit, Zap, Target, BarChart3, Bot, Users } from 'lucide-react';
import { DatabaseService } from '../services/database';

interface AuthFormProps {
  onLogin: (user: User) => void;
}

const APP_VERSION = 'v1.3.0'; // Production Release

const FORBIDDEN_USERNAMES = [
  'admin', 'root', 'suporte', 'moderador', 'system', 'sistema', 
  'merda', 'bosta', 'pinto', 'cu', 'caralho', 'puta', 'viado', 'sexo',
  'buceta', 'fdp', 'lixo', 'teste', 'usuario', '12345', 'qwerty', 'abcde',
  'cassino', 'casino', 'bet', 'ganhar', 'lucro', 'hacker', 'bot'
];

// Componente de Jogadores Online (Repetido localmente para evitar dependência circular complexa)
const OnlinePlayersBadge = () => {
    const [count, setCount] = useState<number>(0);

    useEffect(() => {
        const calculateOnlineUsers = () => {
            const now = Date.now();
            const slowWave = Math.sin(now / 6000000); 
            const mediumWave = Math.cos(now / 200000);
            const fastNoise = Math.sin(now / 5000); 
            const base = 3850;
            const variation = (slowWave * 1500) + (mediumWave * 800) + (fastNoise * 50);
            const val = Math.floor(base + variation);
            setCount(Math.max(1200, Math.min(6500, val)));
        };
        calculateOnlineUsers();
        // Atualiza a cada 15 segundos (igual ao App.tsx)
        const interval = setInterval(calculateOnlineUsers, 15000);
        return () => clearInterval(interval);
    }, []);

    if (count === 0) return null;

    return (
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 shadow-2xl animate-fade-in mb-8 z-20 hover:scale-105 transition-transform duration-300 cursor-default select-none">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-[0_0_8px_#22c55e]"></span>
            </div>
            <div className="flex flex-col leading-none">
                <span className="font-mono font-bold tabular-nums text-green-400 text-sm drop-shadow-sm">
                    {count.toLocaleString('pt-BR')}
                </span>
                <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Jogadores Online</span>
            </div>
            <Users size={14} className="text-slate-500 ml-1" />
        </div>
    );
};


// Componente de Fundo Rico
const PresentationBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* 1. Gradientes de Fundo (Ambient Light) */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-casino-gold/10 rounded-full blur-[120px] animate-pulse delay-1000" />

      {/* 2. Textura de Grid Tech */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      {/* 3. "Scattered Writings" - Textos Gigantes de Fundo */}
      <div className="absolute top-[10%] left-[5%] text-slate-800 font-black text-9xl opacity-20 -rotate-12 select-none hidden xl:block">PROBABILITY</div>
      <div className="absolute bottom-[10%] right-[5%] text-slate-800 font-black text-9xl opacity-20 rotate-6 select-none hidden xl:block">ALGORITHM</div>
      <div className="absolute top-[40%] right-[15%] text-slate-800 font-black text-8xl opacity-10 select-none hidden lg:block">DATA</div>

      {/* 4. Elementos Flutuantes de IA (Feature Callouts) - Esquerda */}
      <div className="absolute top-[25%] left-[15%] hidden lg:flex flex-col gap-1 animate-slide-up opacity-60 hover:opacity-100 transition-opacity duration-500">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <BrainCircuit size={20} />
             </div>
             <div>
                <h3 className="text-white font-bold text-sm tracking-wide">REDES NEURAIS</h3>
                <p className="text-[10px] text-purple-300 uppercase tracking-widest">Análise de padrão em tempo real</p>
             </div>
          </div>
          <div className="w-32 h-[1px] bg-gradient-to-r from-purple-500/50 to-transparent mt-2"></div>
      </div>

      <div className="absolute bottom-[30%] left-[10%] hidden lg:flex flex-col gap-1 animate-slide-up delay-300 opacity-60 hover:opacity-100 transition-opacity duration-500">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                <BarChart3 size={20} />
             </div>
             <div>
                <h3 className="text-white font-bold text-sm tracking-wide">ESTATÍSTICA PURA</h3>
                <p className="text-[10px] text-blue-300 uppercase tracking-widest">Aumente suas chances matematicamente</p>
             </div>
          </div>
      </div>

      {/* 5. Elementos Flutuantes de IA - Direita */}
      <div className="absolute top-[30%] right-[12%] hidden lg:flex flex-col items-end gap-1 animate-slide-up delay-150 opacity-60 hover:opacity-100 transition-opacity duration-500 text-right">
          <div className="flex items-center gap-3 flex-row-reverse">
             <div className="w-10 h-10 rounded-lg bg-casino-gold/10 border border-casino-gold/30 flex items-center justify-center text-casino-gold shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                <Zap size={20} />
             </div>
             <div>
                <h3 className="text-white font-bold text-sm tracking-wide">ASSISTENTE IA</h3>
                <p className="text-[10px] text-yellow-200/70 uppercase tracking-widest">Dicas de jogada instantâneas</p>
             </div>
          </div>
          <div className="w-32 h-[1px] bg-gradient-to-l from-casino-gold/50 to-transparent mt-2"></div>
      </div>

      <div className="absolute bottom-[25%] right-[18%] hidden lg:flex flex-col items-end gap-1 animate-slide-up delay-500 opacity-60 hover:opacity-100 transition-opacity duration-500 text-right">
          <div className="flex items-center gap-3 flex-row-reverse">
             <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                <Target size={20} />
             </div>
             <div>
                <h3 className="text-white font-bold text-sm tracking-wide">PRECISÃO</h3>
                <p className="text-[10px] text-green-300 uppercase tracking-widest">Algoritmos de alta performance</p>
             </div>
          </div>
      </div>

      {/* 6. Linhas de Conexão (Efeito visual sutil) */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none hidden lg:block">
          <line x1="20%" y1="30%" x2="50%" y2="50%" stroke="url(#grad1)" strokeWidth="1" strokeDasharray="5,5" />
          <line x1="80%" y1="35%" x2="50%" y2="50%" stroke="url(#grad2)" strokeWidth="1" strokeDasharray="5,5" />
          <defs>
              <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style={{stopColor:'rgb(168,85,247)', stopOpacity:0.5}} />
                  <stop offset="100%" style={{stopColor:'rgb(168,85,247)', stopOpacity:0}} />
              </linearGradient>
              <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style={{stopColor:'rgb(251,191,36)', stopOpacity:0.5}} />
                  <stop offset="100%" style={{stopColor:'rgb(251,191,36)', stopOpacity:0}} />
              </linearGradient>
          </defs>
      </svg>
  </div>
);

export const AuthForm: React.FC<AuthFormProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  
  // Form State
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // --- VALIDATORS ---
  const validateCPF = (cpfString: string): boolean => {
    const strCPF = cpfString.replace(/[^\d]+/g, '');
    if (strCPF.length !== 11) return false;
    if (/^(\d)\1+$/.test(strCPF)) return false; 
    let sum = 0;
    let remainder;
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(strCPF.substring(i - 1, i)) * (11 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(strCPF.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(strCPF.substring(i - 1, i)) * (12 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(strCPF.substring(10, 11))) return false;
    return true;
  };

  const validateAge = (dateString: string): boolean => {
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const birth = new Date(year, month, day);
    const today = new Date();
    if (birth.getFullYear() !== year || birth.getMonth() !== month || birth.getDate() !== day) return false;
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 18;
  };

  const validateFullName = (name: string): boolean => {
      const parts = name.trim().split(' ');
      return parts.length >= 2 && parts.every(part => part.length >= 2);
  };

  const validateUsername = (name: string): string | null => {
    const cleanName = name.trim().toLowerCase();
    if (cleanName.length < 4) return "Usuário: min. 4 caracteres.";
    if (!/^[a-zA-Z0-9_]+$/.test(cleanName)) return "Usuário: apenas letras e números.";
    if (/^(\w)\1+$/.test(cleanName)) return "Usuário inválido (repetitivo).";
    if (FORBIDDEN_USERNAMES.some(bad => cleanName.includes(bad))) return "Nome de usuário indisponível ou impróprio.";
    return null;
  };

  const validateEmail = (emailStr: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);

  // --- HANDLERS ---
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    if (value.length > 9) value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    else if (value.length > 6) value = value.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
    else if (value.length > 3) value = value.replace(/(\d{3})(\d{3})/, '$1.$2');
    setCpf(value);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 4) value = value.replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
    else if (value.length > 2) value = value.replace(/(\d{2})(\d{2})/, '$1/$2');
    setBirthDate(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) { setError('Preencha os campos obrigatórios.'); return; }

    if (isRegister) {
       if (!fullName || !validateFullName(fullName)) { setError('Digite seu nome completo.'); return; }
       if (!validateEmail(email)) { setError('Email inválido.'); return; }
       const userError = validateUsername(username);
       if (userError) { setError(userError); return; }
       if (!validateCPF(cpf)) { setError('CPF inválido.'); return; }
       if (birthDate.length < 10) { setError('Data incompleta.'); return; }
       if (!validateAge(birthDate)) { setError('Apenas para maiores de 18 anos.'); return; }
    }
    
    setIsLoading(true);

    try {
      if (isRegister) {
        const newUser = await DatabaseService.createUser({ fullName, username, email, cpf, birthDate, password });
        onLogin(newUser);
      } else {
        const user = await DatabaseService.login(username, password);
        onLogin(user);
      }
    } catch (err: any) {
      let msg = err.message || 'Erro de conexão.';
      if (msg.includes('Failed to fetch') || msg.includes('conexão') || msg.includes('restarting') || msg.includes('503')) {
          msg = 'O servidor está iniciando. Tente novamente em alguns segundos.';
      }
      if (msg.includes('bad auth') || msg.includes('8000')) {
          msg = 'Erro interno de configuração (Auth). Contate o suporte.';
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 pt-32 md:pt-40 relative z-10 overflow-hidden">
      
      {/* Background Decorativo */}
      <PresentationBackground />

      {/* Badge de Jogadores Online - Reposicionado no centro acima do form */}
      <OnlinePlayersBadge />

      <div 
        className={`
            w-full bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-10
            ${isRegister ? 'max-w-md' : 'max-w-[340px]'}
        `}
      >
        
        <div className="relative z-10">
          <div className="text-center mb-4">
             <div className="inline-flex items-center justify-center p-2 rounded-full bg-white/5 border border-white/10 mb-2 shadow-inner">
                <Bot className="text-casino-gold w-6 h-6 animate-pulse" />
             </div>
            <h1 className="text-3xl font-extrabold text-white mb-1 tracking-tight">CASSINO IA</h1>
            <p className="text-casino-gold uppercase tracking-widest text-[10px] font-semibold">O 1º CASSINO COM INTELIGÊNCIA ARTIFICIAL</p>
          </div>

          <div className="flex p-1 bg-slate-950/50 rounded-lg mb-4">
             <button className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => { setIsRegister(false); setError(''); }}>ENTRAR</button>
             <button className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => { setIsRegister(true); setError(''); }}>CRIAR CONTA</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isRegister && (
               <div className="space-y-3 animate-fade-in">
                   <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1 ml-1">Usuário</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Nome de usuário" />
                   </div>
                   <div>
                    <label className="block text-slate-400 text-[10px] font-bold uppercase mb-1 ml-1">Senha</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="••••••••" />
                   </div>
               </div>
            )}

            {isRegister && (
            <div className="animate-slide-up space-y-2">
              <div><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Nome Completo" /></div>
               <div className="grid grid-cols-2 gap-2">
                    <div className="relative"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Email" /></div>
                     <div><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Usuário (Login)" /></div>
               </div>
              <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={cpf} onChange={handleCpfChange} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="CPF" maxLength={14} />
                  <input type="text" value={birthDate} onChange={handleDateChange} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Nascimento" maxLength={10} />
              </div>
               <div><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-lg px-3 py-2 text-sm outline-none transition-colors" placeholder="Senha" /></div>
            </div>
            )}

            {error && (
              <div className="space-y-2">
                  <div className="text-red-400 text-xs text-center bg-red-900/20 py-2 px-2 rounded-lg border border-red-900/50 animate-shake flex items-center justify-center gap-2">
                    {error.includes('servidor') || error.includes('conexão') ? <WifiOff size={14} /> : null}
                    {error}
                  </div>
              </div>
            )}

            <div className="pt-2">
              <Button fullWidth size="md" disabled={isLoading} type="submit" variant={isRegister ? 'primary' : 'success'}>
                 {isLoading ? (
                    <div className="flex items-center gap-2"><Loader2 className="animate-spin" size={16} /><span>Conectando...</span></div>
                 ) : (
                    <>{isRegister ? 'CRIAR CONTA' : 'ACESSAR'} {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}</>
                 )}
              </Button>
            </div>
          </form>
          
          <div className="mt-4 flex justify-center text-slate-500 text-[10px] gap-2 items-center">
            <ShieldCheck size={12} /> 
            <span>Ambiente seguro e criptografado</span>
          </div>
        </div>
      </div>
      <div className="mt-8 text-[10px] text-slate-600 font-mono tracking-widest opacity-40 select-none relative z-10">{APP_VERSION}</div>
    </div>
  );
};
