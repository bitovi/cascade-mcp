# 056-writing-shell-stories-rate-limit.md

## Status
Not Implemented

## What it proposes
Remove a redundant Figma API call (Tier 2) in the `writing-shell-stories` tool. Phase 3.8 explicitly calls `fetchCommentsForFile()`, but Phase 4's `analyzeScreens()` already fetches the same comments internally — so the spec proposes eliminating Phase 3.8 and sourcing comment data from the `analyzeScreens()` result instead.

## Architectural decisions made
- Extend `FrameAnalysisResult` in `types.ts` to include `unattachedComments?: ScreenAnnotation[]`
- Update `analyzeScreens()` in `analysis-orchestrator.ts` to return `unattachedComments` from the annotation result
- Remove Phase 3.8 `fetchCommentsForFile()` call entirely from `core-logic.ts`
- Add helper `frameAnnotationsToScreenAnnotations()` to convert `AnalyzedFrame[]` annotations to `ScreenAnnotation[]`
- Merge matched frame annotations and unattached comments into `figmaCommentContexts`

## What still needs implementing
- Phase 3.8 still exists in `core-logic.ts` and still calls `fetchCommentsForFile()` (lines 265–272)
- `FrameAnalysisResult` in `types.ts` does not include `unattachedComments`
- `analysis-orchestrator.ts` does not return `unattachedComments` from `analyzeScreens()`
- Helper function `frameAnnotationsToScreenAnnotations()` has not been created
