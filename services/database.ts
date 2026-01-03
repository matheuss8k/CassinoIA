
import { User } from '../types';

// --- CORREÇÃO DE CONEXÃO ---
// Forçamos o uso de caminho relativo.
// Em desenvolvimento (Vite): O proxy redireciona '/api' -> 'localhost:3000'
// Em produção (Render): O navegador usa 'https://seusite.com/api' automaticamente.
const API_URL = '/api';

const CLIENT_VERSION = 'v2.1.0-RELEASE'; // Deve bater com o servidor

// Armazenamento do token em memória (Segurança contra XSS)
let _accessToken: string | null = null;

// --- RETRY LOGIC WITH REFRESH TOKEN ---
const fetchWithRetry = async (url: string, options: RequestInit, retries = 6, backoff = 1000): Promise<Response> => {
    // 1. Headers de Segurança e Autenticação
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-version': CLIENT_VERSION, // Anti-Bot Handshake
        ...(options.headers as Record<string, string>),
    };

    if (_accessToken) {
        headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    options.headers = headers;
    
    // 2. Garante o envio de Cookies (Refresh Token)
    if (!options.credentials) {
        options.credentials = 'include';
    }

    try {
        let response = await fetch(url, options);

        // Se receber 403 (Forbidden), o token pode ter expirado. Tenta Refresh.
        if (response.status === 403) {
            try {
                // Refresh também precisa do header de versão e credenciais
                const refreshResponse = await fetch(`${API_URL}/refresh`, { 
                    method: 'POST',
                    headers: { 'x-client-version': CLIENT_VERSION },
                    credentials: 'include'
                });
                
                if (refreshResponse.ok) {
                    const data = await refreshResponse.json();
                    _accessToken = data.accessToken;
                    
                    // Tenta a requisição original novamente com o novo token
                    const newHeaders = { ...headers, 'Authorization': `Bearer ${_accessToken}` };
                    options.headers = newHeaders;
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

        // Trata 502/503/504 (Server Errors / Starting)
        if (response.status >= 502 && response.status <= 504) {
             if (retries > 0) {
                 console.log(`Servidor iniciando/ocupado... (${retries} tentativas restantes)`);
                 throw new Error("Server warming up"); // Força o catch abaixo
             }
        }
        return response;
    } catch (error: any) {
        if (error.message.includes("Sessão expirada")) throw error;
        
        if (retries > 0) {
            // Backoff exponencial limitado a 4s
            const nextBackoff = Math.min(backoff * 1.5, 4000);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, nextBackoff);
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
    if (response.status === 404) throw new Error("Serviço de API não encontrado.");
    if (response.status >= 500) throw new Error("O servidor está iniciando. Tente novamente.");
    throw new Error(`Erro desconhecido (${response.status}).`);
  }
};

export const DatabaseService = {
  // NOVO: Restaura sessão usando Cookie HttpOnly antes de chamar APIs protegidas
  restoreSession: async (): Promise<User> => {
      try {
          // 1. Tenta obter um novo Access Token via Cookie HttpOnly
          const refreshResponse = await fetch(`${API_URL}/refresh`, { 
              method: 'POST',
              headers: { 'x-client-version': CLIENT_VERSION },
              credentials: 'include'
          });
          if (!refreshResponse.ok) throw new Error("Sessão inválida ou expirada");
          
          const data = await refreshResponse.json();
          _accessToken = data.accessToken; // Salva na memória

          // 2. Com o token em mão, sincroniza os dados do usuário
          const syncResponse = await fetchWithRetry(`${API_URL}/user/sync`, {
              method: 'POST',
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
            body: JSON.stringify({ username, password }),
        });
        const data = await handleResponse(response);
        if (data.accessToken) _accessToken = data.accessToken;
        return data;
    } catch (error) { throw error; }
  },
  
  logout: async () => {
      try {
          // Logout não precisa de retry
          await fetch(`${API_URL}/logout`, { 
              method: 'POST',
              headers: { 'x-client-version': CLIENT_VERSION },
              credentials: 'include'
          });
          _accessToken = null;
      } catch(e) {}
  },
  
  syncUser: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/user/sync`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  updateBalance: async (userId: string, newBalance: number): Promise<void> => {
    try {
        await fetchWithRetry(`${API_URL}/balance`, {
          method: 'POST',
          body: JSON.stringify({ userId, newBalance }),
        });
    } catch (e) { console.error('Sync error', e); }
  },

  updateAvatar: async (userId: string, avatarId: string): Promise<{success: boolean, avatarId: string}> => {
      const response = await fetchWithRetry(`${API_URL}/user/avatar`, {
          method: 'POST',
          body: JSON.stringify({ userId, avatarId }),
      });
      return handleResponse(response);
  },

  requestVerification: async (userId: string): Promise<{success: boolean, documentsStatus: string}> => {
      const response = await fetchWithRetry(`${API_URL}/user/verify`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  blackjackDeal: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/deal`, {
          method: 'POST',
          body: JSON.stringify({ userId, amount }),
      });
      return handleResponse(response);
  },

  blackjackHit: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/hit`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  blackjackStand: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/blackjack/stand`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  minesStart: async (userId: string, amount: number, minesCount: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/start`, {
          method: 'POST',
          body: JSON.stringify({ userId, amount, minesCount }),
      });
      return handleResponse(response);
  },

  minesReveal: async (userId: string, tileId: number) => {
      const response = await fetchWithRetry(`${API_URL}/mines/reveal`, {
          method: 'POST',
          body: JSON.stringify({ userId, tileId }),
      });
      return handleResponse(response);
  },

  minesCashout: async (userId: string) => {
      const response = await fetchWithRetry(`${API_URL}/mines/cashout`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
      });
      return handleResponse(response);
  },

  tigerSpin: async (userId: string, amount: number) => {
      const response = await fetchWithRetry(`${API_URL}/tiger/spin`, {
          method: 'POST',
          body: JSON.stringify({ userId, amount }),
      });
      return handleResponse(response);
  },
  
  purchaseItem: async (userId: string, itemId: string, cost: number) => {
      const response = await fetchWithRetry(`${API_URL}/store/purchase`, {
          method: 'POST',
          body: JSON.stringify({ userId, itemId, cost }),
      });
      return handleResponse(response);
  }
};
