# Cascade MCP: Project Instructions for AI Code Generation

This document enables AI coding assistants to generate features that align perfectly with the Cascade MCP codebase's unique architecture, conventions, and patterns. It is based entirely on observed patterns from the actual codebase—no invented practices.

---

## 1. Project Overview

**Cascade MCP** is a software development enablement platform that bridges design (Figma) and project management (Jira) tools through AI-powered analysis and content generation. It implements the Model Context Protocol (MCP) for communication between clients and tools.

### Key Characteristics
- **Multi-provider OAuth**: Supports Atlassian and Figma with extensible provider pattern
- **8 LLM providers**: Unified AI SDK wrapper supporting Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, and xAI
- **Per-session MCP servers**: Dynamic tool registration based on authenticated providers
- **React 18 browser client**: Vite-based UI with TailwindCSS styling
- **Orchestrated workflows**: Combined tools for design-to-requirements transformation

### Tech Stack
- **Backend**: Node.js/Express, TypeScript, MCP SDK
- **Frontend**: React 18, Vite, TailwindCSS
- **Testing**: Jest with ESM support
- **Deployment**: Docker, GitHub Actions, AWS

---

## 2. File Category Reference

### Frontend Categories

#### **react-components**
**What it is**: React 18 functional components for the browser MCP client UI.

**Representative files**:
- `src/react/App.tsx` - Main app component
- `src/react/components/ToolForm/ToolForm.tsx` - Dynamic form generation

**Key conventions**:
- Use `.tsx` extension; PascalCase naming
- Props typed with interfaces
- All styling via TailwindCSS utility classes
- No CSS modules or CSS-in-JS
- Single source of truth in App component
- Use React hooks only (useState, useEffect, useCallback, useMemo)
- Forms generated dynamically from JSON Schema via AJV validation

**Critical pattern**: All form validation uses AJV to compile JSON schemas. Never implement custom validation logic.

#### **react-hooks**
**What it is**: Custom React hooks encapsulating shared MCP client logic.

**Representative files**:
- `src/react/hooks/useMcpClient.ts` - Central MCP client management
- `src/react/hooks/useConfig.ts` - Configuration loading

**Key conventions**:
- Hooks live in `src/react/hooks/` directory
- Custom hooks return structured objects with clear API contracts
- Use useRef for client instances that must persist across renders
- Implement cleanup with useEffect return functions
- useMcpClient integrates OAuth callback handling with React Strict Mode protection

**Critical pattern**: useMcpClient uses a useRef guard (oauthHandledRef) to prevent double token exchanges when React mounts components twice in Strict Mode.

#### **react-types**
**What it is**: TypeScript type definitions used by React components.

**Representative files**:
- `src/react/components/ResultDisplay/types.ts`

**Key conventions**:
- Use `interface` for prop shapes and response types
- Export types from category-specific files, not globally

#### **frontend-entry**
**What it is**: Application entry points and HTML shell.

**Representative files**:
- `src/main.tsx` - Vite entry point
- `index.html` - HTML template

**Key conventions**:
- Vite expects main.tsx as entry point
- Use ES modules only (no CommonJS)

#### **frontend-styles**
**What it is**: Global CSS and TailwindCSS configuration.

**Representative files**:
- `src/css/styles.css`

**Key conventions**:
- Only TailwindCSS utilities; no custom CSS needed
- tailwind.config.js defines design tokens
- PostCSS processes styles

---

### MCP Client Categories

#### **mcp-client-core**
**What it is**: Browser MCP client wrapping the MCP SDK.

**Representative files**:
- `src/mcp-client/client.ts` - BrowserMcpClient class
- `src/mcp-client/index.ts` - Public exports

**Key conventions**:
- BrowserMcpClient is a class wrapping MCP SDK Client
- Manages connection state, tools, and notifications
- Supports OAuth redirect detection via localStorage checks
- Stateful: maintains client instance across React re-renders

#### **mcp-client-oauth**
**What it is**: OAuth provider implementation for browser clients.

**Representative files**:
- `src/mcp-client/oauth/provider.ts`

**Key conventions**:
- Implements BrowserOAuthClientProvider interface
- Handles OAuth callback detection via URL parameters
- Uses localStorage to persist server URL across OAuth redirects

#### **mcp-client-sampling**
**What it is**: Sampling provider for LLM capabilities in browser.

**Representative files**:
- `src/mcp-client/sampling/anthropic.ts`
- `src/mcp-client/sampling/types.ts`

**Key conventions**:
- Implements SamplingProvider interface for MCP sampling protocol
- AnthropicSamplingProvider handles createMessage requests
- Enables server-side tools to request LLM capabilities from client

---

### Backend Server Categories

#### **backend-server**
**What it is**: Express server initialization, middleware setup, and route registration.

**Representative files**:
- `server/server.ts` - Main server file
- `loader.mjs` - ESM loader for Node.js TypeScript execution

**Key conventions**:
- Express app setup with extensive middleware (session, CORS, logging)
- Morgan HTTP logging piped to Winston
- Sentry error tracking setupExpressErrorHandler called before route handlers
- Trust proxy set to 1 for AWS ELB/ALB
- Session middleware with secure, httpOnly, sameSite=lax cookies
- Extensive debug logging with token sanitization

**Critical pattern**: Session configuration logs are printed to console at startup—this is intentional for debugging OAuth flows. Never remove these.

#### **backend-mcp-core**
**What it is**: MCP server creation and auth context management.

**Representative files**:
- `server/mcp-core/server-factory.ts` - Per-session MCP server creation
- `server/mcp-core/auth-context-store.ts` - Session auth storage

**Key conventions**:
- createMcpServer() factory creates fresh MCP instance per session
- Dynamic tool registration based on authenticated providers
- Combined tools register only when both Atlassian and Figma authenticated
- AuthContext Map stores provider credentials per session ID
- Tools declared with specific capabilities (tools, logging, sampling, fetch, search, actions)

**Critical pattern**: Do NOT use global MCP server. Each session gets isolated instance via createMcpServer().

#### **backend-auth**
**What it is**: OAuth and session management handlers.

**Representative files**:
- `server/atlassian-auth-code-flow.ts`
- `server/manual-token-flow.ts`
- `server/tokens.ts` - JWT wrapping for tokens

**Key conventions**:
- Express session middleware manages PKCE state
- Tokens wrapped in JWT before sending to client
- sanitizeHeaders() removes sensitive data from logs
- OAuth handlers route through provider-agnostic flow
- Fallback to manual token entry for testing

#### **backend-pkce-oauth**
**What it is**: PKCE (Proof Key for Code Exchange) implementation.

**Representative files**:
- `server/pkce/authorize.ts`
- `server/pkce/callback.ts`
- `server/pkce/discovery.ts`
- `server/pkce/token-helpers.ts`

**Key conventions**:
- PKCE parameters generated and stored in session
- Code verifier used during token exchange
- Provider-agnostic: supports any OIDC provider via openid-client
- State parameter prevents CSRF attacks

---

### Backend API Categories

#### **backend-api**
**What it is**: REST API endpoints for direct tool invocation (non-MCP).

**Representative files**:
- `server/api/index.ts` - Route registration
- `server/api/analyze-feature-scope.ts` - Endpoint handler
- `server/api/progress-comment-manager.ts` - Progress streaming via SSE

**Key conventions**:
- Routes registered in server/api/index.ts
- Each endpoint file handles a specific tool
- Headers determine provider and LLM credentials
- Returns Server-Sent Events (SSE) stream for progress
- api-error-helpers.ts provides consistent error formatting

**Critical pattern**: All provider selection via headers (X-LLM-Provider, X-LLM-Model, X-Anthropic-Key, etc.); credentials never in body.

---

### LLM Provider Categories

#### **backend-llm-client**
**What it is**: LLM abstraction layer and factory.

**Representative files**:
- `server/llm-client/provider-factory.ts` - Creates GenerateTextFn
- `server/llm-client/ai-sdk-wrapper.ts` - Wraps AI SDK models
- `server/llm-client/types.ts` - Interface definitions

**Key conventions**:
- generateTextFn function signature: (LLMRequest) => Promise<LLMResponse>
- AI SDK wrapper normalizes responses across all providers
- Supports multimodal messages (text + images)
- QueuedGenerateText manages concurrent requests
- Errors: UnsupportedProviderError, MissingCredentialsError

#### **backend-llm-providers**
**What it is**: Individual LLM provider implementations (8 total).

**Representative files**:
- `server/llm-client/providers/anthropic.ts`
- `server/llm-client/providers/openai.ts`
- `server/llm-client/providers/google.ts`
- `server/llm-client/providers/bedrock.ts`

**Key conventions**:
- Each provider exports createClient(headers, model) function
- Returns AI SDK LanguageModel instance
- Validates credentials from headers or environment
- PROVIDER_MODULES registry in provider-factory.ts
- Model defaults per provider (e.g., claude-sonnet-4-5-20250929 for Anthropic)

---

### Provider Integration Categories

#### **backend-providers-interface**
**What it is**: OAuthProvider interface definition.

**Representative files**:
- `server/providers/provider-interface.ts`

**Key conventions**:
- All OAuth providers implement OAuthProvider interface
- Methods: createAuthUrl, extractCallbackParams, exchangeCodeForTokens, refreshAccessToken, registerTools
- StandardTokenResponse type ensures token shape consistency
- AuthUrlParams, TokenExchangeParams, CallbackParams interfaces

#### **backend-providers-atlassian**
**What it is**: Atlassian/Jira OAuth integration and tools.

**Representative files**:
- `server/providers/atlassian/index.ts` - Provider implementation
- `server/providers/atlassian/atlassian-api-client.ts` - API client factory
- `server/providers/atlassian/tools/index.ts` - Tool registration
- `server/providers/atlassian/markdown-converter.ts` - ADF conversion

**Key conventions**:
- Atlassian provider handles PKCE OAuth flow
- AtlassianClient factory captures token in closure
- All requests via client.fetch(url, options) with auto-auth
- Markdown converted to ADF (Atlassian Document Format) before updating issues
- Tools: atlassian-get-issue, atlassian-fetch, atlassian-search, etc.

**Critical quirk**: Atlassian URL decoding bug: + in authorization code gets decoded as space. Handle with replace(/ /g, '+').

#### **backend-providers-figma**
**What it is**: Figma OAuth integration and tools.

**Representative files**:
- `server/providers/figma/index.ts`
- `server/providers/figma/figma-api-client.ts`
- `server/providers/figma/tools/index.ts`

**Key conventions**:
- FigmaApiClient factory captures token in closure
- Read-only integration (no design creation/modification)
- Figma cache respects DEV_CACHE_DIR environment variable
- Tools: figma-get-user, figma-get-layers-for-page, figma-get-image-download, figma-get-metadata-for-layer

#### **backend-providers-combined-tools**
**What it is**: Multi-provider orchestration tools requiring both Atlassian and Figma.

**Representative files**:
- `server/providers/combined/tools/analyze-feature-scope/`
- `server/providers/combined/tools/writing-shell-stories/`
- `server/providers/combined/tools/write-next-story/`
- `server/providers/combined/tools/review-work-item/`
- `server/providers/combined/tools/shared/` - Shared utilities

**Key conventions**:
- Register only if BOTH authContext.atlassian AND authContext.figma exist
- Each tool has separate core-logic.ts (business logic) and prompt-*.ts (prompt engineering)
- Strategy pattern for different analysis approaches (e.g., prompt-scope-analysis-1.ts vs -2.ts)
- Shared utilities: screen-analysis-pipeline.ts, issue-context-builder.ts
- Tools close over authContext and generateText for easy access
- Progress notification for long-running operations

#### **backend-providers-utility**
**What it is**: Tools requiring no OAuth authentication.

**Representative files**:
- `server/providers/utility/tools/utility-test-sampling.ts`

**Key conventions**:
- Always registered (no auth check)
- Used for testing MCP sampling capabilities

---

### Utility & Infrastructure Categories

#### **backend-utils**
**What it is**: General utility functions.

**Representative files**:
- `server/utils/file-paths.ts` - Path resolution utilities
- `server/debug-helpers.ts` - Debugging utilities

#### **backend-observability**
**What it is**: Logging and monitoring setup.

**Representative files**:
- `server/observability/logger.ts` - Winston logger configuration
- `server/observability/instruments.ts` - Sentry instrumentation

**Key conventions**:
- Winston logger with CloudWatch transport
- Morgan HTTP logging integration
- Sentry error tracking with performance profiling
- Structured logging with consistent fields

#### **test-files**
**What it is**: Unit and E2E tests.

**Representative files**:
- `server/api/index.test.ts`
- `test/e2e/api-workflow.test.ts`

**Key conventions**:
- ESM modules; ts-jest with custom loader
- E2E tests use 600s timeout (jest --testTimeout=600000)
- Sequential execution for E2E (--runInBand)
- Mock Atlassian OAuth server for testing

#### **test-helpers**
**What it is**: Shared testing utilities.

**Representative files**:
- `specs/shared/helpers/mcp-client.js` - MCP client setup
- `specs/shared/helpers/auth-flow.js` - OAuth flow helpers

#### **configuration**
**What it is**: TypeScript, Vite, Jest, PostCSS, and code quality configurations.

**Representative files**:
- `tsconfig.json` - Strict TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `tailwind.config.js` - TailwindCSS design tokens
- `.prettierrc` - Prettier formatting
- `jest.config` in package.json

**Key conventions**:
- TypeScript strict mode enabled (noImplicitAny, strictNullChecks)
- Vite v6 with React plugin
- Prettier integration via husky pre-commit hooks
- ESM-only (no CommonJS)

#### **ci-cd**
**What it is**: GitHub Actions workflows for testing and deployment.

**Representative files**:
- `.github/workflows/ci.yaml`
- `.github/workflows/deploy-prod.yaml`

#### **build-scripts**
**What it is**: Build and validation utilities.

**Representative files**:
- `scripts/validate-pat-tokens.ts`
- `scripts/clear-legacy-cache.sh`

#### **api-scripts**
**What it is**: Scripts for direct API testing.

**Representative files**:
- `scripts/api/analyze-feature-scope.ts`
- `scripts/api/write-shell-stories.ts`

#### **documentation**
**What it is**: README files and guides.

**Representative files**:
- `README.md`
- `docs/rest-api.md`
- `docs/deployment.md`

#### **project-specs**
**What it is**: Feature specifications and planning documents.

**Representative files**:
- `specs/1-feature-identifier.md`
- `specs/22-mcp-client.md`

**Key conventions**:
- Numbered specs document feature development progression
- Specs reference actual code implementation

#### **docker-config**
**What it is**: Docker configuration.

**Representative files**:
- `Dockerfile`
- `docker-compose.yaml`

#### **env-config**
**What it is**: Environment variable templates.

**Representative files**:
- `.env.example`

#### **github-prompts**
**What it is**: Claude/GitHub Copilot instruction prompts.

**Representative files**:
- `.github/prompts/spec.prompt.md`
- `.github/prompts/write-tool-readme-docs.prompt.md`

---

## 3. Architectural Domains & Integration Rules

### Domain: MCP Protocol
**Required patterns**:
- Use createMcpServer() factory from mcp-core/server-factory.ts
- All tools implement registerToolFunction(mcp, authContext) pattern
- Use StreamableHTTPServerTransport for HTTP/JSON transport
- Store session data in sessions map keyed by mcp-session-id header

**Constraints**:
- Tools must be JSON-RPC compatible
- Each session gets isolated transport instance
- MCP operations must not depend on client-specific state beyond auth context

### Domain: OAuth Authentication
**Required patterns**:
- All providers implement OAuthProvider interface
- Use PKCE (Proof Key for Code Exchange) flow
- Store provider info in AuthContext Map
- Use express-session middleware with secure cookies
- Wrap tokens in JWT for transport

**Constraints**:
- All providers return StandardTokenResponse
- Support both stateless (rotated) and stateful (reused) refresh tokens
- Tokens stored in HTTP-only secure cookies; never client-side
- PKCE parameters mandatory for all OAuth flows

### Domain: Multi-Provider LLM
**Required patterns**:
- Use createProviderFromHeaders() to create GenerateTextFn
- Register all providers in PROVIDER_MODULES constant
- Provider/model selected via X-LLM-Provider and X-LLM-Model headers
- Wrap language models with wrapLanguageModel()

**Constraints**:
- All 8 providers must implement identical GenerateTextFn signature
- Credentials passed via headers; never in request body
- Throw UnsupportedProviderError or MissingCredentialsError
- No global provider state; each request independent

### Domain: React UI Components
**Required patterns**:
- Components use .tsx extension; PascalCase naming
- Use React hooks (useState, useEffect, useCallback)
- Create custom hooks in src/react/hooks/
- Type all component props with interfaces
- Use TailwindCSS utility classes for styling

**Constraints**:
- State management via React hooks only; no Redux/Context
- All MCP communication via useMcpClient hook
- Props flow down; callbacks flow up
- Built with Vite v6; ESM modules only

### Domain: Provider Abstraction
**Required patterns**:
- Implement providers as plain objects (not classes)
- Export provider instance from server/providers/{name}/index.ts
- Register tools via provider.registerTools(mcp, authContext)
- Close over API clients to capture auth tokens

**Constraints**:
- Providers must implement OAuthProvider interface
- Tool names unique across all providers
- Providers should not depend on each other
- Tools receive authContext with all authenticated provider tokens

### Domain: Combined Tools Orchestration
**Required patterns**:
- Separate core logic (core-logic.ts) from registration
- Use prompt engineering files (prompt-*.ts) for LLM prompts
- Follow shared utilities pattern for reusable components
- Close tools over generateText function
- Implement progress notification for long operations

**Constraints**:
- Combined tools register only when both providers authenticated
- Use strategy pattern for multiple analysis approaches
- Cleanup temporary files in finally blocks
- Report partial success when operations partially fail

---

## 4. Feature Scaffolding Guide

### Example 1: Adding a New React Component

**Requirement**: "Create a new ToolSelector component that lists available tools"

**Files to create**:
1. `src/react/components/ToolSelector/ToolSelector.tsx` - Component
2. `src/react/components/ToolSelector/types.ts` (if complex) - Types

**Pattern to follow**:
```typescript
// src/react/components/ToolSelector/ToolSelector.tsx
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ToolSelectorProps {
  tools: Tool[];
  selectedTool: Tool | null;
  onSelect: (tool: Tool | null) => void;
}

export function ToolSelector({ tools, selectedTool, onSelect }: ToolSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="font-semibold">Available Tools</label>
      <select
        value={selectedTool?.name || ''}
        onChange={(e) => {
          const tool = tools.find(t => t.name === e.target.value);
          onSelect(tool || null);
        }}
        className="border rounded px-2 py-1 w-full"
      >
        <option value="">-- Select Tool --</option>
        {tools.map((tool) => (
          <option key={tool.name} value={tool.name}>
            {tool.name}: {tool.description}
          </option>
        ))}
      </select>
    </div>
  );
}
```

**Integration**: Import and use in App.tsx, pass tools from useMcpClient hook.

### Example 2: Adding a New React Hook

**Requirement**: "Create a useTools hook to filter and search tools"

**Files to create**:
1. `src/react/hooks/useTools.ts` - Hook

**Pattern to follow**:
```typescript
import { useState, useMemo } from 'react';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function useTools(tools: Tool[], searchQuery: string = '') {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return tools.filter(tool => {
      const matches = !searchQuery ||
        tool.name.includes(searchQuery) ||
        tool.description?.includes(searchQuery);
      return matches;
    });
  }, [tools, searchQuery]);

  return { filtered, favorites, setFavorites };
}
```

### Example 3: Adding a New OAuth Provider

**Requirement**: "Add GitHub OAuth provider support"

**Files to create**:
1. `server/providers/github/index.ts` - Provider instance
2. `server/providers/github/github-api-client.ts` - API client factory
3. `server/providers/github/tools/index.ts` - Tool registration
4. `server/providers/github/types.ts` (if needed) - Types

**Pattern to follow**:
```typescript
// server/providers/github/index.ts
import type { OAuthProvider, AuthUrlParams, TokenExchangeParams, StandardTokenResponse, CallbackParams } from '../provider-interface.js';

export const githubProvider: OAuthProvider = {
  name: 'github',

  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = params.redirectUri || `${process.env.VITE_AUTH_SERVER_URL}/auth/callback/github`;

    return `https://github.com/login/oauth/authorize?${new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
      ...(params.state && { state: params.state }),
    }).toString()}`;
  },

  extractCallbackParams(req: any): CallbackParams {
    return {
      code: req.query?.code,
      state: req.query?.state,
    };
  },

  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.VITE_GITHUB_CLIENT_ID!,
        client_secret: process.env.VITE_GITHUB_CLIENT_SECRET!,
        code: params.code,
        code_verifier: params.codeVerifier,
        redirect_uri: params.redirectUri,
      }),
    });

    const data = await response.json();
    return {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: 3600,
      scope: data.scope,
    };
  },

  registerTools(mcp: McpServer, authContext: AuthContext): void {
    registerGithubTools(mcp, authContext);
  },
};
```

**Integration steps**:
1. Update server/mcp-core/server-factory.ts to conditionally register GitHub tools
2. Add environment variables: VITE_GITHUB_CLIENT_ID, VITE_GITHUB_CLIENT_SECRET
3. Update OAuth routes to support GitHub callback

### Example 4: Adding a New LLM Provider

**Requirement**: "Add Claude (Anthropic) as an additional model provider"

**Files to create**:
1. `server/llm-client/providers/claude.ts` - Provider implementation

**Pattern to follow**:
```typescript
// server/llm-client/providers/claude.ts
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export function createClient(headers: Record<string, string>, model: string): LanguageModel {
  const apiKey = headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new MissingCredentialsError('Anthropic API key required via X-Anthropic-Key header or ANTHROPIC_API_KEY env');
  }

  const anthropic = createAnthropic({ apiKey });
  return anthropic(model);
}
```

**Integration**:
1. Add to PROVIDER_MODULES in provider-factory.ts
2. Update documentation with supported models
3. Add environment variable template in .env.example

### Example 5: Adding a Combined Tool

**Requirement**: "Create a tool that analyzes Figma designs AND creates GitHub issues"

**Files to create**:
1. `server/providers/combined/tools/analyze-and-create-github/index.ts` - Export
2. `server/providers/combined/tools/analyze-and-create-github/analyze-and-create-github.ts` - Main handler
3. `server/providers/combined/tools/analyze-and-create-github/core-logic.ts` - Business logic
4. `server/providers/combined/tools/analyze-and-create-github/prompt-analysis.ts` - LLM prompt
5. `server/providers/combined/tools/analyze-and-create-github/README.md` - Documentation

**Pattern to follow**:
```typescript
// core-logic.ts
export async function executeAnalyzeAndCreateGithub(
  params: {
    epicKey: string;
    cloudId: string;
    githubRepo: string;
  },
  authContext: AuthContext,
  generateText: GenerateTextFn
) {
  // 1. Fetch Figma designs from Jira epic
  const figmaClient = createFigmaClient(authContext.figma!.access_token);
  const designs = await downloadDesigns(figmaClient, ...);

  // 2. Analyze designs
  const analysis = await generateText({
    messages: [{ role: 'user', content: [...designs] }],
  });

  // 3. Create GitHub issue
  const githubClient = createGithubClient(authContext.github!.access_token);
  const issue = await githubClient.createIssue(params.githubRepo, analysis);

  return { success: true, issueUrl: issue.html_url };
}
```

**Registration**:
```typescript
// In server/providers/combined/index.ts
if (authContext.atlassian && authContext.figma && authContext.github) {
  mcp.tool('analyze-and-create-github', schema, async (params) => {
    return executeAnalyzeAndCreateGithub(params, authContext, generateText);
  });
}
```

---

## 5. Common Patterns & Conventions

### Pattern: Closure-Based API Clients
API clients capture auth tokens in closure to avoid passing them through parameters:

```typescript
// Create once during tool registration
const client = createAtlassianClient(authContext.atlassian!.access_token);

// Use everywhere in tool without re-passing token
mcp.tool('fetch-issue', schema, async (params) => {
  // Token already captured in client closure
  const response = await client.fetch(url);
});
```

### Pattern: Provider-Agnostic Handlers
OAuth handlers work with any provider implementing OAuthProvider interface:

```typescript
// Same handler works for Atlassian, Figma, GitHub, etc.
export function makeCallback(providers: OAuthProvider[]) {
  return async (req: Request, res: Response) => {
    const provider = providers.find(p => p.name === req.params.provider);
    const tokens = await provider.exchangeCodeForTokens({
      code: callbackParams.code,
      codeVerifier: req.session.pkceData.codeVerifier,
    });
  };
}
```

### Pattern: Dynamic Tool Registration
Tools registered based on authenticated providers:

```typescript
// Server factory conditionally registers tools
export function createMcpServer(authContext: AuthContext): McpServer {
  const mcp = new McpServer(...);

  if (authContext.atlassian) {
    atlassianProvider.registerTools(mcp, authContext);
  }

  if (authContext.figma) {
    figmaProvider.registerTools(mcp, authContext);
  }

  // Combined tools only if both authenticated
  if (authContext.atlassian && authContext.figma) {
    combinedProvider.registerTools(mcp, authContext);
  }

  return mcp;
}
```

### Pattern: JSON Schema-Driven Forms
React forms generated dynamically from tool inputSchema:

```typescript
// Tool defines schema
const schema = {
  type: 'object',
  properties: {
    issueKey: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['issueKey'],
};

// Component generates form from schema
const ajv = new Ajv();
const validate = ajv.compile(schema);
// Then build form inputs based on properties
```

### Pattern: Progress Notification in Long Operations
Long-running tools notify clients of progress:

```typescript
async function executeWithProgress(params, authContext, generateText, notifyProgress) {
  notifyProgress({ stage: 'fetching', percent: 20 });
  const data = await fetch(...);

  notifyProgress({ stage: 'analyzing', percent: 50 });
  const analysis = await generateText(...);

  notifyProgress({ stage: 'saving', percent: 80 });
  await save(...);

  notifyProgress({ stage: 'complete', percent: 100 });
}
```

### Pattern: Multimodal Messages with Images
LLM requests support both text and images:

```typescript
const response = await generateText({
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this design' },
        { type: 'image', data: base64Image, mimeType: 'image/png' },
      ],
    },
  ],
});
```

### Pattern: Temporary File Management
Tools that download files clean up in finally blocks:

```typescript
export async function executeTool(params, authContext, generateText) {
  const tempDir = await createTempDirectory();

  try {
    const files = await downloadFiles(tempDir, ...);
    const result = await processFiles(files);
    return result;
  } finally {
    // Always cleanup
    await cleanupTempDirectory(tempDir);
  }
}
```

---

## 6. Example: Prompting Copilot

### User Request
> "Create a new React component that displays a paginated list of tools with search and sorting"

### Copilot Response (Generated Files)

**1. Component file**: `src/react/components/ToolList/ToolList.tsx`
```typescript
import { useState, useMemo } from 'react';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ToolListProps {
  tools: Tool[];
  itemsPerPage?: number;
}

export function ToolList({ tools, itemsPerPage = 10 }: ToolListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'description'>('name');

  const filtered = useMemo(() => {
    return tools
      .filter(tool => {
        const matches = !searchQuery ||
          tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matches;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return (a.description || '').localeCompare(b.description || '');
      });
  }, [tools, searchQuery, sortBy]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filtered.slice(start, start + itemsPerPage);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="flex-1 border rounded px-2 py-1"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'description')}
          className="border rounded px-2 py-1"
        >
          <option value="name">Sort by Name</option>
          <option value="description">Sort by Description</option>
        </select>
      </div>

      <div className="space-y-2">
        {pageItems.map((tool) => (
          <div key={tool.name} className="border rounded p-3">
            <h3 className="font-semibold">{tool.name}</h3>
            <p className="text-sm text-gray-600">{tool.description}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-center">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={cn(
              'px-3 py-1 rounded',
              currentPage === page ? 'bg-blue-600 text-white' : 'border'
            )}
          >
            {page}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**2. Integration**: Update App.tsx to use new component
```typescript
<ToolList tools={tools} itemsPerPage={5} />
```

---

## 7. Environment Variables Reference

### Required for Core Functionality
```bash
VITE_AUTH_SERVER_URL=https://cascade.bitovi.com
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
NODE_ENV=production
PORT=3000
```

### Atlassian Integration
```bash
VITE_JIRA_CLIENT_ID=your-client-id
VITE_JIRA_CLIENT_SECRET=your-client-secret
VITE_JIRA_SCOPE=manage:jira-configuration read:jira-work
```

### Figma Integration
```bash
VITE_FIGMA_CLIENT_ID=your-client-id
VITE_FIGMA_CLIENT_SECRET=your-client-secret
```

### LLM Providers
```bash
# Anthropic (default)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Google
GOOGLE_API_KEY=...

# AWS Bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Others
MISTRAL_API_KEY=...
DEEPSEEK_API_KEY=...
GROQ_API_KEY=...
XAI_API_KEY=...
```

### Optional (Development)
```bash
DEV_CACHE_DIR=.cache/figma  # Cache Figma downloads during development
LOG_LEVEL=debug
SENTRY_DSN=https://...      # Sentry error tracking
```

---

## 8. Key Constraints & "Critical Don'ts"

### 🚫 Critical Don'ts

1. **Don't use global MCP server**: Each session needs `createMcpServer()` instance
2. **Don't store tokens client-side**: Use HTTP-only secure cookies
3. **Don't skip PKCE**: All OAuth flows must use code_challenge + code_verifier
4. **Don't implement custom validation**: Use AJV with JSON Schema
5. **Don't use CSS modules**: Use TailwindCSS utility classes only
6. **Don't pass auth credentials in request body**: Use HTTP headers
7. **Don't mix sync/async patterns**: All operations must be async/await
8. **Don't hardcode credentials**: Use environment variables
9. **Don't register combined tools for single provider**: Check both authContext.atlassian && authContext.figma
10. **Don't use CommonJS**: Use ES modules exclusively

### ✅ Do This Instead

1. **Do create per-session MCP servers**: `const mcp = createMcpServer(authContext)`
2. **Do store tokens in HTTP-only cookies**: Use express-session middleware
3. **Do implement PKCE flows**: All OAuth requires code_challenge/verifier
4. **Do use AJV for validation**: `ajv.compile(schema)`
5. **Do use TailwindCSS**: `className="flex justify-center"`
6. **Do pass credentials via headers**: `X-Anthropic-Key`, `X-LLM-Provider`
7. **Do use async/await**: `await client.fetch(url)`
8. **Do use environment variables**: `process.env.JIRA_CLIENT_ID`
9. **Do check both providers**: `if (authContext.atlassian && authContext.figma)`
10. **Do use ES modules**: `import { ... } from '...'`

---

## 9. Testing Patterns

### Unit Test Pattern
```typescript
// server/api/index.test.ts
import { describe, it, expect } from '@jest/globals';

describe('API Routes', () => {
  it('should return 400 on missing required parameter', async () => {
    const response = await request(app)
      .post('/api/analyze-feature-scope')
      .send({ epicKey: 'PROJ-1' }); // Missing cloudId

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
```

### E2E Test Pattern
```typescript
// test/e2e/api-workflow.test.ts
describe('E2E: Write Shell Stories Workflow', () => {
  it('should create stories from Figma designs', async () => {
    // 1. Setup: Create test epic with Figma link
    // 2. Call: POST /api/write-shell-stories
    // 3. Assert: Verify stories created in Jira
  }, 600000); // 10 minute timeout
});
```

---

## 10. Debugging Tips

### Enable Debug Logging
```bash
LOG_LEVEL=debug npm run dev
```

### Common Issues & Solutions

**OAuth Token Expired**:
- Check WWW-Authenticate header for "expired_token"
- Implement token refresh in your tool
- Use authContext.atlassian?.refresh_token for Atlassian

**Figma Image Download Fails**:
- Check DEV_CACHE_DIR is writable
- Verify Figma access_token has file_content_read scope
- Inspect figma-cache.ts for cached responses

**MCP Connection Drops**:
- Check mcp-session-id header is sent with each request
- Verify session hasn't been cleaned up
- Look for InvalidTokenError in logs

**Tool Not Registered**:
- Verify provider is authenticated in authContext
- Check combined tools both providers are present
- Inspect server factory logs for registration details

---

## Conclusion

This instructions file provides everything needed for AI assistants to generate code that:
- ✅ Follows project conventions
- ✅ Integrates with existing architecture
- ✅ Uses established patterns
- ✅ Maintains consistency across the codebase
- ✅ Respects security and performance constraints

For questions about implementation details, refer to the specific domain deep-dives in the `4-domains/` folder.
