
import { User } from '../types';

// --- CONFIGURAÇÃO DA API ---

const GET_BASE_URL = () => {
    // PROTEÇÃO CRÍTICA PARA PRODUÇÃO (RENDER):
    // Quando rodando no Render (que não é localhost), usamos caminho relativo
    // pois o server.js serve tanto a API quanto o Frontend na mesma porta.
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (!isLocalhost) {
        return '/api';
    }

    // Em desenvolvimento local
    const envUrl = (import.meta as any).env?.VITE_API_URL;
    if (envUrl) return envUrl;
    
    return '/api';
};

const API_URL = GET_BASE_URL();

// --- RETRY LOGIC (Para Cold Starts do Render) ---
const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, backoff = 1000): Promise<Response> => {
    try {
        const response = await fetch(url, options);
        // Se for erro de servidor 5xx, pode ser cold start
        if (response.status >= 502 && response.status <= 504 && retries > 0) {
             console.log(`Servidor acordando... (${retries} retries left)`);
             throw new Error("Server warming up");
        }
        return response;
    } catch (error: any) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
};

// Helper Robusto para tratar respostas
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");
  
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Erro do servidor (${response.status})`);
    }
    return data;
  } else {
    // Se a resposta NÃO é JSON (ex: HTML de erro 500 do Render ou 404)
    const text = await response.text();
    console.error("Non-JSON Response:", text.substring(0, 100)); // Log para debug
    
    if (response.status === 404) {
        throw new Error("Serviço de API não encontrado (404).");
    }
    if (response.status >= 500) {
        throw new Error("O servidor está reiniciando ou com problemas temporários. Tente em 1 minuto.");
    }
    throw new Error(`Erro de conexão desconhecido (${response.status}).`);
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

  updateBalance: async (userId: string, newBalance: number): Promise<void> => {
    try {
        await fetchWithRetry(`${API_URL}/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newBalance }),
        });
    } catch (e) { console.error('Network error syncing balance', e); }
  },

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
  
  purchaseItem: async (userId: string, itemId: string, cost: number) => {
      const response = await fetchWithRetry(`${API_URL}/store/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId, cost }),
      });
      return handleResponse(response);
  }
};
