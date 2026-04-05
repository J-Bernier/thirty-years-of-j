// Shared types used by both server and client.
// Server extends some of these (e.g., ServerTeam adds socketId).

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
  timestamp: number; // Server timer value at lock time (higher = faster answer, counts down)
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
  answers: Record<string, QuizAnswer>;
  gameScores: Record<string, number>;
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
  showLeaderboard: boolean;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  teamName: string;
  text: string;
  timestamp: number;
  teamColor: string;
}

export interface MediaPayload {
  type: 'video' | 'audio';
  url: string;
  duration?: number;
}

export type QuizAdminAction = {
  type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END';
  payload?: Record<string, unknown>;
};

export interface ServerToClientEvents {
  gameStateUpdate: (state: GameState) => void;
  reactionTriggered: (payload: { type: string; teamId: string; teamName: string; teamColor: string }) => void;
  triggerAnimation: (type: string) => void;
  chatMessage: (message: ChatMessage) => void;
  playMedia: (payload: MediaPayload) => void;
}

export interface ClientToServerEvents {
  joinTeam: (payload: { name: string; playerId: string }) => void;
  quizAnswer: (optionIndex: number) => void;
  quizLock: () => void;
  quizAdminAction: (action: QuizAdminAction) => void;
  playerReaction: (reactionType: string) => void;
  triggerAnimation: (type: string) => void;
  toggleLeaderboard: (show: boolean) => void;
  sendChatMessage: (text: string) => void;
  adminPlayMedia: (payload: MediaPayload) => void;
  adminUpdateScore: (payload: { teamId: string; delta: number }) => void;
  adminGetQuestions: (callback: (questions: QuizQuestion[]) => void) => void;
  adminAddQuestion: (question: Omit<QuizQuestion, 'id'>, callback: (response: { success: boolean; error?: string }) => void) => void;
  adminDeleteQuestion: (id: string, callback: (success: boolean) => void) => void;
}
