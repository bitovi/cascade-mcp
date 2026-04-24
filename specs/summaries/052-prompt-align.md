# 052-prompt-align.md

## Status
Implemented

## What it proposes
Align the new `screen-analyzer.ts` prompt with the original `prompt-screen-analysis.ts` by adding the missing "Screen Order" field and renaming all "epic context" terminology to "feature context" throughout the prompt text.

## Architectural decisions made
- Add `screenPosition`/`screenOrder` to `AnalyzedFrame` type and include it conditionally in the prompt header
- Rename `epicContext` parameter to `contextMarkdown` (generic) and update all prompt text from "epic context" → "feature context"
- Keep new enhancements from `screen-analyzer.ts`: Section Name display, "CRITICAL - Scope Limiting Notes" section, and added scope guideline in Analysis Guidelines

## What still needs implementing
Fully implemented.
