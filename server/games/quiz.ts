import { Server } from 'socket.io';
import { GameState, QuizQuestion, ServerToClientEvents, ClientToServerEvents } from '../types';

// Sample questions for testing
const SAMPLE_QUESTIONS: QuizQuestion[] = [
  {
    id: '1',
    text: 'What year was J born?',
    options: ['1990', '1995', '1985', '2000'],
    correctOptionIndex: 1
  },
  {
    id: '2',
    text: 'What is J\'s favorite color?',
    options: ['Blue', 'Red', 'Green', 'Yellow'],
    correctOptionIndex: 0
  },
  {
    id: '3',
    text: 'Where did J go to college?',
    options: ['Harvard', 'MIT', 'Stanford', 'Local University'],
    correctOptionIndex: 3
  }
];

export class QuizManager {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private getGameState: () => GameState;
  private setGameState: (state: GameState) => void;
  private timerInterval: NodeJS.Timeout | null = null;

  constructor(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    getGameState: () => GameState,
    setGameState: (state: GameState) => void
  ) {
    this.io = io;
    this.getGameState = getGameState;
    this.setGameState = setGameState;
  }

  public handleAdminAction(action: { type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: any }) {
    const state = this.getGameState();

    switch (action.type) {
      case 'SETUP':
        this.setupQuiz();
        break;
      case 'START':
        this.startQuiz(action.payload);
        break;
      case 'NEXT':
        this.nextQuestion();
        break;
      case 'REVEAL':
        this.revealAnswer();
        break;
      case 'SKIP_TO_END':
        this.skipToEnd();
        break;
      case 'CANCEL':
        this.cancelQuiz();
        break;
    }
  }

  public handleAnswer(teamId: string, optionIndex: number) {
    const state = this.getGameState();
    if (state.quiz.phase !== 'QUESTION') return;
    
    // Don't allow changing if locked (though UI should prevent this, server must enforce)
    if (state.quiz.answers[teamId]?.locked) return;

    state.quiz.answers[teamId] = {
      optionIndex,
      locked: false,
      timestamp: Date.now()
    };
    
    this.setGameState(state);
    // We don't broadcast every selection to everyone to avoid cheating/influence, 
    // but we might want to send a "someone answered" event or just update the host.
    // For now, full state update is simplest but reveals too much? 
    // Actually, the client types show everything. We should probably mask answers for players.
    // But for MVP, let's just broadcast.
    this.io.emit('gameStateUpdate', state);
  }

  public handleLock(teamId: string) {
    const state = this.getGameState();
    if (state.quiz.phase !== 'QUESTION') return;
    
    if (state.quiz.answers[teamId]) {
      state.quiz.answers[teamId].locked = true;
      state.quiz.answers[teamId].timestamp = state.quiz.timer; // Record time remaining as score tiebreaker? Or elapsed?
      // Let's use current timer value (higher is better/faster if counting down? No, lower is better if elapsed. 
      // But our timer counts down. So higher timer value = faster answer.)
      
      this.setGameState(state);
      this.io.emit('gameStateUpdate', state);
      
      // Check if all teams locked
      const allLocked = state.teams.length > 0 && state.teams.every(t => state.quiz.answers[t.id]?.locked);
      if (allLocked) {
        this.stopTimer();
      }
    }
  }

  private setupQuiz() {
    const state = this.getGameState();
    state.phase = 'GAME';
    state.activeRound = 'QUIZ';
    state.quiz = {
      isActive: true,
      config: { timePerQuestion: 30, totalQuestions: SAMPLE_QUESTIONS.length },
      currentQuestion: null,
      currentQuestionIndex: -1,
      timer: 0,
      phase: 'IDLE',
      answers: {}
    };
    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }

  private startQuiz(config: { timePerQuestion: number, totalQuestions: number }) {
    const state = this.getGameState();
    if (config) {
      state.quiz.config = config;
    }
    // Start the first question immediately
    this.nextQuestion();
  }

  private nextQuestion() {
    const state = this.getGameState();
    const nextIndex = state.quiz.currentQuestionIndex + 1;
    
    if (nextIndex >= SAMPLE_QUESTIONS.length) {
      // End of quiz
      this.cancelQuiz(); // Or separate END phase
      return;
    }

    state.quiz.currentQuestionIndex = nextIndex;
    state.quiz.currentQuestion = SAMPLE_QUESTIONS[nextIndex];
    state.quiz.phase = 'QUESTION';
    state.quiz.timer = state.quiz.config.timePerQuestion;
    state.quiz.answers = {}; // Reset answers
    
    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);

    this.startTimer();
  }

  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      const state = this.getGameState();
      if (state.quiz.timer > 0) {
        state.quiz.timer--;
        this.setGameState(state);
        this.io.emit('gameStateUpdate', state);
      } else {
        this.stopTimer();
        // Time up! Auto-lock all answers
        let changed = false;
        state.teams.forEach(team => {
          const answer = state.quiz.answers[team.id];
          if (answer && !answer.locked) {
            answer.locked = true;
            changed = true;
          }
        });
        if (changed) {
          this.setGameState(state);
          this.io.emit('gameStateUpdate', state);
        }
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private revealAnswer() {
    this.stopTimer();
    const state = this.getGameState();
    state.quiz.phase = 'REVEAL';
    
    // Calculate scores
    const correctIndex = state.quiz.currentQuestion?.correctOptionIndex;
    if (correctIndex !== undefined) {
      state.teams.forEach(team => {
        const answer = state.quiz.answers[team.id];
        if (answer && answer.locked && answer.optionIndex === correctIndex) {
          team.score += 10; // Base points
          // Bonus for speed could go here
        }
      });
    }

    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }

  private skipToEnd() {
    this.stopTimer();
    const state = this.getGameState();
    state.quiz.phase = 'END';
    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }

  private cancelQuiz() {
    this.stopTimer();
    const state = this.getGameState();
    state.phase = 'LOBBY';
    state.activeRound = null;
    state.quiz.isActive = false;
    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }
}
