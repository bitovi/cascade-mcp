# 047-figma-screen-analyses-workflow.md

## Status
Implemented

## What it proposes
Create a consolidated `server/providers/figma/screen-analyses-workflow/` folder with semantically organized, testable modules for the Figma screen analysis workflow. The modules use a dependency injection pattern (no mocking frameworks needed) to enable unit testing, and expose a single `index.ts` entry point for consumers.

## Architectural decisions made
- **Two-phase fetching**: Phase 1 fetches metadata to discover frames; Phase 2 batch-fetches full frame data (with children) for semantic XML and comment association
- **Dependency injection pattern**: Functions accept optional dependency overrides with sensible defaults, enabling testing without `jest.mock()`
- **Batching per file**: API calls for nodes, images, and metadata are batched per file to minimize requests
- **Caching by file timestamp**: Only re-analyze frames when the Figma file timestamp changes
- **Parallel AI analysis**: Multiple frames analyzed concurrently via LLM
- **Flexible entry point**: `analyzeFrames()` accepts either raw URLs (full workflow) or pre-processed frames (skips to cache check)
- **Unified types in `types.ts`**: `AnalyzedFrame`, `FrameAnnotation`, `FrameAnalysisResult` shared across all modules

## What still needs implementing
Fully implemented.

All proposed modules are present with matching test files:
- `index.ts`, `types.ts`
- `url-processor.ts` + test
- `frame-expander.ts` + test
- `annotation-associator.ts` + test
- `cache-validator.ts` + test
- `image-downloader.ts` + test
- `screen-analyzer.ts` + test
- `analysis-orchestrator.ts` + test

Additional modules beyond the spec (`frame-data-fetcher.ts`, `figma-cache.ts`, `cache-reuse.test.ts`) were also added during implementation.
