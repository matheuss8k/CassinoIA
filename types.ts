
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
  claimed?: boolean; // New: Controls if the reward was manually collected
}

export interface Trophy {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name or emoji
  unlockedAt?: string; // Date ISO string
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Lista Bruta de Troféus (Insira novos aqui em qualquer ordem)
const RAW_TROPHIES: Trophy[] = [
    // --- GERAL (Funcionam em qualquer jogo) ---
    { id: 'first_win', name: 'Primeira Vitória', description: 'Vença sua primeira aposta no sistema.', icon: '🏆', rarity: 'common' },
    { id: 'club_50', name: 'Clube dos 50', description: 'Complete 50 rodadas (qualquer jogo).', icon: '🎰', rarity: 'common' },
    { id: 'loyal_player', name: 'Lealdade Pura', description: 'Complete 30 rodadas ou missões.', icon: '🤝', rarity: 'rare' },
    { id: 'rich_club', name: 'Novo Magnata', description: 'Alcance um saldo de R$ 5.000,00.', icon: '💰', rarity: 'rare' },
    
    // --- INCENTIVO FINANCEIRO ---
    { id: 'first_deposit', name: 'Primeiro Aporte', description: 'Realize seu primeiro depósito.', icon: '💎', rarity: 'common' },
    { id: 'whale', name: 'A Baleia', description: 'Acumule R$ 1.000 em depósitos totais.', icon: '🐳', rarity: 'legendary' },

    // --- HIGH STAKES / SKILL (Geral) ---
    { id: 'phoenix', name: 'A Fênix', description: 'Vença uma partida após 3 derrotas seguidas.', icon: '🔥', rarity: 'rare' },
    { id: 'heavy_hitter', name: 'Mão Pesada', description: 'Ganhe um prêmio único acima de R$ 200.', icon: '💪', rarity: 'rare' },
    { id: 'unbeatable', name: 'O Imbatível', description: 'Conquiste 10 vitórias consecutivas.', icon: '👑', rarity: 'legendary' },
    { id: 'high_roller', name: 'Apostador de Elite', description: 'Faça uma aposta única de R$ 500+.', icon: '🎩', rarity: 'legendary' },
    
    // --- MINES (Específicos) ---
    { id: 'sniper', name: 'Sniper de Elite', description: 'Revele 20 campos no Mines sem explodir.', icon: '🎯', rarity: 'legendary' },
    { id: 'mines_surgeon', name: 'Cirurgião', description: 'Faça um saque de 10x ou mais no Mines.', icon: '🔪', rarity: 'rare' },

    // --- TIGER (Específicos) ---
    { id: 'multiplier_king', name: 'Rei do Multiplicador', description: 'Acerte 50x ou mais no Tigrinho.', icon: '🚀', rarity: 'legendary' },
    { id: 'tiger_gold', name: 'Tigre Dourado', description: 'Complete a tela com Wilds no Tigrinho.', icon: '🐯', rarity: 'epic' },

    // --- BLACKJACK (Específicos) ---
    { id: 'bj_master', name: 'Rei do 21', description: 'Acumule 10 Blackjacks Naturais.', icon: '♠️', rarity: 'legendary' },
    
    // --- BACCARAT (Específicos) ---
    { id: 'bacc_king', name: 'Imperador', description: 'Vença 5 rodadas seguidas no Baccarat.', icon: '🐉', rarity: 'legendary' },
];

// Peso das Raridades para Ordenação
const RARITY_WEIGHT = {
  'common': 1,
  'rare': 2,
  'epic': 3,
  'legendary': 4
};

// Exportação Ordenada Automaticamente
export const TROPHY_MAP: Trophy[] = RAW_TROPHIES.sort((a, b) => {
  return RARITY_WEIGHT[a.rarity] - RARITY_WEIGHT[b.rarity];
});

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'cosmetic' | 'consumable';
  category: 'avatar' | 'frame' | 'consumable'; // New: Organization
  rarity: 'common' | 'rare' | 'epic' | 'legendary'; // New: Visual weight
  icon: string;
}

export interface SideBets {
    perfectPairs: number;
    dealerBust: number;
}

// Baccarat Types
export type BaccaratBetType = 'PLAYER' | 'BANKER' | 'TIE' | 'PAIR_PLAYER' | 'PAIR_BANKER';

export interface BaccaratHistoryItem {
    id: number;
    winner: 'PLAYER' | 'BANKER' | 'TIE';
    scorePlayer: number;
    scoreBanker: number;
    isPair: boolean;
    timestamp: Date;
}

// Interface para restaurar estado do jogo
export interface ActiveGame {
  type: 'BLACKJACK' | 'MINES' | 'TIGER' | 'BACCARAT' | 'NONE';
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
  frameId: string; // New: Modular Frame System
  isVerified: boolean;
  documentsStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  vipLevel?: number;
  
  // Gamification (Simplified)
  loyaltyPoints: number; // Moeda da loja
  missions: Mission[];
  unlockedTrophies: string[]; // IDs dos troféus
  ownedItems: string[]; // IDs dos itens comprados
  favorites: string[]; // IDs dos jogos favoritos
  lastDailyReset: string; // Data do último reset de missões
  
  // Stats for Trophies (NEW: Backend Synced)
  stats?: {
      totalGames: number;
      totalWins: number;
      totalBlackjacks: number;
      highestWin: number;
      totalWagered: number;
  };
  
  totalDeposits: number; // Required for 'whale' trophy

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
  Insurance = 'INSURANCE',
  Squeezing = 'SQUEEZING' // New Baccarat Status
}

export enum GameResult {
  None = 'NONE',
  PlayerWin = 'WIN',
  DealerWin = 'LOSE',
  Push = 'PUSH',
  Blackjack = 'BLACKJACK',
  Bust = 'BUST',
  BankerWin = 'BANKER_WIN',
  Tie = 'TIE'
}
