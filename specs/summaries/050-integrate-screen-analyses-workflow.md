# 050-integrate-screen-analyses-workflow.md

## Status
Implemented

## What it proposes
Migrate `write-story` and `review-work-item` tools from an inline ~200-line `loadFigmaScreens()` implementation in `context-loader.ts` to the consolidated `screen-analyses-workflow/` module via `analyzeScreens()`. This provides feature parity with `write-shell-stories` (semantic XML, node caching, meta-first caching) and reduces duplication.

## Architectural decisions made
- Create a thin `loadFigmaScreensViaWorkflow()` adapter function in `context-loader.ts` that calls `analyzeScreens()` and converts `AnalyzedFrame[]` to the existing `AnalyzedScreen[]` type
- Add `contextMarkdown` to `ScreenAnalysisOptions` in `screen-analyzer.ts` so epic/issue context passes through to LLM prompts
- Add `notify` callback to `AnalysisWorkflowOptions` in `analysis-orchestrator.ts` for progress notifications
- Remove the old inline `loadFigmaScreens()` function entirely after migration
- Wire up `loadFigmaScreensViaWorkflow` in the `loadLinkedResources()` parallel fetch call

## What still needs implementing
Fully implemented.
