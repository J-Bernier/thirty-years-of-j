import type { Round, RoundConfig, RoundState, RoundAction, MediaSegmentConfig } from '../../shared/rounds';

export interface MediaRoundState extends RoundState {
  type: 'media';
  src: string;
  title?: string;
  elapsed: number;
  duration?: number;
}

export class MediaSegment implements Round {
  private config: MediaSegmentConfig | null = null;
  private elapsed = 0;
  private complete = false;

  async setup(config: RoundConfig): Promise<void> {
    this.config = config as MediaSegmentConfig;
    this.elapsed = 0;
    this.complete = false;
  }

  tick(): void {
    if (!this.config || this.complete) return;
    this.elapsed++;

    if (this.config.autoAdvance && this.config.duration && this.elapsed >= this.config.duration) {
      this.complete = true;
    }
  }

  handleAction(action: RoundAction): void {
    if (action.type === 'SKIP' || action.type === 'ADVANCE') {
      this.complete = true;
    }
  }

  getState(): MediaRoundState {
    return {
      type: 'media',
      phase: this.complete ? 'DONE' : 'PLAYING',
      isComplete: this.complete,
      src: this.config?.src ?? '',
      title: this.config?.title,
      elapsed: this.elapsed,
      duration: this.config?.duration,
    };
  }

  cleanup(): void {
    this.elapsed = 0;
    this.complete = false;
    this.config = null;
  }

  isComplete(): boolean {
    return this.complete;
  }
}
