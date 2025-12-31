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
  id: string; // Unique ID for React keys and animations
}

export interface User {
  id: string;
  username: string;
  cpf: string;
  birthDate?: string;
  balance: number;
  password?: string; // In a real app, never store plain text password on client state
}

export enum GameStatus {
  Idle = 'IDLE',      // Waiting for bet
  Betting = 'BETTING', // Chips selection
  Dealing = 'DEALING', // Initial 4 cards
  Playing = 'PLAYING', // Player decisions
  DealerTurn = 'DEALER_TURN', // Dealer hitting
  GameOver = 'GAME_OVER' // Result display
}

export enum GameResult {
  None = 'NONE',
  PlayerWin = 'WIN',
  DealerWin = 'LOSE',
  Push = 'PUSH',
  Blackjack = 'BLACKJACK',
  Bust = 'BUST'
}
