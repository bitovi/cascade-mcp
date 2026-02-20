# 055 — Reducing Figma API Requests

## Problem

Several tools make redundant Figma REST API calls, wasting rate limit budget. Figma enforces strict rate limits by tier (as of November 2025):

| API Tier | Seat | Starter | Professional | Organization | Enterprise |
|----------|------|---------|-------------|--------------|------------|
| **Tier 1** | View, Collab | Up to 6/month | Up to 6/month | Up to 6/month | Up to 6/month |
| | Dev, Full | | 10/min | 15/min | 20/min |
| **Tier 2** | View, Collab | Up to 5/min | Up to 5/min | Up to 5/min | Up to 5/min |
| | Dev, Full | | 25/min | 50/min | 100/min |
| **Tier 3** | View, Collab | Up to 10/min | Up to 10/min | Up to 10/min | Up to 10/min |
| | Dev, Full | | 50/min | 100/min | 150/min |

Rate limits are per-user, per-plan (PAT) or per-user, per-plan, per-app (OAuth). Tier 1 is the most restrictive — on Professional, only **10 requests/min** for Dev/Full seats.

### Endpoint Tier Mapping (from Figma docs)

| Endpoint | Method | Tier | Scope Required |
|----------|--------|------|----------------|
| `GET /v1/files/{key}` | GET | **Tier 1** | `file_content:read` |
| `GET /v1/files/{key}/nodes?ids=` | GET | **Tier 1** | `file_content:read` |
| `GET /v1/images/{key}?ids=` | GET | **Tier 1** | `file_content:read` |
| `GET /v1/files/{key}/meta` | GET | **Tier 3** | *minimal* |
| `GET /v1/files/{key}/comments` | GET | **Tier 2** | `file_comments:read` |
| `POST /v1/files/{key}/comments` | POST | **Tier 2** | `file_comments:write` |

> **Source:** Tier assignments confirmed from Figma REST API documentation. Both `/files/{key}` (full file) and `/files/{key}/nodes` (subtrees) are Tier 1 endpoints. Comment endpoints are assumed Tier 2 based on their write/metadata nature. Actual tiers will be validated by observing `X-Figma-Plan-Tier` and `X-Figma-Rate-Limit-Type` response headers on 429 errors (Step 1).

---

## Current State Audit

### `figma-review-design` — worst offender

Currently makes **16 Figma API calls** for a typical run (1 file, 5 frames, 10 questions):

| # | Call | Tier | Count | Redundant? |
|---|------|------|-------|------------|
| 1 | `GET /v1/files/{key}` (full file) | T1 | 1 | **YES** — result only used for `console.log(fileData.name)` |
| 2 | `GET /v1/files/{key}/comments` | T2 | 1 | **YES** — `commentsMap` never referenced after Step 2 |
| 3 | `GET /v1/files/{key}/meta` | T3 | 1 | No (cache validation) |
| 4 | `GET /v1/files/{key}/nodes?ids=` | T1 | 1 | No (fetches node subtrees) |
| 5 | `GET /v1/images/{key}?ids=` | T1 | 1 | No (downloads screenshots) |
| 6 | `GET /v1/files/{key}/comments` | T2 | 1 | No (annotation association, but duplicates #2) |
| 7 | `POST /v1/files/{key}/comments` | T2 | 10 | No (posts questions) |

**Redundant calls: 1 Tier 1 + 1 Tier 2 per file key.**

### Dead code (no rate limit impact)

- `getNodeMetadata()` in [figma-helpers.ts:536](server/providers/figma/figma-helpers.ts#L536) — calls `fetchFigmaFile()`, never called externally
- `downloadFigmaImagesBatch` import in [figma-review-design/core-logic.ts](server/providers/figma/tools/figma-review-design/core-logic.ts) — imported but never used
- `downloadFigmaImage` (singular) in [figma-helpers.ts:754](server/providers/figma/figma-helpers.ts#L754) — exported, zero callers

---

## Implementation Plan

> **Note:** This plan focuses **exclusively** on reducing API call count to stay within rate limits. Bandwidth optimizations that don't reduce the number of API calls (e.g., using `/nodes` instead of `/files` when both are Tier 1) are out of scope, even though they may improve performance.

### Step 1: Add Figma rate-limit header logging

Add logging to the Figma API client to capture rate limit response headers on every response. This gives us ground truth on actual tier assignments and remaining budget before making optimization changes.

**Headers to log (from [Figma rate limit docs](https://developers.figma.com/docs/rest-api/rate-limits/)):**
- `Retry-After` (seconds) — on 429 errors
- `X-Figma-Plan-Tier` (string enum) — `enterprise`, `org`, `pro`, `starter`, `student`
- `X-Figma-Rate-Limit-Type` (string enum) — `low` (View/Collab seats) or `high` (Dev/Full seats)
- `X-Figma-Upgrade-Link` (string) — URL to pricing/settings page

**Note:** Standard rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Limit`, `X-RateLimit-Reset`) may not be present on Figma responses — the docs only document the above headers.

**Changes:**
- In [figma-api-client.ts](server/providers/figma/figma-api-client.ts) → `createFigmaClient()` → `fetch` wrapper: 
  - After every response (success or error), extract and log the headers at debug level
  - Format: `🔢 Figma rate limit [endpoint]: plan=${X-Figma-Plan-Tier}, type=${X-Figma-Rate-Limit-Type}, retry-after=${Retry-After}`
- Add helper function `logFigmaRateLimitHeaders(response: Response, endpoint: string)` for consistent formatting

**Verification:** Run `figma-review-design` once. Check server logs for rate limit headers on each call. Confirm actual tier assignments per endpoint and identify if the user has a View/Collab seat (`X-Figma-Rate-Limit-Type: low`) or Dev/Full seat (`high`).

---

### Step 2: Remove redundant `fetchFigmaFile` in `figma-review-design` (saves 1 Tier 1 call)

The full file fetch in Step 2 of [core-logic.ts](server/providers/figma/tools/figma-review-design/core-logic.ts) is only used for `console.log(\`✅ Fetched file: ${fileData.name}\`)`. The file name can be obtained from the `analyzeScreens()` result instead.

**Changes:**
- Remove the `fetchFigmaFile()` call and `fileDataMap` in Step 2
- Get the file name from `analysisResult` (the orchestrator already logs it)
- Keep the error handling for "no valid files" — move that check to after `analyzeScreens()` (it already returns empty frames on failure)

**Verification:** Run `figma-review-design` with a valid Figma URL. Confirm:
- The tool still works end to end
- Server logs show one fewer `GET /v1/files/{key}` call (verify via Step 1 logging)
- Questions are still generated and posted correctly

---

### Step 3: Remove redundant `fetchComments` in `figma-review-design` (saves 1 Tier 2 call)

The comment fetch in Step 2 stores results in `commentsMap`, which is **never read** after Step 2. Comments are re-fetched inside `analyzeScreens()` → `fetchAndAssociateAnnotations()`.

**Changes:**
- Remove the `figmaClient.fetchComments()` call and `commentsMap` in Step 2
- Remove the `FigmaComment` import if no longer needed
- The `fetchCommentsForFile` import and related comment types from `figma-comment-utils.ts` are still needed for Step 5 (posting)

**Verification:** Run `figma-review-design`. Confirm:
- Comments/annotations still appear in the analysis output (they come from `analyzeScreens()`)
- Questions are still posted to the correct frames
- One fewer `GET /v1/files/{key}/comments` call in the logs

---

### Step 4: Clean up dead code

Remove unused exports and imports identified in the audit.

**Changes:**
- Remove `getNodeMetadata()` from [figma-helpers.ts](server/providers/figma/figma-helpers.ts#L536) (never called)
- Remove unused `downloadFigmaImagesBatch` import from [figma-review-design/core-logic.ts](server/providers/figma/tools/figma-review-design/core-logic.ts)
- Consider removing `downloadFigmaImage` (singular) from [figma-helpers.ts](server/providers/figma/figma-helpers.ts#L754) if no callers exist

**Verification:** `npx tsc --noEmit` passes with no errors.

---

### Step 5: Add View/Collab seat rate limit mode

Add an environment variable `ATTEMPT_TO_STAY_WITHIN_VIEW_SEAT_LIMIT` that, when enabled, restricts comment posting to stay within View/Collab seat Tier 2 limits (up to 5/min).

**Background:** Seat type affects rate limits dramatically:
- **Dev/Full seats** on Professional: 25/min for Tier 2 (POST comments)
- **View/Collab seats** on Professional: Up to 5/min for Tier 2

Currently, `postQuestionsToFigma()` posts with 2.5s delay (24/min rate) for Dev/Full seats. This would exceed View/Collab limits.

**Changes:**
- Add `ATTEMPT_TO_STAY_WITHIN_VIEW_SEAT_LIMIT` to `.env.example` and environment configuration
- In [figma-comment-utils.ts](server/providers/figma/tools/figma-review-design/figma-comment-utils.ts) → `postQuestionsToFigma()`:
  - Check the env var
  - If true: use 12s delay between comments (5/min rate)
  - If false (default): keep existing 2.5s delay (24/min rate)
- Log the rate limit mode being used at the start of comment posting

**Tradeoffs:**
- **Pros**: Prevents 429 errors for users with View/Collab seats
- **Cons**: Slower question posting (12s vs 2.5s per comment)
- **Note**: The existing consolidation logic (>25 questions → merge into frame-level comments) should still apply

**Verification:** 
1. Set `ATTEMPT_TO_STAY_WITHIN_VIEW_SEAT_LIMIT=true` in environment
2. Run `figma-review-design` with a design that generates 10 questions
3. Confirm comments post with ~12s delay between each
4. Confirm no 429 errors occur
5. Test with env var false/unset — confirm 2.5s delay

---

## Summary of Savings

| Step | Tool | Tier | Calls Saved | Notes |
|------|------|------|-------------|-------|
| 2 | `figma-review-design` | **T1** | **1/invocation** | Removes redundant full file fetch |
| 3 | `figma-review-design` | T2 | 1/invocation | Removes redundant comment fetch |
| 5 | All tools (comment posting) | T2 | 0 (but safer) | Prevents 429s for View/Collab seats via slower rate |

**Net savings per `figma-review-design` invocation: 1 Tier 1 + 1 Tier 2 call.**

On Professional plans, Tier 1 budget is only 10/min — saving even 1 call is significant.

**View/Collab seat protection (Step 5):** When enabled, slows comment posting from 24/min → 5/min to stay within "up to 5/min" Tier 2 limits for View/Collab seats.

---

## Questions

1. Should we add retry-with-backoff logic for 429 responses in the shared `figma-api-client.ts` `fetch` wrapper (covering all calls automatically), or keep the current per-call-site retry logic?

   **Answer:** No, keep the current behavior.

2. Do you have Figma Organization or Enterprise plan? This affects how aggressive we need to be — Professional (10 T1/min) is much tighter than Enterprise (20 T1/min).

   **Answer:** I have an Organization plan. However, we want to try to squeeze a `figma-analyze-design` into a `view` seat if possible so folks can demo the behavior.  