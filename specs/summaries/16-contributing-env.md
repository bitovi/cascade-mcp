# 16-contributing-env.md

## Status
Implemented

## What it proposes
Update `contributing.md` and `.env.example` to fix outdated Atlassian callback URLs (from `/callback` to `/auth/callback/atlassian`), add missing Figma OAuth app setup instructions, and ensure all required environment variables for both providers are documented clearly.

## Architectural decisions made
- Provider-specific callback URL pattern: `{BASE_URL}/auth/callback/{provider}`
- Both Atlassian and Figma OAuth setup are required (not optional)
- `.env.example` grouped by purpose: Server, Atlassian OAuth, Figma OAuth, Security, Testing, Optional
- `contributing.md` follows a two-step flow: PAT-based API setup first, then OAuth MCP setup
- `VITE_JIRA_CALLBACK_URL` documents correct path and can override base URL

## What still needs implementing
Fully implemented.
