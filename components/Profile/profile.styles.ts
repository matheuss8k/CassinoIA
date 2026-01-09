
// Definições visuais e constantes do Perfil e Loja

export const RARITY_TRANSLATION: Record<string, string> = {
    'common': 'Comum',
    'rare': 'Raro',
    'epic': 'Épico',
    'legendary': 'Lendário'
};

export const RARITY_WEIGHT: Record<string, number> = {
    'legendary': 4,
    'epic': 3,
    'rare': 2,
    'common': 1
};

export const RARITY_STYLES: Record<string, { border: string, cardBg: string, topGlow: string, text: string, badge: string, button: string }> = {
    'common': { 
        border: 'border-slate-700', 
        cardBg: 'bg-slate-900', 
        topGlow: 'from-slate-700/20',
        text: 'text-slate-400',
        badge: 'bg-slate-800 text-slate-400 border-slate-600',
        button: 'bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600'
    },
    'rare': { 
        border: 'border-blue-500', 
        cardBg: 'bg-gradient-to-b from-blue-950 to-slate-900', 
        topGlow: 'from-blue-500/20',
        text: 'text-blue-200',
        badge: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
        button: 'bg-blue-600 text-white hover:bg-blue-500 border-t border-blue-400 shadow-lg shadow-blue-900/20'
    },
    'epic': { 
        border: 'border-purple-500', 
        cardBg: 'bg-gradient-to-b from-purple-950 to-slate-900', 
        topGlow: 'from-purple-500/20',
        text: 'text-purple-200',
        badge: 'bg-purple-900/40 text-purple-300 border-purple-500/30',
        button: 'bg-purple-600 text-white hover:bg-purple-500 border-t border-purple-400 shadow-lg shadow-purple-900/20'
    },
    'legendary': { 
        border: 'border-yellow-500', 
        cardBg: 'bg-gradient-to-b from-yellow-950 to-slate-900', 
        topGlow: 'from-yellow-500/20',
        text: 'text-yellow-200',
        badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30',
        button: 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-black font-bold hover:brightness-110 border-t border-yellow-300'
    }
};

export const FREE_AVATAR_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const DEFAULT_FRAME_ID = 'frame_1';
