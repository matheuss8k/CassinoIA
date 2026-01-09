
import React, { useMemo } from 'react';
import { User as UserIcon, Bot, Skull, Ghost, Sword, Zap, Glasses, Crown } from 'lucide-react';

interface AvatarProps {
  avatarId: string;
  frameId?: string;
  className?: string;
  showFrame?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Avatar: React.FC<AvatarProps> = ({ 
  avatarId, 
  frameId = 'frame_1', 
  className = '', 
  showFrame = true, 
  size = 'md'
}) => {
  
  const avatarConfig = useMemo(() => {
      switch (avatarId) {
        case '1': return { icon: <UserIcon size="60%" />, bg: 'from-slate-700 to-slate-800' };
        case '2': return { icon: <Bot size="60%" />, bg: 'from-cyan-900 to-cyan-700' };
        case '3': return { icon: <Skull size="60%" />, bg: 'from-red-900 to-red-700' };
        case '4': return { icon: <Ghost size="60%" />, bg: 'from-purple-900 to-purple-700' };
        case '5': return { icon: <Sword size="60%" />, bg: 'from-orange-900 to-orange-700' };
        case '6': return { icon: <Zap size="60%" />, bg: 'from-yellow-700 to-yellow-500' };
        case '7': return { icon: <Glasses size="60%" />, bg: 'from-emerald-900 to-emerald-700' };
        case '8': return { icon: <Crown size="60%" />, bg: 'from-pink-900 to-pink-700' };
        
        case 'avatar_rich': return { icon: <span className="text-[60%] font-black text-white">$</span>, bg: 'from-yellow-600 to-yellow-900' };
        case 'avatar_alien': return { icon: <span className="text-[80%] leading-none pb-0.5">👽</span>, bg: 'from-green-600 to-emerald-900' };
        case 'avatar_robot_gold': return { icon: <Bot size="60%" className="text-yellow-200" />, bg: 'from-yellow-500 to-orange-600' };
        case 'avatar_dragon': return { icon: <Zap size="60%" className="text-red-200" />, bg: 'from-red-600 to-purple-900' };
        case 'avatar_samurai': return { icon: <Sword size="60%" />, bg: 'from-slate-900 to-red-900' };
        
        default: return { icon: <UserIcon size="60%" />, bg: 'from-slate-700 to-slate-800' };
      }
  }, [avatarId]);

  const renderFrame = () => {
      if (!showFrame) return null;

      switch (frameId) {
          case 'frame_gold':
              return <div className="absolute -inset-[3px] rounded-full bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 animate-pulse-gold z-0 pointer-events-none"></div>;
          case 'frame_silver':
              return <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-slate-300 via-slate-100 to-slate-400 shadow-[0_0_10px_rgba(255,255,255,0.3)] z-0 pointer-events-none"></div>;
          case 'frame_neon':
              return (
                  <>
                    <div className="absolute -inset-[3px] rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 blur-[4px] animate-spin-slow z-0 pointer-events-none"></div>
                    <div className="absolute -inset-[1px] rounded-full bg-slate-950 z-0 pointer-events-none"></div>
                  </>
              );
          case 'frame_royal':
              return <div className="absolute -inset-[4px] rounded-full bg-gradient-to-b from-red-600 via-red-800 to-yellow-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-0 border-2 border-yellow-500 pointer-events-none"></div>;
          case 'frame_glitch':
              return (
                  <>
                    <div className="absolute -inset-[3px] rounded-full border-2 border-green-500/50 animate-pulse z-0 pointer-events-none opacity-70"></div>
                    <div className="absolute -inset-[1px] rounded-full border border-white/20 z-0 pointer-events-none"></div>
                    <div className="absolute -inset-[1px] rounded-full bg-green-500/10 z-0 pointer-events-none animate-pulse"></div>
                  </>
              );
          case 'frame_1':
          default:
              return <div className="absolute inset-0 rounded-full border border-white/10 z-0 pointer-events-none"></div>;
      }
  };

  const sizeClasses = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-16 h-16 text-lg',
      xl: 'w-24 h-24 text-2xl md:w-32 md:h-32',
      '2xl': 'w-32 h-32 text-3xl md:w-48 md:h-48'
  };

  // ADICIONADO: 'rounded-full' na div container para que a shadow-2xl do pai fique redonda
  return (
    <div className={`relative inline-block rounded-full ${className}`}>
        {/* Frame Layer (Behind) - z-0 to ensure it stays behind the avatar */}
        {renderFrame()}
        
        {/* Avatar Layer (Front) - z-10 to ensure it stays on top of the frame */}
        <div className={`
            ${sizeClasses[size]} rounded-full flex items-center justify-center 
            bg-gradient-to-br ${avatarConfig.bg} text-white shadow-inner relative z-10
            overflow-hidden
        `}>
            {avatarConfig.icon}
            
            {/* Gloss Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
        </div>
    </div>
  );
};
