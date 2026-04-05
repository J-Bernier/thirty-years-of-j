# DESIGN.md — Thirty Years of J

Visual identity and design system for the game show app. Source of truth for all UI decisions.

## Theme: Game Show Dark

Dark, high-energy, stage-ready. Think HQ Trivia meets late-night TV.

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#0a0a1a` | Display view background |
| `bg-surface` | `#1a1a2e` | Cards, panels, overlays |
| `accent-primary` | `#e94560` | Primary actions, highlights, branding |
| `accent-secondary` | `#00a8e8` | Secondary info, links |
| `success` | `#00c896` | Correct answers, connected status |
| `warning` | `#ffb700` | Timer warnings, medium priority |
| `text-primary` | `#f0f0f0` | Main text on dark backgrounds |
| `text-muted` | `#888888` | Secondary text, labels |
| `text-dim` | `#555555` | Tertiary text, disabled |

### Team Colors

Pre-defined palette, assigned in join order. All tested for readability on dark backgrounds.

| Order | Color | Hex |
|-------|-------|-----|
| 1 | Hot pink | `#e94560` |
| 2 | Electric blue | `#00a8e8` |
| 3 | Mint | `#00c896` |
| 4 | Amber | `#ffb700` |
| 5 | Purple | `#a855f7` |
| 6 | Orange | `#f97316` |
| 7 | Cyan | `#06b6d4` |
| 8 | Magenta | `#ec4899` |

Wraps if > 8 teams. Defined in `shared/constants.ts` as `TEAM_COLORS`.

## Typography (Projector Display)

Optimized for readability at 20-30 feet on a projected 1080p screen.

| Element | Min Size | Weight | Notes |
|---------|----------|--------|-------|
| Show title | 72px+ | 900 (Black) | Gradient text, center screen |
| Timer | 80px+ | 700 (Bold) | Tabular nums, monospace feel |
| Question text | 48px+ | 600 (Semibold) | Center, max 2 lines |
| Answer options | 36px+ | 400 (Normal) | Color-coded by letter |
| Team names | 24px+ | 700 (Bold) | On leaderboard and lobby |
| Score numbers | 36px+ | 700 (Bold) | Tabular nums |
| Status text | 18px+ | 300 (Light) | "Waiting for teams...", etc. |

Font: System font stack (no web fonts needed for a one-time event).

## Animation Timing

| Animation | Duration | Easing | Notes |
|-----------|----------|--------|-------|
| Segment transition | 800ms total | fade-to-black 300ms, hold 200ms, fade-in 300ms | Standard TV cut |
| Option stagger | 100ms/item | ease-out | Options A-D appear one by one |
| Timer pulse (<5s) | 500ms | scale 1.0-1.05 | Red glow, fast tick sound |
| Leaderboard reveal | 500ms/team | ease-out | Bottom-up, 2s pause before #1 |
| Score count-up | 50ms/point | linear | 80 pts = 4 seconds |
| Confetti | 1.5s | — | canvas-confetti, 150 particles |
| Reaction float | 3s | ease-out + fade | Float up from team position |
| Game launch splash | 3s | spring | Full-screen overlay, then fade |

## Display View States

### Lobby
- Show title centered (gradient text)
- QR code (200px+, scannable from back of room) + visible short URL
- Team names appear as they join, grid layout
- Subtle animated background (particles or gradient shift)

### Quiz Question
- Question text dominant center
- Options A/B/C/D in 2x2 grid, color-coded
- Timer bar drains left-to-right, color shifts green-yellow-red
- Timer number large in corner
- Answer dots (green = team answered)

### Answer Reveal
- Correct answer glows green, wrong options fade to 30% opacity
- Stats bar: X/Y correct, avg response time, fastest team
- Confetti burst for majority-correct questions

### Commercial Break
- Fade to black, then "We'll Be Right Back" title card
- Pre-produced content plays (video or image)
- Auto-advance after duration, or host tap

### Leaderboard
- Bottom-up reveal with staggered animation
- Scores count up from 0
- 2-second dramatic pause before #1
- Gold/silver/bronze accent for top 3
- Confetti on winner reveal

### Disconnected
- Freeze last state
- Thin pulsing red border (subtle)
- Small "Reconnecting..." badge in corner
- No full-screen overlay (host can vamp)

## Sound Cues

| Event | Sound | Timing |
|-------|-------|--------|
| Show start | Intro jingle | On first segment launch |
| Question appear | Short whoosh | On question text render |
| Countdown tick | Tick sound | Starts at 10s remaining |
| Timer critical | Fast tick | Under 5s, doubles pace |
| Answer reveal (correct) | Ascending chime | On correct answer show |
| Answer reveal (wrong) | Descending buzz | On wrong answer show |
| Leaderboard reveal | Drumroll | During bottom-up reveal |
| Winner announce | Fanfare | On #1 reveal + confetti |
| Commercial break | TV static / jingle | On transition |

All sounds pre-loaded on Display view initialization. Requires user click to satisfy browser autoplay policy (handled by "Start Show" button in lobby).
