import { QuizQuestion } from '../types';
import type { GameState } from '../../shared/types';
import { DEFAULT_TIME_PER_QUESTION } from '../../shared/constants';
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

export interface QuizCallbacks {
  getGameState: () => GameState;
  setGameState: (state: GameState) => void;
  broadcastState: (state: GameState) => void;
  broadcastEvent: (event: string, payload?: unknown) => void;
}

export class QuizManager {
  private callbacks: QuizCallbacks;
  private timerInterval: NodeJS.Timeout | null = null;
  private currentQuestions: QuizQuestion[] = [];

  constructor(callbacks: QuizCallbacks) {
    this.callbacks = callbacks;
  }

  private get state(): GameState {
    return this.callbacks.getGameState();
  }

  private commitState(state: GameState) {
    this.callbacks.setGameState(state);
    this.callbacks.broadcastState(state);
  }

  public async getQuestions(): Promise<QuizQuestion[]> {
    try {
      const snapshot = await db.collection(QUESTIONS_COLLECTION).get();
      if (snapshot.empty) {
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

  public async handleAdminAction(action: { type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: Record<string, unknown> }) {
    switch (action.type) {
      case 'SETUP':
        await this.setupQuiz();
        break;
      case 'START':
        this.startQuiz(action.payload as { timePerQuestion: number; totalQuestions: number });
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
    const state = this.state;
    if (state.quiz.phase !== 'QUESTION') return;
    if (state.quiz.answers[teamId]?.locked) return;

    state.quiz.answers[teamId] = {
      optionIndex,
      locked: false,
      timestamp: Date.now()
    };

    this.commitState(state);
  }

  public handleLock(teamId: string) {
    const state = this.state;
    if (state.quiz.phase !== 'QUESTION') return;

    if (state.quiz.answers[teamId]) {
      state.quiz.answers[teamId].locked = true;
      state.quiz.answers[teamId].timestamp = state.quiz.timer; // Higher = faster (timer counts down)

      this.commitState(state);

      // Check if all teams locked
      const allLocked = state.teams.length > 0 && state.teams.every(t => state.quiz.answers[t.id]?.locked);
      if (allLocked) {
        this.stopTimer();
      }
    }
  }

  private async setupQuiz() {
    const questions = await this.getQuestions();
    const state = this.state;
    state.phase = 'GAME';
    state.activeRound = 'QUIZ';
    state.quiz = {
      isActive: true,
      config: { timePerQuestion: DEFAULT_TIME_PER_QUESTION, totalQuestions: questions.length },
      currentQuestion: null,
      currentQuestionIndex: -1,
      timer: 0,
      phase: 'IDLE',
      answers: {},
      gameScores: {}
    };
    state.teams.forEach(team => {
      state.quiz.gameScores[team.id] = 0;
    });

    this.currentQuestions = questions;
    this.commitState(state);
  }

  private startQuiz(config: { timePerQuestion: number; totalQuestions: number }) {
    const state = this.state;
    const questions = this.currentQuestions || [];

    const timePerQuestion = typeof config?.timePerQuestion === 'number' && config.timePerQuestion > 0
      ? config.timePerQuestion
      : DEFAULT_TIME_PER_QUESTION;
    const totalQuestions = typeof config?.totalQuestions === 'number' && config.totalQuestions > 0
      ? Math.min(config.totalQuestions, questions.length)
      : questions.length;

    state.quiz.config = { timePerQuestion, totalQuestions };
    this.nextQuestion();
  }

  private nextQuestion() {
    const state = this.state;
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
    state.quiz.answers = {};

    this.commitState(state);
    this.startTimer();
  }

  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const state = this.state;
      if (state.quiz.timer > 0) {
        state.quiz.timer--;
        this.commitState(state);
      } else {
        this.stopTimer();
        let changed = false;
        state.teams.forEach(team => {
          const answer = state.quiz.answers[team.id];
          if (answer && !answer.locked) {
            answer.locked = true;
            changed = true;
          }
        });
        if (changed) {
          this.commitState(state);
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
    const state = this.state;
    if (state.quiz.phase === 'REVEAL') return;

    this.stopTimer();
    state.quiz.phase = 'REVEAL';

    state.teams.forEach(team => {
      const answer = state.quiz.answers[team.id];
      if (answer) {
        answer.locked = true;
      }
    });

    const correctIndex = state.quiz.currentQuestion?.correctOptionIndex;
    if (correctIndex !== undefined) {
      state.teams.forEach(team => {
        const answer = state.quiz.answers[team.id];
        if (answer && answer.locked && answer.optionIndex === correctIndex) {
          if (!state.quiz.gameScores[team.id]) state.quiz.gameScores[team.id] = 0;
          state.quiz.gameScores[team.id] += 10;
        }
      });
    }

    this.commitState(state);
  }

  private skipToEnd() {
    this.stopTimer();
    const state = this.state;

    state.teams.forEach(team => {
      const gameScore = state.quiz.gameScores[team.id] || 0;
      team.score += gameScore;
    });

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
    this.commitState(state);
    this.callbacks.broadcastEvent('triggerAnimation', 'confetti');
  }

  private cancelQuiz() {
    this.stopTimer();
    const state = this.state;

    state.phase = 'LOBBY';
    state.activeRound = null;
    state.quiz.isActive = false;
    this.commitState(state);
  }
}
