
// --- ENGINE AGGREGATOR ---

// Core Modules
const { calculateRisk } = require('./modules/RiskEngine');
const { processTransaction, saveGameLog, GameStateHelper, statsBatcher } = require('./modules/TransactionManager');
const { AchievementSystem } = require('./modules/AchievementSystem');
const { MissionSystem } = require('./modules/MissionSystem');

// Games
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
    MissionSystem,
    statsBatcher,

    // Game Engines
    BlackjackEngine,
    BaccaratEngine,
    MinesEngine,
    TigerEngine
};
