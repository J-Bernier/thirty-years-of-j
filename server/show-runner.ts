import type { Round, RoundAction, SegmentConfig } from '../shared/rounds';
import type { QuizAdminAction } from '../shared/types';
import { QuizManager, QuizCallbacks } from './games/quiz';
import { MediaSegment, MediaRoundState } from './segments/media';
import type { GameState } from '../shared/types';

export interface ShowRunnerCallbacks {
  getGameState: () => GameState;
  setGameState: (state: GameState) => void;
  broadcastState: () => void;
  broadcastEvent: (event: string, payload?: unknown) => void;
}

export class ShowRunner {
  private callbacks: ShowRunnerCallbacks;
  private segments: SegmentConfig[] = [];
  private currentIndex = -1;
  private activeRound: Round | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private advancing = false;
  private quizManager: QuizManager;

  constructor(callbacks: ShowRunnerCallbacks) {
    this.callbacks = callbacks;

    // QuizManager gets its own callbacks that route through ShowRunner
    const quizCallbacks: QuizCallbacks = {
      getGameState: callbacks.getGameState,
      setGameState: callbacks.setGameState,
      broadcastState: (state) => callbacks.broadcastState(),
      broadcastEvent: (event, payload) => callbacks.broadcastEvent(event, payload),
    };
    this.quizManager = new QuizManager(quizCallbacks);
  }

  /** Access the QuizManager for question CRUD (used by admin socket handlers) */
  getQuizManager(): QuizManager {
    return this.quizManager;
  }

  /** Load a show definition. Call before start(). */
  loadShow(segments: SegmentConfig[]): void {
    this.segments = segments;
    this.currentIndex = -1;
    this.activeRound = null;
  }

  /** Start the show or advance to the next segment. */
  async advance(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;

    try {
    // Clean up current segment
    if (this.activeRound) {
      this.activeRound.cleanup();
      this.activeRound = null;
    }
    this.stopTick();

    this.currentIndex++;

    if (this.currentIndex >= this.segments.length) {
      // Show is over
      this.endShow();
      return;
    }

    const segmentConfig = this.segments[this.currentIndex];
    this.activeRound = this.createRound(segmentConfig);

    if (this.activeRound) {
      await this.activeRound.setup(segmentConfig);

      // For quiz segments, auto-start after setup
      if (segmentConfig.type === 'quiz') {
        // Quiz setup puts state in IDLE. The host will send START action.
      }

      this.startTick();
    }

    this.callbacks.broadcastState();
    } finally {
      this.advancing = false;
    }
  }

  /** Handle an action from host or player, routed to the active round. */
  handleAction(action: RoundAction): void {
    if (!this.activeRound) return;

    // For quiz segments, delegate to QuizManager's richer action handling
    if (this.segments[this.currentIndex]?.type === 'quiz') {
      this.quizManager.handleAdminAction(action as QuizAdminAction);
    } else {
      this.activeRound.handleAction(action);
      this.callbacks.broadcastState();
    }
  }

  /** Handle player-specific actions (answer, lock) for quiz segments. */
  handlePlayerAnswer(teamId: string, optionIndex: number): void {
    if (this.segments[this.currentIndex]?.type === 'quiz') {
      this.quizManager.handleAnswer(teamId, optionIndex);
    }
  }

  handlePlayerLock(teamId: string): void {
    if (this.segments[this.currentIndex]?.type === 'quiz') {
      this.quizManager.handleLock(teamId);
    }
  }

  /** Get the current show state for broadcasting to clients. */
  getShowState(): GameState['show'] {
    const config = this.currentIndex >= 0 ? this.segments[this.currentIndex] : null;
    const roundState = this.activeRound?.getState();
    const mediaState = roundState?.type === 'media' ? roundState as MediaRoundState : undefined;

    return {
      isActive: this.currentIndex >= 0 && this.currentIndex < this.segments.length,
      currentSegmentIndex: this.currentIndex,
      currentSegmentType: config?.type ?? null,
      currentSegmentTitle: config && 'title' in config ? (config as { title?: string }).title : undefined,
      totalSegments: this.segments.length,
      mediaState: mediaState ? {
        src: mediaState.src,
        title: mediaState.title,
        elapsed: mediaState.elapsed,
        duration: mediaState.duration,
        phase: mediaState.phase,
      } : undefined,
    };
  }

  /** Cancel the show and return to lobby. */
  cancelShow(): void {
    if (this.activeRound) {
      this.activeRound.cleanup();
      this.activeRound = null;
    }
    this.stopTick();
    this.currentIndex = -1;

    const state = this.callbacks.getGameState();
    state.phase = 'LOBBY';
    state.activeRound = null;
    state.quiz.isActive = false;
    this.callbacks.setGameState(state);
    this.callbacks.broadcastState();
  }

  /** Insert a segment after the current one (for live deviation). */
  insertSegment(segment: SegmentConfig): void {
    if (!this.isActive()) return;
    this.segments.splice(this.currentIndex + 1, 0, segment);
    this.callbacks.broadcastState();
  }

  /** Get the remaining segment configs (for host preview). */
  getRemainingSegments(): SegmentConfig[] {
    if (this.currentIndex < 0) return this.segments;
    return this.segments.slice(this.currentIndex + 1);
  }

  isActive(): boolean {
    return this.currentIndex >= 0 && this.currentIndex < this.segments.length;
  }

  private endShow(): void {
    this.stopTick();
    const state = this.callbacks.getGameState();
    state.phase = 'RESULTS';
    state.activeRound = null;
    this.callbacks.setGameState(state);
    this.callbacks.broadcastState();
  }

  private createRound(config: SegmentConfig): Round | null {
    switch (config.type) {
      case 'quiz':
        // QuizManager manages its own state through callbacks.
        // We return a thin adapter so ShowRunner can call tick/isComplete.
        return this.createQuizAdapter();
      case 'media':
        return new MediaSegment();
      case 'leaderboard':
        // Leaderboard is a display-only segment with optional auto-advance.
        // For now, use MediaSegment as a timer-only placeholder.
        return new MediaSegment();
      default:
        return null;
    }
  }

  private createQuizAdapter(): Round {
    const quizManager = this.quizManager;
    const getState = this.callbacks.getGameState;

    return {
      async setup(config) {
        await quizManager.handleAdminAction({ type: 'SETUP' });
      },
      tick() {
        // QuizManager runs its own timer via setInterval.
        // ShowRunner tick checks for completion only.
      },
      handleAction(action) {
        quizManager.handleAdminAction(action as QuizAdminAction);
      },
      getState() {
        const state = getState();
        return {
          type: 'quiz',
          phase: state.quiz.phase,
          isComplete: state.quiz.phase === 'END',
        };
      },
      cleanup() {
        quizManager.handleAdminAction({ type: 'CANCEL' });
      },
      isComplete() {
        const state = getState();
        return state.quiz.phase === 'END';
      },
    };
  }

  private startTick(): void {
    this.stopTick();
    this.tickInterval = setInterval(() => {
      if (!this.activeRound) return;

      this.activeRound.tick();

      if (this.activeRound.isComplete()) {
        // Auto-advance when segment completes
        this.advance();
      } else if (this.segments[this.currentIndex]?.type !== 'quiz') {
        // Non-quiz segments need state broadcast on tick (quiz does its own)
        this.callbacks.broadcastState();
      }
    }, 1000);
  }

  private stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
