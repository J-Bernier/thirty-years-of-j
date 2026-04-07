import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ClientToServerEvents, ServerToClientEvents, GameState, ServerTeam } from './types';
import {
  DISCONNECT_GRACE_PERIOD_MS,
  FIRESTORE_SAVE_DEBOUNCE_MS,
  TEAM_COLORS,
  MAX_TEAM_NAME_LENGTH,
  MAX_CHAT_MESSAGE_LENGTH,
  DEFAULT_TIME_PER_QUESTION,
} from '../shared/constants';

// Server-side game state uses ServerTeam (with socketId) instead of base Team
interface ServerGameState extends Omit<GameState, 'teams'> {
  teams: ServerTeam[];
}

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

import { ShowRunner } from './show-runner';
import { db } from './firebase';

const GAME_STATE_DOC_ID = 'current_game_state';
const GAME_STATE_COLLECTION = 'game_states';

let gameState: ServerGameState = {
  phase: 'LOBBY',
  teams: [] as ServerTeam[],
  activeRound: null,
  history: [],
  showLeaderboard: false,
  quiz: {
    isActive: false,
    config: { timePerQuestion: DEFAULT_TIME_PER_QUESTION, totalQuestions: 0 },
    currentQuestion: null,
    currentQuestionIndex: -1,
    timer: 0,
    phase: 'IDLE',
    answers: {},
    gameScores: {}
  }
};

// Debounce save function to prevent excessive writes
let saveTimeout: NodeJS.Timeout | null = null;
let saveEnabled = true;

const saveGameState = (state: ServerGameState) => {
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
  }, FIRESTORE_SAVE_DEBOUNCE_MS);
};

// Load initial state
const loadGameState = async () => {
  try {
    const doc = await db.collection(GAME_STATE_COLLECTION).doc(GAME_STATE_DOC_ID).get();
    if (doc.exists) {
      const data = doc.data() as ServerGameState;
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


const broadcastGameState = () => {
  // Merge show state into gameState before broadcasting
  gameState.show = showRunner.getShowState();
  io.emit('gameStateUpdate', gameState);
};

const showRunner = new ShowRunner({
  getGameState: () => gameState,
  setGameState: (newState) => {
    gameState = newState as ServerGameState;
    saveGameState(gameState);
  },
  broadcastState: broadcastGameState,
  broadcastEvent: (event, payload) => {
    if (event === 'triggerAnimation') {
      io.emit('triggerAnimation', payload as string);
    }
  },
});

const quizManager = showRunner.getQuizManager();

// Track disconnection timeouts at module scope so all connections share it.
// If scoped per-connection, a reconnecting player's new socket can't clear
// the old socket's timeout, causing the team to be removed despite reconnecting.
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // Send initial state (merge show state so reconnecting clients see current segment)
  gameState.show = showRunner.getShowState();
  socket.emit('gameStateUpdate', gameState);

  socket.on('joinTeam', ({ name, playerId }: { name: string, playerId: string }) => {
    if (!name || !playerId) return;
    const sanitizedName = name.trim().slice(0, MAX_TEAM_NAME_LENGTH);
    if (!sanitizedName) return;

    // Check if team already exists (reconnection)
    const existingTeam = gameState.teams.find(t => t.id === playerId);

    if (existingTeam) {
      // Reconnect
      existingTeam.socketId = socket.id;
      existingTeam.name = sanitizedName;
      
      // Clear any pending disconnect timeout
      if (disconnectTimeouts.has(playerId)) {
        clearTimeout(disconnectTimeouts.get(playerId)!);
        disconnectTimeouts.delete(playerId);
      }
      
      console.log(`Team reconnected: ${name} (${playerId})`);
    } else {
      // New Team
      const newTeam: ServerTeam = {
        id: playerId,
        socketId: socket.id,
        name: sanitizedName,
        score: 0,
        color: TEAM_COLORS[gameState.teams.length % TEAM_COLORS.length],
      };
      gameState.teams.push(newTeam);
      console.log(`Team joined: ${name} (${playerId})`);
    }
    
    saveGameState(gameState);
    io.emit('gameStateUpdate', gameState);
  });

  socket.on('quizAdminAction', (action) => {
    if (showRunner.isActive()) {
      showRunner.handleAction(action);
    } else {
      // Standalone quiz flow (backwards compatible)
      quizManager.handleAdminAction(action);
    }
  });

  socket.on('quizAnswer', (optionIndex) => {
    const team = gameState.teams.find(t => t.socketId === socket.id);
    if (team) {
      if (showRunner.isActive()) {
        showRunner.handlePlayerAnswer(team.id, optionIndex);
      } else {
        quizManager.handleAnswer(team.id, optionIndex);
      }
    }
  });

  socket.on('quizLock', () => {
    const team = gameState.teams.find(t => t.socketId === socket.id);
    if (team) {
      if (showRunner.isActive()) {
        showRunner.handlePlayerLock(team.id);
      } else {
        quizManager.handleLock(team.id);
      }
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
    if (!text || typeof text !== 'string') return;
    const sanitizedText = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!sanitizedText) return;

    const team = gameState.teams.find(t => t.socketId === socket.id);
    if (team) {
      const message = {
        id: Math.random().toString(36).substring(7),
        teamId: team.id,
        teamName: team.name,
        text: sanitizedText,
        timestamp: Date.now(),
        teamColor: team.color
      };
      io.emit('chatMessage', message);
    }
  });

  socket.on('adminPlayMedia', (payload) => {
    io.emit('playMedia', payload);
  });

  // Show management events
  socket.on('showLoadAndStart', async (segments) => {
    showRunner.loadShow(segments);
    await showRunner.advance();
  });

  socket.on('showAdvance', async () => {
    await showRunner.advance();
  });

  socket.on('showCancel', () => {
    showRunner.cancelShow();
  });

  socket.on('adminUpdateScore', ({ teamId, delta }) => {
    if (!teamId || typeof delta !== 'number') return;
    const team = gameState.teams.find(t => t.id === teamId);
    if (team) {
      team.score += delta;
      saveGameState(gameState);
      io.emit('gameStateUpdate', gameState);
    }
  });

  socket.on('adminGetQuestions', async (callback) => {
    const questions = await quizManager.getQuestions();
    callback(questions);
  });

  socket.on('adminAddQuestion', async (question, callback) => {
    const result = await quizManager.addQuestion(question);
    callback(result);
  });

  socket.on('adminDeleteQuestion', async (id, callback) => {
    const success = await quizManager.deleteQuestion(id);
    callback(success);
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
      }, DISCONNECT_GRACE_PERIOD_MS);

      disconnectTimeouts.set(team.id, timeout);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
