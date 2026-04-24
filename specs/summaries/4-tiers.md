# Figma API Endpoints - Rate Limit Tiers

**Status:** Implemented

## What it proposes
Documents all Figma REST API endpoints used by the MCP server along with their rate limit tiers, and describes how 429 rate limit errors should be handled. It notes which response headers (`Retry-After`, `X-Figma-Rate-Limit-Type`, `X-Figma-Plan-Tier`, `X-Figma-Upgrade-Link`) should be parsed and surfaced to users.

## Architectural decisions made
- All file-read operations are Tier 1 endpoints, meaning users need Dev or Full seats for practical usage.
- `FigmaUnrecoverableError` is thrown on 429 responses to signal sampling hooks to stop retrying.

## What still needs implementing
- `X-Figma-Upgrade-Link` header is not currently extracted or surfaced to users in error messages.
