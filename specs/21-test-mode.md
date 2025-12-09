# Test Mode - Web UI for CascadeMCP

## Overview

Make CascadeMCP easier to use for folks without an MCP client by providing a web interface.

## Requirements

- A webpage where someone can authenticate with CascadeMCP (by connecting to Figma and Atlassian) and getting a JWT (similar to how an MCP client would connect)
- They can go to a page where they can call the core combined API endpoints starting with `server/api/analyze-feature-scope.ts`
- They can enter a Jira ticket URL and an Anthropic key (later we will support other LLM clients)
- Eventually, the page should receive live progress updates via notifications

## Current Architecture Analysis

### Two Existing Ways to Call Tools

| Aspect | REST API (PAT) | MCP Protocol |
|--------|----------------|--------------|
| **Authentication** | PAT tokens via `X-Atlassian-Token`, `X-Figma-Token` headers | OAuth JWT with embedded Atlassian/Figma tokens |
| **LLM Provider** | Directly calls Anthropic/etc via `createProviderFromHeaders()` | MCP Sampling - delegates to client via `sampling/createMessage` |
| **Progress Notifications** | Writes comments to Jira via `ProgressCommentManager` | Sends `notifications/message` and `notifications/progress` to MCP client |
| **Entry Points** | `server/api/*.ts` handlers | `server/providers/combined/tools/*/` tool registrations |
| **Core Logic** | Shared `executeAnalyzeFeatureScope()` etc. | Same shared core logic |

### Shared Architecture Pattern

Both paths use the same core logic via **dependency injection** (`ToolDependencies`):

```typescript
interface ToolDependencies {
  atlassianClient: AtlassianClient;  // Token captured in closure
  figmaClient: FigmaClient;          // Token captured in closure
  generateText: GenerateTextFn;      // LLM abstraction
  notify: (message: string) => Promise<void>; // Progress notifications
}
```

## Approach Comparison

### Approach A: Extend REST API to Support OAuth + SSE Notifications

**Changes Required:**
1. Add OAuth authentication to API endpoints (accept JWT from `Authorization: Bearer` header)
2. Add Server-Sent Events (SSE) endpoint for real-time notifications
3. Create new API routes like `POST /api/oauth/analyze-feature-scope`
4. Modify `notify` function to push to SSE stream instead of Jira comments

**Pros:**
- Simpler frontend - just HTTP calls and EventSource
- No MCP protocol complexity in browser
- Can reuse existing OAuth flow from connection hub

**Cons:**
- Duplicates some MCP infrastructure (auth validation, session management)
- SSE connection management adds complexity
- Different code paths for notifications vs MCP

### Approach B: Implement Minimal MCP Client in Browser

**Changes Required:**
1. Use `@modelcontextprotocol/sdk` browser client
2. Implement `InspectorOAuthClientProvider` pattern for auth (like MCP Inspector)
3. Implement sampling request handler (calls Anthropic API from browser)
4. Connect via SSE or Streamable HTTP transport

**Pros:**
- Uses existing MCP infrastructure completely
- Notifications work automatically via MCP protocol
- Same code path as real MCP clients

**Cons:**
- More complex frontend - must implement MCP client
- Sampling from browser requires exposing user's API key
- CORS considerations for Anthropic API calls from browser

## Recommended Approach: Hybrid (Approach A+)

**Why:** Extend the REST API but leverage existing OAuth infrastructure. This minimizes duplication while keeping the frontend simple.

### Key Insight: OAuth Already Works for Web

The existing connection hub (`/auth/connect`) already provides:
- Multi-provider OAuth flow (Atlassian + Figma)
- JWT creation with embedded tokens
- Browser-compatible redirects

We just need to:
1. Add JWT acceptance to REST API endpoints
2. Add SSE for progress notifications
3. Build a simple frontend

## Implementation Plan

### Phase 1: OAuth-Authenticated REST Endpoints

**Goal:** REST API accepts OAuth JWTs (not just PATs)

**Step 1.1: Create JWT Authentication Middleware**

Create `server/api/jwt-auth-middleware.ts`:
- Extract JWT from `Authorization: Bearer` header  
- Validate JWT structure and expiration
- Extract Atlassian/Figma tokens from nested structure
- Return `AtlassianClient` and `FigmaClient` configured with OAuth tokens

**Verification:** Unit test that valid JWTs pass, invalid/expired JWTs return 401

**Step 1.2: Add New OAuth-Authenticated API Route**

Create `/api/v2/analyze-feature-scope` that:
- Uses JWT auth middleware
- Accepts `X-LLM-*` headers for LLM config (same as current)
- Returns same response format as existing endpoint

**Verification:** 
- Call with valid JWT → 200 success
- Call with expired JWT → 401 with proper error
- Call with PAT headers → 400 (wrong endpoint)

### Phase 2: SSE Progress Notifications

**Goal:** Real-time progress updates in browser

**Step 2.1: Add SSE Endpoint**

Create `GET /api/v2/sse/:sessionId` endpoint:
- Validates JWT from query param
- Opens SSE stream
- Stores stream reference in session map

**Step 2.2: Connect Notify to SSE**

Create `createSseProgressNotifier(sessionId)`:
- Returns `notify` function matching `ToolDependencies`
- Pushes messages to SSE stream
- Also writes to Jira comments (dual notification)

**Step 2.3: Modify V2 Endpoint to Use SSE**

Update `/api/v2/analyze-feature-scope`:
- Accept `sessionId` in request body
- Use SSE notifier if session has active stream
- Fall back to comment-only if no stream

**Verification:**
1. Open SSE stream in browser
2. Call analyze-feature-scope with sessionId
3. See progress events arrive in browser
4. See progress comment in Jira (dual write)

### Phase 3: Frontend Web UI

**Goal:** Simple UI for authentication and tool execution

**Step 3.1: Basic HTML Structure**

Create `static/test-mode/index.html`:
- Connection status display
- "Connect to Atlassian & Figma" button (links to `/auth/connect`)
- Jira Epic URL input
- LLM provider selection (Anthropic default)
- API key input
- "Analyze" button
- Progress log display

**Step 3.2: OAuth Completion Handler**

Update connection hub "Done" flow:
- After JWT creation, redirect to `/test-mode?token=<jwt>`
- Frontend stores JWT in sessionStorage
- Updates UI to show "Connected"

**Step 3.3: Execute Tool from UI**

Implement JavaScript:
- Parse Jira URL to extract epic key
- Generate sessionId
- Open SSE connection
- POST to `/api/v2/analyze-feature-scope`
- Display progress in log panel
- Show completion/error status

**Verification:** 
1. Load `/test-mode`
2. Click connect, complete OAuth
3. Paste Jira epic URL
4. Enter Anthropic key
5. Click Analyze
6. Watch progress in real-time
7. See result in Jira

### Phase 4: Polish and Additional Tools

**Step 4.1: Add Write Shell Stories Support**

Add `/api/v2/write-shell-stories` with same pattern

**Step 4.2: Add Write Next Story Support**

Add `/api/v2/write-next-story` with same pattern

**Step 4.3: Error Handling and UX**

- Clear error messages for auth failures
- Token refresh flow when JWT expires
- Loading states and timeouts

## File Structure

```
server/
  api/
    v2/
      index.ts              # Register v2 routes
      jwt-auth.ts           # JWT authentication middleware
      sse.ts                # SSE endpoint and stream management
      analyze-feature-scope.ts
      write-shell-stories.ts
      write-next-story.ts
    progress-sse-notifier.ts # SSE-based notify function
static/
  test-mode/
    index.html             # Main UI
    app.js                 # Frontend logic
    styles.css             # Styling
```

## Questions

1. Should the web UI JWT have a shorter expiration than MCP client JWTs? (e.g., 15 minutes vs 1 hour)

2. For the SSE dual-write (browser + Jira comments), should we make the Jira comment optional via a UI checkbox?

3. Should we support multiple LLM providers in the initial release, or just Anthropic?

4. Should the test mode require a deployment URL or also work against localhost for development?

5. Do we want any rate limiting on the web UI to prevent abuse?





