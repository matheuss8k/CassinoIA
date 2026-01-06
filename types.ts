
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
  rarity: 'common' | 'rare' | 'legendary';
}

export const TROPHY_MAP: Trophy[] = [
    { id: 'first_win', name: 'Primeira Vitória', description: 'Vença sua primeira aposta no sistema.', icon: '🏆', rarity: 'common' },
    { id: 'club_50', name: 'Clube dos 50', description: 'Complete 50 rodadas em qualquer jogo.', icon: '🎰', rarity: 'common' },
    { id: 'loyal_player', name: 'Lealdade Pura', description: 'Complete 30 rodadas ou missões.', icon: '🤝', rarity: 'rare' },
    { id: 'phoenix', name: 'A Fênix', description: 'Vença uma partida após 3 derrotas seguidas.', icon: '🔥', rarity: 'rare' },
    { id: 'heavy_hitter', name: 'Heavy Hitter', description: 'Ganhe um prêmio único acima de R$ 200.', icon: '💪', rarity: 'rare' },
    { id: 'rich_club', name: 'Novo Magnata', description: 'Alcance um saldo de R$ 5.000,00.', icon: '💰', rarity: 'rare' },
    { id: 'multiplier_king', name: 'Rei do Multiplicador', description: 'Acerte um multiplicador de 50x ou mais.', icon: '🚀', rarity: 'legendary' },
    { id: 'unbeatable', name: 'O Imbatível', description: 'Conquiste 10 vitórias consecutivas.', icon: '👑', rarity: 'legendary' },
    { id: 'high_roller', name: 'High Roller', description: 'Faça uma aposta única de R$ 500+.', icon: '💎', rarity: 'legendary' },
    { id: 'sniper', name: 'Sniper de Elite', description: 'Revele 20 campos no Mines sem explodir.', icon: '🎯', rarity: 'legendary' },
    { id: 'bj_master', name: 'Rei do 21', description: 'Obtenha 10 Blackjacks Naturais.', icon: '♠️', rarity: 'legendary' },
];

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'cosmetic' | 'consumable';
  icon: string;
}

export interface SideBets {
    perfectPairs: number;
    dealerBust: number;
}

// Interface para restaurar estado do jogo
export interface ActiveGame {
  type: 'BLACKJACK' | 'MINES' | 'NONE';
  bet: number;
  // BJ Props
  bjPlayerHand?: Card[];
  bjDealerHand?: Card[];
  bjStatus?: string;
  sideBets?: SideBets;
  insuranceBet?: number;
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
  
  // Stats for Trophies (NEW: Backend Synced)
  stats?: {
      totalGames: number;
      totalWins: number;
      totalBlackjacks: number;
      highestWin: number;
      totalWagered: number;
  };

  // Session Restore
  activeGame?: ActiveGame;
}

export enum GameStatus {
  Idle = 'IDLE',      
  Betting = 'BETTING', 
  Dealing = 'DEALING', 
  Playing = 'PLAYING', 
  DealerTurn = 'DEALER_TURN', 
  GameOver = 'GAME_OVER',
  Insurance = 'INSURANCE' // New Status
}

export enum GameResult {
  None = 'NONE',
  PlayerWin = 'WIN',
  DealerWin = 'LOSE',
  Push = 'PUSH',
  Blackjack = 'BLACKJACK',
  Bust = 'BUST'
}
