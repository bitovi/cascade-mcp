# AI SDK Integration: API Abstraction Layer

## Scope

This spec covers integrating Vercel's AI SDK at the **REST API layer** using **Anthropic only**. The goal is to replace the direct Anthropic client in API routes (`server/api/`) with AI SDK's unified interface as a foundation for future multi-provider support. MCP tools will continue using `createMcpLLMClient()` unchanged.

**What's Included**: API routes, interface alignment, Anthropic provider support, infrastructure for future providers

**What's NOT Included**: Additional providers (OpenAI, Google, Bedrock, etc.), dynamic/optional package installation, lazy loading, plugin architecture

**Follow-up Specs**: 
- `20-dynamic-llm-providers.md` - Add support for Bedrock and other providers (high priority)
- Additional specs for making packages optional/dynamic

## Current State

- **API endpoint usage**: Currently using Anthropic when the API endpoints are used (e.g., REST API routes in `server/api/`)
- **MCP tool usage**: MCP connections use MCP sampling/createMessage endpoint (no Anthropic dependency)
- **Client factory pattern**: Already have abstraction layer via `GenerateTextFn` type:
  - `createAnthropicClient()` - Creates Anthropic client
  - `createMcpLLMClient()` - Creates MCP sampling client
  - Both return same `GenerateTextFn` interface
  - Used in tools via `McpToolContext` (MCP) or direct initialization (API routes)

## Goal

Replace the existing Anthropic client with Vercel AI SDK's unified interface. This provides a solid foundation for adding additional providers (Bedrock, OpenAI, etc.) in future specs without requiring code changes to API routes.

## Implementation Plan

### Phase 1: Research - Align Interface with AI SDK ✅ RESEARCH COMPLETE

**1.1 Research findings applied**
- ✅ AI SDK provides unified `generateText()` interface across all providers
- ✅ All providers (Anthropic, OpenAI, Google, etc.) accept identical parameters
- ✅ Anthropic provider hardcoded for this spec; `LLM_PROVIDER` deferred to spec 20
- ✅ Model selection via `LLM_MODEL` env var (defaults to `claude-sonnet-4-5-20250929`); credentials from environment variables

**1.2 Interface alignment strategy**
- Migrate from `LLMRequest`/`LLMResponse` to AI SDK's native types
- Keep `GenerateTextFn` type but update parameter structure:
  - Change `systemPrompt` → `system` (AI SDK naming)
  - Change `prompt` → `messages` format (more flexible, AI SDK standard)
  - Keep `maxTokens` (same name)
  - Extend metadata response to include `finishReason`, `warnings`, full `usage` object
- This makes our abstraction thinner and more aligned with AI SDK's architecture

### Phase 2: Update Type Definitions

**2.1 Align `LLMRequest` with AI SDK's message format**
- Current structure uses flat `prompt` + `systemPrompt`
- AI SDK uses messages array format (more flexible for multi-turn, image support)
- New `LLMRequest` structure:
  ```typescript
  interface LLMRequest {
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string | Array<{
        type: 'text' | 'image';
        text?: string;
        data?: string;      // base64 image data
        mimeType?: string;
      }>;
    }>;
    model?: string;           // optional, uses LLM_MODEL env if not provided
    maxTokens?: number;       // default 8000
    temperature?: number;     // 0-1, optional
    topP?: number;           // optional
  }
  ```
- Provide helper: `createUserMessage(prompt: string)` and `createSystemMessage(system: string)` for easy migration

**2.2 Extend `LLMResponse` metadata**
- Current: `{ text, metadata: { model?, stopReason?, tokensUsed? } }`
- AI SDK response includes:
  ```typescript
  interface LLMResponse {
    text: string;
    metadata: {
      model: string;
      finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      warnings?: string[];
    };
  }
  ```

**2.3 Create migration helpers**
- `convertPromptToMessages(prompt: string, system?: string)` → converts old flat format to messages array
- `createUserMessage(content: string)` → helper to create user message
- `createSystemMessage(content: string)` → helper to create system message
- **Success criteria**: All code updated to use new messages format; helpers used during migration

### Phase 3: Create Provider Factory & AI SDK Wrapper

**3.1 Install AI SDK provider packages**
- Install `@ai-sdk/anthropic` (current provider)
- Add to `dependencies` in `package.json`
- Command: `npm install @ai-sdk/anthropic`
- **Note**: This spec keeps it simple with Anthropic only. Adding more providers (OpenAI, Bedrock, etc.) is handled in follow-up spec `20-dynamic-llm-providers.md`
- **Success criteria**: Package installs successfully; `npm list | grep @ai-sdk/anthropic` shows it

**3.2 Create environment variable validation**
- File: `server/llm-client/anthropic-config.ts`
- Define `LLM_MODEL` string (optional, provider defaults to `claude-sonnet-4-5-20250929` if not set)
- Create `validateAnthropicConfig()` function that checks:
  - `ANTHROPIC_API_KEY` env var exists
  - Throws descriptive error with setup instructions if missing
- Create `getAnthropicDefaults()` function that returns `{ model: 'claude-sonnet-4-5-20250929' }`
- **Note**: `LLM_PROVIDER` env var is not used in this spec (Anthropic hardcoded). Multi-provider routing added in spec 20.
- **Success criteria**: `validateAnthropicConfig()` catches missing API key at startup

**3.3 Create provider factory function**
- File: `server/llm-client/provider-factory.ts`
- Function: `createLLMClient(model?: string): GenerateTextFn` (synchronous, no await)
- Calls `validateAnthropicConfig()` to ensure `ANTHROPIC_API_KEY` is set (throws error if missing)
- Uses `process.env.LLM_MODEL` or Anthropic default if not provided
- Imports and initializes Anthropic provider:
  - `import { anthropic } from '@ai-sdk/anthropic'`
  - Reads `ANTHROPIC_API_KEY` from environment
- Returns wrapped `GenerateTextFn` that calls `generateText()` from AI SDK via wrapper
- **Success criteria**: Factory returns working `GenerateTextFn` for Anthropic; throws error if `ANTHROPIC_API_KEY` missing

**3.4 Create Anthropic wrapper**
- File: `server/llm-client/anthropic-wrapper.ts`
- Function: `wrapAnthropicModel(model: LanguageModel): GenerateTextFn`
- Anthropic-specific wrapper that converts `LLMRequest` (messages array) to AI SDK's `generateText()` call:
  - Map `request.messages` directly to AI SDK params
  - Map `request.maxTokens` → `maxTokens`
  - Map `request.temperature` → `temperature`
  - Map `request.topP` → `topP`
- Convert AI SDK response to `LLMResponse`:
  - Extract `result.text`
  - Build metadata from `result.usage`, `result.finishReason`, `result.model`
  - Include `result.warnings` if present
- Handle errors: throw descriptive errors, not AI SDK errors
- **Note**: This is Anthropic-specific for this spec. Future providers (OpenAI, Bedrock, etc.) will have their own wrappers in spec 20.
- **Success criteria**: Wrapper converts Anthropic model to `GenerateTextFn` without data loss

### Phase 4: Integration and Migration

**4.1 Update API routes to use provider factory**
- Identify all files that call `createAnthropicLLMClient()` (old factory):
  - `server/api/write-shell-stories.ts`
  - `server/api/write-next-story.ts`
  - `server/api/analyze-feature-scope.ts`
  - `server/api/identify-features.ts`
- Replace `createAnthropicLLMClient(apiKey)` with `createLLMClient()` (reads from environment)
- Remove all references to old factory (no deprecation path; internal code)
- Update callers to use new `GenerateTextFn` with messages format
- Factory is synchronous: `const generateText = createLLMClient()` (no `await` needed)
- **Success criteria**: API routes work with Anthropic via new provider factory; no old factory calls remain

**4.2 Update tool signatures to use messages format**
- Check which tools receive `generateText` function in context or API route params
- Update all tool code to pass `LLMRequest` with messages array (new format only)
- Use migration helpers where needed: `convertPromptToMessages(prompt, system)` or `createUserMessage()`/`createSystemMessage()`
- **Success criteria**: All tools compile and use new messages format consistently

**4.3 Test with Anthropic**
- Verify `ANTHROPIC_API_KEY` is set and API calls succeed
- Test error handling: Verify helpful error when `ANTHROPIC_API_KEY` is missing
- Test API route with sample request to verify token usage tracking works
- **Success criteria**: API routes work end-to-end with new AI SDK integration

**4.4 Update documentation**
- Update `server/readme.md`:
  - Document `ANTHROPIC_API_KEY` env variable (required, get from anthropic.com)
  - Document `LLM_MODEL` env variable (optional, defaults to `claude-sonnet-4-5-20250929`)
  - Quick-start: `ANTHROPIC_API_KEY=sk-ant-... npm run start-local`
  - Note that MCP tools use separate `createMcpLLMClient()` (unchanged)
  - Note that API routes now use AI SDK via `createLLMClient()`
- **Success criteria**: New developer can read docs, set `ANTHROPIC_API_KEY`, and API routes work

### Phase 5: Cleanup and Finalization

**5.1 Update LLM client types**
- File: `server/llm-client/types.ts`
- Update `LLMRequest` to use messages array format only (see Phase 2 details)
- Update `LLMResponse` metadata to use `finishReason` (not `stopReason`), include full `usage` object
- Keep `GenerateTextFn` type signature consistent
- Export helpers: `createUserMessage()`, `createSystemMessage()`, `convertPromptToMessages()`
- **Success criteria**: Types compile without errors; all code uses messages format

**5.2 Verify old client factory removal** (completed in Phase 4.1)
- Confirm `createAnthropicLLMClient()` has been removed entirely (no deprecation period)
- Verify no internal references remain
- Export: `createLLMClient`, helpers, and types from `server/llm-client/index.ts`
- Verify `createMcpLLMClient()` is untouched
- **Success criteria**: Clean migration to new factory; no old factory calls remain; build passes

**5.3 Update tool implementations**
- Identify all tools that use `generateText` callback
- Update all to use new messages format (via helpers if needed for conversion)
- Update signatures to reflect messages-based `LLMRequest`
- **Success criteria**: All tools compile and use messages format consistently

**5.4 Document new message format**
- Update code comments/JSDoc in `types.ts` to document new message format
- Document helpers: `convertPromptToMessages()`, `createUserMessage()`, `createSystemMessage()`
- Note in `server/readme.md`: All API routes now use messages format (old flat `prompt`/`systemPrompt` format removed)
- Note: Additional provider support (OpenAI, Bedrock, etc.) will be added in spec 20
- **Success criteria**: Clear documentation of new message format; developers know how to migrate from old format

## File Structure Changes

```
server/llm-client/
├── types.ts                    # UPDATED: New message format + helpers
├── index.ts                    # UPDATED: Export new factory + helpers
├── anthropic-config.ts         # NEW: Anthropic env var validation
├── provider-factory.ts         # NEW: Creates Anthropic LLM client via createLLMClient()
├── anthropic-wrapper.ts        # NEW: Wraps Anthropic model → GenerateTextFn
├── migration-helpers.ts        # NEW: convertPromptToMessages, createUserMessage, createSystemMessage
├── anthropic-client.ts         # REMOVED: Old factory (replaced by provider-factory.ts)
└── mcp-sampling-client.ts      # UNCHANGED: MCP tools still use this directly
```

## Architecture Diagram

```
API Routes (write-shell-stories, etc.)
         ↓
createLLMClient(model)  ← Read LLM_MODEL env (Anthropic hardcoded)
         ↓
provider-factory.ts
  - Validates config (anthropic-config.ts)
  - Imports Anthropic provider from @ai-sdk/anthropic
  - Initializes with ANTHROPIC_API_KEY from environment
         ↓
anthropic-wrapper.ts
  - Wraps AI SDK's generateText()
  - Converts LLMRequest (messages) ↔ AI SDK format
  - Returns GenerateTextFn
         ↓
generateText({ messages, maxTokens, etc. })
         ↓
AI SDK's generateText()
         ↓
HTTP → Anthropic API
```

## Implementation Status

- ✅ **Phase 1**: Research complete; interface aligned with AI SDK
- ⏳ **Phase 2**: Types updated; migration helpers available (not started)
- ⏳ **Phase 3**: Provider factory working; AI SDK wrapper functional (not started)
- ⏳ **Phase 4**: API routes updated to use messages format (not started)
- ⏳ **Phase 5**: Cleanup and finalization (not started)

## Research Findings

### AI SDK Architecture
**Unified Interface**: Vercel AI SDK uses a consistent `generateText()` and `streamText()` interface across all providers. All providers (Anthropic, OpenAI, Google, Groq, etc.) accept the same parameters through the unified language model specification published as open source.

**Provider Initialization Pattern**:
- Each provider has an npm package: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.
- Each provider exports a default instance (e.g., `import { anthropic } from '@ai-sdk/anthropic'`) OR a factory function (e.g., `createAnthropic()`) for custom configuration
- Providers are initialized with credentials via environment variables or passed parameters:
  - Anthropic: `ANTHROPIC_API_KEY` env var or passed to `createAnthropic({ apiKey })`
  - OpenAI: `OPENAI_API_KEY` env var or passed to `createOpenAI({ apiKey })`
- The model is selected via string ID when calling the provider: `anthropic('claude-opus-4-5')` or `openai('gpt-5')`

**Provider-Agnostic Request/Response**:
```typescript
// Same interface for all providers
const { text } = await generateText({
  model: anthropic('claude-sonnet-4-5-20250929'), // or openai('gpt-5'), etc.
  prompt: 'Your prompt here',
  maxTokens: 8000,
  system: 'Your system prompt'
});
```

**Supported Providers** (30+): Anthropic, OpenAI, Azure, Google Generative AI, Google Vertex, Mistral, Groq, DeepSeek, xAI Grok, Cohere, Perplexity, and many more via community packages.

### Mapping AI SDK to Your `GenerateTextFn`
Your current `LLMRequest` → `LLMResponse` interface maps cleanly to AI SDK:

| Your Type | AI SDK Equivalent |
|-----------|------------------|
| `LLMRequest.prompt` | `generateText()` `prompt` parameter |
| `LLMRequest.systemPrompt` | `generateText()` `system` parameter |
| `LLMRequest.maxTokens` | `generateText()` `maxTokens` parameter |
| `LLMRequest.image` | `generateText()` supports image in `messages[].content[]` |
| `LLMResponse.text` | `result.text` |
| `LLMResponse.metadata` | `result.usage`, `result.model`, `result.finishReason` |

**Minor differences**:
- AI SDK uses `system` (singular) not `systemPrompt`
- AI SDK's response structure is richer (includes `usage`, `finishReason`, `warnings`, etc.)
- Streaming is different: AI SDK has `streamText()` that returns a stream object, not a simple text stream

## Design Decisions

1. **Initial provider support**: Start with Anthropic only. Additional providers (OpenAI, Bedrock, etc.) added in follow-up spec `20-dynamic-llm-providers.md`.

2. **Anthropic hardcoded for this spec**: This spec supports Anthropic only. Multi-provider support (including `LLM_PROVIDER` env var) is handled in spec 20.

3. **Model specification**: Create `LLM_MODEL` env variable (optional, defaults to `claude-sonnet-4-5-20250929`):
   - Allows easy model switching without code changes
   - Recommended: **One `LLM_MODEL` env var with sensible default**.

4. **Streaming support**: AI SDK's `streamText()` is more sophisticated than current setup. Current API routes use buffered responses. Recommended: **Start with non-streaming `generateText()` in wrapper, add streaming support later if needed**.

5. **MCP sampling integration**: Keep `createMcpLLMClient()` separate and unchanged. MCP sampling doesn't use AI SDK providers. Only API routes go through the new provider factory. Recommended: **MCP tools stay separate, API routes use provider factory**.

6. **Testing strategy**: Create provider mocks using AI SDK's test utilities. AI SDK supports custom `fetch` implementations for testing. Create mock provider that returns fixed responses without hitting real APIs. Recommended: **Mock fetch + fixed responses per provider**.

## Follow-up Spec: `20-dynamic-llm-providers.md`

That spec will cover:
- Making provider packages optional dependencies
- Lazy loading providers only when needed
- Dynamic import patterns and error handling
- Plugin architecture for registering providers
- Reduces production dependencies significantly

## Decision Summary

**Resolved Design Questions:**
1. `LLM_PROVIDER` env var: **Hardcoded Anthropic** in this spec; multi-provider routing in spec 20
2. `createAnthropicLLMClient()` removal: **Removed entirely** in Phase 4 (no deprecation period; internal refactor)
3. `createLLMClient()` sync/async: **Synchronous** (no await; AI SDK providers are sync)
4. Wrapper specificity: **Anthropic-specific** (`anthropic-wrapper.ts`); future providers get own wrappers in spec 20
5. Old format compatibility: **All code updated to messages format**; old `prompt`/`systemPrompt` format removed entirely

