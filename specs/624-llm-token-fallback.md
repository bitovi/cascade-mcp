# LLM Token Fallback for E2E Tests

## Problem

We need our E2E tests to pass by having access to an Anthropic API key, but we don't want that key available in deployed environments (staging/production). In deployed environments, users should provide their own LLM credentials through API headers or environment variables.

**Current situation:**
- E2E tests (`test/e2e/api-workflow.test.ts`) require `ANTHROPIC_API_KEY` to test LLM-powered endpoints
- Tests currently skip if this variable is missing
- The GitHub Actions secret `ANTHROPIC_API_KEY` has been added to the `test` environment
- Deployment environments (staging/prod) should NOT have this key

## Context

### Key Files and Systems

**Test Infrastructure:**
- `test/e2e/api-workflow.test.ts` - Main E2E test requiring LLM access
- `test/e2e/helpers/api-client.ts` - Creates API clients with LLM headers
- `.github/workflows/ci.yaml` - CI pipeline with separate `e2e-test` job
- `specs/shared/config/jest-setup.js` - Test environment configuration

**LLM Provider System:**
- `server/llm-client/providers/anthropic.ts` - Anthropic provider with fallback logic
- `server/llm-client/provider-factory.ts` - Multi-provider factory with header/env resolution
- `server/llm-client/providers/provider-helpers.ts` - Standard provider creation utilities
- `server/api/*.ts` - API endpoints using `createProviderFromHeaders()`

**Build & Deploy:**
- `scripts/generate-build-env.sh` - Legacy script, no longer used (kept for local dev convenience)
- `.github/workflows/deploy.yaml` - Reusable deployment workflow (manually builds `repo_env`)
- `.github/workflows/deploy-staging.yaml` - Staging deployment trigger
- `.github/workflows/deploy-prod.yaml` - Production deployment trigger
- `.github/workflows/ci.yaml` - CI pipeline with explicit `.env` generation

**Important Historical Context:**
- **Before commit a50226a** (Dec 2024): All workflows (CI, staging, prod) called `generate-build-env.sh`
- **After commit a50226a**: Deployment workflows refactored to manually build `repo_env`
- **After this spec**: CI workflow also refactored to manually build `.env` for consistency
- This creates explicit visibility: all environment variables are listed inline in workflows

### Current Authentication Flow

**Anthropic Provider Fallback Order (from `server/llm-client/providers/anthropic.ts`):**
1. `x-anthropic-key` header (legacy, primary)
2. `ANTHROPIC_API_KEY` env var (legacy, primary) ← **This is what tests need**
3. `x-llmclient-anthropic-api-key` header (standard)
4. `LLMCLIENT_ANTHROPIC_API_KEY` env var (standard)

**E2E Test Usage (from `test/e2e/api-workflow.test.ts`):**
- Reads `ANTHROPIC_API_KEY` from environment
- Passes it as `X-LLMClient-Anthropic-Api-Key` header to API client
- Tests skip if environment variable is missing

**API Endpoint Flow:**
```typescript
// API endpoints call createProviderFromHeaders(req.headers)
// → Checks headers['x-llm-provider'] (default: 'anthropic')
// → Loads provider module (e.g., anthropicProvider)
// → Calls provider's createProviderFromHeaders(headers)
// → Provider checks headers + env vars for credentials
```

## Implementation Plan

### Step 1: Update CI Workflow to Include ANTHROPIC_API_KEY

**Goal:** Make the GitHub Actions secret available to the E2E test job.

**Changes made in `.github/workflows/ci.yaml`:**

The workflow now manually builds the `.env` file (matching the pattern in `deploy.yaml`). The `ANTHROPIC_API_KEY` has been added to the "Generate .env file" step alongside other test credentials:

```yaml
- name: Generate .env file
  run: |
    # ... other variables ...
    echo "ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}" >> .env
```

**Benefits of this approach:**
- All environment variables are explicitly visible in the workflow file
- Consistent with deployment workflow pattern
- No hidden script that could be modified
- Easier to audit what CI has access to

**Verification:**
- Run the E2E test job in GitHub Actions
- Check job logs to confirm `.env file created` message appears
- Confirm E2E tests no longer skip due to missing credentials
- Verify tests execute successfully

### Step 3: Confirm Deployment Environments Don't Receive Key

**Goal:** Ensure staging and production deployments do NOT include `ANTHROPIC_API_KEY`.

**Context:** As of commit a50226a (Dec 2024), all workflows were refactored to explicitly list variables:
- Previously: All workflows called `generate-build-env.sh`
- Now: All workflows manually build environment files with inline `echo` statements
- CI builds `.env` with test credentials (including `ANTHROPIC_API_KEY`)
- Deployments build `repo_env` with only production-needed variables

**What NOT to change:**
- `.github/workflows/deploy.yaml` - Should NOT include `ANTHROPIC_API_KEY` in "Generate repo_env file" step
  - This is the security boundary for deployments
  - Only variables echoed here reach staging/prod servers
- `.github/workflows/deploy-staging.yaml` - No changes needed (calls deploy.yaml)
- `.github/workflows/deploy-prod.yaml` - No changes needed (calls deploy.yaml)
- `scripts/generate-build-env.sh` - No longer used by any workflow (can remain for local dev convenience)

**Verification:**
- Review `deploy.yaml` lines 28-46 - confirm `ANTHROPIC_API_KEY` is NOT echoed to `repo_env`
- Review `ci.yaml` - confirm `ANTHROPIC_API_KEY` IS included in `.env` generation
- After next staging deployment, SSH to staging server and verify:
  ```bash
  grep ANTHROPIC_API_KEY /path/to/repo_env  # Should return nothing
  grep ANTHROPIC_API_KEY .env               # Should return nothing
  ```
- Confirm API endpoints still work when users provide credentials via headers
- Verify test environment can access the key but deployments cannotPI_KEY` in "Generate repo_env file" step
  - This is the actual security boundary
  - Only variables echoed here reach staging/prod servers
- `.github/workflows/deploy-staging.yaml` - No changes needed (calls deploy.yaml)
- `.github/workflows/deploy-prod.yaml` - No changes needed (calls deploy.yaml)

**Verification:**
- Review `deploy.yaml` lines 28-46 - confirm `ANTHROPIC_API_KEY` is NOT echoed to `repo_env`
- After next staging deployment, SSH to staging server and verify:
  ```bash
  grep ANTHROPIC_API_KEY /path/to/repo_env  # Should return nothing
  grep ANTHROPIC_API_KEY .env               # Should return nothing
  ```
- Confirm API endpoints still work when users provide credentials via headers
- Verify test environment can access the key but deployments cannot

### Step 4: Document Environment Variable Separation

**Goal:** Make it clear which environment variables are for which contexts.

**Add documentation section to `docs/deployment.md` or create new doc:**

```markdown
## Environment Variables by Context

### Test Environment Only
These variables are ONLY available in GitHub Actions test jobs:
- `ANTHROPIC_API_KEY` - For E2E testing LLM endpoints
- `ATLASSIAN_TEST_PAT`, `FIGMA_TEST_PAT` - PAT tokens for direct API testing

### Deployed Environments (Staging/Production)
These are the only secrets/vars needed for runtime operation:
- OAuth secrets: `JIRA_CLIENT_SECRET`, `FIGMA_CLIENT_SECRET`
- Session management: `SESSION_SECRET`, `JWT_SECRET`
- AWS credentials: `AWS_ACCESS_KEY_ID_JIRA_INTEGRATIONS`, `AWS_SECRET_ACCESS_KEY_JIRA_INTEGRATIONS`
- Configuration vars: All `VITE_*` variables

### User-Provided at Runtime
Users provide these via API headers when making requests:
- `X-Atlassian-Token` or `X-Figma-Token` - User's PAT tokens
- `X-LLM-Provider` - LLM provider choice (anthropic, openai, etc.)
- `X-LLMClient-{Provider}-Api-Key` - User's LLM API key
- `X-LLM-Model` - Model selection
```

**Verification:**
- Documentation clearly separates test-only vs. runtime variables
- New team members can understand why test secrets aren't in production

### Step 5: Add Safety Check to Prevent Accidental Leaks (Optional Enhancement)

**Goal:** Prevent accidentally adding `ANTHROPIC_API_KEY` to deployment workflows.

**Option A: Add validation script**

Create `scripts/validate-deployment-env.sh`:
```bash
#!/bin/bash
# Validates that deployment workflows don't contain test-only secrets

FORBIDDEN_VARS=("ANTHROPIC_API_KEY")
DEPLOY_FILE=".github/workflows/deploy.yaml"

for var in "${FORBIDDEN_VARS[@]}"; do
  if grep -q "$var" "$DEPLOY_FILE"; then
    echo "❌ ERROR: Found test-only variable '$var' in $DEPLOY_FILE"
    exit 1
  fi
done

echo "✅ Deployment workflow validation passed"
```

**Option B: Add comment warning in deploy.yaml**

Add a comment block at the top of `.github/workflows/deploy.yaml`:
```yaml
# WARNING: This workflow deploys to production/staging.
# DO NOT add test-only secrets like ANTHROPIC_API_KEY here.
# Test secrets belong ONLY in ci.yaml's e2e-test job.
# See docs/deployment.md for environment variable guidelines.
```

**Verification:**
- If using Option A: Run `bash scripts/validate-deployment-env.sh` successfully
- If using Option B: Comment is visible and clear to future maintainers

## Questions

1. **Should we also support other LLM providers (OpenAI, Claude via Bedrock, etc.) in E2E tests?**
   - If yes, we'd need to add those API keys to GitHub secrets and update test configuration
   - Current plan only addresses Anthropic since that's the default provider

2. **Do we want E2E tests to explicitly verify the fallback behavior** (tests passing credentials via headers work the same as environment variables)?
   - Could add a test case that deliberately uses headers instead of env vars
   - Would validate the multi-tenant API pattern more thoroughly

3. **Should the safety check (Step 5) be mandatory or optional?**
   - Optional: Relies on code review to catch mistakes
   - Mandatory: Could add to CI as a separate check job or pre-commit hook

4. **Is there any concern about the test environment secret being accessible to all PRs** or should we restrict it to specific branches?
   - Current `ci.yaml` runs on all PRs and pushes
   - GitHub Actions secrets in the `test` environment are accessible to all jobs using that environment
   - Could restrict with branch protections if needed