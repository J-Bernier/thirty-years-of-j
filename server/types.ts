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

export interface GameHistoryEntry {
  id: string;
  gameType: string;
  timestamp: number;
  scores: { teamId: string; teamName: string; score: number }[];
}

export interface GameState {
  phase: GamePhase;
  teams: Team[];
  activeRound: string | null;
  quiz: QuizState;
  history: GameHistoryEntry[];
  showLeaderboard: boolean; // Global leaderboard toggle
}

export interface ChatMessage {
  id: string;
  teamId: string;
  teamName: string;
  text: string;
  timestamp: number;
  teamColor: string;
}

export interface ServerToClientEvents {
  gameStateUpdate: (state: GameState) => void;
  reactionTriggered: (payload: { type: string; teamId: string; teamName: string; teamColor: string }) => void;
  triggerAnimation: (type: string) => void;
  chatMessage: (message: ChatMessage) => void;
}

export interface ClientToServerEvents {
  joinTeam: (teamName: string) => void;
  adminAction: (action: any) => void;
  quizAnswer: (optionIndex: number) => void;
  quizLock: () => void;
  quizAdminAction: (action: { type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: any }) => void;
  playerReaction: (reactionType: string) => void;
  triggerAnimation: (type: string) => void;
  toggleLeaderboard: (show: boolean) => void;
  sendChatMessage: (text: string) => void;
}
