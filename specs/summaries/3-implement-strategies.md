# Shell Story Generation - Strategy Refactoring

**Status:** Not Implemented

## What it proposes
Refactor the `writing-shell-stories` tool to extract the current single-prompt logic into a versioned strategy file under a new `strategies/` subdirectory, mirroring the pattern used in `identify-features`. This enables future alternative generation strategies (e.g., a three-prompt consolidate-generate-validate pipeline) to be swapped in by changing a single import line in `core-logic.ts`.

## Architectural decisions made
- Strategy selection is done via import path changes, not environment variables.
- The current `prompt-shell-stories.ts` becomes `strategies/prompt-shell-stories-1.ts` (versioned naming).
- No behavior changes — only a structural refactor to decouple strategy from orchestration.

## What still needs implementing
- Create `server/providers/combined/tools/writing-shell-stories/strategies/` directory
- Copy/move `prompt-shell-stories.ts` to `strategies/prompt-shell-stories-1.ts`
- Update import in `core-logic.ts` from `./prompt-shell-stories.js` to `./strategies/prompt-shell-stories-1.js`
