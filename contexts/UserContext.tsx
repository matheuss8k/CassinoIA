
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../types';
import { DatabaseService } from '../services/database';
import { useNavigate } from 'react-router-dom';

interface UserContextData {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (user: User) => void;
    logout: () => void;
    updateUser: (data: Partial<User>) => void;
    updateBalance: (newBalance: number) => Promise<void>;
    refreshSession: () => Promise<void>;
    sessionStatus: 'active' | 'kicked' | 'expired';
    resetSessionStatus: () => void;
}

const UserContext = createContext<UserContextData>({} as UserContextData);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionStatus, setSessionStatus] = useState<'active' | 'kicked' | 'expired'>('active');

    // --- SESSION RESTORE (F5) ---
    useEffect(() => {
        const restore = async () => {
            setIsLoading(true);
            try {
                const restoredUser = await DatabaseService.restoreSession();
                // Data Sanitation / Migration
                if (restoredUser.vipLevel === undefined) restoredUser.vipLevel = 0;
                if (!restoredUser.frameId) restoredUser.frameId = 'frame_1';
                if (!restoredUser.favorites) restoredUser.favorites = [];
                
                setUser(restoredUser);
                if (restoredUser.id) localStorage.setItem('casino_userId', restoredUser.id);
            } catch (error: any) {
                // Silent fail on simple 401, mostly for clean start
                localStorage.removeItem('casino_userId');
            } finally {
                setIsLoading(false);
            }
        };
        restore();
    }, []);

    // --- GLOBAL EVENT LISTENERS (KICK/EXPIRE) ---
    useEffect(() => {
        const handleKick = () => {
            setSessionStatus('kicked');
            setUser(null);
            localStorage.removeItem('casino_userId');
        };
        const handleExpire = () => {
            setSessionStatus('expired');
            setUser(null);
            localStorage.removeItem('casino_userId');
        };

        window.addEventListener('session-kicked', handleKick);
        window.addEventListener('session-expired', handleExpire);

        return () => {
            window.removeEventListener('session-kicked', handleKick);
            window.removeEventListener('session-expired', handleExpire);
        };
    }, []);

    const login = useCallback((userData: User) => {
        // Data Sanitation
        if (userData.vipLevel === undefined) userData.vipLevel = 0;
        if (!userData.frameId) userData.frameId = 'frame_1';
        if (!userData.favorites) userData.favorites = [];

        setUser(userData);
        localStorage.setItem('casino_userId', userData.id);
        setSessionStatus('active');
    }, []);

    const logout = useCallback(() => {
        DatabaseService.logout();
        setUser(null);
        localStorage.removeItem('casino_userId');
        setSessionStatus('active'); // Reset status purely for UI logic if needed
    }, []);

    const updateUser = useCallback((data: Partial<User>) => {
        setUser(prev => {
            if (!prev) return null;
            return { ...prev, ...data };
        });
    }, []);

    const updateBalance = useCallback(async (newBalance: number) => {
        if (!user) return;
        // Optimistic UI Update
        setUser(prev => prev ? { ...prev, balance: newBalance } : null);
        try {
            await DatabaseService.updateBalance(user.id, newBalance);
        } catch (e) {
            console.error("Balance Sync Failed", e);
            // Revert or Sync logic could go here
            refreshSession();
        }
    }, [user]);

    const refreshSession = useCallback(async () => {
        if (!user?.id) return;
        try {
            const updated = await DatabaseService.syncUser(user.id);
            updateUser(updated);
        } catch (e) {
            console.error("Session Sync Failed");
        }
    }, [user, updateUser]);

    const resetSessionStatus = () => setSessionStatus('active');

    return (
        <UserContext.Provider value={{
            user,
            isLoading,
            isAuthenticated: !!user,
            login,
            logout,
            updateUser,
            updateBalance,
            refreshSession,
            sessionStatus,
            resetSessionStatus
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within a UserProvider');
    return context;
};
