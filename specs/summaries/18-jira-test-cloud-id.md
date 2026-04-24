# 18-jira-test-cloud-id.md

## Status
Implemented

## What it proposes
Remove the `JIRA_TEST_CLOUD_ID` environment variable from tests, scripts, and documentation since cloudId is now auto-resolved from `siteName` via the `/_edge/tenant_info` endpoint. Tests and API helpers should use `siteName: 'bitovi'` instead of passing a hardcoded cloudId.

## Architectural decisions made
- cloudId auto-resolution via `/_edge/tenant_info` works for both OAuth and PAT tokens, making the env var redundant
- API helper functions keep an optional `cloudId` parameter for flexibility
- Tests switch to using `siteName` (e.g., `'bitovi'`) instead of a raw cloudId string
- Documentation, `.env.example`, and README updated to remove all references

## What still needs implementing
Fully implemented.
