# 15-e2e-test-helper.md

## Status
Implemented

## What it proposes
Create reusable E2E test helpers and CLI scripts for testing REST API endpoints. This includes an `ApiClient` class, typed endpoint helper functions, a Jira URL parser utility, a restructured `test/e2e/` directory, and CLI scripts under `scripts/api/` for manual testing.

## Architectural decisions made
- `test/e2e/helpers/api-client.ts` — base HTTP client with token injection from environment variables
- `test/e2e/helpers/jira-url-parser.ts` — parses `https://{site}.atlassian.net/browse/{KEY}` into `{ epicKey, siteName }`
- `test/e2e/helpers/api-endpoints.ts` — typed wrappers for each REST API endpoint
- Existing test moved and converted from JS → TS at `test/e2e/api-workflow.test.ts`
- `package.json` scripts: `test:e2e` and `test:e2e:rest-api` pointing to the new location
- CLI scripts in `scripts/api/` for `analyze-feature-scope`, `write-shell-stories`, `write-next-story`, etc.

## What still needs implementing
Fully implemented.
