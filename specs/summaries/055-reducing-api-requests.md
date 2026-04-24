# 055-reducing-api-requests.md

## Status
Partial

## What it proposes
Reduce redundant Figma API calls in `figma-review-design` to conserve rate limit budget (especially Tier 1 at 10 req/min for Professional plans). Specific targets: remove a redundant full-file fetch and a redundant comments fetch per invocation, clean up dead code, and add an env-var mode for View/Collab seat rate limits.

## Architectural decisions made
- Add `logFigmaRateLimitHeaders(response, endpoint)` helper in `figma-api-client.ts` to log `X-Figma-Plan-Tier`, `X-Figma-Rate-Limit-Type`, and `Retry-After` headers on every response at debug level (Step 1)
- Remove redundant `fetchFigmaFile()` full-file fetch in `figma-review-design/core-logic.ts` Step 2 — saves 1 Tier 1 call (Step 2)
- Remove redundant `figmaClient.fetchComments()` call in `figma-review-design/core-logic.ts` Step 2 (`commentsMap` was never read) — saves 1 Tier 2 call (Step 3)
- Delete dead exports: `getNodeMetadata()` in `figma-helpers.ts`, unused `downloadFigmaImagesBatch` import in `core-logic.ts`, and `downloadFigmaImage` singular (Step 4)
- Add `ATTEMPT_TO_STAY_WITHIN_VIEW_SEAT_LIMIT` env var to throttle comment posting from 2.5s → 12s delay for View/Collab seat users (Step 5)

## What still needs implementing
- **Step 1**: The spec's `logFigmaRateLimitHeaders` helper function in `figma-api-client.ts` logging rate limit headers on every response at debug level is not implemented. Current code only reads `Retry-After` on 429 errors; `figma-helpers.ts` has `createRateLimitErrorMessage()` that reads `x-figma-plan-tier` only for error messages, not proactive per-response debug logging.
