# 17-contributing-split.md

## Status
Implemented

## What it proposes
Split the contributing guide into two distinct setup paths: a simpler "API Client Setup" using PAT tokens and a more complex "MCP Client Setup" using OAuth, so developers can get started quickly with the API before tackling the full OAuth configuration.

## Architectural decisions made
- Both paths documented in a single `contributing.md` file (not separate files)
- API setup is Step 1, MCP setup is Step 2 — sequential not mutually exclusive
- PAT token section covers both Atlassian (base64-encoded) and Figma tokens with links to generation docs
- Minimal `.env` snippet provided showing only API-required variables
- Token validation script (`scripts/validate-pat-tokens.cjs`) referenced as verification step

## What still needs implementing
Fully implemented.
