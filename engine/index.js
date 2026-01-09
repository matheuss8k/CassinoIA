
// --- ENGINE AGGREGATOR ---
// This file re-exports all modules for easy import.

const { calculateRisk } = require('./modules/RiskEngine');
const { processTransaction, saveGameLog, GameStateHelper, statsBatcher } = require('./modules/TransactionManager');
const { AchievementSystem } = require('./modules/AchievementSystem');

// Games (Optional: Controllers can import directly if preferred to reduce bundle, but kept here for legacy support)
const BlackjackEngine = require('./games/BlackjackEngine');
const BaccaratEngine = require('./games/BaccaratEngine');
const MinesEngine = require('./games/MinesEngine');
const TigerEngine = require('./games/TigerEngine');

module.exports = {
    // Core Modules
    calculateRisk,
    processTransaction,
    saveGameLog,
    GameStateHelper,
    AchievementSystem,
    statsBatcher,

    // Game Engines
    BlackjackEngine,
    BaccaratEngine,
    MinesEngine,
    TigerEngine
};
