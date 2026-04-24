# 23-auto-connect.md

## Status
Implemented

## What it proposes
When a user connects all available OAuth providers (Atlassian, Figma) in the Connection Hub (`/auth/hub`), the server should automatically redirect to `/auth/done` instead of requiring the user to manually click the "Done - Create Session" button. The auto-redirect only triggers when every required provider is connected; if only some are connected, the user stays at the hub and can still click "Done" manually.

## Architectural decisions made
- Auto-redirect triggers only when ALL providers in `REQUIRED_PROVIDERS` are connected (not just any one)
- `REQUIRED_PROVIDERS` is defined as a constant array (`['atlassian', 'figma', 'google']`) to make it easy to add future providers
- The check uses `REQUIRED_PROVIDERS.every(provider => connectedProviders.includes(provider))` at the top of `renderConnectionHub()`, redirecting before any HTML is rendered
- The "Done" button remains available for users who want to proceed with partial provider connections

## What still needs implementing
Fully implemented.
