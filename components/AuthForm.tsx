import React, { useState } from 'react';
import { User } from '../types';
import { Button } from './UI/Button';
import { Play, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { DatabaseService } from '../services/database';

interface AuthFormProps {
  onLogin: (user: User) => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Formatters
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // 000.000.000-00
    if (value.length > 9) {
      value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (value.length > 6) {
      value = value.replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
    } else if (value.length > 3) {
      value = value.replace(/(\d{3})(\d{3})/, '$1.$2');
    }
    
    setCpf(value);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);

    // DD/MM/YYYY
    if (value.length > 4) {
      value = value.replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
    } else if (value.length > 2) {
      value = value.replace(/(\d{2})(\d{2})/, '$1/$2');
    }

    setBirthDate(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (isRegister) {
       if (!cpf || !birthDate) {
         setError('Preencha todos os campos para cadastro.');
         return;
       }
       if (birthDate.length < 10) {
         setError('Data de nascimento inválida.');
         return;
       }
       if (cpf.length < 14) {
          setError('CPF inválido.');
          return;
       }
    }
    
    setIsLoading(true);

    try {
      if (isRegister) {
        // Register Flow
        const newUser = await DatabaseService.createUser({
          username,
          cpf,
          birthDate,
          password
        });
        onLogin(newUser);
      } else {
        // Login Flow
        const user = await DatabaseService.login(username, password);
        onLogin(user);
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 relative z-10">
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Decorative background glow */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-casino-purple/40 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-casino-gold/20 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">CASSINO IA</h1>
            <p className="text-casino-gold uppercase tracking-widest text-xs font-semibold">Experiência Premium de Cassino</p>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-slate-950/50 rounded-lg mb-6">
             <button 
               className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
               onClick={() => { setIsRegister(false); setError(''); }}
             >
               ENTRAR
             </button>
             <button 
               className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${isRegister ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
               onClick={() => { setIsRegister(true); setError(''); }}
             >
               CRIAR CONTA
             </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-bold uppercase mb-1 ml-1">Usuário</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-xl px-4 py-3 outline-none transition-colors"
                placeholder="Seu nome de usuário"
              />
            </div>
            
            {isRegister && (
            <div className="animate-slide-up space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-1 ml-1">CPF</label>
                <input 
                  type="text" 
                  value={cpf}
                  onChange={handleCpfChange}
                  className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-xl px-4 py-3 outline-none transition-colors"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase mb-1 ml-1">Data de Nascimento</label>
                <input 
                  type="text" 
                  value={birthDate}
                  onChange={handleDateChange}
                  className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-xl px-4 py-3 outline-none transition-colors"
                  placeholder="DD/MM/AAAA"
                />
              </div>
            </div>
            )}

            <div>
              <label className="block text-slate-400 text-xs font-bold uppercase mb-1 ml-1">Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 focus:border-casino-gold text-white rounded-xl px-4 py-3 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-900/20 py-2 rounded-lg border border-red-900/50">
                {error}
              </div>
            )}

            <div className="pt-2">
              <Button fullWidth size="lg" disabled={isLoading} type="submit" variant={isRegister ? 'primary' : 'success'}>
                 {isLoading ? (
                    <span className="animate-pulse">PROCESSANDO...</span>
                 ) : (
                    <>
                      {isRegister ? 'CRIAR CONTA' : 'ACESSAR'} 
                      {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
                    </>
                 )}
              </Button>
            </div>
          </form>
          
          <div className="mt-6 flex justify-center text-slate-500 text-xs gap-2 items-center">
            <ShieldCheck size={14} /> 
            <span>Ambiente seguro e criptografado</span>
          </div>
        </div>
      </div>
    </div>
  );
};