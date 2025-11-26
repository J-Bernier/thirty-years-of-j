import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents, GameState } from './types';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

import { QuizManager } from './games/quiz';
import { db } from './firebase';

const GAME_STATE_DOC_ID = 'current_game_state';
const GAME_STATE_COLLECTION = 'game_states';

let gameState: GameState = {
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
    answers: {}
  }
};

// Debounce save function to prevent excessive writes
let saveTimeout: NodeJS.Timeout | null = null;
let saveEnabled = true;

const saveGameState = (state: GameState) => {
  if (!saveEnabled) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    try {
      await db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).set(state);
      console.log('Game state saved to Firestore');
    } catch (error) {
      console.error('Error saving game state (disabling persistence):', error);
      saveEnabled = false; // Disable future saves to prevent log spam/crashes
    }
  }, 1000); // Save at most once per second
};

// Load initial state
const loadGameState = async () => {
  try {
    const doc = await db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).get();
    if (doc.exists) {
      const data = doc.data() as GameState;
      // Merge with default state to ensure structure is valid
      gameState = { ...gameState, ...data };
      console.log('Game state loaded from Firestore');
    } else {
      console.log('No existing game state found, using default');
    }
  } catch (error) {
    console.error('Error loading game state (using default):', error);
    saveEnabled = false; // Disable saving if loading failed (likely auth issue)
  }
};

// Load state immediately
loadGameState();


const quizManager = new QuizManager(
  io,
  () => gameState,
  (newState) => { 
    gameState = newState;
    saveGameState(gameState);
  }
);

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);
  
  // Send initial state
  socket.emit('gameStateUpdate', gameState);

  // Map to track disconnection timeouts
  const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

  socket.on('joinTeam', ({ name, playerId }: { name: string, playerId: string }) => {
    // Check if team already exists (reconnection)
    const existingTeam = gameState.teams.find(t => t.id === playerId);

    if (existingTeam) {
      // Reconnect
      existingTeam.socketId = socket.id;
      existingTeam.name = name; // Update name just in case
      
      // Clear any pending disconnect timeout
      if (disconnectTimeouts.has(playerId)) {
        clearTimeout(disconnectTimeouts.get(playerId)!);
        disconnectTimeouts.delete(playerId);
      }
      
      console.log(`Team reconnected: ${name} (${playerId})`);
    } else {
      // New Team
      const newTeam = {
        id: playerId,
        socketId: socket.id,
        name: name,
        score: 0,
        color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
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
