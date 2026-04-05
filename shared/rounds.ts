// Round interface: the contract every game segment implements.
// The ShowRunner calls these methods generically — it doesn't know
// whether it's running a quiz, a music round, or a media break.

export interface RoundConfig {
  type: string;
}

export interface RoundState {
  type: string;
  phase: string;
  isComplete: boolean;
}

export interface RoundAction {
  type: string;
  teamId?: string;
  payload?: Record<string, unknown>;
}

export interface Round {
  /** Initialize the round with its config. May be async (e.g., loading questions). */
  setup(config: RoundConfig): Promise<void>;

  /** Called every second by the ShowRunner's timer. Drives countdowns, auto-advances, etc. */
  tick(): void;

  /** Handle a player or host action. The ShowRunner routes actions to the active round. */
  handleAction(action: RoundAction): void;

  /** Return current state for broadcast. Must NOT include sensitive data (e.g., correct answers for players). */
  getState(): RoundState;

  /** Clean up timers, reset state. Called when the round ends or is cancelled. */
  cleanup(): void;

  /** ShowRunner checks this to know when to advance to the next segment. */
  isComplete(): boolean;
}

// Segment definition: what the ShowRunner uses to plan the show.
// A show is an ordered list of these.

export interface QuizSegmentConfig extends RoundConfig {
  type: 'quiz';
  timePerQuestion: number;
  totalQuestions: number;
}

export interface MediaSegmentConfig extends RoundConfig {
  type: 'media';
  src: string;
  title?: string;
  duration?: number; // seconds — auto-advance after this, or wait for host
  autoAdvance: boolean;
}

export interface LeaderboardSegmentConfig extends RoundConfig {
  type: 'leaderboard';
  duration?: number; // auto-advance after this many seconds
}

export type SegmentConfig = QuizSegmentConfig | MediaSegmentConfig | LeaderboardSegmentConfig;
