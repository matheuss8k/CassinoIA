import React from 'react';
import { Card, Suit } from '../types';

interface CardProps {
  card: Card;
  index: number;
}

export const CardComponent: React.FC<CardProps> = ({ card, index }) => {
  const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds;
  
  // Stagger animation based on index
  const style = {
    animationDelay: `${index * 150}ms`
  };

  return (
    <div 
      className="relative w-20 h-28 sm:w-24 sm:h-36 perspective-1000 animate-deal-card opacity-0 fill-mode-forwards"
      style={style}
    >
      {/* 
         Container: Controls the flip state.
         Use inline style for transform to prevent Tailwind class conflicts.
      */}
      <div 
        className="relative w-full h-full transition-transform duration-500 preserve-3d"
        style={{ transform: card.isHidden ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        
        {/* Front of Card (Visible when 0deg) */}
        <div className={`absolute w-full h-full backface-hidden bg-white rounded-lg shadow-xl border border-gray-300 flex flex-col justify-between p-2 select-none`}>
          {/* Top Left Rank */}
          <div className={`text-left text-lg font-bold leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            {card.rank}
          </div>
          
          {/* Center Suit */}
          <div className={`absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
            {card.suit}
          </div>

          {/* Bottom Right Rank (Inverted) */}
          <div className={`text-right text-lg font-bold leading-none ${isRed ? 'text-red-600' : 'text-slate-900'} rotate-180`}>
            {card.rank}
          </div>
        </div>

        {/* Back of Card (Visible when 180deg) */}
        <div 
          className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-900 to-black rounded-lg shadow-xl border border-white/20 flex items-center justify-center"
          style={{ transform: 'rotateY(180deg)' }}
        >
            <div className="w-[90%] h-[90%] rounded border-2 border-dashed border-casino-gold/30 opacity-60 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] flex items-center justify-center">
                 <span className="font-bold text-casino-gold text-xl opacity-80">IA</span>
            </div>
        </div>

      </div>
    </div>
  );
};