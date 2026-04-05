# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A real-time multiplayer game show app for a 30th birthday party. Three client roles (Host, Player, Display) connect via Socket.io to a Node/Express server. The only game mode currently implemented is a timed quiz.

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
```

No test suite exists yet.

## Architecture

**Monorepo with two packages** — `client/` (Vite + React 19) and `server/` (Express + Socket.io). Root `package.json` uses `concurrently` to run both.

**Real-time state flow:** The server holds a single `GameState` object in memory. Every mutation broadcasts the full state to all clients via `io.emit('gameStateUpdate', state)`. State is persisted to Firestore with a debounced write (1s). On startup, state is loaded from Firestore if available.

**Three client views** at distinct routes:
- `/host` — Admin dashboard (auth-gated via Firebase Google sign-in). Controls quiz flow, scores, media, leaderboard.
- `/player` — Team join + quiz answering + reactions + chat.
- `/display` — Big-screen presentation view (leaderboard, quiz display, animations, chat feed).

**Socket context:** `client/src/context/SocketContext.tsx` provides a single socket instance to the entire React tree. Server URL comes from `VITE_SERVER_URL` env var (defaults to `localhost:3000`).

**Quiz game module:** `server/games/quiz.ts` — `QuizManager` class owns quiz lifecycle (setup → question → reveal → end). Questions are stored in Firestore (`quiz_questions` collection), seeded with samples on first access. Timer runs server-side at 1s intervals.

**Types are duplicated** between `server/types.ts` and `client/src/types.ts`. The server version includes `socketId` on the `Team` interface (internal); the client version omits it. Keep them in sync when modifying shared interfaces.

**Firebase setup:**
- Server uses `firebase-admin` with Application Default Credentials (or emulator mode via `FIRESTORE_EMULATOR_HOST` env var).
- Client uses Firebase JS SDK with config from `VITE_FIREBASE_*` env vars. Emulator connection toggled by `VITE_USE_EMULATORS=true`.

**UI:** Tailwind CSS + shadcn/ui components in `client/src/components/ui/`. Uses Framer Motion for animations and `canvas-confetti`.
