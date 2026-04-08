# TODOS

## Stretch Goals

### Canvas particle atmosphere
**What:** Replace CSS gradient atmosphere with canvas-based particle system that responds to team colors, chat activity, and mood shifts.
**Why:** More dynamic, "living organism" feel. CSS gradients are functional but particles would be theatrical.
**Context:** Current MVP uses CSS gradient animations for 3 moods (hype/chill/neutral). Canvas upgrade is purely visual polish.
**Depends on:** Live Performance Console shipped and stable.
**Added:** 2026-04-08 (eng review)

### Game plugin abstraction
**What:** Extract a GamePlugin interface from the direct quiz wiring when game #2 is added.
**Why:** Current quiz is wired directly into the stage. When a second game type materializes, extract the pattern.
**Context:** Premature to abstract now with only one game. The Round interface on the server already provides extensibility.
**Depends on:** A second game type being designed.
**Added:** 2026-04-08 (design doc)
