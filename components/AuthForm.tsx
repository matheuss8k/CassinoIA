
import React, { useState } from 'react';
import { User } from '../types';
import { Button } from './UI/Button';
import { ShieldCheck, UserPlus, LogIn, Mail, WifiOff, Loader2 } from 'lucide-react';
import { DatabaseService } from '../services/database';

interface AuthFormProps {
  onLogin: (user: User) => void;
}

const APP_VERSION = 'v1.0.4 (Prod Release)';

const FORBIDDEN_USERNAMES = [
  'admin', 'root', 'suporte', 'moderador', 'system', 'sistema', 
  'merda', 'bosta', 'pinto', 'cu', 'caralho', 'puta', 'viado', 'sexo',
  'buceta', 'fdp', 'lixo', 'teste', 'usuario', '12345', 'qwerty', 'abcde',
  'cassino', 'casino', 'bet', 'ganhar', 'lucro', 'hacker', 'bot'
];

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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative z-10">
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        
        <div className="relative z-10">
          <div className="text-center mb-4">
            <h1 className="text-3xl font-extrabold text-white mb-1 tracking-tight">CASSINO IA</h1>
            <p className="text-casino-gold uppercase tracking-widest text-[10px] font-semibold">O PRIMEIRO CASSINO DE IA DO MUNDO!</p>
          </div>

          <div className="flex p-1 bg-slate-950/50 rounded-lg mb-4">
             <button className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => { setIsRegister(false); setError(''); }}>ENTRAR</button>
             <button className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => { setIsRegister(true); setError(''); }}>CRIAR CONTA</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isRegister && (
               <div className="space-y-3">
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
      <div className="mt-8 text-[10px] text-slate-600 font-mono tracking-widest opacity-40 select-none">{APP_VERSION}</div>
    </div>
  );
};
