import { Server } from 'socket.io';
import { QuizQuestion, ServerToClientEvents, ClientToServerEvents } from '../types';
import type { GameState } from '../../shared/types';
import { db } from '../firebase';

const QUESTIONS_COLLECTION = 'quiz_questions';

// Sample questions for testing/seeding
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
  private currentQuestions: QuizQuestion[] = [];

  constructor(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    getGameState: () => GameState,
    setGameState: (state: GameState) => void
  ) {
    this.io = io;
    this.getGameState = getGameState;
    this.setGameState = setGameState;
  }

  public async getQuestions(): Promise<QuizQuestion[]> {
    try {
      const snapshot = await db.collection(QUESTIONS_COLLECTION).get();
      if (snapshot.empty) {
        // Seed with sample questions if empty
        console.log('Seeding database with sample questions...');
        const batch = db.batch();
        const seededQuestions: QuizQuestion[] = [];
        
        for (const q of SAMPLE_QUESTIONS) {
          const docRef = db.collection(QUESTIONS_COLLECTION).doc();
          const questionWithId = { ...q, id: docRef.id };
          batch.set(docRef, questionWithId);
          seededQuestions.push(questionWithId);
        }
        
        await batch.commit();
        return seededQuestions;
      }
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizQuestion));
    } catch (error) {
      console.error('Error fetching questions:', error);
      return [];
    }
  }

  public async addQuestion(question: Omit<QuizQuestion, 'id'>): Promise<{ success: boolean; error?: string }> {
    try {
      await db.collection(QUESTIONS_COLLECTION).add(question);
      return { success: true };
    } catch (error) {
      console.error('Error adding question:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  public async deleteQuestion(id: string): Promise<boolean> {
    try {
      await db.collection(QUESTIONS_COLLECTION).doc(id).delete();
      return true;
    } catch (error) {
      console.error('Error deleting question:', error);
      return false;
    }
  }

  public async handleAdminAction(action: { type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: any }) {
    const state = this.getGameState();

    switch (action.type) {
      case 'SETUP':
        await this.setupQuiz();
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
    // TODO: State masking — players currently receive full state including correct answers.
    // Phase 2 (ShowRunner) will add role-based state filtering per client.
    this.io.emit('gameStateUpdate', state);
  }

  public handleLock(teamId: string) {
    const state = this.getGameState();
    if (state.quiz.phase !== 'QUESTION') return;
    
    if (state.quiz.answers[teamId]) {
      state.quiz.answers[teamId].locked = true;
      state.quiz.answers[teamId].timestamp = state.quiz.timer; // Higher = faster (timer counts down)
      
      this.setGameState(state);
      this.io.emit('gameStateUpdate', state);
      
      // Check if all teams locked
      const allLocked = state.teams.length > 0 && state.teams.every(t => state.quiz.answers[t.id]?.locked);
      if (allLocked) {
        this.stopTimer();
      }
    }
  }

  private async setupQuiz() {
    const questions = await this.getQuestions();
    const state = this.getGameState();
    state.phase = 'GAME';
    state.activeRound = 'QUIZ';
    state.quiz = {
      isActive: true,
      config: { timePerQuestion: 30, totalQuestions: questions.length },
      currentQuestion: null,
      currentQuestionIndex: -1,
      timer: 0,
      phase: 'IDLE',
      answers: {},
      gameScores: {}
    };
    // Initialize game scores for all current teams
    state.teams.forEach(team => {
      state.quiz.gameScores[team.id] = 0;
    });

    // Questions stored in private property, not in GameState (avoid leaking answers to clients)
    this.currentQuestions = questions;

    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }

  private startQuiz(config: { timePerQuestion: number, totalQuestions: number }) {
    const state = this.getGameState();
    const questions = this.currentQuestions || [];
    
    if (config) {
      state.quiz.config = {
        ...config,
        totalQuestions: Math.min(config.totalQuestions, questions.length)
      };
    }
    // Start the first question immediately
    this.nextQuestion();
  }

  private nextQuestion() {
    const state = this.getGameState();
    const questions = this.currentQuestions || [];
    const nextIndex = state.quiz.currentQuestionIndex + 1;
    
    if (nextIndex >= questions.length || nextIndex >= state.quiz.config.totalQuestions) {
      this.skipToEnd();
      return;
    }

    state.quiz.currentQuestionIndex = nextIndex;
    state.quiz.currentQuestion = questions[nextIndex];
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
    const state = this.getGameState();
    if (state.quiz.phase === 'REVEAL') return;
    
    this.stopTimer();
    state.quiz.phase = 'REVEAL';
    
    // Ensure all answers are locked before calculating scores
    // This handles the case where host reveals before auto-lock triggers
    state.teams.forEach(team => {
      const answer = state.quiz.answers[team.id];
      if (answer) {
        answer.locked = true;
      }
    });

    // Calculate scores
    const correctIndex = state.quiz.currentQuestion?.correctOptionIndex;
    if (correctIndex !== undefined) {
      state.teams.forEach(team => {
        const answer = state.quiz.answers[team.id];
        if (answer && answer.locked && answer.optionIndex === correctIndex) {
          // Update game score instead of global score
          if (!state.quiz.gameScores[team.id]) state.quiz.gameScores[team.id] = 0;
          state.quiz.gameScores[team.id] += 10;
        }
      });
    }

    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
  }

  private skipToEnd() {
    this.stopTimer();
    const state = this.getGameState();
    
    // Add game scores to global scores
    state.teams.forEach(team => {
      const gameScore = state.quiz.gameScores[team.id] || 0;
      team.score += gameScore;
    });

    // Record history
    if (state.teams.some(t => (state.quiz.gameScores[t.id] || 0) > 0)) {
      state.history.push({
        id: Date.now().toString(),
        gameType: 'Life Quiz',
        timestamp: Date.now(),
        scores: state.teams.map(t => ({ 
          teamId: t.id, 
          teamName: t.name, 
          score: state.quiz.gameScores[t.id] || 0 
        }))
      });
    }

    state.quiz.phase = 'END';
    this.setGameState(state);
    this.io.emit('gameStateUpdate', state);
    this.io.emit('triggerAnimation', 'confetti');
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
