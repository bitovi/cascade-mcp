# Remove JIRA_TEST_CLOUD_ID Environment Variable

## Status: ✅ COMPLETE

All phases implemented and verified successfully.

## Overview

Remove the `JIRA_TEST_CLOUD_ID` environment variable while preserving the ability to pass `cloudId` directly to API calls and test helpers. Since cloudId is now auto-resolved from `siteName` via the `/_edge/tenant_info` endpoint (works with both OAuth and PAT tokens), the environment variable is no longer needed.

## Current State

`JIRA_TEST_CLOUD_ID` is currently used in:

1. **Test Files:**
   - `test/e2e/api-workflow.test.ts` - Reads from env, passes to API helpers
   - `specs/support-direct-api-requests.test.js` - Reads from env
   - `specs/mcp-sdk/connecting-to-tool-use/oauth-discovery.test.js` - Reads from env

2. **Scripts:**
   - `scripts/validate-pat-tokens.cjs` - Reads from env, validates it exists

3. **Documentation:**
   - `.env.example` - Shows as optional example
   - `test/e2e/README.md` - Documents the variable
   - `docs/rest-api.md` - Example configuration
   - Various spec markdown files

## Goals

- Remove all code that reads `JIRA_TEST_CLOUD_ID` from environment
- Keep API helper functions accepting optional `cloudId` parameter
- Update tests to use `siteName` instead of `cloudId`
- Update documentation to remove references
- Ensure all tests still pass without the environment variable

## Implementation Plan

### Phase 1: Update Test Files

**Step 1.1: Update `test/e2e/api-workflow.test.ts`**
- Remove `JIRA_CLOUD_ID` constant that reads from env
- Remove it from `shouldSkip` check
- Remove warning message about missing `JIRA_TEST_CLOUD_ID`
- Change API calls from `cloudId: JIRA_CLOUD_ID` to `siteName: 'bitovi'`
- Remove cloudId from console.log statements

**Validation:** Run `npm run test:e2e:rest-api` and verify test passes without `JIRA_TEST_CLOUD_ID` in `.env`

**Step 1.2: Update `specs/support-direct-api-requests.test.js`**
- Remove `JIRA_CLOUD_ID` constant
- Remove it from skip conditions
- Remove warning message
- Update test to use `siteName: 'bitovi'` instead

**Validation:** Run the test file directly and verify it works

**Step 1.3: Update `specs/mcp-sdk/connecting-to-tool-use/oauth-discovery.test.js`**
- Remove `process.env.JIRA_TEST_CLOUD_ID` checks
- Remove error about missing env var
- Remove from console.log statements
- Determine if this test needs cloudId at all (likely for MCP OAuth testing)

**Validation:** Run the test and verify behavior

### Phase 2: Update Scripts

**Step 2.1: Update `scripts/validate-pat-tokens.cjs`**
- Remove `JIRA_CLOUD_ID` constant
- Remove validation check for the env var
- Remove success/error messages about it
- Script should focus only on validating PAT tokens work, not cloudId presence

**Validation:** Run `npm run validate-pat-tokens` and verify it works without complaining about missing cloudId

### Phase 3: Update Documentation

**Step 3.1: Update `.env.example`**
- Remove both instances of `JIRA_TEST_CLOUD_ID` comment lines (lines 55 and 64)
- Remove the new "Optional" comment we added

**Step 3.2: Update `test/e2e/README.md`**
- Remove `JIRA_TEST_CLOUD_ID` from environment setup section
- Remove instructions on how to find cloudId (lines 33-39)
- Update examples to show `siteName` usage instead of `cloudId`

**Step 3.3: Update `docs/rest-api.md`**
- Find and remove `JIRA_TEST_CLOUD_ID` references
- Update examples to use `siteName` instead

**Step 3.4: Update spec documentation files**
- `specs/support-direct-api-requests-test.md` - Remove cloudId references
- Any other spec files that mention `JIRA_TEST_CLOUD_ID`

**Validation:** Grep search for `JIRA_TEST_CLOUD_ID` should return no results in code files (only possibly in git history or this spec)

### Phase 4: Verification

**Step 4.1: Test without environment variable**
- Remove or comment out `JIRA_TEST_CLOUD_ID` from your local `.env` file
- Run full test suite: `npm run test:e2e`
- Run validation script: `npm run validate-pat-tokens`
- Run API scripts manually:
  ```bash
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/TF-10
  ```

**Validation:** All tests and scripts work without `JIRA_TEST_CLOUD_ID` in environment

**Step 4.2: Verify cloudId parameter still works**
- Add a test that explicitly passes `cloudId` to an API helper
- Verify it uses the provided cloudId directly (should skip siteName resolution)

**Validation:** Confirm explicit `cloudId` parameter still works as performance optimization

**Step 4.3: Final grep verification**
```bash
grep -r "JIRA_TEST_CLOUD_ID" . --exclude-dir=node_modules --exclude-dir=.git --exclude="18-jira-test-cloud-id.md"
```

**Validation:** Should return no matches in code files

## Notes

- Keep `cloudId` as optional parameter in all API helpers (already implemented)
- Keep `siteName` as the preferred way to identify Jira site
- The `/_edge/tenant_info` endpoint auto-resolves cloudId from siteName
- This works with both OAuth and PAT authentication

## Questions

1. For `specs/mcp-sdk/connecting-to-tool-use/oauth-discovery.test.js` - does this test specifically need cloudId for OAuth flow testing, or can it use siteName resolution? Should we investigate what this test does before modifying it?

I think it should be able to use siteName

2. Should we add a test specifically to verify that passing explicit `cloudId` still works and skips the siteName resolution (as a performance optimization test)?

maybe at the end.

3. Are there any CI/CD pipelines or GitHub Actions workflows that set `JIRA_TEST_CLOUD_ID` that we need to update?

I don't believe so.

4. Should we keep `.env.backup` as-is (it has `JIRA_TEST_CLOUD_ID` set), or clean it up too?

Ignore it.