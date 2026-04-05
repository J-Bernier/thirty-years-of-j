import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShowRunner, ShowRunnerCallbacks } from '../show-runner';
import { MediaSegment } from '../segments/media';
import type { GameState } from '../../shared/types';
import type { SegmentConfig } from '../../shared/rounds';
import { DEFAULT_TIME_PER_QUESTION } from '../../shared/constants';

// Mock firebase (QuizManager imports it)
vi.mock('../firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [
          { id: 'q1', data: () => ({ text: 'Q1?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 }) },
          { id: 'q2', data: () => ({ text: 'Q2?', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 1 }) },
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
    ],
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
      gameScores: {},
    },
  };
}

function createShowRunner() {
  let state = createGameState();
  let broadcastCount = 0;
  const events: { event: string; payload?: unknown }[] = [];

  const callbacks: ShowRunnerCallbacks = {
    getGameState: () => state,
    setGameState: (s) => { state = s as any; },
    broadcastState: () => { broadcastCount++; },
    broadcastEvent: (event, payload) => { events.push({ event, payload }); },
  };

  const runner = new ShowRunner(callbacks);
  return { runner, getState: () => state, getBroadcastCount: () => broadcastCount, events };
}

describe('MediaSegment (unit)', () => {
  it('ticks elapsed and completes at duration', async () => {
    const seg = new MediaSegment();
    await seg.setup({ type: 'media', src: '/v.mp4', duration: 3, autoAdvance: true });

    expect(seg.isComplete()).toBe(false);
    seg.tick(); // elapsed=1
    seg.tick(); // elapsed=2
    expect(seg.isComplete()).toBe(false);
    seg.tick(); // elapsed=3
    expect(seg.isComplete()).toBe(true);
    expect(seg.getState().phase).toBe('DONE');
  });

  it('does not auto-complete when autoAdvance is false', async () => {
    const seg = new MediaSegment();
    await seg.setup({ type: 'media', src: '/v.mp4', duration: 2, autoAdvance: false });

    seg.tick();
    seg.tick();
    seg.tick();
    expect(seg.isComplete()).toBe(false);
  });

  it('completes on SKIP action', async () => {
    const seg = new MediaSegment();
    await seg.setup({ type: 'media', src: '/v.mp4', duration: 30, autoAdvance: false });

    seg.handleAction({ type: 'SKIP' });
    expect(seg.isComplete()).toBe(true);
  });

  it('getState returns correct media info', async () => {
    const seg = new MediaSegment();
    await seg.setup({ type: 'media', src: '/vid.mp4', title: 'Break', duration: 5, autoAdvance: true });

    seg.tick();
    const state = seg.getState();
    expect(state.type).toBe('media');
    expect(state.src).toBe('/vid.mp4');
    expect(state.title).toBe('Break');
    expect(state.elapsed).toBe(1);
    expect(state.duration).toBe(5);
    expect(state.phase).toBe('PLAYING');
  });

  it('cleanup resets state', async () => {
    const seg = new MediaSegment();
    await seg.setup({ type: 'media', src: '/v.mp4', duration: 3, autoAdvance: true });
    seg.tick();
    seg.cleanup();
    expect(seg.getState().src).toBe('');
    expect(seg.getState().elapsed).toBe(0);
    expect(seg.isComplete()).toBe(false);
  });
});

describe('ShowRunner', () => {
  describe('Segment sequencing', () => {
    it('advances through segments', async () => {
      const { runner } = createShowRunner();
      runner.loadShow([
        { type: 'media', src: '/v1.mp4', duration: 5, autoAdvance: false },
        { type: 'media', src: '/v2.mp4', duration: 5, autoAdvance: false },
      ]);

      await runner.advance();
      expect(runner.getShowState()?.currentSegmentIndex).toBe(0);
      expect(runner.getShowState()?.currentSegmentType).toBe('media');

      await runner.advance();
      expect(runner.getShowState()?.currentSegmentIndex).toBe(1);
    });

    it('ends show after last segment', async () => {
      const { runner, getState } = createShowRunner();
      runner.loadShow([
        { type: 'media', src: '/v.mp4', duration: 5, autoAdvance: false },
      ]);

      await runner.advance(); // segment 0
      await runner.advance(); // past end

      expect(runner.isActive()).toBe(false);
      expect(getState().phase).toBe('RESULTS');
    });
  });

  describe('Cancel', () => {
    it('cancelShow resets to LOBBY', async () => {
      const { runner, getState } = createShowRunner();
      runner.loadShow([{ type: 'media', src: '/v.mp4', duration: 10, autoAdvance: false }]);
      await runner.advance();

      runner.cancelShow();

      expect(runner.isActive()).toBe(false);
      expect(getState().phase).toBe('LOBBY');
    });
  });

  describe('Re-entrancy guard', () => {
    it('advance() rejects concurrent calls', async () => {
      const { runner } = createShowRunner();
      runner.loadShow([
        { type: 'media', src: '/v1.mp4', duration: 5, autoAdvance: false },
        { type: 'media', src: '/v2.mp4', duration: 5, autoAdvance: false },
      ]);

      const p1 = runner.advance();
      const p2 = runner.advance(); // should no-op

      await Promise.all([p1, p2]);

      expect(runner.getShowState()?.currentSegmentIndex).toBe(0);
    });
  });

  describe('Media segment via ShowRunner', () => {
    it('getShowState includes mediaState', async () => {
      const { runner } = createShowRunner();
      runner.loadShow([{ type: 'media', src: '/video.mp4', title: 'Commercial', duration: 5, autoAdvance: true }]);
      await runner.advance();

      const showState = runner.getShowState();
      expect(showState?.mediaState).toBeDefined();
      expect(showState?.mediaState?.src).toBe('/video.mp4');
      expect(showState?.mediaState?.title).toBe('Commercial');
      expect(showState?.mediaState?.phase).toBe('PLAYING');
    });

    it('handleAction SKIP marks segment complete', async () => {
      const { runner } = createShowRunner();
      runner.loadShow([
        { type: 'media', src: '/v.mp4', duration: 30, autoAdvance: false },
        { type: 'media', src: '/v2.mp4', duration: 5, autoAdvance: false },
      ]);
      await runner.advance();

      runner.handleAction({ type: 'SKIP' });

      // The segment is marked complete, next tick in the interval would advance.
      // But we can also manually advance.
      expect(runner.getShowState()?.mediaState?.phase).toBe('DONE');
    });
  });

  describe('Quiz segment via ShowRunner', () => {
    it('loads quiz segment and delegates to QuizManager', async () => {
      const { runner, getState } = createShowRunner();
      runner.loadShow([{ type: 'quiz', timePerQuestion: 15, totalQuestions: 2 }]);
      await runner.advance();

      expect(getState().quiz.isActive).toBe(true);
      expect(getState().quiz.phase).toBe('IDLE');
    });

    it('player actions route to QuizManager', async () => {
      const { runner, getState } = createShowRunner();
      runner.loadShow([{ type: 'quiz', timePerQuestion: 30, totalQuestions: 2 }]);
      await runner.advance();

      // Start the quiz via action
      runner.handleAction({ type: 'START', payload: { timePerQuestion: 30, totalQuestions: 2 } });

      expect(getState().quiz.phase).toBe('QUESTION');

      // Player answers
      runner.handlePlayerAnswer('team1', 0);
      expect(getState().quiz.answers['team1']).toBeDefined();

      runner.handlePlayerLock('team1');
      expect(getState().quiz.answers['team1'].locked).toBe(true);
    });
  });
});
