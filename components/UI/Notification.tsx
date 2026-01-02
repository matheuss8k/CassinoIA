
import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type NotificationType = 'error' | 'success' | 'info';

interface NotificationProps {
  message: string | null;
  type?: NotificationType;
  onClose: () => void;
  duration?: number;
}

export const Notification: React.FC<NotificationProps> = ({ 
  message, 
  type = 'error', 
  onClose, 
  duration = 2000 // Reduzido de 3000ms para 2000ms por padrão
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState(message);

  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
      
      requestAnimationFrame(() => {
          setIsVisible(true);
      });
      
      // Lógica inteligente: Erros de "ação rápida" ou "conexão" duram menos (1s)
      // para não atrapalhar o fluxo do jogo.
      let effectiveDuration = duration;
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('rápida') || lowerMsg.includes('conexão')) {
          effectiveDuration = 1000;
      }

      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 200); 
      }, effectiveDuration);

      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!displayMessage && !isVisible) return null;

  const styles = {
    error: "bg-slate-950/95 border-red-500 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.5)]",
    success: "bg-slate-950/95 border-green-500 text-green-200 shadow-[0_0_30px_rgba(34,197,94,0.5)]",
    info: "bg-slate-950/95 border-blue-500 text-blue-200 shadow-[0_0_30px_rgba(59,130,246,0.5)]"
  };

  const icons = {
    error: <AlertCircle className="text-red-500" size={24} />,
    success: <CheckCircle className="text-green-500" size={24} />,
    info: <Info className="text-blue-500" size={24} />
  };

  return (
    <div 
        className={`
            fixed top-24 left-1/2 -translate-x-1/2 z-[100] 
            transition-opacity duration-200 ease-out transform transition-transform
            ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'}
            ${!isVisible && !message ? 'pointer-events-none' : ''}
        `}
    >
        <div className={`flex items-center gap-3 px-6 py-4 rounded-xl border backdrop-blur-xl min-w-[300px] max-w-md ${styles[type]}`}>
            <div className="shrink-0">{icons[type]}</div>
            <div className="flex-1 text-sm font-bold">{displayMessage}</div>
            <button onClick={() => setIsVisible(false)} className="opacity-70 hover:opacity-100 transition-opacity text-white">
                <X size={18} />
            </button>
        </div>
    </div>
  );
};
