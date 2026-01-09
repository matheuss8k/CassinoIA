
import React from 'react';
import { User } from '../../types';
import { Clock, Coins } from 'lucide-react';

interface MissionsTabProps {
    missions: User['missions'];
    timeToReset: string;
}

export const MissionsTab: React.FC<MissionsTabProps> = ({ missions, timeToReset }) => {
    return (
        <div className="animate-fade-in space-y-3">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-2.5 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Clock size={14} /></div>
                    <div><h3 className="font-bold text-white text-[10px] uppercase tracking-wide">Reset Diário</h3></div>
                </div>
                <div className="bg-black/50 px-2 py-0.5 rounded border border-white/5 font-mono font-bold text-blue-400 text-xs tracking-widest shadow-inner">{timeToReset || "00:00:00"}</div>
            </div>
            <div className="grid grid-cols-1 gap-3">
                {missions && missions.length > 0 ? (missions.map((mission) => {
                    const displayCurrent = Math.floor(mission.current);
                    const displayTarget = Math.floor(mission.target);
                    return (
                        <div key={mission.id} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${mission.completed ? 'bg-green-900/10 border-green-500/30 opacity-60' : 'bg-slate-900 border-white/10'}`}>
                            <div className="flex-1">
                                <h4 className={`font-bold text-sm ${mission.completed ? 'text-green-400 line-through' : 'text-white'}`}>{mission.description}</h4>
                                <div className="flex gap-2 text-[10px] mt-1"><span className="text-yellow-500 font-bold flex items-center gap-1"><Coins size={8}/> {Math.floor(mission.rewardPoints)} Pontos</span></div>
                                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (displayCurrent / displayTarget) * 100)}%` }}></div></div>
                            </div>
                            <div className="ml-3 text-right"><span className="text-base font-black text-slate-500">{displayCurrent}/{displayTarget}</span></div>
                        </div>
                    )
                })) : (
                    <div className="text-center p-8 bg-slate-900/50 rounded-xl border border-white/5 text-slate-500 text-xs">Nenhuma missão ativa hoje. Volte amanhã!</div>
                )}
            </div>
        </div>
    );
};
