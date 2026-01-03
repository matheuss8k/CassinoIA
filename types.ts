
export enum Suit {
  Hearts = '♥',
  Diamonds = '♦',
  Clubs = '♣',
  Spades = '♠'
}

export enum Rank {
  Two = '2', Three = '3', Four = '4', Five = '5', Six = '6',
  Seven = '7', Eight = '8', Nine = '9', Ten = '10',
  Jack = 'J', Queen = 'Q', King = 'K', Ace = 'A'
}

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number;
  isHidden?: boolean;
  id: string; 
}

// Gamification Types
export interface Mission {
  id: string;
  type: 'blackjack_win' | 'mines_play' | 'bet_total' | 'profit_total';
  description: string;
  target: number;
  current: number;
  rewardPoints: number; // Only Points remain
  completed: boolean;
}

export interface Trophy {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name or emoji
  unlockedAt?: string; // Date ISO string
}

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'cosmetic' | 'consumable';
  icon: string;
}

// Interface para restaurar estado do jogo
export interface ActiveGame {
  type: 'BLACKJACK' | 'MINES' | 'NONE';
  bet: number;
  // BJ Props
  bjPlayerHand?: Card[];
  bjDealerHand?: Card[];
  bjStatus?: string;
  // Mines Props
  minesCount?: number;
  minesRevealed?: number[]; // IDs dos tiles revelados
  minesMultiplier?: number;
  // Provably Fair Visual
  publicSeed?: string; 
}

export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  cpf: string;
  birthDate: string;
  balance: number;
  consecutiveWins: number;
  password?: string;
  
  // New: Session tracking
  sessionProfit: number; // Positive = Profit, Negative = Loss
  
  // Profile
  avatarId: string;
  isVerified: boolean;
  documentsStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  vipLevel?: number;
  
  // Gamification (Simplified)
  loyaltyPoints: number; // Moeda da loja
  missions: Mission[];
  unlockedTrophies: string[]; // IDs dos troféus
  ownedItems: string[]; // IDs dos itens comprados
  lastDailyReset: string; // Data do último reset de missões
  
  // Stats for Trophies
  totalGamesPlayed: number;
  totalBlackjacks: number;

  // Session Restore
  activeGame?: ActiveGame;
}

export enum GameStatus {
  Idle = 'IDLE',      
  Betting = 'BETTING', 
  Dealing = 'DEALING', 
  Playing = 'PLAYING', 
  DealerTurn = 'DEALER_TURN', 
  GameOver = 'GAME_OVER' 
}

export enum GameResult {
  None = 'NONE',
  PlayerWin = 'WIN',
  DealerWin = 'LOSE',
  Push = 'PUSH',
  Blackjack = 'BLACKJACK',
  Bust = 'BUST'
}
