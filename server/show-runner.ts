import type { Round, RoundAction, SegmentConfig } from '../shared/rounds';
import type { QuizAdminAction } from '../shared/types';
import { QuizManager, QuizCallbacks } from './games/quiz';
import { MediaSegment, MediaRoundState } from './segments/media';
import { LeaderboardRound } from './segments/leaderboard';
import type { GameState } from '../shared/types';

export interface ShowRunnerCallbacks {
  getGameState: () => GameState;
  setGameState: (state: GameState) => void;
  broadcastState: () => void;
  broadcastEvent: (event: string, payload?: unknown) => void;
}

export class ShowRunner {
  private callbacks: ShowRunnerCallbacks;
  private activeRound: Round | null = null;
  private currentConfig: SegmentConfig | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private advancing = false;
  private quizManager: QuizManager;
  private showId: string | null = null;
  private completedAt: number | undefined;

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

  /** Set the show instance ID (called when going live, null to clear). */
  setShowId(showId: string | null): void {
    this.showId = showId;
    this.quizManager.setShowId(showId);
  }

  /** Get the current show instance ID. */
  getShowId(): string | null {
    return this.showId;
  }

  /** Execute a segment on demand. If one is already running, cleanup first. */
  async executeSegment(config: SegmentConfig): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;

    try {
      // Clean up current segment if one is running
      if (this.activeRound) {
        this.activeRound.cleanup();
        this.activeRound = null;
      }
      this.stopTick();

      this.currentConfig = config;
      this.completedAt = undefined;
      this.activeRound = this.createRound(config);

      if (this.activeRound) {
        await this.activeRound.setup(config);
        this.startTick();
      }

      this.callbacks.broadcastState();
    } finally {
      this.advancing = false;
    }
  }

  /** Finish the current segment without starting a new one. Host decides what's next. */
  finishCurrentSegment(): void {
    if (this.activeRound) {
      this.activeRound.cleanup();
      this.activeRound = null;
    }
    this.stopTick();
    this.currentConfig = null;
    this.completedAt = undefined;
    this.callbacks.broadcastState();
  }

  /** Handle an action from host or player, routed to the active round. */
  handleAction(action: RoundAction): void {
    if (!this.activeRound) return;

    // For quiz segments, delegate to QuizManager's richer action handling
    if (this.currentConfig?.type === 'quiz') {
      this.quizManager.handleAdminAction(action as QuizAdminAction);
    } else {
      this.activeRound.handleAction(action);
      this.callbacks.broadcastState();
    }
  }

  /** Handle player-specific actions (answer, lock) for quiz segments. */
  handlePlayerAnswer(teamId: string, optionIndex: number): void {
    // LEGACY: standalone quiz flow
    if (this.currentConfig?.type === 'quiz') {
      this.quizManager.handleAnswer(teamId, optionIndex);
    }
  }

  handlePlayerLock(teamId: string): void {
    // LEGACY: standalone quiz flow
    if (this.currentConfig?.type === 'quiz') {
      this.quizManager.handleLock(teamId);
    }
  }

  /** Get the current show state for broadcasting to clients. */
  getShowState(): GameState['show'] {
    const config = this.currentConfig;
    const roundState = this.activeRound?.getState();
    const mediaState = roundState?.type === 'media' ? roundState as MediaRoundState : undefined;

    return {
      instanceId: this.showId ?? '',
      instanceName: '', // filled by server/index.ts before broadcast
      isLive: this.showId !== null,
      currentSegmentType: config?.type ?? null,
      currentSegmentTitle: config && 'title' in config ? (config as { title?: string }).title : undefined,
      completedAt: this.completedAt,
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
    this.currentConfig = null;
    this.completedAt = undefined;
    this.showId = null;

    const state = this.callbacks.getGameState();
    state.phase = 'LOBBY';
    state.activeRound = null;
    state.quiz.isActive = false;
    this.callbacks.setGameState(state);
    this.callbacks.broadcastState();
  }

  isActive(): boolean {
    return this.activeRound !== null;
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
        return new LeaderboardRound({
          getGameState: this.callbacks.getGameState,
          setGameState: this.callbacks.setGameState,
        });
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
    let wasComplete = false;

    this.tickInterval = setInterval(() => {
      if (!this.activeRound) return;

      this.activeRound.tick();

      if (!wasComplete && this.activeRound.isComplete()) {
        // Segment just completed — record timestamp, broadcast, stop tick.
        // Do NOT auto-advance. The host decides what's next.
        wasComplete = true;
        this.completedAt = Date.now();
        this.callbacks.broadcastState();
        this.stopTick();
      } else if (this.currentConfig?.type !== 'quiz') {
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
