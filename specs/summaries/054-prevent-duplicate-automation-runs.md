# 054-prevent-duplicate-automation-runs.md

## Status
Implemented

## What it proposes
When a user double-clicks a Jira automation button (e.g., "write story"), two identical jobs fire causing duplicate comments in Jira. The spec proposes server-side throttling to reject duplicate requests within ~10 seconds of each other, detecting when a request is already in-flight for the same issue and blocking the second one.

## Architectural decisions made
- Server-side throttling (not client-side button disabling) as the primary mechanism
- Dedup key based on operation + site/project context (e.g., `write-shell-stories:siteName:epicKey`)
- 409 Conflict response with human-readable retry-after message for blocked duplicates
- In-memory `Map<string, timestamp>` for tracking recent requests (5-second window)
- Lazy cleanup of expired map entries when size exceeds 100 entries
- Implemented as reusable Express middleware (`debounce()`) applied per-route

## What still needs implementing
Fully implemented.
