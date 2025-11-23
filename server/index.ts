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

let gameState: GameState = {
  phase: 'LOBBY',
  teams: [],
  activeRound: null,
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

const quizManager = new QuizManager(
  io,
  () => gameState,
  (newState) => { gameState = newState; }
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
