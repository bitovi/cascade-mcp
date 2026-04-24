# 045-consolidate-screen-analyses.md

## Status
Implemented

## What it proposes
Consolidate two divergent screen analysis code paths — a shared `regenerateScreenAnalyses()` function and an inline implementation in `context-loader.ts` — into a single unified `analyzeScreens()` function with canonical types. The goal was to eliminate ~200 lines of duplication, unify features (semantic XML, SECTION context, consistent caching), and provide a single return type that includes analysis content alongside stats.

## Architectural decisions made
- Create a unified `analyzeScreens()` function as the single authoritative entry point for all screen analysis
- Consolidate types: replace `ScreenToAnalyze`, `AnalyzedScreen`, and `Screen` with a single `Screen` interface that optionally carries `analysis`
- Return both analyzed screen content and statistics (`ScreenAnalysisResult`) rather than stats alone
- Accept raw Figma URLs directly (not only pre-processed `Screen[]`), eliminating the need for callers to fetch frame data themselves
- Place the consolidated implementation in `server/providers/figma/screen-analyses-workflow/` (as `analysis-orchestrator.ts`) rather than modifying the old `screen-analysis-regenerator.ts`

## What still needs implementing
Fully implemented.

- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` no longer exists
- `regenerateScreenAnalyses` is no longer referenced anywhere
- `context-loader.ts` now imports `analyzeScreens` from `../../../figma/screen-analyses-workflow/index.js` and delegates to it via `loadFigmaScreensViaWorkflow`
- The `screen-analyses-workflow/` module contains the full consolidated pipeline: `analysis-orchestrator.ts`, `frame-data-fetcher.ts`, `image-downloader.ts`, `screen-analyzer.ts`, `annotation-associator.ts`, `cache-validator.ts`, etc.
