# TODOS

## Post-Ship Cleanup

### Remove standalone quiz fallback path
**What:** Remove the dual-path quiz routing in `server/index.ts` (lines 167-196) that falls back to standalone QuizManager when ShowRunner isn't active.
**Why:** DRY violation — two code paths for quiz admin actions, player answers, and locks. With the command center, all quiz usage goes through ShowRunner.
**Context:** Kept during command center implementation as a dev convenience (// LEGACY comment). Once the command center is stable and tested, this dead code should go. Consider adding a "quick start" button in the command center as a replacement for the standalone quiz dev workflow.
**Depends on:** Command center feature shipped and stable.
**Added:** 2026-04-07 (eng review)
