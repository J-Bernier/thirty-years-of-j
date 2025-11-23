export interface Team {
  id: string;
  name: string;
  score: number;
  color: string;
}

export type GamePhase = 'LOBBY' | 'GAME' | 'RESULTS';

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
}

export interface QuizAnswer {
  optionIndex: number;
  locked: boolean;
  timestamp: number; // Time remaining when answered (or elapsed time)
}

export interface QuizState {
  isActive: boolean;
  config: {
    timePerQuestion: number;
    totalQuestions: number;
  };
  currentQuestion: QuizQuestion | null;
  currentQuestionIndex: number;
  timer: number;
  phase: 'IDLE' | 'QUESTION' | 'REVEAL' | 'END';
  answers: Record<string, QuizAnswer>; // teamId -> answer
}

export interface GameState {
  phase: GamePhase;
  teams: Team[];
  activeRound: string | null;
  quiz: QuizState;
}

export interface ServerToClientEvents {
  gameStateUpdate: (state: GameState) => void;
}

export interface ClientToServerEvents {
  joinTeam: (teamName: string) => void;
  adminAction: (action: any) => void;
  quizAnswer: (optionIndex: number) => void;
  quizLock: () => void;
  quizAdminAction: (action: { type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL', payload?: any }) => void;
}
