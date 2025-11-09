# Support Direct API Requests for Write Story Tools

## Overview

Enable the write story tools (`write-shell-stories` and `write-next-story`) to work via direct REST API requests in addition to the existing MCP protocol. This allows:
- Direct API integration from external systems
- Testing without MCP client setup
- Alternative authentication methods (PATs instead of OAuth)

**API Endpoints:**
- `POST /api/write-shell-stories` - Generate shell stories from Figma screens
- `POST /api/write-next-story` - Write the next prioritized story from an epic

## Architecture Strategy

### Core Principle: Abstraction Layers
Keep the existing tool logic intact by introducing abstraction layers that work with both MCP OAuth and direct API PATs.

### Key Abstractions Needed

#### 1. **API Client Abstraction**
Currently: Direct `fetch()` calls with OAuth tokens embedded

Proposed: **Factory functions** that return pre-configured fetch wrappers:
- `createAtlassianClient(token)` returns object with `fetch()` and helper methods
- `createFigmaClient(token)` returns object with `fetch()` and helper methods

**Key insight**: The API/tool layer creates these clients with auth baked in via closures, then passes the pre-configured clients to core logic. Core logic never sees tokens!

#### 2. **LLM Client Abstraction**
Currently: MCP sampling via `mcp.server.request({ method: "sampling/createMessage" })`

Proposed: **Factory function** that returns pre-configured LLM interface:
- `createLLMClient(options)` returns `generateText(prompt, options)`
- Options include: MCP server reference OR Anthropic API key
- Name alternatives: `createAIClient`, `createGenerationClient`

**Key insight**: The returned function has everything it needs captured in closure - no context passing required!

## Implementation Plan

### Phase 0: Audit Current Implementations

**Goal:** Document the current state before refactoring

**Steps:**

1. **Audit write-shell-stories implementation**
   - Document all external dependencies (APIs called, auth points)
   - List all function signatures that will need to change
   - Identify all direct `fetch()` calls with auth
   - Identify all MCP sampling calls
   
   **Validation:** Complete dependency map created

2. **Audit write-next-story implementation**
   - Same analysis as write-shell-stories
   - Document any shared utilities between the two tools
   
   **Validation:** Complete dependency map created

3. **Document Anthropic SDK requirements**
   - Specify package: `@anthropic-ai/sdk` 
   - Document API version and authentication method
   - Document request/response format mapping
   
   **Validation:** Clear integration requirements documented

4. **Create Zod schema examples**
   - Define validation schemas for API request bodies
   - Define validation schemas for API responses
   - Document error response formats
   
   **Validation:** Schemas compile and examples are clear

### Phase 1: Create API Client Factories (Token → Configured Functions)

**Goal:** Factory functions that capture auth in closures, eliminating context passing

**Steps:**

1. **Create Atlassian client factory** (`server/providers/atlassian/atlassian-api-client.ts`)
   ```typescript
   export interface AtlassianClient {
     fetch: (url: string, options?: RequestInit) => Promise<Response>;
     getIssue: (cloudId: string, issueKey: string) => Promise<Issue>;
     // Add other helper methods as needed
   }
   
   export function createAtlassianClient(token: string): AtlassianClient {
     return {
       fetch: async (url: string, options?: RequestInit) => {
         // Token is captured in closure!
         return fetch(url, {
           ...options,
           headers: {
             ...options?.headers,
             'Authorization': `Bearer ${token}`
           }
         });
       },
       // Add helper methods as needed
       getIssue: async (cloudId: string, issueKey: string) => { ... }
     };
   }
   ```
   
   **Validation:** Create client with test token, verify Authorization header is set

2. **Create Figma client factory** (`server/providers/figma/figma-api-client.ts`)
   ```typescript
   export interface FigmaClient {
     fetch: (url: string, options?: RequestInit) => Promise<Response>;
     // Add helper methods as needed
   }
   
   export function createFigmaClient(token: string): FigmaClient {
     // Similar pattern to Atlassian client
     // Token captured in closure
   }
   ```
   
   **Validation:** Create client with test token, make test request

3. **Refactor existing helper functions to accept client objects**
   - Update `server/providers/atlassian/atlassian-helpers.ts`
   - Change signature from `resolveCloudId(token, ...)` to `resolveCloudId(client, ...)`
   - Client object is passed in, not raw token
   
   **Validation:** Existing functionality works with client objects

### Phase 2: Create LLM Client Factory

**Goal:** Factory function that returns pre-configured LLM interface

**Steps:**

1. **Create LLM client interface** (`server/llm-client/types.ts`)
   - Define `LLMRequest` type (prompt, system message, max tokens, etc.)
   - Define `LLMResponse` type (generated text, metadata)
   - Define `GenerateTextFn` type: `(request: LLMRequest) => Promise<LLMResponse>`
   
   **Validation:** TypeScript compiles, types are clear

2. **Create MCP sampling factory** (`server/llm-client/mcp-sampling-client.ts`)
   ```typescript
   export function createMcpLLMClient(mcpServer: McpServer): GenerateTextFn {
     return async (request: LLMRequest) => {
       // mcpServer is captured in closure!
       const response = await mcpServer.request({
         method: "sampling/createMessage",
         params: { /* map request to MCP format */ }
       });
       return { text: response.content.text };
     };
   }
   ```
   
   **Validation:** Test with existing write-shell-stories tool

3. **Create Anthropic SDK factory** (`server/llm-client/anthropic-client.ts`)
   ```typescript
   export function createAnthropicLLMClient(apiKey: string): GenerateTextFn {
     const client = new Anthropic({ apiKey }); // Captured in closure!
     return async (request: LLMRequest) => {
       const response = await client.messages.create({
         /* map request to Anthropic format */
       });
       return { text: response.content[0].text };
     };
   }
   ```
   
   **Validation:** Test basic completion with Anthropic API

### Phase 3: Extract Tool Core Logic with Dependency Injection

**Goal:** Extract tool logic into pure functions that receive pre-configured clients

**Steps:**

1. **Define core function dependencies interface** (`server/providers/combined/tools/types.ts`)
   ```typescript
   export interface ToolDependencies {
     atlassianClient: AtlassianClient;
     figmaClient: FigmaClient;
     generateText: GenerateTextFn;
     notify: (message: string, step: number) => Promise<void>;
   }
   ```
   - `notify` is always provided (never optional)
   - For API handlers, provide a no-op function: `async () => {}`
   - For MCP handlers, provide the actual progress notifier
   - This eliminates conditional checks throughout the core logic
   
   **Validation:** Interface captures all external dependencies

2. **Extract write-shell-stories core logic** (`server/providers/combined/tools/writing-shell-stories/core-logic.ts`)
   ```typescript
   export async function executeWriteShellStories(
     params: { epicKey: string; cloudId?: string; siteName?: string },
     deps: ToolDependencies
   ): Promise<Result> {
     // Use deps.atlassianClient.fetch(...) - no auth context needed!
     // Use deps.figmaClient.fetch(...) - no auth context needed!
     // Use deps.generateText(...) - no auth context needed!
     
     // Always call notify - it's either real progress or no-op
     await deps.notify('Starting phase 1...', 1);
     
     // More work...
     await deps.notify('Analyzing Figma screens...', 2);
     
     // No conditional checks needed!
   }
   ```
   - All business logic moved here
   - No MCP-specific code
   - No direct auth handling
   - No conditional notify checks - always call it
   
   **Validation:** Function signature is clean, no auth context parameters

3. **Extract write-next-story core logic** (`server/providers/combined/tools/write-next-story/core-logic.ts`)
   - Similar pattern to write-shell-stories
   - Uses `ToolDependencies` for all external interactions
   
   **Validation:** Function is pure, testable without MCP setup

### Phase 4: Update MCP Tool Handlers (Thin Wrappers)

**Goal:** MCP handlers become thin wrappers that prepare dependencies and call core logic

**Steps:**

1. **Update write-shell-stories MCP handler** (`server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts`)
   ```typescript
   async ({ epicKey, cloudId, siteName }, context) => {
     // 1. Get auth tokens from MCP context
     const authInfo = getAuthInfoSafe(context, 'write-shell-stories');
     
     // 2. Create pre-configured clients (auth captured in closures)
     const atlassianClient = createAtlassianClient(authInfo.atlassian.access_token);
     const figmaClient = createFigmaClient(authInfo.figma.access_token);
     const generateText = createMcpLLMClient(mcp.server);
     
     // 3. Prepare dependencies object with real progress notifier
     const deps: ToolDependencies = {
       atlassianClient,
       figmaClient,
       generateText,
       notify: createProgressNotifier(context, 8) // Real MCP progress
     };
     
     // 4. Call core logic (which never sees auth!)
     return executeWriteShellStories({ epicKey, cloudId, siteName }, deps);
   }
   ```
   
   **Validation:** Full end-to-end test via MCP protocol

2. **Update write-next-story MCP handler** (`server/providers/combined/tools/write-next-story/write-next-story.ts`)
   - Same pattern: get tokens → create clients → prepare deps → call core
   - Handler is ~20 lines of glue code
   
   **Validation:** Full end-to-end test via MCP protocol

3. **Verify backward compatibility**
   - Run existing integration tests
   - Confirm no functionality regressions
   - Verify progress notifications still work
   
   **Validation:** All existing tests pass

### Phase 5: Create REST API Endpoints

**Goal:** HTTP endpoints that prepare dependencies from PAT headers and call core logic

**Steps:**

1. **Create API request/response types** (`server/api/types.ts`)
   - Define request body schemas for each endpoint (use Zod)
   - Define response body schemas
   - Document expected headers
   
   **Validation:** TypeScript compiles, schemas are clear

2. **Create write-shell-stories API handler** (`server/api/handlers/write-shell-stories.ts`)
   ```typescript
   export async function handleWriteShellStories(req: Request, res: Response) {
     try {
       // 1. Extract PAT tokens from headers
       const atlassianToken = req.headers['x-atlassian-token'];
       const figmaToken = req.headers['x-figma-token'];
       const anthropicKey = req.headers['x-anthropic-token'];
       
       // 2. Validate tokens present
       if (!atlassianToken || !figmaToken || !anthropicKey) {
         return res.status(401).json({ error: 'Missing required tokens' });
       }
       
       // 3. Create pre-configured clients (same pattern as MCP!)
       const atlassianClient = createAtlassianClient(atlassianToken as string);
       const figmaClient = createFigmaClient(figmaToken as string);
       const generateText = createAnthropicLLMClient(anthropicKey as string);
       
       // 4. Prepare dependencies with no-op notifier
       const deps: ToolDependencies = {
         atlassianClient,
         figmaClient,
         generateText,
         notify: async () => {} // No-op for API mode
       };
       
       // 5. Parse request body
       const params = parseWriteShellStoriesRequest(req.body);
       
       // 6. Call core logic (same as MCP!)
       const result = await executeWriteShellStories(params, deps);
       
       // 7. Return response
       res.json(result);
       
     } catch (error) {
       // 8. Handle errors with proper HTTP status codes
       if (error.constructor.name === 'InvalidTokenError') {
         return res.status(401).json({ error: 'Invalid authentication' });
       }
       console.error('Tool execution failed:', error);
       res.status(500).json({ 
         error: error.message || 'Internal server error' 
       });
     }
   }
   ```
   
   **Validation:** Test with curl providing valid PAT headers

3. **Create write-next-story API handler** (`server/api/handlers/write-next-story.ts`)
   - Identical pattern to write-shell-stories
   - Extract tokens → create clients → prepare deps with no-op notify → call core → handle errors → return
   
   **Validation:** Test with curl/Postman

4. **Register API routes** (`server/server.ts`)
   ```typescript
   app.post('/api/write-shell-stories', handleWriteShellStories);
   app.post('/api/write-next-story', handleWriteNextStory);
   ```
   - No middleware needed - auth handled in handlers
   - CORS already configured globally
   
   **Validation:** Routes accessible via HTTP POST

### Phase 6: Documentation and Testing

**Goal:** Clear documentation and comprehensive testing for both MCP and API modes

**Steps:**

1. **Document API endpoints** (`server/readme.md`)
   - Add API section with endpoint descriptions
   - Document request/response formats
   - Provide example curl commands
   - Document required headers
   
   **Validation:** Documentation is clear and accurate

2. **Create integration tests** (`specs/api/write-stories-api.test.js`)
   - Test write-shell-stories endpoint with PATs
   - Test write-next-story endpoint with PATs
   - Test error cases (missing tokens, invalid params)
   
   **Validation:** All integration tests pass

3. **Update environment setup documentation**
   - Document how to obtain Anthropic API key
   - Document how to generate Atlassian/Figma PATs
   - Update `.env.example` with new variables
   
   **Validation:** New developer can follow docs and set up environment

4. **Create comparison test** (optional but valuable)
   - Same input run through both MCP and API paths
   - Verify outputs are identical
   - Confirms abstraction layer works correctly
   
   **Validation:** Outputs match between MCP and API modes

## Key Design Decisions

### Authentication Header Format
```
X-Atlassian-Token: <personal_access_token>
X-Figma-Token: <personal_access_token>
X-Anthropic-Token: <api_key>
```

### Request Body Format
```json
{
  "epicKey": "PROJ-123",
  "cloudId": "...",
  "siteName": "..."
}
```

### Progress Updates Strategy
- **MCP mode:** Provide real `notify` function in dependencies → sends progress via MCP protocol
- **API mode:** Provide no-op `notify` function (`async () => {}`) → core logic always calls it but does nothing
- **Benefit:** No conditional checks in core logic - always call `deps.notify()` without if statements
- **API mode (future):** Could provide `notify` function that writes to SSE stream (same interface!)

### Error Handling
- Maintain existing MCP error handling patterns
- Add HTTP-specific error codes and messages for API endpoints
- Ensure auth errors return 401 (not 500)

## File Organization

```
server/
├── api/
│   ├── types.ts                    # API request/response schemas (Zod)
│   └── handlers/
│       ├── write-shell-stories.ts  # REST handler (prepares deps, calls core)
│       └── write-next-story.ts     # REST handler (prepares deps, calls core)
├── llm-client/
│   ├── types.ts                    # LLMRequest, LLMResponse, GenerateTextFn
│   ├── mcp-sampling-client.ts      # createMcpLLMClient() factory
│   └── anthropic-client.ts         # createAnthropicLLMClient() factory
├── providers/
│   ├── atlassian/
│   │   └── atlassian-api-client.ts # createAtlassianClient() factory
│   ├── figma/
│   │   └── figma-api-client.ts     # createFigmaClient() factory
│   └── combined/
│       └── tools/
│           ├── types.ts                    # ToolDependencies interface
│           ├── writing-shell-stories/
│           │   ├── write-shell-stories.ts  # MCP handler (thin wrapper)
│           │   └── core-logic.ts           # Pure logic (receives deps)
│           └── write-next-story/
│               ├── write-next-story.ts     # MCP handler (thin wrapper)
│               └── core-logic.ts           # Pure logic (receives deps)
```

**Key Architecture Benefits:**
- ✅ No `authContext` passed to core logic
- ✅ Clients created with closures at API/MCP layer
- ✅ Core logic is pure, testable without auth setup
- ✅ MCP and API handlers follow identical pattern
- ✅ Easy to add new providers (just add factory)
- ✅ No conditional notify checks - always call it (real or no-op)

## Testing Strategy

### Unit Tests
- Auth context factories
- API client wrappers
- LLM client adapters
- Middleware validation

### Integration Tests
- End-to-end via MCP protocol
- End-to-end via REST API
- Cross-mode comparison tests

### Manual Testing Checklist
- [ ] Generate shell stories via MCP with OAuth
- [ ] Generate shell stories via API with PATs
- [ ] Write next story via MCP with OAuth
- [ ] Write next story via API with PATs
- [ ] Verify error handling in both modes
- [ ] Confirm outputs are consistent

## Optional Enhancement: Pilot Implementation

**Consider refactoring a simpler tool first as a proof of concept:**

### Why pilot with `atlassian-get-issue`?
- Much simpler than write-story tools (single API call)
- Already has auth handling we need to abstract
- No MCP sampling complexity
- Quick validation of factory pattern
- Provides reference implementation

### Pilot Steps:
1. Create `createAtlassianClient()` factory
2. Refactor `atlassian-get-issue` tool to use client
3. Create API endpoint `/api/get-issue` 
4. Test both MCP and API paths
5. Validate pattern works before tackling complex tools

### Decision:
- **If confident:** Skip pilot, go straight to write-story tools
- **If uncertain:** Start with pilot to validate architecture

## Questions

**Q: Should we support mixed auth modes?**
Example: OAuth for Atlassian, PAT for Figma in same request?
- Consider: With factory pattern, this is actually trivial to support!
- MCP layer: Create clients from OAuth tokens
- API layer: Create clients from PAT headers
- Decision: No

**Q: Should progress updates stream in API mode?**
- Option A (MVP): Omit `notify` from deps → no progress updates (simple, works immediately)
- Option B (Future): Provide `notify` that writes to SSE stream → real-time progress
- With factory pattern, both options use the same core logic!
- Decision: No, most tools that make simple http requests won't be able to work with a SSE stream.

**Q: How should we name the LLM abstraction?**
- Current suggestion: `LLMClient`
- Alternatives: `AIClient`, `GenerationClient`, `CompletionClient`
- Decision: LLMClient

**Q: Should we version the API endpoints?**
- `/api/v1/write-shell-stories` vs. `/api/write-shell-stories`
- Consider: Future compatibility, breaking changes
- Decision: No

**Q: Should PAT headers be required or optional?**
- Required: All three tokens must be provided
- Optional: Only provide tokens for providers being used
- Decision: Required for these two endpoints.

**Q: How should we handle Anthropic API key storage?**
- Passed in request headers (stateless)
- Stored in environment variables (server-wide)
- Stored per-user (requires user management)
- Decision: passed in headers

**Q: Should we support both streaming and non-streaming LLM responses?**
- Consider: Anthropic SDK supports streaming, MCP sampling might not
- Impact: Interface complexity, response time perception
- Decision: We don't need to support streaming.  Non-stream is fine for now.

**Q: Should the REST API share the same Express session as OAuth flows?**
- Yes: Could enable hybrid auth scenarios
- No: Simpler, stateless API design
- Decision: No.

**Q: How should we handle rate limiting?**
- Defer to external API gateway
- Implement in-app rate limiting
- No rate limiting initially
- Decision: No rate limiting.

**Q: Should we log API usage separately from MCP usage?**
- Separate logs: Better analytics, separate quotas
- Same logs: Simpler implementation
- Decision: No

## Success Criteria

When complete, both of these approaches should work identically and produce the same results:

### MCP Call (VS Code Copilot)
```typescript
// User instruction in VS Code Copilot:
"Use write-shell-stories on PROJ-123"

// Behind the scenes:
// - OAuth tokens retrieved from MCP context
// - Progress notifications sent via MCP protocol
// - Shell stories written to Jira epic
```

### API Call (Direct HTTP Request)
```bash
curl -X POST https://your-server.com/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: YOUR_ATLASSIAN_PAT" \
  -H "X-Figma-Token: YOUR_FIGMA_PAT" \
  -H "X-Anthropic-Token: YOUR_ANTHROPIC_KEY" \
  -d '{
    "epicKey": "PROJ-123",
    "cloudId": "your-cloud-id"
  }'

# Response (200 OK):
{
  "success": true,
  "epicKey": "PROJ-123",
  "storiesCreated": 12,
  "epicUrl": "https://your-site.atlassian.net/browse/PROJ-123"
}
```

### Expected Behavior

**Both approaches should:**
- ✅ Create identical shell stories in the Jira epic
- ✅ Use the same core logic (`executeWriteShellStories`)
- ✅ Produce the same analysis files in temp storage
- ✅ Generate the same AI prompts and responses
- ✅ Update the epic description with the same markdown

**Key differences:**
- MCP mode: Shows real-time progress updates to user (`notify` does real work)
- API mode: No progress updates (returns final result only, `notify` is no-op)
- MCP mode: Uses OAuth tokens from authenticated session
- API mode: Uses PATs from request headers
- Both modes: Core logic always calls `deps.notify()` - no conditionals needed

### Testing the Implementation

**Validation checklist:**
1. Run the same epic through both MCP and API paths
2. Compare the resulting Jira epic descriptions (should be identical)
3. Compare the generated temp files (should be identical)
4. Verify API returns proper HTTP status codes (401 for missing auth, 200 for success)
5. Verify MCP still sends progress notifications
6. Confirm core logic never directly handles authentication tokens

**Example comparison test:**
```typescript
// Test both paths with identical input
const epicKey = "TEST-123";

// Path 1: Via MCP
const mcpResult = await mcpClient.callTool('write-shell-stories', { epicKey });

// Path 2: Via API  
const apiResult = await fetch('/api/write-shell-stories', {
  method: 'POST',
  headers: { /* PAT tokens */ },
  body: JSON.stringify({ epicKey })
});

// Compare results
assert.equal(mcpResult.storiesCreated, apiResult.storiesCreated);
assert.equal(mcpResult.epicUrl, apiResult.epicUrl);
```

This demonstrates the abstraction is working correctly when both paths produce identical business outcomes.