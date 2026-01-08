
// Engine de Regras do Baccarat (Punto Banco Standard)

const getCardValue = (rank) => {
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
    if (rank === 'A') return 1;
    return parseInt(rank);
};

const calculateHandScore = (hand) => {
    let sum = hand.reduce((acc, card) => acc + getCardValue(card.rank), 0);
    return sum % 10;
};

const simulateGame = (deck) => {
    const pHand = [deck.pop(), deck.pop()];
    const bHand = [deck.pop(), deck.pop()];
    
    let pScore = calculateHandScore(pHand);
    let bScore = calculateHandScore(bHand);
    
    // Natural Win (8 or 9) checks
    if (pScore >= 8 || bScore >= 8) {
        return {
            pHand, bHand, pScore, bScore,
            winner: pScore > bScore ? 'PLAYER' : bScore > pScore ? 'BANKER' : 'TIE',
            natural: true
        };
    }

    // Third Card Rules
    let pThirdCard = null;
    
    // Player Rules
    if (pScore <= 5) {
        pThirdCard = deck.pop();
        pHand.push(pThirdCard);
        pScore = calculateHandScore(pHand);
    }

    // Banker Rules
    let bankerDraws = false;
    if (bScore <= 2) {
        bankerDraws = true;
    } else if (bScore === 3) {
        // Draw unless Player's 3rd card was an 8
        if (!pThirdCard || getCardValue(pThirdCard.rank) !== 8) bankerDraws = true;
    } else if (bScore === 4) {
        // Draw if Player's 3rd card was 2-7
        if (pThirdCard) {
            const val = getCardValue(pThirdCard.rank);
            if (val >= 2 && val <= 7) bankerDraws = true;
        } else {
            bankerDraws = true; // Player stood (6-7), Banker draws on 0-5 -> logic simplified: if player stood, banker hits 0-5. Here bScore is 4.
        }
        // Correction: If player stood, Banker hits 0-5. 
        if (!pThirdCard && bScore <= 5) bankerDraws = true;
        
    } else if (bScore === 5) {
        // Draw if Player's 3rd card was 4-7
        if (pThirdCard) {
            const val = getCardValue(pThirdCard.rank);
            if (val >= 4 && val <= 7) bankerDraws = true;
        } else if (!pThirdCard && bScore <= 5) {
             bankerDraws = true;
        }
    } else if (bScore === 6) {
        // Draw if Player's 3rd card was 6 or 7
        if (pThirdCard) {
            const val = getCardValue(pThirdCard.rank);
            if (val === 6 || val === 7) bankerDraws = true;
        }
        // If player stood, banker stands on 6.
    }
    // 7 stands.

    // Specific Logic Correction for "Player Stood"
    if (!pThirdCard) {
        if (bScore <= 5) bankerDraws = true;
        else bankerDraws = false;
    }

    if (bankerDraws) {
        bHand.push(deck.pop());
        bScore = calculateHandScore(bHand);
    }

    return {
        pHand, bHand, pScore, bScore,
        winner: pScore > bScore ? 'PLAYER' : bScore > pScore ? 'BANKER' : 'TIE',
        natural: false
    };
};

module.exports = {
    getCardValue,
    calculateHandScore,
    simulateGame
};
