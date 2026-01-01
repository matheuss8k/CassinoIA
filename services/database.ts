
import { User } from '../types';

// Detecta a URL da API baseada no ambiente.
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

// Helper para tratar respostas da API com segurança
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");
  
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Erro na requisição');
    }
    return data;
  } else {
    console.error("Non-JSON Response:", response.status, response.statusText);
    throw new Error(`Erro inesperado do servidor: ${response.status}`);
  }
};

export const DatabaseService = {
  // Create a new user via API
  createUser: async (userData: Partial<User>): Promise<User> => {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  // Authenticate user via API
  login: async (username: string, password: string): Promise<User> => {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleResponse(response);
  },
  
  // SYNC USER DATA
  syncUser: async (userId: string) => {
      const response = await fetch(`${API_URL}/user/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // Update user balance via API (Wallet only)
  updateBalance: async (userId: string, newBalance: number): Promise<void> => {
    try {
        await fetch(`${API_URL}/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newBalance }),
        });
    } catch (e) {
        console.error('Network error syncing balance', e);
    }
  },

  // --- USER PROFILE ---
  updateAvatar: async (userId: string, avatarId: string): Promise<{success: boolean, avatarId: string}> => {
      const response = await fetch(`${API_URL}/user/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, avatarId }),
      });
      return handleResponse(response);
  },

  requestVerification: async (userId: string): Promise<{success: boolean, documentsStatus: string}> => {
      const response = await fetch(`${API_URL}/user/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // --- SECURE BLACKJACK TRANSACTIONS ---
  
  blackjackDeal: async (userId: string, amount: number) => {
      const response = await fetch(`${API_URL}/blackjack/deal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount }),
      });
      return handleResponse(response);
  },

  blackjackHit: async (userId: string) => {
      const response = await fetch(`${API_URL}/blackjack/hit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  blackjackStand: async (userId: string) => {
      const response = await fetch(`${API_URL}/blackjack/stand`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // --- SECURE MINES LOGIC ---
  
  minesStart: async (userId: string, amount: number, minesCount: number) => {
      const response = await fetch(`${API_URL}/mines/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount, minesCount }),
      });
      return handleResponse(response);
  },

  minesReveal: async (userId: string, tileId: number) => {
      const response = await fetch(`${API_URL}/mines/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, tileId }),
      });
      return handleResponse(response);
  },

  minesCashout: async (userId: string) => {
      const response = await fetch(`${API_URL}/mines/cashout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },
  
  // --- STORE ---
  purchaseItem: async (userId: string, itemId: string, cost: number) => {
      const response = await fetch(`${API_URL}/store/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId, cost }),
      });
      return handleResponse(response);
  }
};
