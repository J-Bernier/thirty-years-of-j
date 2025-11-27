"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const quiz_1 = require("./games/quiz");
const firebase_1 = require("./firebase");
const GAME_STATE_DOC_ID = 'current_game_state';
const GAME_STATE_COLLECTION = 'game_states';
let gameState = {
    phase: 'LOBBY',
    teams: [],
    activeRound: null,
    history: [],
    showLeaderboard: false,
    quiz: {
        isActive: false,
        config: { timePerQuestion: 30, totalQuestions: 0 },
        currentQuestion: null,
        currentQuestionIndex: -1,
        timer: 0,
        phase: 'IDLE',
        answers: {},
        gameScores: {}
    }
};
// Debounce save function to prevent excessive writes
let saveTimeout = null;
let saveEnabled = true;
const saveGameState = (state) => {
    if (!saveEnabled)
        return;
    if (saveTimeout)
        clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield firebase_1.db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).set(state);
            console.log('Game state saved to Firestore');
        }
        catch (error) {
            console.error('Error saving game state (disabling persistence):', error);
            saveEnabled = false; // Disable future saves to prevent log spam/crashes
        }
    }), 1000); // Save at most once per second
};
// Load initial state
const loadGameState = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doc = yield firebase_1.db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).get();
        if (doc.exists) {
            const data = doc.data();
            // Merge with default state to ensure structure is valid
            gameState = Object.assign(Object.assign({}, gameState), data);
            console.log('Game state loaded from Firestore');
        }
        else {
            console.log('No existing game state found, using default');
        }
    }
    catch (error) {
        console.error('Error loading game state (using default):', error);
        saveEnabled = false; // Disable saving if loading failed (likely auth issue)
    }
});
// Load state immediately
loadGameState();
const quizManager = new quiz_1.QuizManager(io, () => gameState, (newState) => {
    gameState = newState;
    saveGameState(gameState);
});
io.on('connection', (socket) => {
    console.log('a user connected', socket.id);
    // Send initial state
    socket.emit('gameStateUpdate', gameState);
    // Map to track disconnection timeouts
    const disconnectTimeouts = new Map();
    socket.on('joinTeam', ({ name, playerId }) => {
        // Check if team already exists (reconnection)
        const existingTeam = gameState.teams.find(t => t.id === playerId);
        if (existingTeam) {
            // Reconnect
            existingTeam.socketId = socket.id;
            existingTeam.name = name; // Update name just in case
            // Clear any pending disconnect timeout
            if (disconnectTimeouts.has(playerId)) {
                clearTimeout(disconnectTimeouts.get(playerId));
                disconnectTimeouts.delete(playerId);
            }
            console.log(`Team reconnected: ${name} (${playerId})`);
        }
        else {
            // New Team
            const newTeam = {
                id: playerId,
                socketId: socket.id,
                name: name,
                score: 0,
                color: `#${Math.floor(Math.random() * 16777215).toString(16)}` // Random color
            };
            gameState.teams.push(newTeam);
            console.log(`Team joined: ${name} (${playerId})`);
        }
        saveGameState(gameState);
        io.emit('gameStateUpdate', gameState);
    });
    socket.on('quizAdminAction', (action) => {
        quizManager.handleAdminAction(action);
    });
    socket.on('quizAnswer', (optionIndex) => {
        const team = gameState.teams.find(t => t.socketId === socket.id);
        if (team) {
            quizManager.handleAnswer(team.id, optionIndex);
        }
    });
    socket.on('quizLock', () => {
        const team = gameState.teams.find(t => t.socketId === socket.id);
        if (team) {
            quizManager.handleLock(team.id);
        }
    });
    socket.on('playerReaction', (reactionType) => {
        const team = gameState.teams.find(t => t.socketId === socket.id);
        if (team) {
            io.emit('reactionTriggered', {
                type: reactionType,
                teamId: team.id,
                teamName: team.name,
                teamColor: team.color
            });
        }
    });
    socket.on('triggerAnimation', (type) => {
        io.emit('triggerAnimation', type);
    });
    socket.on('toggleLeaderboard', (show) => {
        gameState.showLeaderboard = show;
        saveGameState(gameState);
        io.emit('gameStateUpdate', gameState);
    });
    socket.on('sendChatMessage', (text) => {
        const team = gameState.teams.find(t => t.socketId === socket.id);
        if (team) {
            const message = {
                id: Math.random().toString(36).substring(7),
                teamId: team.id,
                teamName: team.name,
                text,
                timestamp: Date.now(),
                teamColor: team.color
            };
            io.emit('chatMessage', message);
        }
    });
    socket.on('adminPlayMedia', (payload) => {
        io.emit('playMedia', payload);
    });
    socket.on('adminUpdateScore', ({ teamId, delta }) => {
        const team = gameState.teams.find(t => t.id === teamId);
        if (team) {
            team.score += delta;
            saveGameState(gameState);
            io.emit('gameStateUpdate', gameState);
        }
    });
    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        const team = gameState.teams.find(t => t.socketId === socket.id);
        if (team) {
            // Set a timeout to remove the team after a grace period
            const timeout = setTimeout(() => {
                const currentTeamIndex = gameState.teams.findIndex(t => t.id === team.id);
                if (currentTeamIndex !== -1) {
                    const removedTeam = gameState.teams[currentTeamIndex];
                    gameState.teams.splice(currentTeamIndex, 1);
                    saveGameState(gameState);
                    io.emit('gameStateUpdate', gameState);
                    console.log(`Team removed after timeout: ${removedTeam.name}`);
                }
                disconnectTimeouts.delete(team.id);
            }, 10000); // 10 seconds grace period
            disconnectTimeouts.set(team.id, timeout);
        }
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
