# Split Contributing Guide: API vs MCP Setup

## Overview

The current `contributing.md` file focuses entirely on MCP client setup (OAuth flow with interactive login). However, the API endpoints can be used directly with simpler PAT (Personal Access Token) authentication, which is easier to set up for developers who just want to use the API scripts or test the REST endpoints.

This spec outlines splitting the contributing guide into two paths:
1. **API Client Setup** (simpler - PAT tokens only)
2. **MCP Client Setup** (current guide - OAuth flow)

## Current State

- `contributing.md` - Contains only MCP setup instructions (OAuth apps, callback URLs, interactive flow)
- `scripts/validate-pat-tokens.cjs` - Already validates PAT tokens for API access
- `scripts/api/readme.md` - Documents the three main API scripts with PAT usage examples
- `.env.example` - Contains both OAuth variables (for MCP) and PAT variables (for API)

## Goal

Create a clearer onboarding experience where:
- Developers wanting to use API scripts can get started quickly with PAT tokens
- Developers wanting to use MCP clients understand the additional OAuth setup required
- Both paths are clearly documented and easy to follow

## Implementation Plan

### Step 1: Analyze Content Separation

**What to do:**
- Identify which sections of `contributing.md` are MCP-specific (OAuth apps, callback URLs, scopes)
- Identify which sections are shared (prerequisites, clone, install, run server)
- Determine what's unique to API setup (PAT token generation, validation)

**How to verify:**
- Create a table/list showing:
  - Shared sections (both paths need)
  - MCP-only sections
  - API-only sections

### Step 2: Create API Setup Guide Structure

**What to do:**
- Create a new section in `contributing.md` called "Setup for API Clients"
- Include these subsections:
  1. Prerequisites (Node.js, accounts)
  2. Fork and clone
  3. Install dependencies
  4. Generate PAT tokens (Atlassian + Figma)
  5. Configure environment variables (PAT-focused)
  6. Run the server
  7. Validate token setup
  8. Try the API scripts

**How to verify:**
- The guide flows logically from setup to verification
- All required environment variables for API usage are documented
- Links to external PAT generation docs are included

### Step 3: Document PAT Token Generation

**What to do:**
- Add clear instructions for generating Atlassian PAT token
  - Link to: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
  - Explain the base64 encoding requirement: `echo -n "email:token" | base64`
  - Show which scopes are needed for API access
- Add clear instructions for generating Figma PAT token
  - Link to: https://www.figma.com/settings (Personal access tokens section)
  - Note that no special scopes are required (PAT has full user access)

**How to verify:**
- Instructions are copy-pasteable
- Users understand the format expected in `.env` file
- Security note about keeping tokens secret is included

### Step 4: Document Required Environment Variables for API

**What to do:**
- Show a minimal `.env` setup for API usage:
  ```bash
  # Required for API client setup
  ATLASSIAN_TEST_PAT="<base64-encoded-credentials>"
  FIGMA_TEST_PAT="figd_..."
  ANTHROPIC_API_KEY="sk-ant-..."
  SESSION_SECRET="changeme_in_production"
  JWT_SECRET="devsecret_change_in_production"
  
  # Optional (has defaults)
  API_BASE_URL=http://localhost:3000
  DEV_CACHE_DIR=./cache
  ```
- Explain what each variable is for
- Note which ones are required vs optional

**How to verify:**
- Users can copy this minimal set and get started
- Clear distinction from the larger OAuth-required set for MCP
- Explanation of when `API_BASE_URL` would need to change

### Step 5: Add Token Validation Section

**What to do:**
- Document the `npm run validate-pat-tokens` command
- Explain what it checks:
  - Atlassian: Authentication, project access (PLAY), issue creation permissions
  - Figma: Basic authentication, optionally E2E test file access
- Show example successful output
- Add troubleshooting for common failures

**How to verify:**
- Users know how to run validation before trying scripts
- Clear explanation of what "passed" means
- Troubleshooting covers expired tokens, wrong format, insufficient permissions

### Step 6: Add API Scripts Usage Section

**What to do:**
- Link to `scripts/api/readme.md` with brief overview
- Show the three main commands:
  ```bash
  # 1. Analyze feature scope from Figma
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts <jira-url>
  
  # 2. Generate shell stories
  node --import ./loader.mjs scripts/api/write-shell-stories.ts <jira-url>
  
  # 3. Write next story (iterative)
  node --import ./loader.mjs scripts/api/write-next-story.ts <jira-url>
  ```
- Explain the typical workflow (run in order)
- Note that detailed options are in the linked readme

**How to verify:**
- Users can quickly test their setup works
- Clear that more details are available in scripts/api/readme.md
- Example Jira URL format shown

### Step 7: Restructure MCP Setup Section

**What to do:**
- Rename current guide content to "Setup for MCP Clients"
- Add a clear intro explaining this is for MCP protocol integration
- Keep all existing OAuth setup instructions
- Add a note at the top: "For simpler API-only setup, see 'Setup for API Clients' above"

**How to verify:**
- MCP setup remains complete and unchanged
- Clear distinction that this path is for MCP protocol use
- Cross-reference to API setup for comparison

### Step 8: Update Table of Contents

**What to do:**
- Add clear section headers with anchor links:
  ```markdown
  ## Table of Contents
  - [Setup for API Clients](#setup-for-api-clients) - Simpler PAT-based setup
  - [Setup for MCP Clients](#setup-for-mcp-clients) - OAuth-based MCP protocol integration
  - [Optional Configuration](#optional-configuration)
  - [Running Tests](#running-tests)
  - [Contributing Code](#contributing-code)
  ```

**How to verify:**
- Users can easily jump to their preferred setup path
- Clear indication of which path is simpler
- All sections are linkable

### Step 9: Add Decision Guide

**What to do:**
- Add a "Which Setup Should I Use?" section at the top after prerequisites
- Decision tree:
  - "Want to use the CLI scripts or REST API directly?" → API Client Setup
  - "Want to integrate with MCP protocol (VS Code Copilot, Claude Desktop, etc.)?" → MCP Client Setup
  - "Want both?" → Complete both setups

**How to verify:**
- New contributors immediately understand their options
- Clear use case for each path
- Obvious that API path is simpler to start with

### Step 10: Test the Documentation

**What to do:**
- Follow the API setup guide from scratch in a fresh clone
- Verify all commands work as documented
- Check that `validate-pat-tokens` runs successfully
- Run at least one API script to confirm end-to-end flow

**How to verify:**
- A developer following the guide can:
  1. Set up environment in under 15 minutes
  2. Validate tokens successfully
  3. Run an API script and see results
- No missing steps or unclear instructions

## Questions

1. Should the API setup guide be in a completely separate file (like `CONTRIBUTING_API.md`) or remain as a section within `contributing.md`?

A section.

2. Do we want to mention docker setup as an option for either path, or keep that in the main README?

Not now. 

3. Should we create a quick-start script that validates tokens AND runs a sample API call to confirm full setup?

No, we will tell people to run this instead of creating a combined script.

4. The current contributing guide says "Both providers are required" - is this true for API-only usage? Can someone use just Jira OR just Figma APIs?

Yes, it's true for API usage.

5. Should we add a visual diagram showing the difference between PAT flow (API) vs OAuth flow (MCP)?

No.

6. Do we need to document the E2E test setup separately, or is that advanced enough to keep in specs/?

Ignore this for now. I want to clean up our testing later.

7. Should the API setup section come before or after the MCP setup section in the guide?

API setup should come before. 

