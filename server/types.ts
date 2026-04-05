// Re-export all shared types
export * from '../shared/types';

import type { Team } from '../shared/types';

// Server-only extension: Team with socketId for routing messages to specific clients.
// Structurally compatible with Team — can be used anywhere Team is expected.
export interface ServerTeam extends Team {
  socketId: string;
}
