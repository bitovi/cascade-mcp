# 053-tasks-shell-stories-improvements.md

## Status
Implemented

## What it proposes
Fixes two bugs in the shell story generation pipeline: (1) stories were being created for features explicitly declined by stakeholders ("None for now") because the scope analysis didn't mark them as ❌ out-of-scope, and (2) stories were ordered illogically (e.g., navigation came last instead of first). Both fixes involve updating the scope analysis and shell stories prompts.

## Architectural decisions made
- Both `prompt-scope-analysis.ts` and `prompt-shell-stories.ts` should be updated for defense-in-depth (not just one)
- "None for now" / "Not for now" = ❌ Out of Scope, not ⏬ Low Priority — this distinction must be made explicit in prompts
- Scope analysis should output both a 💬 answered-question marker AND a ❌ exclusion marker for declined features
- Shell story prompt Step 3 (PRIORITIZE) should enforce scaffolding-first ordering: Navigation → List → Create → View → Edit → Delete
- Story ordering should follow natural user flow progression within each flow stage

## What still needs implementing
Fully implemented.
