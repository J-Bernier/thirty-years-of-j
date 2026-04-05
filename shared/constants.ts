// Game show configuration constants
// Shared between server and client

export const DISCONNECT_GRACE_PERIOD_MS = 30_000; // 30s — WiFi drops happen at parties
export const CHAT_HISTORY_MAX = 50;
export const REACTION_DISPLAY_DURATION_MS = 3_000;
export const FIRESTORE_SAVE_DEBOUNCE_MS = 1_000;
export const DEFAULT_TIME_PER_QUESTION = 30;
export const GAME_LAUNCH_DISPLAY_MS = 3_000;

// Pre-defined team colors — vivid, high contrast on dark backgrounds.
// Assigned in join order. Wraps if more than 8 teams.
export const TEAM_COLORS = [
  '#e94560', // hot pink
  '#00a8e8', // electric blue
  '#00c896', // mint
  '#ffb700', // amber
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // magenta
] as const;

// Input validation limits
export const MAX_TEAM_NAME_LENGTH = 20;
export const MAX_CHAT_MESSAGE_LENGTH = 200;
export const QUIZ_OPTIONS_COUNT = 4;
