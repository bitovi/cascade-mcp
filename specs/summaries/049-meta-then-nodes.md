# 049-meta-then-nodes.md

## Status
Implemented

## What it proposes
Move the `/meta` cache validation call before the `/nodes` fetch so that node data is only fetched when needed. Additionally, cache the fetched node data so that subsequent calls for an unchanged file skip the `/nodes` API call entirely.

## Architectural decisions made
- `validateCache()` runs as Step 2 (before node fetching) using the lightweight `/meta` endpoint
- `fetchFrameNodesFromUrls()` becomes cache-aware: checks `.nodes-cache.json` before calling Figma API
- Node data is saved to `cache/figma-files/{fileKey}/.nodes-cache.json` after fetching
- If cache is valid and all requested node IDs exist in `.nodes-cache.json`, the `/nodes` API call is skipped entirely
- New `CachedNodesData` interface wraps `requestedNodeIds`, `nodesDataMap`, and `cachedAt` timestamp

## What still needs implementing
Fully implemented.
