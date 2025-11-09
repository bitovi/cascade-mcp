# Phase 0: Audit of Current Implementations

## Overview
This document maps all external dependencies for `write-shell-stories` and `write-next-story` tools before refactoring.

---

## Write Shell Stories Tool

### File Structure
```
server/providers/combined/tools/writing-shell-stories/
├── index.ts                          # Export registration function
├── write-shell-stories.ts            # Main tool handler (MCP-specific)
├── figma-screen-setup.ts             # Epic/Figma data fetching (shared with write-next-story)
├── screen-analysis-regenerator.ts    # Screen analysis with AI
├── progress-notifier.ts              # MCP progress notifications
├── prompt-shell-stories.ts           # AI prompt generation
├── prompt-screen-analysis.ts         # AI prompt for screen analysis
├── screen-analyzer.ts                # Screen/note association logic
├── yaml-generator.ts                 # screens.yaml generation
├── note-text-extractor.ts            # Note text extraction
└── temp-directory-manager.ts         # Temp file management
```

### External Dependencies

#### 1. Authentication (Currently: Raw Tokens)
**Location:** `write-shell-stories.ts:70-71`
```typescript
const atlassianToken = authInfo?.atlassian?.access_token;
const figmaToken = authInfo?.figma?.access_token;
```

**Used in:**
- `write-shell-stories.ts` - Pass to helper functions
- `figma-screen-setup.ts` - Pass to Atlassian/Figma helpers
- `screen-analysis-regenerator.ts` - Pass to Figma helpers

**Refactor Target:** Create `AtlassianClient` and `FigmaClient` with tokens in closure

---

#### 2. Atlassian API Calls

**Direct fetch() calls:**

1. **Update Epic Description** (`write-shell-stories.ts:401`)
   ```typescript
   const updateResponse = await fetch(updateUrl, {
     method: 'PUT',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Accept': 'application/json',
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ fields: { description: updatedDescription } })
   });
   ```
   - URL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`
   - Method: PUT
   - Auth: Bearer token in header

**Helper function calls:**

2. **Resolve Cloud ID** (`figma-screen-setup.ts:169`)
   ```typescript
   const siteInfo = await resolveCloudId(atlassianToken, cloudId, siteName);
   ```
   - Function: `server/providers/atlassian/atlassian-helpers.ts`
   - Returns: `{ cloudId, siteName, siteUrl }`

3. **Get Jira Issue** (`figma-screen-setup.ts:173`)
   ```typescript
   const issueResponse = await getJiraIssue(siteInfo.cloudId, epicKey, undefined, atlassianToken);
   ```
   - Function: `server/providers/atlassian/atlassian-helpers.ts`
   - Returns: Full issue object with fields

**Refactor Target:** All these should use `atlassianClient.fetch()` or helper methods on client

---

#### 3. Figma API Calls

**Helper function calls:**

1. **Parse Figma URL** (`figma-screen-setup.ts:271`)
   ```typescript
   const urlInfo = parseFigmaUrl(figmaUrl);
   ```
   - Function: `server/providers/figma/figma-helpers.ts`
   - Returns: `{ fileKey, nodeId, urlType }`
   - **No auth needed** - pure parsing

2. **Fetch Figma Node** (`figma-screen-setup.ts:281`)
   ```typescript
   const nodeData = await fetchFigmaNode(urlInfo.fileKey, apiNodeId, figmaToken);
   ```
   - Function: `server/providers/figma/figma-helpers.ts`
   - Makes API call: `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`
   - Auth: `X-Figma-Token: ${token}` header

3. **Download Screen Image** (`screen-analysis-regenerator.ts:87`)
   ```typescript
   await downloadScreenImage({
     fileKey: figmaFileKey,
     nodeId: screen.name,
     token: figmaToken,
     outputPath: imagePath
   });
   ```
   - Function: `server/providers/figma/figma-helpers.ts`
   - Makes TWO API calls:
     - Get image URL: `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}`
     - Download image: `fetch(imageUrl)`

**Refactor Target:** Helper functions should accept `figmaClient` instead of raw token

---

#### 4. MCP Sampling (LLM Requests)

**Screen Analysis** (`screen-analysis-regenerator.ts:194`)
```typescript
const samplingResponse = await mcp.server.request({
  "method": "sampling/createMessage",
  "params": {
    "messages": [{ role: "user", content: { type: "text", text: prompt } }],
    "speedPriority": 0.5,
    "systemPrompt": SCREEN_ANALYSIS_SYSTEM_PROMPT,
    "maxTokens": SCREEN_ANALYSIS_MAX_TOKENS
  }
}, CreateMessageResultSchema);
```

**Shell Story Generation** (`write-shell-stories.ts:304`)
```typescript
const samplingResponse = await mcp.server.request({
  "method": "sampling/createMessage",
  "params": {
    "messages": [{ role: "user", content: { type: "text", text: shellStoryPrompt } }],
    "speedPriority": 0.5,
    "systemPrompt": SHELL_STORY_SYSTEM_PROMPT,
    "maxTokens": SHELL_STORY_MAX_TOKENS
  }
}, CreateMessageResultSchema);
```

**Refactor Target:** Create `generateText(request)` function that works with both MCP and Anthropic

---

#### 5. Progress Notifications

**Creation** (`write-shell-stories.ts:102`)
```typescript
const notify = createProgressNotifier(context, 7);
```

**Usage throughout:**
```typescript
await notify('Phase 1-3: Fetching epic and Figma metadata...');
await notify('✅ Phase 1-3 Complete: 5 screens ready');
await notify('Analyzing screen 1/5...'); // Auto-increment
```

**Refactor Target:** 
- MCP mode: Pass real notifier function
- API mode: Pass no-op function `async () => {}`

---

### Function Signatures to Change

#### `figma-screen-setup.ts:157`
```typescript
// BEFORE
export async function setupFigmaScreens(params: {
  epicKey: string;
  atlassianToken: string;  // ❌ Remove
  figmaToken: string;      // ❌ Remove
  tempDirPath: string;
  cloudId?: string;
  siteName?: string;
  notify: (message: string) => Promise<void>;
}): Promise<FigmaScreenSetupResult>

// AFTER
export async function setupFigmaScreens(params: {
  epicKey: string;
  atlassianClient: AtlassianClient;  // ✅ Add
  figmaClient: FigmaClient;          // ✅ Add
  tempDirPath: string;
  cloudId?: string;
  siteName?: string;
  notify: (message: string) => Promise<void>;
}): Promise<FigmaScreenSetupResult>
```

#### `screen-analysis-regenerator.ts:41`
```typescript
// BEFORE
export async function regenerateScreenAnalyses(params: {
  mcp: McpServer;          // ❌ Remove
  screens: ScreenWithNotes[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  figmaToken: string;      // ❌ Remove
  tempDirPath: string;
  epicContext?: string;
  notify: (message: string) => Promise<void>;
}): Promise<{ analyzedScreens: number }>

// AFTER
export async function regenerateScreenAnalyses(params: {
  generateText: GenerateTextFn;  // ✅ Add
  screens: ScreenWithNotes[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  figmaClient: FigmaClient;      // ✅ Add
  tempDirPath: string;
  epicContext?: string;
  notify: (message: string) => Promise<void>;
}): Promise<{ analyzedScreens: number }>
```

---

## Write Next Story Tool

### File Structure
```
server/providers/combined/tools/write-next-story/
├── index.ts                       # Export registration function
├── write-next-story.ts            # Main tool handler (MCP-specific)
├── shell-story-parser.ts          # Parse shell stories from markdown
├── shell-story-parser.test.ts     # Unit tests
├── prompt-story-generation.ts     # AI prompt generation
└── story-writing-guidelines.md    # Documentation
```

### External Dependencies

#### 1. Authentication
**Location:** `write-next-story.ts:69, 85`
```typescript
const atlassianToken = authInfo?.atlassian?.access_token;
const figmaToken = authInfo?.figma?.access_token;
```

**Refactor Target:** Same as write-shell-stories

---

#### 2. Atlassian API Calls

**Direct fetch() calls:**

1. **Get Project Metadata** (`write-next-story.ts:464`)
   ```typescript
   const metadataResponse = await fetch(metadataUrl, {
     headers: {
       'Authorization': `Bearer ${atlassianToken}`,
       'Accept': 'application/json',
     },
   });
   ```
   - URL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`
   - Method: GET
   - Purpose: Get project key for new issue

2. **Create Jira Issue** (`write-next-story.ts:511`)
   ```typescript
   const createResponse = await fetch(createUrl, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${atlassianToken}`,
       'Accept': 'application/json',
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ fields: { ... } })
   });
   ```
   - URL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`
   - Method: POST

3. **Link Issue to Epic** (`write-next-story.ts:568`)
   ```typescript
   const linkResponse = await fetch(linkUrl, {
     method: 'PUT',
     headers: {
       'Authorization': `Bearer ${atlassianToken}`,
       'Accept': 'application/json',
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ issues: [createdIssue.key] })
   });
   ```
   - URL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/epic/${epicKey}/issue`
   - Method: PUT

4. **Update Epic Description** (`write-next-story.ts:645`)
   ```typescript
   const updateResponse = await fetch(updateUrl, {
     method: 'PUT',
     headers: {
       'Authorization': `Bearer ${atlassianToken}`,
       'Accept': 'application/json',
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ fields: { description: updatedDescription } })
   });
   ```
   - URL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`
   - Method: PUT

**Refactor Target:** All should use `atlassianClient.fetch()` or helper methods

---

#### 3. Figma API Calls

**Shared with write-shell-stories:**
- Uses `setupFigmaScreens()` which makes all Figma calls
- Uses `regenerateScreenAnalyses()` for screen images

**Refactor Target:** Same as write-shell-stories

---

#### 4. MCP Sampling

**Story Generation** (`write-next-story.ts:403`)
```typescript
const samplingResponse = await mcp.server.request({
  "method": "sampling/createMessage",
  "params": {
    "messages": [{ role: "user", content: { type: "text", text: storyPrompt } }],
    "speedPriority": 0.5,
    "systemPrompt": STORY_GENERATION_SYSTEM_PROMPT,
    "maxTokens": STORY_GENERATION_MAX_TOKENS
  }
}, CreateMessageResultSchema);
```

**Refactor Target:** Use `generateText()` abstraction

---

#### 5. Progress Notifications

Same pattern as write-shell-stories

---

### Shared Utilities

Both tools use:
- `setupFigmaScreens()` - Fetch epic and Figma metadata
- `regenerateScreenAnalyses()` - Download images and analyze
- `createProgressNotifier()` - Progress updates
- `getTempDir()` - Temp directory management (no auth needed)
- Atlassian/Figma helpers from respective provider folders

---

## Anthropic SDK Requirements

### Package Information
```json
{
  "name": "@anthropic-ai/sdk",
  "version": "^0.27.0",
  "description": "Official Anthropic TypeScript SDK"
}
```

### Authentication
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY // or from header
});
```

### Message Creation
```typescript
const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 8000,
  system: 'System prompt...',
  messages: [
    {
      role: 'user',
      content: 'User prompt...'
    }
  ]
});

// Response structure
const text = message.content[0].text;
```

### Request/Response Mapping

**MCP Format:**
```typescript
{
  method: "sampling/createMessage",
  params: {
    messages: [{ role: "user", content: { type: "text", text: "..." } }],
    speedPriority: 0.5,
    systemPrompt: "...",
    maxTokens: 8000
  }
}
```

**Anthropic SDK Format:**
```typescript
{
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 8000,
  system: "...",
  messages: [{ role: 'user', content: "..." }]
}
```

---

## Zod Schema Examples

### Request Schemas

```typescript
// server/api/types.ts
import { z } from 'zod';

export const WriteShellStoriesRequestSchema = z.object({
  epicKey: z.string()
    .min(1, 'Epic key is required')
    .regex(/^[A-Z]+-\d+$/, 'Epic key must be in format PROJ-123'),
  cloudId: z.string().optional(),
  siteName: z.string().optional(),
});

export type WriteShellStoriesRequest = z.infer<typeof WriteShellStoriesRequestSchema>;

export const WriteNextStoryRequestSchema = z.object({
  epicKey: z.string()
    .min(1, 'Epic key is required')
    .regex(/^[A-Z]+-\d+$/, 'Epic key must be in format PROJ-123'),
  cloudId: z.string().optional(),
  siteName: z.string().optional(),
});

export type WriteNextStoryRequest = z.infer<typeof WriteNextStoryRequestSchema>;
```

### Response Schemas

```typescript
export const WriteShellStoriesResponseSchema = z.object({
  success: z.boolean(),
  epicKey: z.string(),
  storiesCreated: z.number(),
  epicUrl: z.string(),
  message: z.string().optional(),
});

export type WriteShellStoriesResponse = z.infer<typeof WriteShellStoriesResponseSchema>;

export const WriteNextStoryResponseSchema = z.object({
  success: z.boolean(),
  issueKey: z.string(),
  issueUrl: z.string(),
  storyTitle: z.string(),
  epicKey: z.string(),
});

export type WriteNextStoryResponse = z.infer<typeof WriteNextStoryResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum(['AUTH_ERROR', 'VALIDATION_ERROR', 'NOT_FOUND', 'INTERNAL_ERROR']).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
```

---

## Summary of Changes Needed

### Phase 1: API Client Factories
- [ ] Create `AtlassianClient` interface and `createAtlassianClient()` factory
- [ ] Create `FigmaClient` interface and `createFigmaClient()` factory
- [ ] Update `atlassian-helpers.ts` functions to accept client objects
- [ ] Update `figma-helpers.ts` functions to accept client objects

### Phase 2: LLM Client Factory
- [ ] Create `LLMRequest`, `LLMResponse`, `GenerateTextFn` types
- [ ] Create `createMcpLLMClient(mcpServer)` factory
- [ ] Create `createAnthropicLLMClient(apiKey)` factory
- [ ] Install `@anthropic-ai/sdk` package

### Phase 3: Extract Core Logic
- [ ] Create `ToolDependencies` interface (with required `notify`)
- [ ] Extract `executeWriteShellStories()` core function
- [ ] Extract `executeWriteNextStory()` core function
- [ ] Update helper functions: `setupFigmaScreens()`, `regenerateScreenAnalyses()`

### Phase 4: Update MCP Handlers
- [ ] Refactor `write-shell-stories` MCP handler to thin wrapper
- [ ] Refactor `write-next-story` MCP handler to thin wrapper
- [ ] Verify backward compatibility with tests

### Phase 5: Create REST API
- [ ] Create API types and Zod schemas
- [ ] Create `write-shell-stories` API handler
- [ ] Create `write-next-story` API handler
- [ ] Register routes in `server.ts`

### Phase 6: Documentation and Testing
- [ ] Update `server/readme.md` with API documentation
- [ ] Create integration tests for API endpoints
- [ ] Update environment documentation

---

## Key Insights

1. **Auth is passed deeply** - Tokens flow through 3-4 function layers
2. **MCP sampling in 2 places** - Screen analysis and story generation
3. **Many direct fetch() calls** - Need to abstract with client objects
4. **Shared helpers** - Both tools use same Figma/Atlassian helpers
5. **Progress notifications are pervasive** - Must be no-op in API mode
6. **No streaming needed** - All LLM calls are non-streaming

**Ready to proceed with Phase 1!** 🚀
