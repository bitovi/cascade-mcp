## Environment Variables

### LLM Clients

The API supports multiple LLM providers for AI-powered operations. Users can choose their provider and supply credentials via request headers.

**Supported Providers**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), AWS Bedrock, Mistral, DeepSeek, Groq, xAI (Grok)

**📖 See [LLM Provider Guide](./llm-client/providers/README.md)** for complete documentation including:
- All supported providers with authentication details
- Header and environment variable naming conventions (e.g., `X-OpenAI-Api-Key`, `OPENAI_API_KEY`)
- Usage examples for multi-tenant and single-tenant deployments
- AWS Bedrock multi-credential configuration
- Model IDs for each provider

### Optional Configuration

**`ANTHROPIC_API_KEY`** (Optional for REST API)
- Anthropic API key fallback for LLM completions
- Get your key from: https://console.anthropic.com/account/keys
- Format: `sk-ant-...` (typically 120+ characters)
- Example: `export ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXXXX...`
- **Note**: REST API routes prefer `X-Anthropic-Key` header (multi-tenant). This env var is used only when header is not provided.

**`LLM_MODEL`** (Optional)
- Override the default model ID
- Default: `claude-sonnet-4-5-20250929`
- Works with any provider (specify provider-specific model IDs)
- Example: `export LLM_MODEL=claude-sonnet-4-5-20250929`

**`DEV_CACHE_DIR`** (Optional - Development Only)
- Override the default OS temp directory for cache files
- Relative paths: Resolved from project root (e.g., `./cache`)
- Absolute paths: Used as-is (e.g., `/tmp/dev-cache`)
- Default: OS temp directory when not set
- Example: `export DEV_CACHE_DIR=./cache`

**`SAVE_FIGMA_COMMENTS_TO_CACHE`** (Optional - Development Only)
- When set to `true` or `1`, saves fetched Figma comments to cache files for debugging
- Creates `comments.md` files in the Figma file cache directory
- Includes full thread details, user summaries, and position data
- Separates unattached (file-level) comments from screen-attached comments
- Example: `export SAVE_FIGMA_COMMENTS_TO_CACHE=true`

### Quick Start

#### REST API Usage (Multi-tenant)

```bash
# Set required environment variables
export VITE_AUTH_SERVER_URL=http://localhost:3000

# Run the development server
npm run start-local

# Call API with per-request headers
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: base64(email:token)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-Anthropic-Key: sk-ant-..." \
  -d '{"epicKey": "PROJ-123"}'
```

#### Local Development (Single-tenant)

```bash
# Set API key as environment variable (fallback)
export ANTHROPIC_API_KEY=sk-ant-...
export VITE_AUTH_SERVER_URL=http://localhost:3000

# Run the development server
npm run start-local

# Call API without X-Anthropic-Key header (uses env var)
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: base64(email:token)" \
  -H "X-Figma-Token: figd_..." \
  -d '{"epicKey": "PROJ-123"}'
```

### MCP Tools Note

MCP tool connections do NOT use Anthropic API - they use MCP sampling/createMessage endpoint for LLM completions via the connected MCP client.

### Browser MCP Client

The server includes a built-in browser-based MCP client UI for testing and development. When running the server:

```bash
npm run start-local
# Open http://localhost:3000 in your browser
```

**Features:**
- OAuth authentication with PKCE flow
- Tool listing and selection
- Dynamic form generation from JSON Schema
- Sampling support via Anthropic API (direct browser calls)
- Real-time progress logging

**Development:**
```bash
# Run both client and server in dev mode
npm run dev

# Build client only
npm run build:client

# Run client dev server only (with API proxy)
npm run dev:client
```

**Architecture:**
- Frontend: Vite + React + Tailwind CSS
- MCP Client: Uses `@modelcontextprotocol/sdk` with `StreamableHTTPClientTransport`
- OAuth: Custom `OAuthClientProvider` implementation with `sessionStorage`
- Sampling: Direct Anthropic API calls from browser

## Module Responsibilities

- **server.ts** - Application Bootstrap  
  Express app setup with middleware configuration and route registration.  
  *Example*: Route registration for `/mcp` endpoints and direct imports from PKCE modules

- **mcp-service.ts** - MCP Transport Layer  
  Manages MCP HTTP transport, authentication extraction, session lifecycle, and session reconnection.  
  Sessions store transport, McpServer, EventStore, and lastActivityAt. EventStore lives on the session (not per-transport) to survive transport recreation during reconnection. A session reaper cleans up idle sessions after 10 minutes (SESSION_IDLE_THRESHOLD_MS).  
  Uses `cleanupStaleStreamMappings()` from `mcp-core/sdk-stream-mapping-fix.ts` to work around an MCP SDK bug (see that file for details).  
  *Example*: `handleMcpPost()` handles: reconnect (initialize + existing session ID → new transport, reuse McpServer + EventStore), reuse existing session, new session creation, or invalid request

- **pkce/** - OAuth 2.0 Server Implementation (Modular)  
  Modular OAuth 2.0 authorization server with PKCE support split across specialized modules:
  - **pkce/discovery.ts** - OAuth metadata endpoints and dynamic client registration
  - **pkce/authorize.ts** - Authorization endpoint with PKCE parameter handling
  - **pkce/access-token.ts** - Token exchange endpoint for authorization and refresh grants
  - **pkce/refresh-token.ts** - Refresh token grant handler with Atlassian token refresh
  - **pkce/token-helpers.ts** - JWT token creation utilities for MCP-compatible tokens

- **atlassian-auth-code-flow.ts** - Atlassian OAuth Configuration  
  Configuration for Atlassian OAuth API endpoints.  
  *Example*: `getAtlassianConfig()` - Get Atlassian OAuth configuration

- **tokens.ts** - JWT Token Management  
  Creates and validates JWT tokens that wrap Atlassian credentials for bridge authentication.  
  *Example*: `createJWT()` - Create JWT wrapper for Atlassian tokens

- **jira-mcp/index.ts** - MCP Server Core  
  Initializes MCP server with tools and manages authentication context per session.  
  *Example*: `setAuthContext()` - Store auth info per session

- **mcp-core/sdk-stream-mapping-fix.ts** - MCP SDK Bug Workaround  
  Workaround for an MCP SDK bug in `WebStandardStreamableHTTPServerTransport.replayEvents()` where the ReadableStream's `cancel()` callback doesn't clean up `_streamMapping` entries. This causes 409 Conflict on repeated browser refreshes. Should be removed when the SDK fixes the bug upstream.  
  *Example*: `cleanupStaleStreamMappings(transport, lastEventId)` called before GET /mcp requests

- **mcp-core/event-store.ts** - SSE Event Store  
  In-memory `EventStore` implementation for SSE event ID generation and resumability support.  
  Generates sequential event IDs (`{streamId}_{seq}`) and stores events for replay on reconnection.  
  EventStore is stored on `SessionData` (not per-transport) so it survives transport recreation during browser reconnection.  
  *Example*: `new InMemoryEventStore()` stored on session, passed to `StreamableHTTPServerTransport({ eventStore })` in `mcp-service.ts`

- **jira-mcp/auth-helpers.ts** - Tool Authentication  
  Provides safe authentication retrieval for tools with automatic re-auth on token expiration.  
  *Example*: `getAuthInfoSafe()` - Safe auth retrieval that throws `InvalidTokenError`

- **jira-mcp/tool-*.ts** - Individual Tool Handlers  
  Implements specific Jira operations like fetching issues, sites, and updating descriptions.  
  *Example*: `tool-get-accessible-sites.ts::handler()` - Fetch Atlassian sites

- **api/** - REST API Handlers  
  Express route handlers for PAT-authenticated REST API endpoints.
  - **api/write-shell-stories.ts** - Generate shell stories from Figma designs in a Jira epic
  - **api/write-next-story.ts** - Write the next Jira story from shell stories
  - **api/write-story.ts** - Generate or refine a Jira story description with iterative feedback
  - **api/analyze-feature-scope.ts** - Analyze feature scope from Figma designs (generates scope analysis)
  - **api/figma-review-design.ts** - Standalone Figma analysis with comment integration (no Jira required)
  - **api/identify-features.ts** - Identify in-scope and out-of-scope features from Figma
  - **api/progress-comment-manager.ts** - Progress tracking via Jira comments
  - **api/api-error-helpers.ts** - Shared error handling and validation

- **providers/atlassian/atlassian-api-client.ts** - Atlassian API Client Factory  
  Creates pre-configured clients for making authenticated Atlassian API requests.
  - `createAtlassianClient(accessToken)` - OAuth client (routes through api.atlassian.com gateway)
  - `createAtlassianClientWithPAT(base64Credentials)` - PAT client (direct site URLs)
  - `createAtlassianClientFromAuth(providerAuthInfo, siteName?)` - Routes to OAuth or PAT client based on `authType`
  - `client.fetch(url, options)` - Makes authenticated requests with token in closure
  - `client.getJiraBaseUrl(cloudId)` - Returns Jira API base URL for cloud ID
  - `client.getConfluenceBaseUrl(cloudId)` - Returns Confluence API base URL for cloud ID
  - *Note*: OAuth tokens **must** route through `api.atlassian.com/ex/{product}/{cloudId}/` gateway
  - *Example*: `const client = createAtlassianClientFromAuth(authInfo.atlassian, siteName); await client.fetch(client.getJiraBaseUrl(cloudId) + '/issue/PROJ-123')`

- **providers/atlassian/markdown-converter.ts** - Markdown ↔ ADF Conversion  
  Converts between Markdown and ADF (Atlassian Document Format) for Jira descriptions.
  - `convertMarkdownToAdf(markdown)` - Converts markdown to ADF with automatic resource link enhancement
  - `convertAdfToMarkdown(adf)` - Converts ADF to markdown for AI processing
  - `validateAdf(adf)` - Validates ADF document structure
  - **Resource Link Enhancement**: Automatically enhances resource links for better visual distinction
    - Uses `INLINE_CARD_URL_PATTERNS` array imported from adf-utils.ts
    - Confluence pages (`atlassian.net/wiki`) → inlineCard nodes (rich preview cards)
    - Google Docs (`docs.google.com/document`) → inlineCard nodes (rich preview cards)
    - Figma designs (`figma.com`) → Prepends 🎨 emoji to link text (inside the link)
    - Regular URLs remain as standard hyperlinks
  - *Example*: `await convertMarkdownToAdf('[Design](https://figma.com/file/abc)')` creates text "🎨 Design" with link mark
  - *Note*: ⚠️ NEVER use for round-trip conversions - use ADF operations directly for existing content

- **providers/atlassian/adf-utils.ts** - ADF Traversal Utilities  
  Generic traversal and manipulation utilities for ADF (Atlassian Document Format) documents.
  - **URL Pattern Constants** (single source of truth):
    - `FIGMA_URL_PATTERN` - Pattern for Figma designs (used for emoji decoration)
    - `CONFLUENCE_URL_PATTERN` - Pattern for Confluence pages (used for inlineCard conversion)
    - `GOOGLE_DOCS_URL_PATTERN` - Pattern for Google Docs (used for inlineCard conversion)
    - `INLINE_CARD_URL_PATTERNS` - Array of patterns for inlineCard conversion (Confluence + Google Docs only)
  - `traverseADF(adf, visitor)` - Depth-first traversal with visitor callback (read-only)
  - `transformADF(adf, transformer)` - Recursive transformation returning new ADF document
  - `transformADFNodes(nodes, transformer)` - Transform array of nodes (used by transformADF)
  - `extractUrlsFromADF(adf, { urlPattern })` - Extract URLs matching a pattern
  - `extractFigmaUrlsFromADF(adf)` / `extractConfluenceUrlsFromADF(adf)` / `extractGoogleDocsUrlsFromADF(adf)` - Convenience functions
  - `findNodesByType(adf, nodeType)` / `collectTextFromADF(adf)` - Query helpers

- **providers/google/google-docs-helpers.ts** - Google Docs URL Utilities  
  Utilities for extracting and parsing Google Docs URLs from Jira ADF content.
  - **URL Pattern Constant**: `GOOGLE_DOCS_URL_PATTERN` (exported from `tools/drive-doc-to-markdown/url-parser.ts`)
  - `extractGoogleDocsUrlsFromADF(adf)` - Re-exported from adf-utils.ts for backwards compatibility
  - `parseGoogleDocUrl(url)` - Parse URL and extract document ID (returns null on error)
  - `isGoogleDoc(mimeType)` - Validate MIME type is a Google Doc (not Sheets/Slides)
  - `deduplicateByDocumentId(urls)` - Remove duplicate URLs pointing to same document
  - *Note*: All URL extraction functions are now consolidated in adf-utils.ts
  - *Example*: `extractGoogleDocsUrlsFromADF(epicAdf)` returns array of Google Docs URLs

- **providers/atlassian/confluence-*.ts** - Confluence Integration  
  Extracts and processes Confluence page content from epic descriptions for additional context.
  - **confluence-helpers.ts** - URL extraction and API client (parse page URLs, fetch page content, resolve short links)
  - **confluence-cache.ts** - Caching with timestamp validation (7-day retention, invalidates on page update)
  - **confluence-relevance.ts** - LLM-based relevance scoring for each tool's decision points
  - *Example*: `extractConfluenceUrlsFromADF(epicAdf)` returns array of page URLs

- **providers/combined/tools/shared/confluence-setup.ts** - Confluence Context Orchestration  
  Main setup function for extracting and processing Confluence context from epics.
  - Extracts URLs, fetches pages, converts to markdown, scores relevance
  - Returns documents sorted by relevance for each tool (analyzeScope, writeStories, writeNextStory)
  - Caches results with Confluence version-based invalidation
  - *Example*: `setupConfluenceContext({ epicAdf, atlassianClient, generateText, siteName })`

- **providers/combined/tools/shared/google-docs-setup.ts** - Google Docs Context Orchestration  
  Main setup function for extracting and processing Google Docs context from epics.
  - Extracts URLs, fetches documents via Drive API, converts to markdown, scores relevance
  - Returns documents sorted by relevance for each tool (analyzeScope, writeStories, writeNextStory)
  - Caches results with modifiedTime-based invalidation in `cache/google-docs/{documentId}/`
  - Exports shared `DocumentContext` type for unified prompt context
  - Handles errors gracefully: skips inaccessible docs with warnings, continues processing
  - *Example*: `setupGoogleDocsContext({ epicAdf, googleClient, generateText })`

- **providers/google/google-docs-cache.ts** - Google Docs Caching  
  Cache management for Google Docs content with version-based invalidation.
  - `getGoogleDocCachePath(documentId)` - Returns cache directory path
  - `loadGoogleDocMetadata(documentId)` / `saveGoogleDocMetadata(...)` - Metadata operations
  - `loadGoogleDocMarkdown(documentId)` / `saveGoogleDocMarkdown(...)` - Content operations
  - `ensureValidCacheForGoogleDoc(documentId, modifiedTime)` - Validate/clear stale cache
  - Cache includes relevance scores to avoid re-scoring unchanged documents

- **providers/figma/screen-analyses-workflow/** - Consolidated Figma Screen Analysis  
  Unified workflow for analyzing Figma screens with AI-generated documentation.
  - **Shared Pipeline**: `fetchFrameData(urls, figmaClient, options)` - Shared data-fetching pipeline (URL parsing → node fetching → images → annotations → ordering). Used by both `analyzeScreens` and `figma-ask-scope-questions-for-page`.
  - **Main Entry Point**: `analyzeScreens(urls, figmaClient, generateText, options)` - Complete workflow from URLs to documented frames. Delegates to `fetchFrameData()` then adds LLM-powered analysis.
  - **Features**: Semantic XML generation, meta-first caching (tier 3 API), node caching, comment/note association
  - **Options**: `imageOptions` (format, scale), `analysisOptions` (contextMarkdown, systemPrompt), `notify` (progress callback)
  - **Returns**: `FrameAnalysisResult` with `frames: AnalyzedFrame[]` and `figmaFileUrl`
  - **Types**: `AnalyzedFrame`, `FrameAnnotation`, `ScreenAnalysisOptions`, `FetchFrameDataResult`, `FetchFrameDataOptions`
  - **Modules**: frame-data-fetcher, url-processor, frame-expander, annotation-associator, cache-validator, image-downloader, screen-analyzer
  - *Used by*: `figma-review-design`, `figma-ask-scope-questions-for-page`, `write-story`, `review-work-item` (via context-loader adapter)
  - *Example*: `analyzeScreens(['https://figma.com/...'], client, generateText, { analysisOptions: { contextMarkdown } })`

- **providers/figma/scope-cache.ts** 🆕 - Server-Side Scope Cache (spec 067)
  - Short-lived cache for design review workflow — stores frame data while agents process frames one at a time
  - **TTL**: 10-minute lifetime, 5-minute extension on access, lazy cleanup on next write
  - **Structure**: `cache/figma-scope/{fileKey}/frames/{nodeId}/` with `image.png`, `context.md`, `structure.xml` + `prompts/` dir
  - **cacheToken format**: `{fileKey}-{timestamp}` — used by `figma-frame-analysis` to retrieve cached data
  - **Exports**: `createScopeCache(input)`, `getScopeCacheEntry(cacheToken, fileKey)`, `readCachedFrameData(fileKey, nodeId)`, `cleanupExpiredScopeCaches()`

- **llm-client/** - LLM Client Integration (Vercel AI SDK)  
  Abstracts LLM access for API routes (Anthropic via AI SDK). MCP tools use MCP sampling separately.
  - **llm-client/types.ts** - Core types: `LLMRequest` (messages array), `LLMResponse`, `GenerateTextFn`
  - **llm-client/provider-factory.ts** - `createLLMClient({ apiKey? })` - Creates Anthropic client (API key from header or env)
  - **llm-client/anthropic-wrapper.ts** - Wraps AI SDK's `generateText()` to match `GenerateTextFn` interface
  - **llm-client/anthropic-config.ts** - Configuration and validation for Anthropic provider
  - **llm-client/mcp-sampling-client.ts** - `createMcpLLMClient()` - For MCP tools only (uses sampling)
  - **llm-client/anthropic-config.ts** - Anthropic configuration and validation
  - **llm-client/anthropic-wrapper.ts** - Wraps AI SDK's `generateText()` to implement `GenerateTextFn`
  - **llm-client/migration-helpers.ts** - Helpers for converting old format to messages: `createUserMessage()`, `createSystemMessage()`, `convertPromptToMessages()`
  - **llm-client/mcp-sampling-client.ts** - UNCHANGED: MCP tools still use this for MCP sampling
  - *Example*: `const generateText = createLLMClient(); await generateText({ messages: [...] })`

- **api/progress-comment-manager.ts** - Progress Comment Management  
  Manages creating and updating progress comments on Jira issues during long-running operations.
  - **Lazy Initialization**: Comment created on first progress notification
  - **Real-time Updates**: Continuously updates comment with new progress messages as numbered list
  - **Error Handling**: Appends error details with two-part format (indicator + full details)
  - **Graceful Degradation**: Falls back to console-only after 3 consecutive comment failures
  - **Always Logs**: Console.log() backup ensures progress is always visible
  *Example*: `createProgressCommentManager(context)` - Create manager for an operation

## MCP Prompts

Cascade MCP exposes prompts as agent entry points for end-to-end workflows. Each prompt tells the agent to call a corresponding context tool that returns all necessary data and embedded prompts.

**Pattern: Prompt + Context Tool Pairs (spec 061)**

Each workflow = 1 MCP prompt (discovered via `prompts/list`) + 1 context tool (returns all data + all embedded prompts):

> **Note:** `figma-ask-scope-questions-for-page` uses a self-contained pattern instead — the tool returns workflow instructions directly in its response, with no separate prompt needed.

### prompt-write-story
- **Purpose**: Generate or refine a Jira story description from hierarchy context
- **Arguments**: `issueKey` (required), `siteName` (required)
- **Context Tool**: `write-story-context`
- **Workflow**: Agent calls context tool → receives issue hierarchy, comments, existing description, linked resource URLs, and embedded story-writing prompt → generates story content → updates Jira via `atlassian-update-issue-description`

**Architecture:** Context tools return data as `text` blocks and prompts as `resource` blocks with `annotations.audience: ['assistant']` and `priority` ordering.

## MCP Resources

Cascade MCP exposes static resources that agents can read via `resources/list` and `resources/read`. Resources require no authentication — they return static text (prompt instructions or workflow orchestration documents).

**Source:** `server/mcp-resources/` — registered in `server/mcp-core/server-factory.ts` via `registerAllResources()`.

### Prompt Resources

Prompt resources expose the same prompt text that `figma-ask-scope-questions-for-page` embeds in its tool response, as independently readable MCP resources. Both share the same source constants (`prompt-constants.ts`) to maintain a single source of truth.

| URI | Description |
|-----|-------------|
| `prompt://frame-analysis` | Frame analysis instructions — how to analyze a single Figma frame using its image, context, and semantic XML |
| `prompt://scope-synthesis` | Scope synthesis instructions — how to combine frame analyses into a cross-screen scope analysis |
| `prompt://generate-questions` | Question generation instructions — how to produce frame-specific clarifying questions from analyses |
| `prompt://write-story-content` | Story writing instructions — how to write or refine a Jira story from hierarchy context |

### Workflow Resources

Workflow resources are multi-step orchestration documents that instruct agents how to execute complex workflows, including subagent parallelization.

| URI | Description |
|-----|-------------|
| `workflow://review-design` | Design review questions workflow — batch fetch Figma data → cache on server → fork MCP-capable subagent per frame → join → synthesize scope → generate questions |

**Hybrid Pattern (spec 063):** The `workflow://review-design` resource implements a "Server Batch + Local Files + Subagents" pattern:
1. Server efficiently batch-fetches all Figma data (2 Tier 1 + 1 Tier 2 + 1 Tier 3 API calls)
2. Server writes frame data to scope cache (`cache/figma-scope/`), returns lightweight manifest
3. One subagent per frame analyzes independently (parallel) — subagents MUST have MCP tool access (not read-only/explore agents)
4. Orchestrating agent synthesizes and generates questions

## Available MCP Tools

### Standard Atlassian Tools

- **atlassian-get-sites** - List accessible Atlassian cloud sites
- **atlassian-get-issue** - Retrieve complete Jira issue details with ADF description
- **atlassian-get-attachments** - Fetch issue attachments by ID
- **atlassian-update-issue-description** - Update issue description with markdown (converts to ADF)
- **atlassian-add-comment** 🆕 - Post a comment to a Jira issue (accepts markdown, converts to ADF)
- **atlassian-update-comment** 🆕 - Update an existing Jira comment by ID (accepts markdown, replaces full body)
  - Parameters: `issueKey`, `commentId` (from atlassian-add-comment), `comment` (markdown), optional `cloudId`, `siteName`
  - Used by: `answer-questions` sub-skill for incremental Q&A comment building

### Figma Tools

- **figma-get-layers-for-page** - Get list of frames/layers from a Figma page
  - Returns frame metadata with node IDs
  - Parameters: `url` (Figma page URL)
  - Use with: orchestration workflows to discover frames for analysis

- **figma-get-image-download** - Download frame screenshot as base64 image
  - Returns base64 image data + MIME type
  - Parameters: `url`, `nodeId`, `format` (png/jpg/svg/pdf), `scale` (1-4)

- **figma-get-metadata-for-layer** - Get full node metadata including tree structure
  - Returns complete node metadata
  - Parameters: `url`, `nodeId`

- **figma-ask-scope-questions-for-page** 🆕 - Self-contained design review scope questions tool
  - Uses shared `fetchFrameData()` pipeline for data fetching (same as `figma-review-design`)
  - Fetches all frame data, writes to server-side scope cache (`cache/figma-scope/`), returns lightweight manifest (~3-5KB)
  - Manifest includes cacheToken, frame metadata, and workflow instructions referencing `figma-frame-analysis` and MCP resources (`prompt://scope-synthesis`, `prompt://generate-questions`)
  - Sends progress notifications during data fetching (via `createProgressNotifier`)
  - Workflow supports parallel subagent processing: one MCP-capable agent per frame, each calling `figma-frame-analysis` (instructions explicitly require MCP tool access, not read-only/explore subagents)
  - Parameters: `url` (Figma page URL), `context` (optional description)
  - Returns spatial ordering manifest for consistent left-to-right, top-to-bottom processing

- **figma-frame-analysis** 🆕 - Per-frame analysis retrieval tool (spec 067)
  - Returns one frame's image + context markdown + semantic XML + analysis prompt
  - With `cacheToken`: reads from server-side scope cache (0 Figma API calls)
  - Without `cacheToken`: fetches directly from Figma API (standalone mode, scale:1)
  - Parameters: `url` (Figma frame URL, required), `cacheToken` (optional string)
  - Includes XML truncation for large frames (>50KB) via `truncateSemanticXml()`

- **figma-batch-load** 🆕 - Batch-fetch Figma data for multiple URLs across files
  - Returns a one-time download URL for a zip containing frame images, semantic XML, and analysis prompts
  - Agent uses `curl` + `unzip` to extract to `.temp/cascade/figma/`
  - Manifest includes per-frame `width` and `height` (from Figma `absoluteBoundingBox`) for comment positioning
  - API budget per file: 1 Tier 3 (meta) + 1 Tier 1 (nodes) + 1 Tier 1 (images)
  - Comments NOT included — use `figma-get-comments` separately
  - Parameters: `requests` (array of `{ url, label? }`), `context` (optional)
  - Returns: `{ downloadUrl, expiresAt, manifest, saveInstructions }`

- **figma-post-comment** 🆕 - Post a comment to a Figma file
  - Optionally pin to a specific node via `nodeId`
  - Optionally position within frame via `nodeOffset` (`{ x, y }` relative to frame origin)
  - Use `x: -50` for left edge placement, distribute `y` between 50 and (height-50) for spacing
  - Parameters: `fileKey`, `message`, `nodeId` (optional), `nodeOffset` (optional)
  - Returns: `{ success, commentId, fileKey, nodeId }`

- **figma-get-comments** 🆕 - Read existing comment threads from a Figma file
  - Always fetches fresh (no caching — comments have no timestamp invalidation)
  - Returns formatted markdown of comment threads
  - Parameters: `fileKey`, `nodeId` (optional filter)

### Google Drive Tools

- **google-drive-doc-to-markdown** - Convert Google Drive documents to markdown format
  - Fetches Google Docs via Drive API, exports as HTML, converts to GitHub-flavored Markdown using Turndown
  - Preserves formatting: headings, bold, italic, strikethrough, lists, tables, links, images, code blocks
  - Special character normalization (smart quotes → straight quotes, em-dashes, etc.)
  - Comprehensive error handling: permission denied, document not found, unsupported types, file size limits
  - Supports both OAuth (user-delegated) and Service Account authentication
  - Returns: markdown content, document metadata, conversion warnings, processing time
  - Parameters: `url` (Google Doc URL or document ID)
  - Example: `google-drive-doc-to-markdown({ url: "https://docs.google.com/document/d/abc123/edit" })`
  - Available as MCP tool only
  - Limitations: Google Docs only (not Sheets/Slides/PDFs), max 10MB document size

### Google Sheets Tools

- **sheets-list-spreadsheets** - List spreadsheets accessible to the authenticated user
  - Uses Drive API `files.list` with spreadsheet mimeType filter
  - Optional name substring filtering to narrow results
  - Sorted by most recently modified
  - Parameters: `nameFilter` (optional, substring search), `maxResults` (optional, default 25)
  - Example: `sheets-list-spreadsheets({ nameFilter: "Budget" })`
  - Returns: spreadsheet name, ID, modified time, and link for each result

- **sheets-get-info** - Get spreadsheet metadata
  - Retrieves title, locale, URL, and details for each sheet tab (name, dimensions, frozen rows/columns)
  - Parameters: `spreadsheetId` (required)
  - Example: `sheets-get-info({ spreadsheetId: "1a2b3c4d..." })`
  - Returns: formatted metadata including per-tab grid dimensions

- **sheets-read-values** - Read cell values from a range
  - Reads values using A1 notation and returns a formatted markdown table
  - Large results (>100 data rows) are truncated with a row count summary
  - Parameters: `spreadsheetId` (required), `range` (optional, default `A1:Z1000`)
  - Example: `sheets-read-values({ spreadsheetId: "1a2b3c4d...", range: "Sheet1!A1:D10" })`
  - Returns: markdown table of cell values with row count

- **sheets-write-values** - Write or clear cell values
  - Writes a 2D array of values to a range, or clears a range
  - Supports `USER_ENTERED` (parses formulas/formats) and `RAW` input modes
  - Parameters: `spreadsheetId` (required), `range` (required), `values` (JSON 2D array string), `valueInputOption` (optional, default `USER_ENTERED`), `clearValues` (optional boolean)
  - Example (write): `sheets-write-values({ spreadsheetId: "1a2b3c4d...", range: "Sheet1!A1:B2", values: "[[\\"Name\\",\\"Age\\"],[\\"Alice\\",\\"30\\"]]" })`
  - Example (clear): `sheets-write-values({ spreadsheetId: "1a2b3c4d...", range: "Sheet1!A1:B2", clearValues: true })`
  - Returns: updated range, row/column/cell counts

### Utility Tools

- **utility-test-sampling** - Test MCP sampling functionality
- **utility-notifications** - Test MCP notification patterns
- **utility-test-multi-step-workflow** - Test multi-step workflows and subagent behavior

### Combined Provider Tools
Advanced workflow tools that integrate multiple services:

- **extract-linked-resources** 🆕 - Universal URL fetcher that returns content + discovered links
  - Takes a single URL (Jira, Confluence, Google Doc, Google Sheet) and returns markdown with YAML frontmatter
  - Frontmatter includes `discoveredLinks` categorized by type (figma, confluence, jira, googleDocs, googleSheets)
  - For Jira: includes relationship info (parent, blocks, relates-to) on discovered Jira links
  - For Jira: includes paginated comments with `hasMoreComments` / `commentsStartAt` support
  - For Confluence: extracts links from page body ADF
  - For Google Docs: extracts URLs via regex from markdown content
  - For Figma URLs: returns a message to use `figma-batch-load` instead
  - Auto-routes auth: Atlassian token for Jira/Confluence, Google token for Docs/Sheets
  - Parameters: `url` (required), `siteName` (optional), `commentsStartAt` (optional)
  - REST API: `POST /api/extract-linked-resources`
  - Used by: generate-questions, write-story, review-design skills (Phase 1 + iterative loading)

- **write-story-context** 🆕 - Context tool for story writing workflow
  - Returns all data needed by `prompt-write-story`: issue hierarchy, comments, existing description, linked resource URLs
  - Bundles embedded story-writing prompt with system instructions and all context
  - Parameters: `issueKey`, `siteName`
  - Does NOT call LLMs or update Jira — agent handles generation and updates
  - Returns linked Figma/Confluence/Google Docs URLs for agent to fetch separately if needed

- **analyze-feature-scope** ⚠️ **DEPRECATED** - Use `write-shell-stories` instead
  - **Migration**: `write-shell-stories` now includes automatic scope analysis (see below)
  - Analyzes screens against epic requirements to identify in-scope/out-of-scope features
  - Categorizes features as: ✅ confirmed, ❌ out-of-scope, ❓ needs-clarification, ⏬ low-priority
  - Updates epic description with structured scope analysis grouped by feature areas
  - **Documentation Context**: Automatically extracts and uses linked Confluence pages and Google Docs for additional requirements context
  - Parameters: `epicKey`, `figmaUrl`, optional `cloudId`
  - Example: `analyze-feature-scope({ epicKey: "PLAY-123", figmaUrl: "https://..." })`
  - **Deprecated**: Run `write-shell-stories` directly instead - it handles scope analysis automatically

- **figma-review-design** - Standalone Figma design analysis without Jira integration
  - Analyzes Figma screens independently of Jira epics
  - **Figma Comments Integration**: Reads existing comments as context, posts AI-generated questions back
  - Categorizes features as: ✅ confirmed, ❌ out-of-scope, ❓ needs-clarification, ⏬ low-priority
  - Returns scope analysis as markdown (does not write to Jira)
  - **Rate Limit Handling**: Respects Figma's 25 req/min limit with consolidation fallback
  - Parameters: `figmaUrls` (array), optional `contextDescription`
  - Example: `figma-review-design({ figmaUrls: ["https://..."], contextDescription: "Mobile app onboarding" })`
  - Dual interface: Available as MCP tool and REST API endpoint `/api/figma-review-design`
  - **Authentication**: Requires Figma auth only (no Atlassian needed)

- **write-shell-stories** - Generate shell user stories from Figma designs
  - **Automatic Scope Analysis**: Runs scope analysis internally if no "## Scope Analysis" section exists
  - **Question-Based Decision**: Counts unanswered questions (❓) and either:
    - ≤5 questions: Proceeds with creating shell stories
    - >5 questions: Creates Scope Analysis section, asks user to answer questions and re-run
  - **Iterative Refinement**: On re-run, regenerates analysis with 💬 markers for answered questions
  - **Figma Comments Integration**: Reads Figma comment threads to infer answered questions
  - Creates prioritized shell stories based on scope analysis categorizations
  - Organizes features into incremental delivery plan (stories)
  - **Documentation Context**: References linked Confluence pages and Google Docs for story planning
  - Updates epic description with shell stories section
  - Parameters: `epicKey`, optional `cloudId` or `siteName`

- **write-next-story** - Write the next Jira story from shell stories
  - **PREREQUISITE**: Epic must have shell stories (run write-shell-stories first)
  - Generates detailed Jira story with acceptance criteria from shell story
  - Validates dependencies before writing each story
  - **Documentation Context**: Includes relevant Confluence and Google Docs technical documentation
  - Parameters: `epicKey`, optional `cloudId` or `siteName`

- **review-work-item** - Review a Jira work item and identify gaps/questions
  - Gathers context from parent hierarchy, linked Confluence docs, and project description
  - **Figma Analysis**: Downloads and analyzes linked Figma screens with AI vision
  - Generates comprehensive review questions grouped by feature area
  - Posts review as a Jira comment for team discussion
  - Identifies Definition of Ready compliance issues
  - Parameters: `issueKey`, optional `cloudId`, `siteName`, `maxDepth`
  - Example: `review-work-item({ issueKey: "PLAY-456" })`

- **write-story** - Generate or refine a Jira story description with iterative feedback
  - **Timestamp-Based Change Detection**: Only re-generates when context actually changes
  - **Scope Analysis Section**: Uses ❓/💬 markers to track unanswered/answered questions
  - **Multi-Source Context**: Gathers parent/child issues, comments, linked Confluence docs, Figma designs
  - **Inline Answer Detection**: Recognizes answers added directly in the description (at ❓ questions)
  - **Comment Answer Detection**: Recognizes answers in Jira comments that reference question text
  - **Iterative Refinement**: Re-run to incorporate new answers and update scope analysis
  - Generates: Overview, Scope Analysis (with ❓/💬 markers), Acceptance Criteria, Technical Notes
  - Parameters: `issueKey`, optional `cloudId`, `siteName`, `maxDepth`
  - Example: `write-story({ issueKey: "PLAY-789" })`
  - **Workflow**: Run once to generate story → Answer questions → Re-run to refine

**Documentation Context Feature**: 
All combined tools automatically extract and process Confluence page and Google Docs links from the epic description:
- PRDs (Product Requirement Documents) - Used for feature identification and acceptance criteria
- Technical architecture docs - Used for implementation constraints and API references
- Definition of Done - Linked (not duplicated) in generated stories
- **Confluence**: Cached with timestamp-based validation (7-day retention)
- **Google Docs**: Cached with modifiedTime-based validation (invalidates when doc changes)
- Scored for relevance to each tool's specific needs using shared `DOCS_RELEVANCE_THRESHOLD`
- Prompts include `[Confluence]` or `[Google Docs]` source tags for AI disambiguation

### ChatGPT-Compatible Tools
These tools follow OpenAI's MCP specification patterns for optimal ChatGPT integration:

- **fetch** - Fetch Jira issue by key
  - Returns standardized document format: `{ id, title, text, url, metadata }`
  - Description converted from ADF to markdown for readability
  - Metadata includes: status, assignee, reporter, priority, issueType, created, updated, project
  - Example: `fetch({ issueKey: "PLAY-38" })`

- **search** - Search Jira issues using JQL
  - Input: JQL query string and optional maxResults (default: 25)
  - Returns array of document summaries
  - Each result includes: issue key, summary, status, assignee, due date, priority
  - Example: `search({ jql: "project = PLAY AND status = 'In Progress'", maxResults: 10 })`

**Key Differences:**
- **Standard tools**: Return full Jira API responses with ADF formatting
- **ChatGPT tools**: Return simplified document format with markdown text
- **Combined tools**: Multi-service workflows with AI-powered analysis
- **All tools are always available** - use based on client needs (VS Code Copilot vs ChatGPT)

## REST API Endpoints (PAT Authentication)

All REST endpoints accept PAT (Personal Access Token) authentication via headers.

### Figma Endpoints

- **POST /api/figma-batch-load** — Batch-fetch Figma frames → zip download URL
  - Header: `X-Figma-Token`
  - Body: `{ requests: [{ url, label? }], context? }`

- **POST /api/figma-post-comment** — Post a comment to a Figma file
  - Header: `X-Figma-Token`
  - Body: `{ fileKey, message, nodeId? }`

- **GET /api/figma-get-comments** — Read comment threads from a Figma file
  - Header: `X-Figma-Token`
  - Query: `?fileKey=abc123&nodeId=123:456` (nodeId optional)

### Atlassian Endpoints

- **POST /api/atlassian-add-comment** — Post a comment to a Jira issue
  - Header: `X-Atlassian-Token` (format: `email:api-token`)
  - Body: `{ issueKey, comment, cloudId?, siteName? }`

- **PUT /api/atlassian-update-comment** — Update an existing Jira comment
  - Header: `X-Atlassian-Token` (format: `email:api-token`)
  - Body: `{ issueKey, commentId, comment, cloudId?, siteName? }`

### Cross-Provider Endpoints

- **POST /api/extract-linked-resources** — Fetch a URL and return content + discovered links
  - Header: `X-Atlassian-Token` for Jira/Confluence, `X-Google-Token` for Google Docs/Sheets
  - Body: `{ url, siteName?, commentsStartAt? }`
  - Returns: `{ success, content }` where `content` is markdown with YAML frontmatter

### Download Endpoint

- **GET /dl/:token** — One-time zip download (no auth header required)
  - Token is the auth mechanism (UUID, single-use, 10-minute TTL)
  - Returns the zip file as `application/zip` with `Content-Disposition: attachment`
  - Used by agent skills to download `figma-batch-load` results via `curl`

## Plugin Skills

The `plugins/cascade-mcp/` directory contains AI agent skills packaged as a `.claude-plugin` plugin. Skills are SKILL.md instruction files that guide agents through multi-step workflows.

### Plugin Structure

```
plugins/cascade-mcp/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest + MCP server config
├── README.md                 # Install instructions
└── skills/
    ├── load-content/         # Sub-skill: batch-fetch data
    ├── analyze-content/      # Sub-skill: orchestrate frame analysis
    ├── analyze-figma-frame/  # Sub-skill: per-frame subagent analysis
    ├── scope-analysis/       # Sub-skill: synthesize feature scope
    ├── generate-questions/   # Parent: load → analyze → generate questions
    ├── post-questions-to-figma/  # Parent: post questions as Figma comments
    ├── post-questions-to-jira/   # Parent: post questions as Jira comment
    ├── review-design/        # Parent: end-to-end review workflow
    └── write-story/          # Parent: write story from design analysis
```

### How Skills Interact with MCP Tools

1. Skills call `figma-batch-load` to get a zip download URL
2. Agent runs `curl` + `unzip` to save data to `.temp/cascade/figma/`
3. Sub-skills read from the local filesystem (no further MCP calls for cached data)
4. Results posted via `figma-post-comment`, `atlassian-add-comment`, or `atlassian-update-issue-description`

## Key Authentication Patterns

### MCP PAT Authentication (Personal Access Tokens)

MCP clients can authenticate using Personal Access Tokens via HTTP headers instead of the OAuth PKCE flow. This enables headless/cloud-hosted AI agents (e.g., GitHub Copilot agent), programmatic MCP clients, and simpler local development.

**Supported headers:**
- `X-Atlassian-Token` — Base64-encoded `email:api_token` for Jira/Confluence
- `X-Figma-Token` — Figma personal access token
- `X-Google-Token` — RSA-encrypted Google service account JSON

At least one provider token must be present. PAT auth bypasses the OAuth PKCE flow entirely.

**Auth fallback chain:** JWT Bearer → Query param JWT → PAT headers. If a JWT is present, PAT headers are ignored. A session is either fully OAuth or fully PAT.

**Key differences from OAuth:**
- PATs don't expire in the auth store (no `expires_at` / `refresh_token`)
- Invalid PATs return tool errors, not `WWW-Authenticate` 401s (no OAuth re-auth flow)
- Atlassian PATs require `siteName` in tool parameters (PAT clients use `{siteName}.atlassian.net` directly instead of the OAuth API gateway)

**Example: Initialize an MCP session with PATs:**
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: base64(email:api_token)" \
  -H "X-Figma-Token: figd_..." \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "my-client", "version": "1.0" }
    },
    "id": 1
  }'
```

**Internal routing:** MCP tools use `createAtlassianClientFromAuth(authInfo.atlassian, siteName)` which automatically selects `Bearer` auth (OAuth) or `Basic` auth (PAT) based on `authType`.

### Environment Variables

#### DEV_CACHE_DIR (Optional - Development Only)

Override the default OS temp directory for cache files.

- **Relative paths**: Resolved from project root (e.g., `./cache`)
- **Absolute paths**: Used as-is (e.g., `/tmp/dev-cache`)
- **Default**: OS temp directory when not set

Example:
```bash
export DEV_CACHE_DIR=./cache
npm run start-local
```

Cache structure with override:
```
<project-root>/cache/
  ├── {sessionId}/
  │   ├── {epicKey}/
  │   │   ├── screens.yaml
  │   │   ├── {screen-name}.png
  │   │   ├── {screen-name}.analysis.md
  │   │   └── ...
```

**Note**: In dev mode, directories are NOT automatically cleaned up. This preserves debugging artifacts across sessions.

### JWT Token Structure
```javascript
{
  "sub": "user-{uuid}",
  "iss": "http://localhost:3000", 
  "aud": "http://localhost:3000",
  "scope": "read:jira-work write:jira-work offline_access",
  "atlassian_access_token": "eyJraWQ...", // Embedded Atlassian token
  "refresh_token": "eyJraWQ...",           // Embedded refresh token
  "iat": 1756506221,
  "exp": 1756509761                       // JWT expiration (1min before Atlassian)
}
```

### Session Flow Pattern
1. **Transport Creation**: `StreamableHTTPServerTransport` with unique session ID and `InMemoryEventStore`
2. **Auth Storage**: `setAuthContext(sessionId, authInfo)` stores JWT payload
3. **Tool Access**: `getAuthInfoSafe(context)` retrieves via session ID
4. **SSE Streaming**: POST responses use `text/event-stream` with event IDs (format: `{streamId}_{seq}`)
5. **Error Handling**: `InvalidTokenError` triggers OAuth re-authentication
6. **Cleanup**: Grace period → reaper → `clearAuthContext(sessionId)` (see below)

### Session Reconnection (Phase 1)

Supports reconnecting to an existing server session after a browser page refresh.

**Server side (`mcp-service.ts`):**
- Sessions have a `lastActivityAt` timestamp, updated on every POST/GET.
- On transport close, a **grace period** (10 minutes) keeps the session alive instead of deleting it immediately.
- A **session reaper** runs every 60 seconds. If a session has been idle for >2 minutes without a grace timer, one is started.
- `handleMcpPost` is refactored into four helper functions:
  1. `handleSessionReconnect()` — `mcp-session-id` + existing session + `initialize` method. Cancels grace timer, updates auth context, returns a synthetic init response.
  2. `handleExistingSession()` — existing session, non-initialize request (normal reuse).
  3. `handleNewSession()` — no session ID + `initialize` (fresh connection).
  4. `handleInvalidRequest()` — everything else → 400.
- `MCP_SERVER_INFO` and `MCP_SERVER_CAPABILITIES` are exported from `server-factory.ts` so the synthetic init response stays in sync with `createMcpServer()`.

**Client side (`BrowserMcpClient`):**
- `connect()` persists `mcp_session_id` to `localStorage` after successful connection.
- `reconnect(serverUrl)` reads the stored session ID, creates an `OAuthClientProvider` on demand, reads tokens from `localStorage` (no `auth()` redirect), pre-sets the session ID on the transport, and calls `client.connect()`. Server returns synthetic init response.
- `disconnect()` and `clearTokens()` clear `mcp_session_id` from `localStorage`.
- `setupClientAndHandlers()` is a shared helper used by both `connect()` and `reconnect()`.

**React hook (`useMcpClient`):**
- On mount, the auto-reconnect path tries `reconnect()` first, falls back to `connect()`.
- `'reconnecting'` added to `ConnectionStatus` type.

**UI (`App.tsx`):**
- `result` and selected tool name are persisted to `localStorage` and restored on mount.
- Cleared on explicit disconnect.

### Error Recovery
- **401 Responses**: Include `WWW-Authenticate` header with OAuth metadata
- **Token Expiration**: Tools throw `InvalidTokenError` for automatic refresh
- **Session Management**: Grace period + reaper prevent both premature cleanup and memory leaks

### Request Debouncing

**Purpose**: Prevents duplicate requests from fat-finger double-clicks on Jira automation buttons.

**Implementation**:
- 5-second debounce window per tool + site + issue/epic combination
- Dedup key format: `toolName:siteName:issueKey` (e.g., `write-shell-stories:bitovi:PROJ-123`)
- Different tools can run concurrently on the same issue
- Different Jira sites with same issue key are treated independently

**Protected Endpoints**:
- `POST /api/write-shell-stories` (REST) and `write-shell-stories` (MCP)
- Can be extended to other long-running tools as needed

**Response on Duplicate**:
- REST API: `409 Conflict` with message indicating retry time
- MCP: Text content with user-friendly message
- Example: `"A write-shell-stories operation was already requested for PROJ-123 within the last 3 seconds. Please wait 3 more seconds before retrying."`

**Automatic Cleanup**: Entries older than 5 seconds are lazily removed on subsequent requests.

**Testing**: See `server/utils/__tests__/request-debounce.test.ts` for unit tests covering edge cases.

### Content Size Limits

Jira Cloud has a **43,838 character limit** for description fields (applies to the entire JSON representation of the ADF document).

**Automatic Handling in `write-shell-stories`**:
- When adding Shell Stories would exceed this limit, the tool automatically moves the `## Scope Analysis` section to a comment
- **Priority**: Shell Stories remain in the description (required by `write-next-story` tool)
- **Preservation**: Scope Analysis is preserved in a comment with a note explaining the move
- **Safety Margin**: Uses a 2KB buffer (41,838 chars) to account for serialization variations
- **Error Handling**: If content exceeds the safe limit, logs a warning but attempts the update anyway (Jira will reject if truly too large)

This ensures both sections are preserved while keeping the description within Jira's limits.

## Integration Points

### External APIs
- **Atlassian OAuth**: `https://auth.atlassian.com/oauth/token` ([RFC 6749](https://tools.ietf.org/html/rfc6749))
- **Atlassian Sites**: `https://api.atlassian.com/oauth/token/accessible-resources` ([Atlassian OAuth API](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/))
- **Jira REST API**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/` ([Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/))

### MCP Protocol Compliance
- **Protocol Version**: `2025-06-18` ([MCP Specification](https://modelcontextprotocol.io/docs/specification))
- **Transport**: HTTP + SSE hybrid ([MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport))
- **Authentication**: OAuth 2.0 with JWT bearer tokens ([RFC 6750](https://tools.ietf.org/html/rfc6750), [RFC 7519](https://tools.ietf.org/html/rfc7519))
- **Tools**: JSON-RPC 2.0 compatible tool interface ([JSON-RPC 2.0](https://www.jsonrpc.org/specification), [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools))

### VS Code Client Compatibility
- **Client Detection**: User-Agent `"node"` and MCP clientInfo `"Visual Studio Code"` ([VS Code Copilot Agent Spec](../specs/vs-code-copilot/readme.md))
- **OAuth Parameters**: Conditional `resource_metadata_url` vs `resource_metadata` ([RFC 9728 Section 5.1](https://tools.ietf.org/html/rfc9728#section-5.1))

### Browser Session Reconnection

Supports browser reconnection after page refresh during long-running tool execution (spec 778c).

**Server-side (`mcp-service.ts`):**
- `SessionData` stores `transport`, `mcpServer`, `eventStore`, and `lastActivityAt`
- `EventStore` lives on the session, not the transport — survives transport recreation during reconnection
- Session reaper cleans up idle sessions after 10 minutes (`SESSION_IDLE_THRESHOLD_MS`)
- When a client sends `initialize` with an existing `mcp-session-id`, the server creates a **new transport** while keeping the existing `McpServer` and `EventStore`
- `lastActivityAt` is updated on every POST/GET request

**Client-side (`src/mcp-client/client.ts`):**
- `persistReconnectionState()` saves `mcp_session_id`, `mcp_server_url`, and `mcp_last_event_id` to `localStorage` continuously via `onresumptiontoken` callback
- `reconnect(serverUrl)` creates a new transport with the stored `sessionId`, connects, and calls `resumeStream(lastEventId)` to replay missed SSE events
- `clearReconnectionState()` removes all persisted state on explicit disconnect
- `callTool()` automatically injects `onresumptiontoken` to persist event IDs during tool execution
- `reconnect()` wraps `transport.onmessage` to intercept replayed JSON-RPC responses (tool results) that the SDK would otherwise drop (since the new client has no response handler for the original request ID)
- New `reconnecting` connection status for UI feedback (blue pulsing indicator)

**React hook (`src/react/hooks/useMcpClient.ts`):**
- On page load: tries MCP session reconnection first, falls back to OAuth auto-reconnect
- Automatically fetches tools after successful reconnection

**E2E test (`test/e2e/reconnection.test.ts`):**
- Validates the full flow: connect → start tool → destroy client → reconnect → receive remaining events

**E2E test (`test/e2e/claude-agent-review-design.test.ts`):** 🆕
- Uses [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript) (`@anthropic-ai/claude-agent-sdk`) to connect to MCP server
- Runs the full design review workflow: `figma-ask-scope-questions-for-page` → `figma-frame-analysis` per frame → synthesis → questions
- Auth: unsigned test JWT with Figma PAT (works because `parseJWT()` doesn't verify signatures)
- Required env vars: `ANTHROPIC_API_KEY`, `FIGMA_TEST_PAT`, `FIGMA_TEST_URL`
- Run: `npm run test:e2e:claude-agent`
- Test output saved to `temp/claude-agent-review-design-*.json` for inspection

## References

### OAuth 2.0 and Extensions
- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 6750 - OAuth 2.0 Bearer Token Usage](https://tools.ietf.org/html/rfc6750)
- [RFC 7636 - Proof Key for Code Exchange (PKCE)](https://tools.ietf.org/html/rfc7636)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://tools.ietf.org/html/rfc8414)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)

### JWT and Security
- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)

### MCP Protocol
- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs/specification)
- [MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport)
- [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools)
- [MCP Authentication](https://modelcontextprotocol.io/docs/concepts/authentication)

### JSON-RPC and Web Standards
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)
- [Server-Sent Events (W3C)](https://html.spec.whatwg.org/multipage/server-sent-events.html)

### Atlassian APIs
- [Atlassian OAuth 2.0 (3LO) Apps](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian Connect Framework](https://developer.atlassian.com/cloud/jira/platform/connect/)

### Project-Specific Documentation
- [VS Code Copilot Agent Specification](../specs/vs-code-copilot/readme.md)
- [E2E Testing Strategy](../specs/e2e-testing-strategy.md)
- [Atlassian MCP Analysis](../specs/atlassian-mcp-analysis/analysis.md)
