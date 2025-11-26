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
const saveGameState = (state: GameState) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).set(state);
      console.log('Game state saved to Firestore');
    } catch (error) {
      console.error('Error saving game state:', error);
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
    console.error('Error loading game state:', error);
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

  socket.on('joinTeam', (teamName: string) => {
    const newTeam = {
      id: socket.id,
      name: teamName,
      score: 0,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
    };
    gameState.teams.push(newTeam);
    saveGameState(gameState);
    io.emit('gameStateUpdate', gameState);
    console.log(`Team joined: ${teamName}`);
  });

  socket.on('quizAdminAction', (action) => {
    quizManager.handleAdminAction(action);
  });

  socket.on('quizAnswer', (optionIndex) => {
    quizManager.handleAnswer(socket.id, optionIndex);
  });

  socket.on('quizLock', () => {
    quizManager.handleLock(socket.id);
  });

  socket.on('playerReaction', (reactionType) => {
    const team = gameState.teams.find(t => t.id === socket.id);
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
    const team = gameState.teams.find(t => t.id === socket.id);
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

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    // Optional: Remove team on disconnect? Or keep them for reconnection?
    // For now, let's keep them but maybe mark as disconnected later.
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
