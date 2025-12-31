import { User } from '../types';

// Detecta a URL da API baseada no ambiente.
// Em desenvolvimento (Vite proxy) e Produção (Express serving static), '/api' funciona bem.
// Mas permite override via .env se necessário.
const API_URL = import.meta.env?.VITE_API_URL || '/api';

export const DatabaseService = {
  // Create a new user via API
  createUser: async (userData: Omit<User, 'id' | 'balance'>): Promise<User> => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao criar conta');
    }

    return data;
  },

  // Authenticate user via API
  login: async (username: string, password: string): Promise<User> => {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao realizar login');
    }

    return data;
  },

  // Update user balance via API (Wallet only)
  updateBalance: async (userId: string, newBalance: number): Promise<void> => {
    const response = await fetch(`${API_URL}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newBalance }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Failed to sync balance:', data.message);
    }
  },

  // --- SECURE GAME TRANSACTIONS ---
  
  // Deduz aposta atomicamente no servidor
  placeBet: async (userId: string, amount: number): Promise<number> => {
    const response = await fetch(`${API_URL}/game/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao processar aposta');
    }

    return data.newBalance;
  },

  // Processa pagamento no servidor
  settleGame: async (userId: string, amount: number): Promise<number> => {
    const response = await fetch(`${API_URL}/game/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao processar pagamento');
    }

    return data.newBalance;
  }
};