import type { Round, RoundConfig, RoundState, RoundAction } from '../../shared/rounds';
import type { GameState } from '../../shared/types';

export interface LeaderboardRoundState extends RoundState {
  type: 'leaderboard';
  elapsed: number;
  duration?: number;
}

export class LeaderboardRound implements Round {
  private elapsed = 0;
  private duration?: number;
  private dismissed = false;
  private callbacks: { getGameState: () => GameState; setGameState: (s: GameState) => void };

  constructor(callbacks: { getGameState: () => GameState; setGameState: (s: GameState) => void }) {
    this.callbacks = callbacks;
  }

  async setup(config: RoundConfig): Promise<void> {
    const cfg = config as { duration?: number };
    this.duration = cfg.duration;
    this.elapsed = 0;
    this.dismissed = false;
    // Set showLeaderboard boolean so Display view shows leaderboard
    const state = this.callbacks.getGameState();
    state.showLeaderboard = true;
    this.callbacks.setGameState(state);
  }

  tick(): void {
    this.elapsed++;
    if (this.duration && this.elapsed >= this.duration) {
      this.dismissed = true;
    }
  }

  handleAction(action: RoundAction): void {
    if (action.type === 'DISMISS') {
      this.dismissed = true;
    }
  }

  getState(): LeaderboardRoundState {
    return {
      type: 'leaderboard',
      phase: this.dismissed ? 'DONE' : 'SHOWING',
      isComplete: this.dismissed,
      elapsed: this.elapsed,
      duration: this.duration,
    };
  }

  cleanup(): void {
    // Clear showLeaderboard boolean
    const state = this.callbacks.getGameState();
    state.showLeaderboard = false;
    this.callbacks.setGameState(state);
    this.elapsed = 0;
    this.dismissed = false;
  }

  isComplete(): boolean {
    return this.dismissed;
  }
}
