import { User } from '../types';

// The API URL will be relative because of the Vite proxy in dev 
// and same-origin in production.
const API_URL = '/api';

export const DatabaseService = {
  // Find user is not exposed publicly for security, handled by login now
  findUser: async (username: string): Promise<User | undefined> => {
     // This method is deprecated in favor of direct login, but keeping signature safe
     return undefined;
  },

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

  // Update user balance via API
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
  }
};