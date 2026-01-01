
import { User } from '../types';

// --- CONFIGURAÇÃO DA API ---

const GET_BASE_URL = () => {
    // PROTEÇÃO CRÍTICA PARA PRODUÇÃO:
    // Se o site não estiver rodando em localhost, FORÇA o uso do caminho relativo '/api'.
    // Isso impede que variáveis de ambiente de desenvolvimento (como http://192.168.x.x)
    // quebrem o app quando acessado via 4G/5G ou URLs públicas (Render).
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
        return '/api';
    }

    // Apenas em desenvolvimento local usamos a variável de ambiente ou fallback
    const envUrl = (import.meta as any).env?.VITE_API_URL;
    if (envUrl) return envUrl;
    
    return '/api';
};

const API_URL = GET_BASE_URL();

// --- RETRY LOGIC (Para Cold Starts do Render) ---
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    try {
        const response = await fetch(url, options);
        // Se for erro de servidor (502, 503, 504), pode ser cold start ou deploy em andamento
        if (response.status >= 502 && response.status <= 504 && retries > 0) {
             throw new Error("Server warming up");
        }
        return response;
    } catch (error: any) {
        if (retries > 0) {
            // Em produção silenciosa, não logamos o retry para o usuário
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
};

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
    if (response.status === 404) {
        throw new Error("Serviço indisponível temporariamente.");
    }
    throw new Error(`Erro de conexão (${response.status}).`);
  }
};

export const DatabaseService = {
  // Create a new user via API
  createUser: async (userData: Partial<User>): Promise<User> => {
    try {
        const response = await fetchWithRetry(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        return handleResponse(response);
    } catch (error: any) {
        console.error("Register Error:", error);
        throw error;
    }
  },

  // Authenticate user via API
  login: async (username: string, password: string): Promise<User> => {
    try {
        const response = await fetchWithRetry(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        return handleResponse(response);
    } catch (error: any) {
        console.error("Login Error:", error);
        throw error;
    }
  },
  
  // SYNC USER DATA
  syncUser: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/user/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // Update user balance via API (Wallet only)
  updateBalance: async (userId: string, newBalance: number): Promise<void> => {
    try {
        await fetchWithRetry(`${API_URL}/balance`, {
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
      const response = await fetchWithRetry(`${API_URL}/user/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, avatarId }),
      });
      return handleResponse(response);
  },

  requestVerification: async (userId: string): Promise<{success: boolean, documentsStatus: string}> => {
      const response = await fetchWithRetry(`${API_URL}/user/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // --- SECURE BLACKJACK TRANSACTIONS ---
  
  blackjackDeal: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/deal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount }),
      });
      return handleResponse(response);
  },

  blackjackHit: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/hit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  blackjackStand: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/stand`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  // --- SECURE MINES LOGIC ---
  
  minesStart: async (userId: string, amount: number, minesCount: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount, minesCount }),
      });
      return handleResponse(response);
  },

  minesReveal: async (userId: string, tileId: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, tileId }),
      });
      return handleResponse(response);
  },

  minesCashout: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/mines/cashout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },
  
  // --- STORE ---
  purchaseItem: async (userId: string, itemId: string, cost: number) => {
      const response = await fetchWithRetry(`${API_URL}/store/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId, cost }),
      });
      return handleResponse(response);
  }
};
