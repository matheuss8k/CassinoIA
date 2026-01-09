
import React from 'react';
import { User } from '../../types';
import { Hash, Mail, FileText, Calendar, Shield, Check, X, Upload, Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../UI/Button';

interface ProfileInfoProps {
    user: User;
    onVerifyRequest: () => void;
    isUploading: boolean;
}

export const ProfileInfo: React.FC<ProfileInfoProps> = ({ user, onVerifyRequest, isUploading }) => {
    const formatCPFDisplay = (cpf: string | undefined) => {
        if (!cpf) return '---';
        const nums = cpf.replace(/\D/g, '');
        if (nums.length !== 11) return cpf; 
        return `***.${nums.slice(3, 6)}.${nums.slice(6, 9)}-**`;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl h-full">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 pb-2 border-b border-white/5"><Hash size={16} className="text-purple-500"/> Dados Pessoais</h3>
                <div className="space-y-3">
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><Mail size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">Email</p><p className="text-xs font-medium text-slate-200">{user.email || "Não informado"}</p></div></div>
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><FileText size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">CPF (Segurança)</p><p className="text-xs font-medium text-slate-200 font-mono tracking-wider">{formatCPFDisplay(user.cpf)}</p></div></div>
                    <div className="bg-slate-950/50 p-2.5 rounded-xl border border-white/5 flex items-center gap-3"><div className="p-1.5 bg-slate-800 rounded-lg text-slate-400"><Calendar size={16}/></div><div><p className="text-[9px] text-slate-500 uppercase font-bold">Data de Nascimento</p><p className="text-xs font-medium text-slate-200">{user.birthDate || "Não informado"}</p></div></div>
                </div>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5"><h3 className="text-base font-bold text-white flex items-center gap-2"><Shield size={16} className="text-green-500"/> Verificação</h3><span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${user.isVerified ? 'bg-green-600/20 text-green-400 border-green-500/50' : user.documentsStatus === 'PENDING' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50' : 'bg-red-600/20 text-red-400 border-red-500/50'}`}>{user.isVerified ? 'VERIFICADO' : user.documentsStatus === 'PENDING' ? 'EM ANÁLISE' : 'NÃO VERIFICADO'}</span></div>
                {!user.isVerified && user.documentsStatus !== 'PENDING' && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between animate-fade-in">
                        <div className="bg-slate-950/40 p-3 rounded-xl border border-white/5 space-y-2"><p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Dicas para aprovação:</p><div className="flex gap-2"><div className="flex-1 space-y-1"><div className="flex items-center gap-2 text-[10px] text-slate-300"><Check size={10} className="text-green-500" /> Sem plástico</div><div className="flex items-center gap-2 text-[10px] text-slate-300"><Check size={10} className="text-green-500" /> Legível</div></div><div className="flex-1 space-y-1"><div className="flex items-center gap-2 text-[10px] text-slate-400"><X size={10} className="text-red-500" /> Tremida</div><div className="flex items-center gap-2 text-[10px] text-slate-400"><X size={10} className="text-red-500" /> Cortada</div></div></div></div>
                        <div><div className="flex gap-2 mb-3"><button className="flex-1 h-16 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Upload size={16} className="group-hover:text-white transition-colors"/><span className="text-[8px] font-bold group-hover:text-white transition-colors">DOCUMENTO</span></button><button className="flex-1 h-16 bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 transition-colors group"><Camera size={16} className="group-hover:text-white transition-colors"/><span className="text-[8px] font-bold group-hover:text-white transition-colors">SELFIE</span></button></div><Button fullWidth onClick={onVerifyRequest} disabled={isUploading} variant="primary" size="sm">{isUploading ? 'Enviando...' : 'ENVIAR ANÁLISE'}</Button></div>
                    </div>
                )}
                {user.documentsStatus === 'PENDING' && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-3 p-4 opacity-80 animate-pulse"><div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center"><FileText size={24} className="text-yellow-500"/></div><div><h4 className="text-white font-bold text-sm">Documentos em Análise</h4><p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Nossa equipe de segurança está validando seus dados. <br/><span className="text-yellow-500">Tempo estimado: até 24 horas.</span></p></div></div>)}
                {user.isVerified && (<div className="flex flex-col items-center justify-center flex-1 text-center space-y-3 p-4 animate-fade-in"><div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)]"><CheckCircle size={32} className="text-green-500"/></div><div><h4 className="text-lg font-bold text-white">Conta Verificada!</h4><p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Você tem acesso total a saques instantâneos.</p></div></div>)}
            </div>
        </div>
    );
};
