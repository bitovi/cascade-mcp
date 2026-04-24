# Simplify Logging for identify-features Tool

**Status:** Partial

## What it proposes
Streamline and standardize console logging across the `identify-features` tool and its supporting files (figma-helpers, figma-screen-setup, screen-analysis-pipeline, screen-analysis-regenerator, core-logic, REST API handler). The spec defines a hierarchical indentation style with emojis (`🎨` for Figma, `🤖` for AI, `♻️` for cache, `✅` for success) and a specific target output format showing clean phase progression.

## Architectural decisions made
- Use `Tool call: identify-features {epicKey: "..."}` format for API entry point
- Show `Resolved: {siteName} ({cloudId})` for cloud ID resolution
- Show `🎨 {url}` for each Figma API request; `🤖 Analyzing: {screenName}` for each screen
- Remove all "✅ Saved X.md" file-save messages
- Keep status codes in parentheses for all API requests
- 7-step implementation plan across 6 files with consistent 2/4/6-space indentation hierarchy

## What still needs implementing
- `figma-screen-setup.ts` still has non-spec log formats; does not show `🎨 {url}` per Figma URL
- `analyze-feature-scope/core-logic.ts` (renamed from `identify-features/core-logic.ts`) retains verbose logs like `🔍 analyze-feature-scope: Received X screens from pipeline` not matching target style
- `screen-analyzer.ts` (formerly `screen-analysis-regenerator`) does not use `🤖 Analyzing: {screenName}` format
- No `♻️ Cached: Name1, Name2, ...` pattern found in screen analysis
- Full 8-step validation checklist not verified (consistent indentation, no redundant messages across all files)
