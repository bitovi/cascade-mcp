# 048-multi-file-figma-loading.md

## Status
Not Implemented

## What it proposes
Add support for analyzing screens from multiple Figma files in a single `analyzeScreens()` workflow invocation. Currently the workflow throws an error when URLs from more than one Figma file are provided; this spec defines how to remove that restriction by processing each file independently in parallel and merging results.

## Architectural decisions made
- **Option B (Per-Frame File Reference)** recommended over Option A (Per-File Grouping): each `AnalyzedFrame` carries its own `figmaFileKey`/`figmaFileUrl`, with the result exposing `figmaFileKeys: string[]` and `figmaFileUrls: string[]` arrays
- Per-file operations (cache validation, node fetching, image downloading, annotation association) should run in parallel via `Promise.all`
- The existing `groupUrlsByFileKey()` helper (already in `url-processor.ts`) should be used as the grouping primitive
- Breaking change to `FrameAnalysisResult`: `figmaFileKey: string` → `figmaFileKeys: string[]`

## What still needs implementing
- Remove the multi-file error in `url-processor.ts` (lines 154–160: `TODO` comment + `if (fileKeys.size > 1) throw`)
- Update `url-processor.ts` to return a `Map<fileKey, FileGroup>` instead of a single `figmaFileKey`
- Update `cache-validator.ts` to validate each file independently and return a `Map<fileKey, CacheValidationResult>`
- Update `image-downloader.ts` to download images per file
- Update `annotation-associator.ts` to fetch comments per file and merge results
- Update `analysis-orchestrator.ts` to iterate over file groups and populate per-frame `figmaFileKey`/`figmaFileUrl`
- Update `types.ts`: add `figmaFileKey`/`figmaFileUrl` to `AnalyzedFrame`; change `FrameAnalysisResult` to use `figmaFileKeys`/`figmaFileUrls` arrays
- Update tests in `url-processor.test.ts` (currently asserts that multi-file URLs throw)
