
import { User } from '../types';

const GET_BASE_URL = () => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalhost) return '/api';
    const envUrl = (import.meta as any).env?.VITE_API_URL;
    if (envUrl) return envUrl;
    return '/api';
};

const API_URL = GET_BASE_URL();

// Armazenamento do token em memória (Segurança contra XSS)
let _accessToken: string | null = null;

// --- RETRY LOGIC WITH REFRESH TOKEN ---
const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, backoff = 1000): Promise<Response> => {
    // Anexa o token se existir
    if (_accessToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${_accessToken}`
        };
    }

    try {
        let response = await fetch(url, options);

        // Se receber 403 (Forbidden), o token pode ter expirado. Tenta Refresh.
        if (response.status === 403) {
            try {
                const refreshResponse = await fetch(`${API_URL}/refresh`, { method: 'POST' });
                if (refreshResponse.ok) {
                    const data = await refreshResponse.json();
                    _accessToken = data.accessToken;
                    
                    // Tenta a requisição original novamente com o novo token
                    options.headers = { ...options.headers, 'Authorization': `Bearer ${_accessToken}` };
                    response = await fetch(url, options);
                } else {
                    // Se o refresh falhar, o usuário precisa relogar
                    _accessToken = null;
                    throw new Error("Sessão expirada. Faça login novamente.");
                }
            } catch (e) {
                // Falha no refresh
                throw e;
            }
        }

        if (response.status >= 502 && response.status <= 504 && retries > 0) {
             console.log(`Servidor acordando... (${retries} retries left)`);
             throw new Error("Server warming up");
        }
        return response;
    } catch (error: any) {
        if (error.message.includes("Sessão expirada")) throw error;
        
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
};

const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.details || `Erro (${response.status})`);
    return data;
  } else {
    const text = await response.text();
    if (response.status === 404) throw new Error("Serviço de API não encontrado.");
    if (response.status >= 500) throw new Error("Instabilidade temporária. Tente em 1 min.");
    throw new Error(`Erro desconhecido (${response.status}).`);
  }
};

export const DatabaseService = {
  // NOVO: Restaura sessão usando Cookie HttpOnly antes de chamar APIs protegidas
  restoreSession: async (): Promise<User> => {
      try {
          // 1. Tenta obter um novo Access Token via Cookie HttpOnly
          const refreshResponse = await fetch(`${API_URL}/refresh`, { method: 'POST' });
          if (!refreshResponse.ok) throw new Error("Sessão inválida ou expirada");
          
          const data = await refreshResponse.json();
          _accessToken = data.accessToken; // Salva na memória

          // 2. Com o token em mão, sincroniza os dados do usuário
          const syncResponse = await fetchWithRetry(`${API_URL}/user/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}), // Body vazio, ID vem do token
          });
          return handleResponse(syncResponse);
      } catch (e) {
          _accessToken = null;
          throw e;
      }
  },

  createUser: async (userData: Partial<User>): Promise<User> => {
    try {
        const response = await fetchWithRetry(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
        });
        const data = await handleResponse(response);
        if (data.accessToken) _accessToken = data.accessToken;
        return data;
    } catch (error) { throw error; }
  },

  login: async (username: string, password: string): Promise<User> => {
    try {
        const response = await fetchWithRetry(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await handleResponse(response);
        if (data.accessToken) _accessToken = data.accessToken;
        return data;
    } catch (error) { throw error; }
  },
  
  logout: async () => {
      try {
          await fetch(`${API_URL}/logout`, { method: 'POST' });
          _accessToken = null;
      } catch(e) {}
  },
  
  syncUser: async (userId: string) => {
      // Nota: userId ainda é enviado no body por compatibilidade de tipo,
      // mas o backend agora usa o token para identificar o usuário (Segurança).
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
    } catch (e) { console.error('Sync error', e); }
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

  tigerSpin: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/tiger/spin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount }),
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
