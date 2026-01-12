
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Notification, NotificationType } from '../components/UI/Notification';

interface ToastContextData {
    showToast: (message: string, type?: NotificationType, duration?: number) => void;
    hideToast: () => void;
}

const ToastContext = createContext<ToastContextData>({} as ToastContextData);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [message, setMessage] = useState<string | null>(null);
    const [type, setType] = useState<NotificationType>('info');
    const [duration, setDuration] = useState(2000);

    const showToast = useCallback((msg: string, type: NotificationType = 'info', duration: number = 2000) => {
        setMessage(msg);
        setType(type);
        setDuration(duration);
    }, []);

    const hideToast = useCallback(() => {
        setMessage(null);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, hideToast }}>
            {children}
            <Notification 
                message={message} 
                type={type} 
                onClose={hideToast} 
                duration={duration} 
            />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};
