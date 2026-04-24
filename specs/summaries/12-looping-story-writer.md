# 12-looping-story-writer.md

## Status
Not Implemented

## What it proposes
Replace the current single-shot shell story generation (one large AI call producing all stories at once) with an iterative two-prompt-per-story loop: first a "feature selection" prompt picks 2–5 related features, then a "single story generation" prompt writes exactly one shell story, repeating until all in-scope features are covered.

## Architectural decisions made
- Two prompts per iteration: `FEATURE_SELECTION` (planner role) and `SINGLE_STORY` (product manager role)
- New files: `prompt-feature-selection.ts`, `prompt-single-story.ts`, `iterative-logic.ts` inside `writing-shell-stories/`
- Feature tracking via an explicit `remainingFeatures` array updated after each iteration
- Feature selection outputs structured JSON; story generation outputs markdown matching the existing shell story format
- Integration via an `iterative?: boolean` flag added to `ExecuteWriteShellStoriesParams` in `core-logic.ts`
- Safety cap of 50 iterations to prevent infinite loops
- Terminology clarification: ⏬ = "Low Priority" (within epic), ❌ = "Out-of-Scope" (excluded); "deferred" reserved only for out-of-scope items

## What still needs implementing
- `prompt-feature-selection.ts` — system prompt + `generateFeatureSelectionPrompt()` function
- `prompt-single-story.ts` — system prompt + `generateSingleStoryPrompt()` function
- `iterative-logic.ts` — `generateShellStoriesIteratively()` orchestration loop
- Helper functions: `extractInScopeFeatures()`, `removeUsedFeatures()`, `parseFeatureSelection()`, `parseShellStory()`
- Update `core-logic.ts` to accept `iterative` flag and branch between single-shot and iterative paths
- Decide fuzzy-matching strategy for `removeUsedFeatures` (exact vs. embedding similarity)
