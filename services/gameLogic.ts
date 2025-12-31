import { Card, Rank, Suit } from '../types';

// CASINO STANDARD: 8 Decks para tornar a contagem de cartas ineficaz.
// O jogo embaralha a cada mão (Continuous Shuffling), tornando a contagem impossível.
export const createDeck = (numberOfDecks: number = 8): Card[] => {
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = Object.values(Rank);
  const deck: Card[] = [];

  // Loop para criar múltiplos baralhos no mesmo "Shoe"
  for (let i = 0; i < numberOfDecks; i++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        let value = 0;
        if (['J', 'Q', 'K'].includes(rank)) {
          value = 10;
        } else if (rank === 'A') {
          value = 11;
        } else {
          value = parseInt(rank);
        }
        
        deck.push({
          suit,
          rank,
          value,
          // Adicionado índice do baralho (i) ao ID para garantir unicidade absoluta
          id: `${rank}-${suit}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          isHidden: false
        });
      }
    }
  }
  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  // Algoritmo Fisher-Yates robusto
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const calculateScore = (hand: Card[]): number => {
  let score = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.isHidden) continue;
    score += card.value;
    if (card.rank === Rank.Ace) aces += 1;
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
};

// Basic Strategy Logic for Hints
export const getBasicStrategyHint = (playerHand: Card[], dealerHand: Card[]): { action: 'HIT' | 'STAND', reason: string } => {
  const playerScore = calculateScore(playerHand);
  
  // Find Dealer Up Card (visible)
  const dealerUpCard = dealerHand.find(c => !c.isHidden);
  const dealerValue = dealerUpCard ? dealerUpCard.value : 0;

  // Simple Basic Strategy
  
  // Hard Totals
  if (playerScore >= 17) {
    return { action: 'STAND', reason: 'Mão forte, alto risco de estourar.' };
  }
  
  if (playerScore <= 11) {
    return { action: 'HIT', reason: 'Sem risco de estourar, aumente sua pontuação.' };
  }

  if (playerScore === 12) {
    if (dealerValue >= 4 && dealerValue <= 6) {
      return { action: 'STAND', reason: 'Dealer tem carta fraca, deixe-o estourar.' };
    } else {
      return { action: 'HIT', reason: 'Pontuação baixa contra dealer forte.' };
    }
  }

  if (playerScore >= 13 && playerScore <= 16) {
    if (dealerValue >= 2 && dealerValue <= 6) {
      return { action: 'STAND', reason: 'Dealer vulnerável, jogue seguro.' };
    } else {
      return { action: 'HIT', reason: 'Dealer forte, você precisa melhorar.' };
    }
  }

  // Fallback
  return { action: 'HIT', reason: 'Estatisticamente melhor.' };
};