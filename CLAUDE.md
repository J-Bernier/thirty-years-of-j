# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A real-time multiplayer game show app for a 30th birthday party. Three client roles (Host, Player, Display) connect via Socket.io to a Node/Express server. Architecture supports pluggable game modes via a Round interface and ShowRunner.

## Commands

```bash
# Install everything (root + server + client)
npm run install:all

# Run both server and client in dev mode
npm run dev

# Run with Firebase emulators (local auth + firestore)
npm run dev:local

# Client only
cd client && npm run dev        # Vite dev server on :5173
cd client && npm run build      # TypeScript check + Vite build
cd client && npm run lint        # ESLint

# Server only
cd server && npm run dev        # nodemon + ts-node on :3000
cd server && npm run build      # tsc

# Tests (server-side, Vitest)
cd server && npm test           # run once
cd server && npm run test:watch # watch mode
```

## Architecture

**Monorepo with three packages** — `client/` (Vite + React 19), `server/` (Express + Socket.io), and `shared/` (types + constants used by both).

**Shared types:** `shared/types.ts` is the single source of truth for all interfaces. `shared/constants.ts` holds magic numbers (grace period, team colors, validation limits). `shared/rounds.ts` defines the Round interface and segment types. Server re-exports from shared and adds `ServerTeam` (extends Team with socketId). Client re-exports via `@shared` path alias.

**Real-time state flow:** The server holds a `GameState` object in memory. Every mutation broadcasts the full state to all clients via `io.emit('gameStateUpdate', state)`. State is persisted to Firestore with a debounced write (1s). On startup, state is loaded from Firestore if available.

**SocketContext owns gameState.** `client/src/context/SocketContext.tsx` provides socket, connection status, AND gameState to the entire React tree. The `gameStateUpdate` listener is attached before the socket connects, guaranteeing no race conditions. Components read gameState from context, never attach their own listeners.

**Three client views** at distinct routes:
- `/host` — Phase-driven performance monitor (auth-gated via Firebase Google sign-in). Transforms per game phase: lobby, quiz question, quiz reveal, quiz end, media break. Bottom tray: leaderboard toggle, FX, score adjust, emergency controls.
- `/player` — Team join + quiz answering + reactions + chat. Persists playerId in localStorage for reconnection.
- `/display` — Big-screen presentation view with DESIGN.md color system. QR code + join URL in lobby, dramatic quiz animations, bottom-up leaderboard reveal, media break support, disconnect indicator.

**ShowRunner:** `server/show-runner.ts` manages an ordered sequence of segments (quiz, media, leaderboard). Each segment implements the Round interface (`shared/rounds.ts`). ShowRunner exposes advance(), cancelShow(), handleAction() for host control. Backwards compatible with standalone quiz flow.

**QuizManager:** `server/games/quiz.ts` — Decoupled from Socket.io via callbacks. Owns quiz lifecycle (setup → question → reveal → end). Questions stored in Firestore (`quiz_questions` collection), seeded with samples on first access. Timer runs server-side at 1s intervals.

**MediaSegment:** `server/segments/media.ts` — Commercial break implementation. Config: src, title, duration, autoAdvance. Ticks elapsed time, auto-completes or waits for host.

**Firebase setup:**
- Server uses `firebase-admin` with Application Default Credentials (or emulator mode via `FIRESTORE_EMULATOR_HOST` env var).
- Client uses Firebase JS SDK with config from `VITE_FIREBASE_*` env vars. Emulator connection toggled by `VITE_USE_EMULATORS=true`.
- Firestore database in europe-west1, project: years-of-j.

**Deployment:**
- Client: Firebase Hosting → https://years-of-j.web.app
- Server: Cloud Run → https://quiz-server-84099615618.europe-west1.run.app
- Dockerfile at repo root (needs both server/ and shared/ in build context)

**Design system:** `DESIGN.md` defines the visual identity — dark theme color palette, projector-optimized typography, pre-defined team colors, animation timing, display view states, sound cues.

**UI:** Tailwind CSS + shadcn/ui components in `client/src/components/ui/`. Uses Framer Motion for animations, `canvas-confetti`, and `qrcode.react`.

**Tests:** 32 server-side tests (Vitest) covering QuizManager lifecycle/scoring/timer/answers and ShowRunner sequencing/media/re-entrancy.
