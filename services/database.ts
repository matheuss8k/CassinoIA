
import { User } from '../types';

// --- CONFIGURAÇÃO ROBUSTA DE URL ---
// Determina a URL base dinamicamente para evitar referências a localhost em produção.
const getApiUrl = () => {
    if (typeof window !== 'undefined') {
        // Em produção, isso retorna 'https://cassinoia.com/api'
        return `${window.location.origin}/api`;
    }
    return '/api';
};

const API_URL = getApiUrl();
const CLIENT_VERSION = 'v2.1.0-RELEASE'; 

let _accessToken: string | null = null;

// --- FETCH WITH TIMEOUT & RETRY ---
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-version': CLIENT_VERSION,
        ...(options.headers as Record<string, string>),
    };

    if (_accessToken) {
        headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    options.headers = headers;
    if (!options.credentials) options.credentials = 'include';

    // Timeout de 15 segundos para evitar loading infinito
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    options.signal = controller.signal;

    try {
        let response = await fetch(url, options);
        clearTimeout(timeoutId); // Limpa o timer se sucesso

        if (response.status === 403) {
            try {
                // Tenta refresh sem timeout agressivo
                const refreshResponse = await fetch(`${API_URL}/refresh`, { 
                    method: 'POST',
                    headers: { 'x-client-version': CLIENT_VERSION },
                    credentials: 'include'
                });
                
                if (refreshResponse.ok) {
                    const data = await refreshResponse.json();
                    _accessToken = data.accessToken;
                    const newHeaders = { ...headers, 'Authorization': `Bearer ${_accessToken}` };
                    options.headers = newHeaders;
                    // Remove signal antigo para nova tentativa
                    const newOptions = { ...options };
                    delete newOptions.signal; 
                    
                    response = await fetch(url, newOptions);
                } else {
                    _accessToken = null;
                    throw new Error("Sessão expirada.");
                }
            } catch (e) { throw e; }
        }

        if (response.status >= 502 && response.status <= 504) {
             throw new Error("Server warming up");
        }
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error("Tempo limite excedido. Verifique sua conexão.");
        }
        if (error.message.includes("Sessão expirada")) throw error;
        
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
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
    if (response.status === 404) throw new Error("API Indisponível (404).");
    throw new Error(`Erro desconhecido (${response.status}).`);
  }
};

export const DatabaseService = {
  restoreSession: async (): Promise<User> => {
      try {
          const refreshResponse = await fetch(`${API_URL}/refresh`, { 
              method: 'POST',
              headers: { 'x-client-version': CLIENT_VERSION },
              credentials: 'include'
          });
          if (!refreshResponse.ok) throw new Error("Sessão inválida");
          
          const data = await refreshResponse.json();
          _accessToken = data.accessToken;

          const syncResponse = await fetchWithRetry(`${API_URL}/user/sync`, { method: 'POST', body: JSON.stringify({}) });
          return handleResponse(syncResponse);
      } catch (e) {
          _accessToken = null;
          throw e;
      }
  },

  createUser: async (userData: Partial<User>): Promise<User> => {
    const response = await fetchWithRetry(`${API_URL}/register`, { method: 'POST', body: JSON.stringify(userData) });
    const data = await handleResponse(response);
    if (data.accessToken) _accessToken = data.accessToken;
    return data;
  },

  login: async (username: string, password: string): Promise<User> => {
    const response = await fetchWithRetry(`${API_URL}/login`, { method: 'POST', body: JSON.stringify({ username, password }) });
    const data = await handleResponse(response);
    if (data.accessToken) _accessToken = data.accessToken;
    return data;
  },
  
  logout: async () => {
      await fetch(`${API_URL}/logout`, { method: 'POST', headers: { 'x-client-version': CLIENT_VERSION }, credentials: 'include' });
      _accessToken = null;
  },
  
  syncUser: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/user/sync`, { method: 'POST', body: JSON.stringify({ userId }) });
      return handleResponse(response);
  },

  updateBalance: async (userId: string, newBalance: number) => {
      await fetchWithRetry(`${API_URL}/balance`, { method: 'POST', body: JSON.stringify({ userId, newBalance }) });
  },

  updateAvatar: async (userId: string, avatarId: string) => {
      const response = await fetchWithRetry(`${API_URL}/user/avatar`, { method: 'POST', body: JSON.stringify({ userId, avatarId }) });
      return handleResponse(response);
  },

  requestVerification: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/user/verify`, { method: 'POST', body: JSON.stringify({ userId }) });
      return handleResponse(response);
  },

  blackjackDeal: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/deal`, { method: 'POST', body: JSON.stringify({ userId, amount }) });
      return handleResponse(response);
  },

  blackjackHit: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/hit`, { method: 'POST', body: JSON.stringify({ userId }) });
      return handleResponse(response);
  },

  blackjackStand: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/stand`, { method: 'POST', body: JSON.stringify({ userId }) });
      return handleResponse(response);
  },

  minesStart: async (userId: string, amount: number, minesCount: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/start`, { method: 'POST', body: JSON.stringify({ userId, amount, minesCount }) });
      return handleResponse(response);
  },

  minesReveal: async (userId: string, tileId: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/reveal`, { method: 'POST', body: JSON.stringify({ userId, tileId }) });
      return handleResponse(response);
  },

  minesCashout: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/mines/cashout`, { method: 'POST', body: JSON.stringify({ userId }) });
      return handleResponse(response);
  },

  tigerSpin: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/tiger/spin`, { method: 'POST', body: JSON.stringify({ userId, amount }) });
      return handleResponse(response);
  },
  
  purchaseItem: async (userId: string, itemId: string, cost: number) => {
      const response = await fetchWithRetry(`${API_URL}/store/purchase`, { method: 'POST', body: JSON.stringify({ userId, itemId, cost }) });
      return handleResponse(response);
  }
};
