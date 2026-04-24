# 29-work-item-review.md

## Status
Implemented

## What it proposes
A combined MCP tool and REST API endpoint that reviews a Jira work item by gathering context from the Jira hierarchy (parents, blockers), linked Confluence docs, Figma designs, and the project description, then uses an LLM to generate structured clarifying questions grouped by feature area and posts them as a Jira comment.

## Architectural decisions made
- Recursive Jira hierarchy fetching (parents + blockers, no children/subtasks), configurable depth limit
- Project description fetched separately (plain text, not ADF) for Definition of Ready detection
- Links extracted from description, comments, parent items, and project description across Confluence, Figma, and Jira
- Context loading done in parallel via `Promise.allSettled` for graceful partial failure handling
- Dual interface pattern: MCP tool + REST API (`/api/review-work-item`) sharing core logic
- Output grouped by feature area with priority ordering (no explicit labels), posted as ADF comment
- Reuses existing utilities: `confluence-setup.ts`, Atlassian API client, Figma caching infrastructure

## What still needs implementing
Fully implemented.
