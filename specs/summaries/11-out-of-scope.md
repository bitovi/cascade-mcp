# 11-out-of-scope

**Status:** Implemented

## What it proposes
This spec investigates how the shell story prompt handles out-of-scope (❌) and low-priority/deferred (⏬) features, identifying a bug where ⏬ bullets forward-referenced story IDs that were never created (orphaned deferrals). It proposes adding an explicit "CREATE STORIES FOR DEFERRED FEATURES" step to the prompt, plus a stricter review step that actively creates missing stories rather than passively verifying them.

## Architectural decisions made
- A dedicated **HANDLE DEFERRED FEATURES** step was to be inserted between the repeat loop and the scope coverage review, so the AI explicitly collects all ⏬ bullets and either creates the referenced stories or converts them to ❌ if they are truly out of scope.
- The review step was updated to actively enforce "no ⏬ bullets may reference non-existent story IDs" and to confirm the final story has zero ⏬ bullets.

## What still needs implementing
_(none — all proposed changes are present in `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts` as steps 9–13)_
