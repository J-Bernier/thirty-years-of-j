# Thirty Years of J

A real-time game show application for a 30th birthday celebration.

## Tech Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express, Socket.io, TypeScript

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm

### Installation

1. Install dependencies for root, server, and client:
   ```bash
   npm run install:all
   ```

### Running Locally

To start both the server and client concurrently:

```bash
npm run dev
```

- **Client**: [http://localhost:5173](http://localhost:5173)
- **Server**: [http://localhost:3000](http://localhost:3000)

## Testing the Game

1. Open the **Host Dashboard** in one browser tab: [http://localhost:5173/host](http://localhost:5173/host)
2. Open the **Display View** in a second tab/window (simulate the TV): [http://localhost:5173/display](http://localhost:5173/display)
3. Open the **Player View** in a third tab (or on your phone on the same network): [http://localhost:5173/player](http://localhost:5173/player)
   - Enter a team name and join.
   - You should see the team appear on the Host and Display views immediately.
