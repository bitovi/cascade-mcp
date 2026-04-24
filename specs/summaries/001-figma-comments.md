# 001-figma-comments

## Status
Implemented

## What it proposes
Add Figma comment integration to cascade-mcp: read existing Figma comments as context in `analyze-feature-scope` and `write-shell-stories`, and create a new `figma-review-design` tool that analyzes Figma designs and posts clarifying questions directly as comments on relevant frames.

## Architectural decisions made
- Fresh fetch per run (no caching) since comments don't trigger `last_touched_at`
- Shared `figma-comment-utils.ts` helper module with `fetchCommentsForFile`, `groupCommentsIntoThreads`, `formatCommentsForContext`, and `postQuestionsAsComments`
- Dual interface pattern: MCP tool (`figma-review-design`) + REST API (`POST /api/figma-review-design`) sharing `core-logic.ts`
- Figma API client extended with `fetchComments` and `postComment` methods (requires `file_comments:write` OAuth scope)
- Questions posted with format `Cascade🤖: {Question}❓` on the most-associated frame; general questions posted at page level
- Rate limit handling: consolidate questions if >25; always return questions in response regardless of posting success

## What still needs implementing
Fully implemented.
