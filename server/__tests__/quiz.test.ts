import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuizManager, QuizCallbacks } from '../games/quiz';
import type { GameState } from '../../shared/types';
import { DEFAULT_TIME_PER_QUESTION } from '../../shared/constants';

// Mock firebase before importing QuizManager
vi.mock('../firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [
          { id: 'q1', data: () => ({ text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 }) },
          { id: 'q2', data: () => ({ text: 'Q2?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 1 }) },
          { id: 'q3', data: () => ({ text: 'Q3?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 2 }) },
        ],
      }),
      doc: vi.fn(() => ({ set: vi.fn(), delete: vi.fn() })),
      add: vi.fn().mockResolvedValue({ id: 'new-q' }),
    })),
  },
}));

function createGameState(): GameState {
  return {
    phase: 'LOBBY',
    teams: [
      { id: 'team1', name: 'Team A', score: 0, color: '#e94560' },
      { id: 'team2', name: 'Team B', score: 0, color: '#00a8e8' },
    ],
    activeRound: null,
    history: [],
    showLeaderboard: false,
    stage: {
      mood: 'neutral',
      overlay: { type: null },
      audio: { cue: null, music: null },
    },
    quiz: {
      isActive: false,
      config: { timePerQuestion: DEFAULT_TIME_PER_QUESTION, totalQuestions: 0 },
      currentQuestion: null,
      currentQuestionIndex: -1,
      timer: 0,
      phase: 'IDLE',
      answers: {},
      gameScores: {},
    },
  };
}

function createQuizManager() {
  let state = createGameState();
  const broadcasts: GameState[] = [];
  const events: { event: string; payload?: unknown }[] = [];

  const callbacks: QuizCallbacks = {
    getGameState: () => state,
    setGameState: (s) => { state = s; },
    broadcastState: () => { broadcasts.push({ ...state }); },
    broadcastEvent: (event, payload) => { events.push({ event, payload }); },
  };

  const manager = new QuizManager(callbacks);
  return { manager, getState: () => state, broadcasts, events };
}

describe('QuizManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Lifecycle', () => {
    it('setup loads questions and sets phase to IDLE', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });

      const state = getState();
      expect(state.phase).toBe('GAME');
      expect(state.activeRound).toBe('QUIZ');
      expect(state.quiz.isActive).toBe(true);
      expect(state.quiz.phase).toBe('IDLE');
      expect(state.quiz.config.totalQuestions).toBe(3);
      expect(state.quiz.gameScores['team1']).toBe(0);
      expect(state.quiz.gameScores['team2']).toBe(0);
    });

    it('start triggers first question with timer', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 20, totalQuestions: 2 } });

      const state = getState();
      expect(state.quiz.phase).toBe('QUESTION');
      expect(state.quiz.currentQuestionIndex).toBe(0);
      expect(state.quiz.currentQuestion?.text).toBe('Q1?');
      expect(state.quiz.timer).toBe(20);
      expect(state.quiz.config.totalQuestions).toBe(2);
    });

    it('start with invalid payload uses defaults', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 'bad', totalQuestions: -1 } as any });

      const state = getState();
      expect(state.quiz.phase).toBe('QUESTION');
      expect(state.quiz.timer).toBe(DEFAULT_TIME_PER_QUESTION);
      expect(state.quiz.config.totalQuestions).toBe(3); // falls back to questions.length
    });

    it('next question advances index and resets answers', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 10, totalQuestions: 3 } });

      // Answer Q1
      manager.handleAnswer('team1', 0);
      expect(Object.keys(getState().quiz.answers)).toHaveLength(1);

      // Reveal then next
      await manager.handleAdminAction({ type: 'REVEAL' });
      await manager.handleAdminAction({ type: 'NEXT' });

      const state = getState();
      expect(state.quiz.currentQuestionIndex).toBe(1);
      expect(state.quiz.currentQuestion?.text).toBe('Q2?');
      expect(Object.keys(state.quiz.answers)).toHaveLength(0); // reset
      expect(state.quiz.timer).toBe(10);
    });

    it('last question calls skipToEnd, preserves scores', async () => {
      const { manager, getState, events } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 10, totalQuestions: 1 } });

      // Answer correctly and reveal
      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');
      await manager.handleAdminAction({ type: 'REVEAL' });
      expect(getState().quiz.gameScores['team1']).toBe(10);

      // Next should trigger skipToEnd since totalQuestions=1
      await manager.handleAdminAction({ type: 'NEXT' });

      const state = getState();
      expect(state.quiz.phase).toBe('END');
      expect(state.teams[0].score).toBe(10); // merged to global
      expect(state.history).toHaveLength(1);
      expect(events.some(e => e.event === 'triggerAnimation')).toBe(true);
    });

    it('cancel resets to LOBBY', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 10, totalQuestions: 3 } });
      await manager.handleAdminAction({ type: 'CANCEL' });

      const state = getState();
      expect(state.phase).toBe('LOBBY');
      expect(state.activeRound).toBeNull();
      expect(state.quiz.isActive).toBe(false);
    });
  });

  describe('Scoring', () => {
    it('correct answer gets +10 on reveal', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 3 } });

      // Q1 correct answer is index 0
      manager.handleAnswer('team1', 0); // correct
      manager.handleAnswer('team2', 1); // wrong
      manager.handleLock('team1');
      manager.handleLock('team2');

      await manager.handleAdminAction({ type: 'REVEAL' });

      const state = getState();
      expect(state.quiz.gameScores['team1']).toBe(10);
      expect(state.quiz.gameScores['team2']).toBe(0);
    });

    it('skipToEnd merges game scores to global and creates history', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 3 } });

      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');
      await manager.handleAdminAction({ type: 'REVEAL' });
      await manager.handleAdminAction({ type: 'SKIP_TO_END' });

      const state = getState();
      expect(state.teams[0].score).toBe(10); // team1 global score
      expect(state.teams[1].score).toBe(0);  // team2 global score
      expect(state.history).toHaveLength(1);
      expect(state.history[0].gameType).toBe('Life Quiz');
      expect(state.history[0].scores).toHaveLength(2);
    });
  });

  describe('Timer', () => {
    it('counts down 1 per second', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 5, totalQuestions: 1 } });

      expect(getState().quiz.timer).toBe(5);
      vi.advanceTimersByTime(1000);
      expect(getState().quiz.timer).toBe(4);
      vi.advanceTimersByTime(2000);
      expect(getState().quiz.timer).toBe(2);
    });

    it('auto-locks all answers when timer hits 0', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 3, totalQuestions: 1 } });

      manager.handleAnswer('team1', 0); // answered but not locked

      vi.advanceTimersByTime(4000); // past 0

      expect(getState().quiz.answers['team1'].locked).toBe(true);
    });

    it('stops early when all teams lock', async () => {
      const { manager, getState, broadcasts } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      const broadcastCountBefore = broadcasts.length;

      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');
      manager.handleAnswer('team2', 1);
      manager.handleLock('team2');

      // Timer should have stopped — no more broadcasts from ticks
      const broadcastCountAfterLock = broadcasts.length;
      vi.advanceTimersByTime(5000);
      expect(broadcasts.length).toBe(broadcastCountAfterLock); // no new broadcasts
    });

    it('stops on reveal', async () => {
      const { manager, getState, broadcasts } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      await manager.handleAdminAction({ type: 'REVEAL' });
      const countAfterReveal = broadcasts.length;

      vi.advanceTimersByTime(5000);
      expect(broadcasts.length).toBe(countAfterReveal);
    });
  });

  describe('Answer handling', () => {
    it('accepts answer during QUESTION phase', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      manager.handleAnswer('team1', 2);
      expect(getState().quiz.answers['team1']).toBeDefined();
      expect(getState().quiz.answers['team1'].optionIndex).toBe(2);
      expect(getState().quiz.answers['team1'].locked).toBe(false);
    });

    it('rejects answer after lock', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');
      manager.handleAnswer('team1', 1); // try to change

      expect(getState().quiz.answers['team1'].optionIndex).toBe(0); // unchanged
    });

    it('rejects answer during REVEAL phase', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });
      await manager.handleAdminAction({ type: 'REVEAL' });

      manager.handleAnswer('team1', 0);
      expect(getState().quiz.answers['team1']).toBeUndefined();
    });

    it('rejects answer during IDLE phase', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });

      manager.handleAnswer('team1', 0);
      expect(getState().quiz.answers['team1']).toBeUndefined();
    });

    it('lock with no prior answer does not crash', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      // Lock without answering first
      expect(() => manager.handleLock('team1')).not.toThrow();
      expect(getState().quiz.answers['team1']).toBeUndefined();
    });

    it('lock records timer value as timestamp', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      vi.advanceTimersByTime(5000); // timer at 25

      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');

      expect(getState().quiz.answers['team1'].timestamp).toBe(25);
    });
  });

  describe('Edge cases', () => {
    it('reveal is idempotent (double reveal does not double score)', async () => {
      const { manager, getState } = createQuizManager();
      await manager.handleAdminAction({ type: 'SETUP' });
      await manager.handleAdminAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 1 } });

      manager.handleAnswer('team1', 0);
      manager.handleLock('team1');

      await manager.handleAdminAction({ type: 'REVEAL' });
      await manager.handleAdminAction({ type: 'REVEAL' }); // second reveal

      expect(getState().quiz.gameScores['team1']).toBe(10); // not 20
    });
  });
});
