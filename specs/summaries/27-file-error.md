# 27-file-error.md

## Status
Partial

## What it proposes
Fix a staging error where `analyze-feature-scope` fails because analysis files can't be found due to a filename format mismatch: old cached files use `{frame-slug}.analysis.md` but the current code expects `{frame-slug}_{node-id}.analysis.md`. The spec chose a cache invalidation approach (Option 2) over perpetual backward compatibility.

## Architectural decisions made
- Chose cache invalidation (Option 2) — no perpetual backward compatibility code
- `screen-analysis-regenerator.ts` should force cache miss if `screen.filename` is missing, triggering regeneration with correct format
- Created `scripts/clear-legacy-cache.sh` as a one-time deployment migration script
- Added temporary Dockerfile cleanup step to remove legacy format files on image build
- Files listed for update: `analyze-feature-scope/core-logic.ts`, `write-next-story/core-logic.ts`, `writing-shell-stories/core-logic.ts`, `screen-analysis-pipeline.ts`

## What still needs implementing
- `screen-analysis-regenerator.ts` does not exist in the codebase — was either never created or renamed; the spec's key change (invalidate cache when `screen.filename` is missing) cannot be verified
- `server/providers/combined/tools/shared/scope-analysis-helpers.ts` (line 384) still uses `screen.filename || screen.name` fallback — the fallback the spec wanted removed
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts` (line 599) still uses `screen.filename || screen.name` fallback
- Temporary Dockerfile cleanup step (`find cache/figma-files -name "*.analysis.md" ...`) was not added
