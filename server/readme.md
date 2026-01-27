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
  Manages MCP HTTP transport, authentication extraction, and session lifecycle.  
  *Example*: `handleMcpPost()` - Main MCP request handler

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
  - **api/analyze-feature-scope.ts** - Analyze feature scope from Figma designs (generates scope analysis)
  - **api/analyze-figma-scope.ts** - Standalone Figma analysis with comment integration (no Jira required)
  - **api/identify-features.ts** - Identify in-scope and out-of-scope features from Figma
  - **api/progress-comment-manager.ts** - Progress tracking via Jira comments
  - **api/api-error-helpers.ts** - Shared error handling and validation

- **providers/atlassian/atlassian-api-client.ts** - Atlassian API Client Factory  
  Creates pre-configured clients for making authenticated Atlassian API requests.
  - `createAtlassianClient(accessToken)` - OAuth client (routes through api.atlassian.com gateway)
  - `createAtlassianClientWithPAT(base64Credentials)` - PAT client (direct site URLs)
  - `client.fetch(url, options)` - Makes authenticated requests with token in closure
  - `client.getJiraBaseUrl(cloudId)` - Returns Jira API base URL for cloud ID
  - `client.getConfluenceBaseUrl(cloudId)` - Returns Confluence API base URL for cloud ID
  - *Note*: OAuth tokens **must** route through `api.atlassian.com/ex/{product}/{cloudId}/` gateway
  - *Example*: `const client = createAtlassianClient(token); await client.fetch(client.getJiraBaseUrl(cloudId) + '/issue/PROJ-123')`

- **providers/atlassian/adf-utils.ts** - ADF Traversal Utilities  
  Generic traversal and manipulation utilities for ADF (Atlassian Document Format) documents.
  - `traverseADF(adf, visitor)` - Depth-first traversal with visitor callback
  - `extractUrlsFromADF(adf, { urlPattern })` - Extract URLs matching a pattern
  - `extractFigmaUrlsFromADF(adf)` / `extractConfluenceUrlsFromADF(adf)` - Convenience functions
  - `findNodesByType(adf, nodeType)` / `collectTextFromADF(adf)` - Query helpers

- **providers/google/google-docs-helpers.ts** - Google Docs URL Utilities  
  Utilities for extracting and parsing Google Docs URLs from Jira ADF content.
  - `extractGoogleDocsUrlsFromADF(adf)` - Extract Google Docs URLs from ADF (uses patterns from url-parser.ts)
  - `parseGoogleDocUrl(url)` - Parse URL and extract document ID (returns null on error)
  - `isGoogleDoc(mimeType)` - Validate MIME type is a Google Doc (not Sheets/Slides)
  - `deduplicateByDocumentId(urls)` - Remove duplicate URLs pointing to same document
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

## Available MCP Tools

### Standard Atlassian Tools
- **atlassian-get-sites** - List accessible Atlassian cloud sites
- **atlassian-get-issue** - Retrieve complete Jira issue details with ADF description
- **atlassian-get-attachments** - Fetch issue attachments by ID
- **atlassian-update-issue-description** - Update issue description with markdown (converts to ADF)

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
  - Dual interface: Available as MCP tool and REST API endpoint `/api/drive-doc-to-markdown`
  - Limitations: Google Docs only (not Sheets/Slides/PDFs), max 10MB document size

### Combined Provider Tools
Advanced workflow tools that integrate multiple services:

- **analyze-feature-scope** ⚠️ **DEPRECATED** - Use `write-shell-stories` instead
  - **Migration**: `write-shell-stories` now includes automatic scope analysis (see below)
  - Analyzes screens against epic requirements to identify in-scope/out-of-scope features
  - Categorizes features as: ✅ confirmed, ❌ out-of-scope, ❓ needs-clarification, ⏬ low-priority
  - Updates epic description with structured scope analysis grouped by feature areas
  - **Documentation Context**: Automatically extracts and uses linked Confluence pages and Google Docs for additional requirements context
  - Parameters: `epicKey`, `figmaUrl`, optional `cloudId`
  - Example: `analyze-feature-scope({ epicKey: "PLAY-123", figmaUrl: "https://..." })`
  - **Deprecated**: Run `write-shell-stories` directly instead - it handles scope analysis automatically

- **analyze-figma-scope** - Standalone Figma design analysis without Jira integration
  - Analyzes Figma screens independently of Jira epics
  - **Figma Comments Integration**: Reads existing comments as context, posts AI-generated questions back
  - Categorizes features as: ✅ confirmed, ❌ out-of-scope, ❓ needs-clarification, ⏬ low-priority
  - Returns scope analysis as markdown (does not write to Jira)
  - **Rate Limit Handling**: Respects Figma's 25 req/min limit with consolidation fallback
  - Parameters: `figmaUrls` (array), optional `contextDescription`
  - Example: `analyze-figma-scope({ figmaUrls: ["https://..."], contextDescription: "Mobile app onboarding" })`
  - Dual interface: Available as MCP tool and REST API endpoint `/api/analyze-figma-scope`
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

## Key Authentication Patterns

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
1. **Transport Creation**: `StreamableHTTPServerTransport` with unique session ID
2. **Auth Storage**: `setAuthContext(sessionId, authInfo)` stores JWT payload
3. **Tool Access**: `getAuthInfoSafe(context)` retrieves via session ID
4. **Error Handling**: `InvalidTokenError` triggers OAuth re-authentication
5. **Cleanup**: `clearAuthContext(sessionId)` on transport close

### Error Recovery
- **401 Responses**: Include `WWW-Authenticate` header with OAuth metadata
- **Token Expiration**: Tools throw `InvalidTokenError` for automatic refresh
- **Session Management**: Proper cleanup prevents memory leaks

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
