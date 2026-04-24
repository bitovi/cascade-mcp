# 044-write-story-parallel-load-project.md

## Status
Implemented

## What it proposes
Optimize the `write-story` tool by parallelizing the project description fetch with the target issue fetch, since the project key can be extracted synchronously from the issue key (e.g., `TF-101` → `TF`). Also parallelize blockers/blocking fetches and run comments fetching concurrently with the full hierarchy fetch.

## Architectural decisions made
- Extract project key synchronously from issue key using a `extractProjectKeyFromIssueKey()` utility (no API call needed)
- Place utility in `server/providers/atlassian/atlassian-helpers.ts` with unit tests
- Parallel Batch 1: `Promise.all([fetchTargetIssue, fetchProject])` in `jira-hierarchy-fetcher.ts`
- Parallel Batch 2: fetch all blockers and blocking issues in `Promise.all` after parents are resolved sequentially
- In `write-story/core-logic.ts`: run hierarchy fetch and comments fetch in parallel via `Promise.all`

## What still needs implementing
Fully implemented.
