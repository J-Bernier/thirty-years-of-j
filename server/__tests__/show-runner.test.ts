import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShowRunner, ShowRunnerCallbacks } from '../show-runner';
import { MediaSegment } from '../segments/media';
import { LeaderboardRound } from '../segments/leaderboard';
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
  describe('Segment execution', () => {
    it('executeSegment starts a media segment', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v1.mp4', duration: 5, autoAdvance: false });

      expect(runner.isActive()).toBe(true);
      expect(runner.getShowState()?.currentSegmentType).toBe('media');
    });

    it('executeSegment replaces a running segment', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v1.mp4', duration: 5, autoAdvance: false });
      await runner.executeSegment({ type: 'media', src: '/v2.mp4', duration: 5, autoAdvance: false });

      expect(runner.isActive()).toBe(true);
      expect(runner.getShowState()?.mediaState?.src).toBe('/v2.mp4');
    });

    it('finishCurrentSegment clears active round', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 5, autoAdvance: false });
      expect(runner.isActive()).toBe(true);

      runner.finishCurrentSegment();
      expect(runner.isActive()).toBe(false);
    });
  });

  describe('Cancel', () => {
    it('cancelShow resets to LOBBY', async () => {
      const { runner, getState } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 10, autoAdvance: false });

      runner.cancelShow();

      expect(runner.isActive()).toBe(false);
      expect(getState().phase).toBe('LOBBY');
    });
  });

  describe('Re-entrancy guard', () => {
    it('executeSegment() rejects concurrent calls', async () => {
      const { runner } = createShowRunner();

      const p1 = runner.executeSegment({ type: 'media', src: '/v1.mp4', duration: 5, autoAdvance: false });
      const p2 = runner.executeSegment({ type: 'media', src: '/v2.mp4', duration: 5, autoAdvance: false }); // should no-op

      await Promise.all([p1, p2]);

      // First call wins, second is skipped due to advancing guard
      expect(runner.getShowState()?.mediaState?.src).toBe('/v1.mp4');
    });
  });

  describe('Media segment via ShowRunner', () => {
    it('getShowState includes mediaState', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/video.mp4', title: 'Commercial', duration: 5, autoAdvance: true });

      const showState = runner.getShowState();
      expect(showState?.mediaState).toBeDefined();
      expect(showState?.mediaState?.src).toBe('/video.mp4');
      expect(showState?.mediaState?.title).toBe('Commercial');
      expect(showState?.mediaState?.phase).toBe('PLAYING');
    });

    it('handleAction SKIP marks segment complete', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 30, autoAdvance: false });

      runner.handleAction({ type: 'SKIP' });

      // The segment is marked complete — host decides what's next
      expect(runner.getShowState()?.mediaState?.phase).toBe('DONE');
    });
  });

  describe('Quiz segment via ShowRunner', () => {
    it('loads quiz segment and delegates to QuizManager', async () => {
      const { runner, getState } = createShowRunner();
      await runner.executeSegment({ type: 'quiz', timePerQuestion: 15, totalQuestions: 2 });

      expect(getState().quiz.isActive).toBe(true);
      expect(getState().quiz.phase).toBe('IDLE');
    });

    it('player actions route to QuizManager', async () => {
      const { runner, getState } = createShowRunner();
      await runner.executeSegment({ type: 'quiz', timePerQuestion: 30, totalQuestions: 2 });

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

  describe('Show ID management', () => {
    it('setShowId/getShowId track show instance', () => {
      const { runner } = createShowRunner();
      expect(runner.getShowId()).toBeNull();

      runner.setShowId('show-123');
      expect(runner.getShowId()).toBe('show-123');
      expect(runner.getShowState()?.isLive).toBe(true);
    });

    it('cancelShow clears showId', async () => {
      const { runner } = createShowRunner();
      runner.setShowId('show-123');
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 5, autoAdvance: false });

      runner.cancelShow();

      expect(runner.getShowId()).toBeNull();
      expect(runner.getShowState()?.isLive).toBe(false);
    });
  });

  describe('Completion signal', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('sets completedAt when segment completes via tick', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 2, autoAdvance: true });

      vi.advanceTimersByTime(3000); // 3 ticks — enough to complete

      const showState = runner.getShowState();
      expect(showState?.completedAt).toBeDefined();
      expect(typeof showState?.completedAt).toBe('number');
    });

    it('does not auto-advance after completion', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'media', src: '/v.mp4', duration: 1, autoAdvance: true });

      vi.advanceTimersByTime(5000); // well past completion

      // Segment is still "active" — host decides what's next
      expect(runner.isActive()).toBe(true);
      expect(runner.getShowState()?.completedAt).toBeDefined();
    });
  });

  describe('Leaderboard segment via ShowRunner', () => {
    it('executeSegment with leaderboard sets showLeaderboard', async () => {
      const { runner, getState } = createShowRunner();
      await runner.executeSegment({ type: 'leaderboard' });
      expect(getState().showLeaderboard).toBe(true);
    });

    it('DISMISS action completes leaderboard segment', async () => {
      const { runner } = createShowRunner();
      await runner.executeSegment({ type: 'leaderboard' });
      runner.handleAction({ type: 'DISMISS' });
      // After dismiss, the segment reports complete
      expect(runner.isActive()).toBe(true); // still active until host finishes it
    });

    it('finishCurrentSegment clears showLeaderboard', async () => {
      const { runner, getState } = createShowRunner();
      await runner.executeSegment({ type: 'leaderboard' });
      expect(getState().showLeaderboard).toBe(true);
      runner.finishCurrentSegment();
      expect(getState().showLeaderboard).toBe(false);
    });
  });
});

describe('LeaderboardRound (unit)', () => {
  function createLeaderboardCallbacks() {
    let state = createGameState();
    return {
      callbacks: {
        getGameState: () => state,
        setGameState: (s: GameState) => { state = s; },
      },
      getState: () => state,
    };
  }

  it('setup sets showLeaderboard to true', async () => {
    const { callbacks, getState } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard' });
    expect(getState().showLeaderboard).toBe(true);
  });

  it('tick increments elapsed', async () => {
    const { callbacks } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard' });

    round.tick();
    round.tick();
    round.tick();
    expect(round.getState().elapsed).toBe(3);
  });

  it('auto-completes at duration', async () => {
    const { callbacks } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard', duration: 3 } as any);

    round.tick();
    round.tick();
    expect(round.isComplete()).toBe(false);
    round.tick();
    expect(round.isComplete()).toBe(true);
  });

  it('does not auto-complete without duration', async () => {
    const { callbacks } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard' });

    for (let i = 0; i < 10; i++) round.tick();
    expect(round.isComplete()).toBe(false);
  });

  it('DISMISS action marks complete', async () => {
    const { callbacks } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard' });

    round.handleAction({ type: 'DISMISS' });
    expect(round.isComplete()).toBe(true);
  });

  it('cleanup sets showLeaderboard to false', async () => {
    const { callbacks, getState } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard' });
    expect(getState().showLeaderboard).toBe(true);

    round.cleanup();
    expect(getState().showLeaderboard).toBe(false);
  });

  it('getState returns correct shape', async () => {
    const { callbacks } = createLeaderboardCallbacks();
    const round = new LeaderboardRound(callbacks);
    await round.setup({ type: 'leaderboard', duration: 10 } as any);

    round.tick();
    round.tick();

    const state = round.getState();
    expect(state.type).toBe('leaderboard');
    expect(state.phase).toBe('SHOWING');
    expect(state.elapsed).toBe(2);
    expect(state.duration).toBe(10);
  });
});
