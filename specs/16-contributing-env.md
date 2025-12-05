# Contributing Environment Setup - Update Documentation

## Objective

Ensure the project is easy for new contributors to set up by updating `.env.example` and `contributing.md` to reflect the current OAuth callback URL patterns and required environment variables. The documentation is outdated - redirect URLs have changed from `http://localhost:3000/callback` to provider-specific paths like `http://localhost:3000/auth/callback/atlassian`.

## Current State Analysis

### Issues Found

1. **Outdated callback URLs in contributing.md**:
   - Documents: `http://localhost:3000/callback`
   - Should be: `http://localhost:3000/auth/callback/atlassian`

2. **Missing Figma configuration in contributing.md**:
   - No documentation on setting up Figma OAuth app
   - No environment variables for Figma (FIGMA_CLIENT_ID, FIGMA_CLIENT_SECRET, FIGMA_OAUTH_SCOPES)

3. **Incomplete .env.example**:
   - Missing Figma OAuth configuration
   - May be missing other provider-specific variables

4. **Callback URL patterns**:
   - Atlassian: `/auth/callback/atlassian`
   - Figma: `/auth/callback/figma`
   - These are provider-specific, not a generic `/callback`

### Current Callback URL Implementation

Based on code review:
- Atlassian callback: `${VITE_AUTH_SERVER_URL}/auth/callback/atlassian`
- Figma callback: `${VITE_AUTH_SERVER_URL}/auth/callback/figma`
- Both use `VITE_AUTH_SERVER_URL` (defaults to `http://localhost:3000` in dev)
- Atlassian also supports `VITE_JIRA_CALLBACK_URL` environment variable override

## Implementation Plan

### Step 1: Update .env.example with all required variables

**Actions:**
- Add comprehensive Figma OAuth configuration section (both providers are required)
- Update Atlassian callback URL documentation to show correct path (`/auth/callback/atlassian`)
- Add clear comments explaining provider-specific callback patterns
- Ensure all required environment variables from code are documented
- Group variables by provider (Atlassian, Figma) and purpose (OAuth, Testing, etc.)
- Mark truly optional variables (AWS, Sentry, test credentials) with clear comments

**Validation:**
- Compare .env.example against all `process.env.*` references in codebase
- Verify all variables in `scripts/generate-build-env.sh` are documented
- Check that deployment.md and .env.example are consistent
- Run: `grep -E "FIGMA_CLIENT_ID|FIGMA_CLIENT_SECRET|FIGMA_OAUTH_SCOPES" .env.example`
- Run: `grep "auth/callback/atlassian" .env.example`

### Step 2: Update contributing.md OAuth setup instructions

**Actions:**
- Fix Atlassian callback URL from `/callback` to `/auth/callback/atlassian`
- Add complete Figma OAuth app setup section (required, not optional)
- Update environment variable examples with correct callback URLs for both providers
- Add clear note that both Atlassian and Figma setup are required
- Explain provider-specific callback URL pattern: `{BASE_URL}/auth/callback/{provider}`
- Update example .env snippet to include both providers
- Ensure scopes documented match provider code exactly

**Validation:**
- Run: `grep "auth/callback/atlassian" contributing.md`
- Run: `grep "auth/callback/figma" contributing.md`
- Run: `grep "FIGMA_CLIENT_ID" contributing.md`
- Verify callback URLs match what's in `server/server.ts` routes
- Verify Atlassian scopes match `server/providers/atlassian/index.ts`
- Verify Figma scopes match `server/providers/figma/index.ts`

## Detailed Requirements

### .env.example Structure

Should include these sections in order:
1. **Server Configuration** - PORT, base URLs
2. **Atlassian OAuth Configuration** - Client ID/secret, scopes, callback URL (required)
3. **Figma OAuth Configuration** - Client ID/secret, scopes (required)
4. **Security Configuration** - SESSION_SECRET, JWT_SECRET (required)
5. **Testing Variables** - Test tokens, cloud IDs, issue keys (optional, for integration tests)
6. **Optional Integrations** - AWS, Sentry, etc. (clearly marked as optional)

### contributing.md Flow

Should follow this structure:
1. Prerequisites
2. Fork and clone
3. Install dependencies
4. **Create Atlassian OAuth app** (detailed steps, required)
5. **Create Figma OAuth app** (detailed steps, required)
6. Configure environment variables (both providers required)
7. Run the app
8. Verify OAuth flows for both providers work
9. Contributing code

### Callback URL Documentation Pattern

Should clearly explain:
- Pattern: `{BASE_URL}/auth/callback/{provider}`
- Atlassian example: `http://localhost:3000/auth/callback/atlassian`
- Figma example: `http://localhost:3000/auth/callback/figma`
- Production URLs use HTTPS and actual domain
- Must match exactly in OAuth app configuration

### Required OAuth Scopes

Must document correct scopes from provider code:

**Atlassian** (from `server/providers/atlassian/index.ts`):
- `read:jira-work write:jira-work offline_access`

**Figma** (from `server/providers/figma/index.ts`):
- `file_content:read file_comments:read` (default if FIGMA_OAUTH_SCOPES not set)

## Testing Each Step

### Step 1 Verification
```bash
# Check .env.example has Figma configuration
grep -E "FIGMA_CLIENT_ID|FIGMA_CLIENT_SECRET|FIGMA_OAUTH_SCOPES" .env.example

# Check .env.example has correct Atlassian callback
grep "auth/callback/atlassian" .env.example

# Verify all variables from generate-build-env.sh are present
diff <(grep "^: \"\${" scripts/generate-build-env.sh | sed 's/.*{\(.*\)?.*/\1/' | sort) \
     <(grep "^[A-Z_].*=" .env.example | cut -d= -f1 | sort)
```

### Step 2 Verification
```bash
# Check contributing.md has correct callback URLs
grep "auth/callback/atlassian" contributing.md
grep "auth/callback/figma" contributing.md

# Check contributing.md documents Figma setup
grep "FIGMA_CLIENT_ID" contributing.md
grep -A5 "Create.*Figma" contributing.md

# Verify no old callback pattern remains
! grep "localhost:3000/callback[^/]" contributing.md
```

## Success Criteria

1. A new contributor can follow contributing.md start to finish and successfully:
   - Create both Atlassian and Figma OAuth apps (both required)
   - Configure all required environment variables for both providers
   - Start the server without errors
   - Complete OAuth flow for both providers

2. .env.example contains all variables needed to run the application with both providers
3. All callback URLs in documentation use `/auth/callback/{provider}` pattern
4. Both providers clearly marked as required in documentation
5. OAuth scopes in documentation match provider code exactly

## Out of Scope

Based on answers to questions, the following are explicitly NOT included in this work:

- Step 3: Troubleshooting section (separate work)
- Step 4: Consistency check across all docs (will update contributing.md and .env.example only)
- Step 5: Environment verification script (separate enhancement)
- Quick Start with pre-configured Bitovi OAuth apps (good idea for future)
- Support for additional OAuth providers (none currently planned)
- Cross-references to deployment.md (keeping docs separate) 
