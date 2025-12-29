# Cascade MCP: AI Assistant Build Instructions

This document enables AI coding assistants to generate new features aligned with the Cascade MCP architecture, conventions, and style. All instructions are derived from observed patterns in the actual codebase.

## Overview

Cascade MCP is an AI-powered software development platform that bridges design tools (Figma) with project management (Jira) through the Model Context Protocol (MCP). This instruction file synthesizes:

- **Technology Stack**: TypeScript, Node.js/Express, React 18, MCP protocol
- **Architecture**: Multi-provider OAuth, per-session MCP servers, functional providers with closure-based state
- **Style**: Functional programming, separation of concerns, type safety with Zod

These instructions enable consistent feature development across the codebase.

---

## Part 1: File Category Reference

### Configuration Files
**Category**: `config`
**What it is**: Build tools, linters, formatters, and environment configuration
**Examples**:
- `tsconfig.json` - TypeScript compiler configuration
- `vite.config.ts` - Vite bundler and dev server configuration
- `tailwind.config.js` - Tailwind CSS framework configuration
- `.eslintrc` - ESLint linting rules
- `.prettierrc` - Prettier code formatter configuration

**Key Conventions**:
- All configuration is centralized and environment-aware
- TypeScript strict mode enabled in `tsconfig.json`
- Environment variables use `VITE_` prefix for frontend-accessible vars
- No hardcoded values; all configuration via env vars

### Docker & Deployment
**Category**: `docker-deployment`
**What it is**: Container images and deployment orchestration
**Examples**:
- `Dockerfile` - Multi-stage Node.js container build
- `docker-compose.yaml` - Local development environment

**Key Conventions**:
- Production builds include both server and client bundles
- ES modules loader (`loader.mjs`) for TypeScript execution
- Environment variables passed at runtime, not baked into image

### CI/CD Workflows
**Category**: `ci-cd`
**What it is**: GitHub Actions workflows for testing and deployment
**Examples**:
- `.github/workflows/ci.yaml` - Run tests and linting
- `.github/workflows/deploy-prod.yaml` - Production deployment
- `.github/workflows/deploy-staging.yaml` - Staging deployment

**Key Conventions**:
- Automated testing on every push
- Separate staging and production environments
- Manual destroy workflows for environment cleanup

### Documentation
**Category**: `docs`
**What it is**: Project documentation, guides, and API specs
**Examples**:
- `README.md` - Project overview and setup
- `docs/rest-api.md` - REST API endpoint documentation
- `server/llm-client/README.md` - LLM client library docs
- `docs/deployment.md` - Infrastructure and deployment guide

**Key Conventions**:
- Documentation colocated with feature implementation
- Tool-specific documentation in tool directories
- Architecture docs in top-level `docs/` directory

### AI Prompts
**Category**: `ai-prompts`
**What it is**: Prompts for AI assistants and model instructions
**Examples**:
- `.github/copilot-instructions.md` - GitHub Copilot configuration
- `.github/prompts/spec.prompt.md` - Specification generation prompt
- `.github/prompts/write-tool-readme-docs.prompt.md` - Tool documentation prompt

**Key Conventions**:
- Prompts are reusable templates
- System prompts separated from user prompts
- Domain-specific constraints encoded in prompts

### Scripts & Utilities
**Category**: `scripts`
**What it is**: CLI scripts and development utilities
**Examples**:
- `scripts/api/write-shell-stories.ts` - CLI to test shell story generation
- `scripts/validate-pat-tokens.ts` - Token validation utility
- `scripts/generate-build-env.sh` - Environment setup script

**Key Conventions**:
- Scripts use TypeScript with ts-node loader
- API testing scripts in `scripts/api/` subdirectory
- Bash scripts for environment setup

### Server Core
**Category**: `server-core`
**What it is**: Express app initialization and main request handlers
**Examples**:
- `server/server.ts` - Express app with middleware setup
- `server/mcp-service.ts` - HTTP transport layer for MCP protocol
- `server/tokens.ts` - JWT token utilities

**Key Conventions**:
- Express app with session middleware for OAuth
- Trust proxy enabled for AWS load balancers
- Sentry and Winston middleware for observability
- Session secrets required from environment

### MCP Core
**Category**: `mcp-core`
**What it is**: MCP server factory and authentication context management
**Examples**:
- `server/mcp-core/server-factory.ts` - Per-session MCP server creation
- `server/mcp-core/auth-context-store.ts` - In-memory session auth storage
- `server/mcp-core/auth-helpers.ts` - Safe auth context extraction

**Key Conventions**:
- Per-session MCP servers created dynamically
- Tools registered based on authenticated providers
- Auth context stored per session ID
- Combined provider tools only register when both providers authenticated

### OAuth - PKCE Flow
**Category**: `oauth-pkce`
**What it is**: OAuth 2.0 authorization code flow with PKCE
**Examples**:
- `server/pkce/authorize.ts` - Authorization endpoint handler
- `server/pkce/callback.ts` - OAuth callback handler
- `server/pkce/token-helpers.ts` - JWT creation and token management

**Key Conventions**:
- PKCE code challenge/verifier for security
- State parameter for CSRF protection
- Automatic token refresh with configurable expiry
- Environment variables for OAuth credentials

### OAuth - Provider Flows
**Category**: `oauth-provider-flows`
**What it is**: Multi-provider OAuth authentication
**Examples**:
- `server/provider-server-oauth/authorize.ts` - Provider-agnostic authorization
- `server/provider-server-oauth/callback.ts` - Multi-provider callback handler
- `server/provider-server-oauth/connection-hub.ts` - OAuth connection UI

**Key Conventions**:
- Providers plugged into auth middleware
- Manual token entry fallback for debugging
- Mock OAuth server for testing
- Consent page for user authorization

### Provider Interface
**Category**: `provider-interface`
**What it is**: Common interface definition for OAuth providers
**Examples**:
- `server/providers/provider-interface.ts` - OAuthProvider interface

**Key Conventions**:
- All providers implement `OAuthProvider` interface
- Providers are functional objects, not classes
- Standardized `StandardTokenResponse` across providers
- Provider-specific refresh token behavior (rotation vs reuse)

### Atlassian Provider
**Category**: `provider-atlassian`
**What it is**: Atlassian (Jira/Confluence) OAuth provider implementation
**Examples**:
- `server/providers/atlassian/index.ts` - atlassianProvider implementation
- `server/providers/atlassian/atlassian-api-client.ts` - Jira API client factory
- `server/providers/atlassian/atlassian-helpers.ts` - Jira helper functions
- `server/providers/atlassian/adf-utils.ts` - Atlassian Document Format utilities

**Key Conventions**:
- Server-side OAuth with client_secret
- Token captured in closure (never passed as parameter)
- Support for both OAuth and PAT authentication
- ADF (Atlassian Document Format) for issue descriptions
- Confluence integration for documentation context

### Atlassian MCP Tools
**Category**: `mcp-tools-atlassian`
**What it is**: Atlassian-specific MCP tools for Jira/Confluence
**Examples**:
- `server/providers/atlassian/tools/atlassian-search.ts` - Search Jira issues
- `server/providers/atlassian/tools/atlassian-get-issue.ts` - Fetch issue details
- `server/providers/atlassian/tools/confluence-analyze-page.ts` - Analyze Confluence

**Key Conventions**:
- Tools prefixed with `atlassian-`
- Zod schemas for input validation
- Return `{ content: [{ type: 'text', text: '...' }] }`
- Auth errors throw `InvalidTokenError`
- Non-auth errors returned as tool content

### Figma Provider
**Category**: `provider-figma`
**What it is**: Figma OAuth provider implementation
**Examples**:
- `server/providers/figma/index.ts` - figmaProvider implementation
- `server/providers/figma/figma-api-client.ts` - Figma API client factory
- `server/providers/figma/figma-cache.ts` - Figma resource caching

**Key Conventions**:
- Client-side PKCE flow
- Token detection by prefix: `figu_` (OAuth) vs `figd_` (PAT)
- File-based caching for Figma resources
- Filesystem-safe node ID conversion (colons → dashes)

### Figma MCP Tools
**Category**: `mcp-tools-figma`
**What it is**: Figma-specific MCP tools for design interaction
**Examples**:
- `server/providers/figma/tools/figma-get-layers.ts` - List page layers
- `server/providers/figma/tools/figma-get-image-download.ts` - Download images
- `server/providers/figma/tools/figma-get-metadata-for-layer.ts` - Layer metadata

**Key Conventions**:
- Tools prefixed with `figma-`
- Image content returned as base64
- Layer metadata includes positioning and visual properties
- Cache validation before API calls

### Utility Provider
**Category**: `provider-utility`
**What it is**: Utility tools available regardless of authentication
**Examples**:
- `server/providers/utility/tools/utility-test-sampling.ts` - Test LLM sampling

**Key Conventions**:
- Utility tools always registered
- Used for testing and debugging
- Can invoke MCP sampling for agent communication

### Combined Tools Provider
**Category**: `provider-combined-tools`
**What it is**: Multi-provider workflow tools requiring both Figma and Jira
**Examples**:
- `server/providers/combined/index.ts` - Combined provider registry
- `server/providers/combined/tools/types.ts` - Shared type definitions

**Key Conventions**:
- Combined tools only registered when both providers authenticated
- Tools orchestrate Atlassian and Figma APIs
- Shared context builders for issue and screen analysis

### Write Shell Stories Tool
**Category**: `mcp-tool-write-shell-stories`
**What it is**: Generate prioritized user story templates from Figma designs
**Examples**:
- `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts` - Tool registration
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts` - Story generation logic
- `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts` - LLM prompts

**Key Conventions**:
- Analyzes Figma screens and Jira epics
- Generates YAML shell story format
- Progress notifications during long operations
- Screen analysis caching and reuse

### Analyze Feature Scope Tool
**Category**: `mcp-tool-analyze-feature-scope`
**What it is**: Analyze feature scope from Figma designs linked in Jira
**Examples**:
- `server/providers/combined/tools/analyze-feature-scope/analyze-feature-scope.ts` - Tool implementation
- `server/providers/combined/tools/analyze-feature-scope/prompt-scope-analysis.ts` - Scope analysis prompts

**Key Conventions**:
- Analyzes Figma designs in epic context
- Identifies features, scope boundaries, and questions
- Multiple prompt strategies for different contexts
- Output structured as feature analysis

### Write Next Story Tool
**Category**: `mcp-tool-write-next-story`
**What it is**: Generate detailed user stories from shell stories
**Examples**:
- `server/providers/combined/tools/write-next-story/write-next-story.ts` - Tool implementation
- `server/providers/combined/tools/write-next-story/shell-story-parser.ts` - Parse shell story format

**Key Conventions**:
- Validates shell story dependencies
- Generates acceptance criteria
- Creates Jira issues with full markdown
- Integrates with epic structure

### Review Work Item Tool
**Category**: `mcp-tool-review-work-item`
**What it is**: Review Jira issues and generate improvement questions
**Examples**:
- `server/providers/combined/tools/review-work-item/review-work-item.ts` - Tool implementation
- `server/providers/combined/tools/review-work-item/context-loader.ts` - Load issue context

**Key Conventions**:
- Loads context from Jira, Confluence, and Figma
- Fetches issue hierarchy and linked items
- Generates questions identifying gaps and ambiguities
- Posts review as Jira comment

### Combined Tools Shared
**Category**: `combined-tools-shared`
**What it is**: Shared utilities for multi-provider tools
**Examples**:
- `server/providers/combined/tools/shared/issue-context-builder.ts` - Build rich issue context
- `server/providers/combined/tools/shared/screen-analysis-pipeline.ts` - Screen analysis pipeline

**Key Conventions**:
- Shared analysis logic reused across tools
- Context builders combine multiple data sources
- Caching and optimization for performance

### LLM Client
**Category**: `llm-client`
**What it is**: Multi-provider LLM abstraction and request queuing
**Examples**:
- `server/llm-client/provider-factory.ts` - Factory for creating LLM clients
- `server/llm-client/mcp-sampling-client.ts` - MCP sampling client
- `server/llm-client/queued-generate-text.ts` - Request queuing wrapper

**Key Conventions**:
- Unified `GenerateTextFn` interface across providers
- Provider selection via HTTP headers
- Queued execution for concurrency control
- MCP sampling for agent-driven requests

### LLM Providers
**Category**: `llm-providers`
**What it is**: Individual LLM provider implementations
**Examples**:
- `server/llm-client/providers/anthropic.ts` - Anthropic Claude provider
- `server/llm-client/providers/openai.ts` - OpenAI GPT provider
- `server/llm-client/providers/google.ts` - Google Gemini provider
- `server/llm-client/providers/bedrock.ts` - AWS Bedrock provider

**Key Conventions**:
- Each provider module exports `createGenerateTextFn`
- Provider-specific API key headers
- Unified error handling via `ProviderError`
- Support for streaming via respective SDKs

### REST API
**Category**: `rest-api`
**What it is**: PAT-authenticated REST endpoints wrapping MCP tool logic
**Examples**:
- `server/api/index.ts` - REST route registration
- `server/api/write-shell-stories.ts` - Shell story REST endpoint
- `server/api/progress-comment-manager.ts` - Progress tracking on Jira

**Key Conventions**:
- All endpoints under `/api/` prefix
- POST method for tool endpoints
- PAT authentication via headers
- Core logic shared with MCP tools via separate files
- Long operations post progress as Jira comments

### Observability
**Category**: `observability`
**What it is**: Logging and error tracking
**Examples**:
- `server/observability/logger.ts` - Winston logger with CloudWatch transport
- `server/observability/instruments.ts` - Sentry instrumentation

**Key Conventions**:
- Winston logger with console and CloudWatch transports
- Sentry integration for error tracking
- Structured logging with metadata
- JWT token sanitization in logs

### Utilities
**Category**: `utilities`
**What it is**: General-purpose utility functions
**Examples**:
- `server/utils/file-paths.ts` - File path resolution utilities

**Key Conventions**:
- Utility modules grouped by function
- Path resolution handles both absolute and relative paths

### React App
**Category**: `react-app`
**What it is**: React SPA entry point and main application
**Examples**:
- `src/react/App.tsx` - Main app component with routing
- `src/main.tsx` - React DOM mount point
- `index.html` - HTML entry point

**Key Conventions**:
- Vite-based React 18 application
- TypeScript functional components
- React hooks for state management
- localStorage for persistent configuration

### React Components
**Category**: `react-components`
**What it is**: Reusable React UI components
**Examples**:
- `src/react/components/ConnectionPanel/ConnectionPanel.tsx` - OAuth connection UI
- `src/react/components/ToolSelector/ToolSelector.tsx` - Tool selection dropdown
- `src/react/components/ToolForm/ToolForm.tsx` - Dynamic form for tool parameters

**Key Conventions**:
- Functional components with TypeScript interfaces for props
- Tailwind CSS for styling (no CSS modules or styled-components)
- Components in `src/react/components/[Name]/` directories
- Clear separation of concerns (input, display, logic)

### React Hooks
**Category**: `react-hooks`
**What it is**: Custom React hooks for state and side effects
**Examples**:
- `src/react/hooks/useMcpClient.ts` - MCP client connection management
- `src/react/hooks/useConfig.ts` - Configuration fetching and caching

**Key Conventions**:
- Hooks return object with state and methods
- Side effects managed with useEffect
- localStorage for persistence across sessions

### MCP Client (Browser)
**Category**: `mcp-client-browser`
**What it is**: Browser-based MCP client with OAuth and sampling
**Examples**:
- `src/mcp-client/client.ts` - BrowserMcpClient implementation
- `src/mcp-client/oauth/provider.ts` - Browser OAuth provider
- `src/mcp-client/sampling/anthropic.ts` - Anthropic sampling provider

**Key Conventions**:
- HTTP transport for MCP protocol
- OAuth auto-discovery and authentication
- Sampling support for LLM requests
- Session management via query parameters

### Styles
**Category**: `styles`
**What it is**: Global CSS and Tailwind configuration
**Examples**:
- `src/css/styles.css` - Global styles and Tailwind imports

**Key Conventions**:
- Tailwind CSS utilities for all styling
- No custom CSS outside of global styles
- No CSS-in-JS or CSS modules

### E2E Tests
**Category**: `e2e-tests`
**What it is**: End-to-end REST API workflow tests
**Examples**:
- `test/e2e/api-workflow.test.ts` - REST API integration tests
- `test/e2e/helpers/api-client.ts` - Test HTTP client

**Key Conventions**:
- Jest for test framework
- Real API calls to test endpoints
- Helper utilities for common test tasks
- Jira URL parsing from responses

### Specifications
**Category**: `specs`
**What it is**: Design specifications and feature documentation
**Examples**:
- `specs/1-feature-identifier.md` - Feature extraction spec
- `specs/write-next-story-tool.md` - Story generation tool spec
- `specs/make-oauth-reusable.md` - OAuth architecture spec

**Key Conventions**:
- Specifications numbered for ordering
- Tool-specific specs in tool directories
- Out-of-scope items documented
- Multiple implementations for complex features

### Spec Tests
**Category**: `spec-tests`
**What it is**: Test files for specifications and prototypes
**Examples**:
- `specs/atlassian-mcp-analysis/atlassian-mcp-test.js` - OAuth flow testing
- `specs/support-direct-api-requests.test.js` - REST API prototyping

**Key Conventions**:
- Prototype implementations for experimentation
- Integration tests for new features
- Mock servers for testing OAuth flows

### Test Helpers
**Category**: `test-helpers`
**What it is**: Shared test utilities and fixtures
**Examples**:
- `specs/shared/config/jest-setup.js` - Jest configuration
- `specs/shared/helpers/auth-flow.js` - OAuth flow testing helper
- `specs/shared/helpers/mcp-client.js` - MCP client test helper

**Key Conventions**:
- Helpers in `specs/shared/helpers/` directory
- Mock servers for external services
- Reusable assertions and setup functions

### Static Assets
**Category**: `static-assets`
**What it is**: Static files like images and icons
**Examples**:
- `static/favicon.ico` - Browser favicon

**Key Conventions**:
- Served from `static/` directory
- Referenced in index.html and components

---

## Part 2: Feature Scaffold Guide

### Step 1: Identify Feature Type

Determine what type of feature you're building:

- **MCP Tool**: New tool for Figma/Jira integration
- **OAuth Provider**: Support for new authentication provider
- **React Component**: New UI component for the mini client
- **REST Endpoint**: New REST API endpoint
- **Helper Function**: Utility for existing modules
- **LLM Provider**: Support for new LLM model

### Step 2: Determine File Categories

For each feature type, create files in these categories:

#### New MCP Tool (Single Provider)

1. **mcp-tools-[provider]**: Tool implementation
   - `server/providers/[provider]/tools/[tool-name]/[tool-name].ts` - Register tool with Zod schema
   - `server/providers/[provider]/tools/[tool-name]/core-logic.ts` - Core logic (reused by REST)
   - `server/providers/[provider]/tools/[tool-name]/index.ts` - Exports
   - `server/providers/[provider]/tools/[tool-name]/README.md` - Documentation

2. **provider-[provider]**: Update provider to register tool
   - Modify `server/providers/[provider]/index.ts` to include new tool registration

3. **rest-api** (optional): Create REST endpoint wrapper
   - `server/api/[tool-name].ts` - REST handler wrapping core logic

#### New MCP Tool (Combined Providers)

1. **mcp-tool-[name]**: Combined tool implementation
   - `server/providers/combined/tools/[name]/[name].ts` - Tool registration
   - `server/providers/combined/tools/[name]/core-logic.ts` - Core logic
   - `server/providers/combined/tools/[name]/prompt-*.ts` - LLM prompts
   - `server/providers/combined/tools/[name]/index.ts` - Exports
   - `server/providers/combined/tools/[name]/README.md` - Documentation

2. **provider-combined-tools**: Register in combined provider
   - Modify `server/providers/combined/index.ts`

3. **rest-api** (optional): Create REST endpoint
   - `server/api/[tool-name].ts`

#### New React Component

1. **react-components**: Component implementation
   - `src/react/components/[ComponentName]/[ComponentName].tsx`

2. **react-hooks** (if stateful): Custom hook
   - `src/react/hooks/use[ComponentName].ts`

3. **react-app**: Update App.tsx to include component

#### New OAuth Provider

1. **provider-interface**: Implement interface
   - `server/providers/[provider]/index.ts` - Provider implementation

2. **provider-[name]**: Provider-specific files
   - `server/providers/[provider]/[provider]-api-client.ts` - API client factory
   - `server/providers/[provider]/[provider]-helpers.ts` - Helper functions
   - `server/providers/[provider]/types.ts` - Type definitions

3. **mcp-tools-[provider]**: Provider tools
   - `server/providers/[provider]/tools/[tool-name]/` directory

4. **oauth-provider-flows**: Register OAuth routes
   - Update `server/provider-server-oauth/` files

5. **mcp-core**: Register in server factory
   - Modify `server/mcp-core/server-factory.ts`

#### New LLM Provider

1. **llm-providers**: Provider implementation
   - `server/llm-client/providers/[provider].ts` - `createGenerateTextFn` function

2. **llm-client**: Update factory
   - Modify `server/llm-client/provider-factory.ts` to include new provider

### Step 3: Follow Naming Conventions

- **Functions**: `create[Name]`, `execute[Action]`, `handle[Action]`, `get[Name]`
- **Variables**: `is[State]`, `has[Property]`, `[name]Provider`, `[name]Client`
- **Files**: kebab-case with purpose prefix (`tool-name.ts`, `api-client.ts`)
- **Types**: PascalCase (`StandardTokenResponse`, `AuthContext`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_TOKENS`, `DEFAULT_SCOPE`)

### Step 4: Code Patterns

#### Tool Registration Pattern

```typescript
mcp.registerTool(
  {
    name: '[provider]-[action]',
    description: 'What this tool does',
    inputSchema: z.object({
      param: z.string().describe('Description'),
    }),
  },
  async (params) => {
    const authInfo = getAuthInfoSafe(context);
    if (!authInfo.[provider]) {
      return { content: [{ type: 'text', text: 'Error: [Provider] auth required' }] };
    }

    try {
      const result = await executeToolLogic(params, authInfo, generateText);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);
```

#### API Client Factory Pattern

```typescript
export function create[Provider]Client(token: string) {
  return {
    async fetch(url: string, options?: any) {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      });

      if (response.status === 401) {
        throw new InvalidTokenError('Token expired');
      }

      return response;
    },

    get baseUrl() {
      return 'https://api.[provider].com';
    }
  };
}
```

#### React Component Pattern

```typescript
interface [ComponentName]Props {
  onAction: (data: string) => void;
  isLoading?: boolean;
}

export const [ComponentName]: React.FC<[ComponentName]Props> = ({
  onAction,
  isLoading = false,
}) => {
  const [state, setState] = useState<string>('');

  const handleClick = async () => {
    await onAction(state);
  };

  return (
    <div className="p-4">
      <input
        value={state}
        onChange={(e) => setState(e.target.value)}
        disabled={isLoading}
        className="px-3 py-2 border rounded"
      />
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
      >
        {isLoading ? 'Processing...' : 'Submit'}
      </button>
    </div>
  );
};
```

### Step 5: Integration Checklist

Before completing a feature:

- [ ] **TypeScript**: Full type coverage, no `any`
- [ ] **Zod Validation**: Input schemas defined with Zod
- [ ] **Error Handling**: Auth errors throw `InvalidTokenError`, others return content
- [ ] **Token Safety**: No full tokens logged; use `getTokenLogInfo`
- [ ] **Separation of Concerns**: Tool handlers separate from core logic
- [ ] **Naming**: Follow function/file/variable naming conventions
- [ ] **Documentation**: README or inline comments explaining complex logic
- [ ] **Tests**: Unit tests for core logic, E2E tests for API endpoints
- [ ] **Exports**: Proper index.ts files for module organization

---

## Part 3: Integration Rules & Constraints

### MCP Protocol Rules

1. **Per-Session Servers**: Create new MCP server per session, never global
   - Server registration: `server/mcp-core/server-factory.ts`
   - Tool availability based on authenticated providers in `AuthContext`

2. **Tool Registration**: All tools use Zod input schema validation
   - Format: `mcp.registerTool({ name, description, inputSchema }, handler)`
   - Return format: `{ content: [{ type: 'text', text: string }] }`

3. **Combined Tools**: Only register when both Atlassian AND Figma authenticated
   ```typescript
   if (authContext.atlassian && authContext.figma) {
     combinedProvider.registerTools(mcp, authContext);
   }
   ```

4. **Tool Naming**: Provider-prefixed kebab-case
   - Single-provider: `[provider]-[action]` (e.g., `atlassian-search`)
   - Combined: `[verb]-[noun]` (e.g., `write-shell-stories`)
   - Utility: `utility-[name]` (e.g., `utility-test-sampling`)

### OAuth Provider Rules

1. **Functional Objects**: All providers are simple objects, never classes
2. **Token in Closure**: Tokens captured in closure, never passed as parameters
3. **PKCE Support**: OAuth flows use PKCE code challenge/verifier
4. **Error Detection**: 401 responses throw `InvalidTokenError`
5. **Refresh Handling**: Support both rotating tokens (Atlassian) and reused tokens (Figma)

### LLM Integration Rules

1. **Provider Abstraction**: Support multiple providers via unified `GenerateTextFn` interface
2. **Header-Based Selection**: Provider specified via `X-LLM-Provider` header (default: Anthropic)
3. **Queued Execution**: Use `createQueuedGenerateText` for concurrency control
4. **MCP Sampling**: Use `createMcpLLMClient` for tool-driven LLM requests
5. **Prompt Generator Functions**: Generate prompts from functions, not hardcoded strings

### React Component Rules

1. **Functional Components**: Use React 18 functional components, never class components
2. **TypeScript Props**: All components have typed props interface
3. **Tailwind CSS**: Style with Tailwind utility classes, no CSS modules
4. **React Hooks**: Use `useState`, `useEffect`, `useRef` for state management
5. **localStorage**: Use for persisting configuration (e.g., API keys)

### REST API Rules

1. **Endpoint Prefix**: All endpoints under `/api/` prefix
2. **HTTP Method**: Tool endpoints use POST
3. **Authentication**: PAT headers `X-Atlassian-Token`, `X-Figma-Token`
4. **Response Format**: `{ success: true, result: string }` or `{ error: string }`
5. **Core Logic Sharing**: REST handlers wrap same core logic as MCP tools

### Error Handling Rules

1. **InvalidTokenError**: Thrown for 401 responses to trigger OAuth re-authentication
2. **Content Errors**: Other errors returned as tool content with helpful messages
3. **Token Safety**: Never log full tokens; use `getTokenLogInfo`
4. **Helpful Messages**: Guide users to solutions, not just "error occurred"
5. **Validation**: Use Zod for input validation with clear error messages

### Caching Rules

1. **File-Based Cache**: Use filesystem with cache/[resource-type]/[id]/ structure
2. **Resource ID**: Cache by resource ID (not epic key) for cross-epic reuse
3. **Node ID Conversion**: Figma node IDs with colons converted to dashes (1:2 → 1-2)
4. **Timestamp Validation**: Compare lastModified/lastTouchedAt with cache time
5. **Metadata Files**: Write `.figma-metadata.json` or `.confluence-metadata.json`

### Logging Rules

1. **Winston Logger**: Central logger with console and CloudWatch transports
2. **Structured Metadata**: Include context objects in log calls
3. **JWT Sanitization**: Use `sanitizeObjectWithJWTs` before logging
4. **Log Levels**: Use ERROR, WARN, INFO, DEBUG appropriately
5. **Sentry Integration**: Capture important errors with Sentry

---

## Part 4: Example Prompt Usage

### Example 1: New MCP Tool

**User Prompt**:
> "Create a new MCP tool called 'atlassian-create-label' that creates labels in Jira issues. It should take a label name and list of issue keys as input, validate the label doesn't already exist, and create it on all specified issues."

**AI Response Should Create**:

1. `server/providers/atlassian/tools/atlassian-create-label/atlassian-create-label.ts`
   - Tool registration with Zod schema
   - Validates auth context for Atlassian
   - Calls core logic

2. `server/providers/atlassian/tools/atlassian-create-label/core-logic.ts`
   - Actual implementation
   - Validates label doesn't exist
   - Creates label on issues
   - Returns summary

3. `server/providers/atlassian/tools/atlassian-create-label/index.ts`
   - Exports registerAtlassianCreateLabelTool

4. `server/providers/atlassian/tools/atlassian-create-label/README.md`
   - Tool documentation

5. Update `server/providers/atlassian/tools/index.ts`
   - Import and export new tool

6. Update `server/providers/atlassian/index.ts`
   - Register tool in atlassianProvider.registerTools

7. (Optional) `server/api/atlassian-create-label.ts`
   - REST API endpoint wrapper

### Example 2: React Component

**User Prompt**:
> "Create a React component called 'IssueSelector' that allows users to select Jira issues from a searchable, paginated list. It should accept an onSelect callback and display issue keys and summaries."

**AI Response Should Create**:

1. `src/react/components/IssueSelector/IssueSelector.tsx`
   - Functional component with TypeScript props
   - Search input with debounce
   - Paginated list display
   - Tailwind styling

2. `src/react/hooks/useIssueSearch.ts`
   - Custom hook for issue fetching
   - Search and pagination logic
   - Caching of results

3. (Optional) Update `src/react/App.tsx`
   - Import and use IssueSelector component

### Example 3: OAuth Provider

**User Prompt**:
> "Add support for GitHub OAuth as a new provider. Create the provider implementation with proper OAuth flow and add tools to search repositories and get repository information."

**AI Response Should Create**:

1. `server/providers/github/index.ts`
   - githubProvider implementation
   - PKCE flow for OAuth
   - Registers GitHub tools

2. `server/providers/github/github-api-client.ts`
   - createGithubClient factory
   - Token in closure pattern
   - Base URL and helper methods

3. `server/providers/github/github-helpers.ts`
   - Helper functions (searchRepositories, getRepoInfo, etc.)
   - Error handling for GitHub API

4. `server/providers/github/types.ts`
   - GitHub-specific type definitions

5. `server/providers/github/tools/github-search-repos.ts`
   - MCP tool for searching repositories

6. `server/providers/github/tools/github-get-repo.ts`
   - MCP tool for fetching repository details

7. Update `server/mcp-core/server-factory.ts`
   - Add GitHub provider registration based on auth context

8. Update `server/provider-server-oauth/index.ts`
   - Add GitHub OAuth endpoints

### Example 4: LLM Provider

**User Prompt**:
> "Add support for Claude 3 Opus model from Anthropic as an LLM provider option."

**AI Response Should Create**:

1. Update `server/llm-client/providers/anthropic.ts`
   - Add Opus model support alongside Sonnet
   - Provider factory still uses base createGenerateTextFn

2. Update `server/llm-client/provider-factory.ts`
   - Add mapping for Opus model
   - Provider selection from headers unchanged

3. No new files needed - just configuration updates

---

## Part 5: Key References for Implementation

### Architectural Domains

Cascade MCP uses these key architectural patterns:

1. **OAuth Provider Abstraction**: Multi-provider OAuth with PKCE, functional objects with closure-based state
2. **MCP Protocol**: Per-session servers with dynamic tool registration based on auth context
3. **LLM Integration**: Multi-provider abstraction with unified interface, header-based provider selection
4. **API Client Pattern**: Token-in-closure pattern eliminating auth threading through parameters
5. **Caching Strategy**: File-based cache by resource ID for cross-epic reuse, timestamp validation
6. **Workflow Tools**: MCP tools with thin handlers calling separate core logic, reused by REST
7. **Prompt Engineering**: Function-generated prompts with scope-based planning and strict formats
8. **Error Handling**: InvalidTokenError for 401s to trigger OAuth, content for other errors
9. **Logging & Observability**: Winston logger with CloudWatch, Sentry integration, JWT sanitization
10. **REST API**: PAT-authenticated endpoints wrapping MCP tool core logic
11. **UI Components**: React functional components with Tailwind, React hooks for state
12. **Express Server**: Middleware-based setup with trust proxy, session management, Sentry

### Style Guide References

For detailed conventions per category, refer to:
- `STYLEGUIDE_SUMMARY.md` - Overall coding philosophy and unique patterns
- `mcp-tools.md` - MCP tool registration and implementation patterns
- `providers-and-clients.md` - OAuth provider and API client patterns
- Domain documentation in `4-domains/` directory

### File Organization Reference

```
project root
├── server/
│   ├── mcp-core/             # MCP server factory
│   ├── llm-client/           # LLM provider abstraction
│   ├── providers/            # OAuth providers
│   │   ├── atlassian/
│   │   ├── figma/
│   │   ├── combined/         # Multi-provider tools
│   │   └── provider-interface.ts
│   ├── api/                  # REST endpoints
│   ├── pkce/                 # OAuth PKCE flow
│   ├── observability/        # Logging/monitoring
│   └── server.ts             # Express app
├── src/
│   ├── react/
│   │   ├── components/       # React components
│   │   ├── hooks/            # React hooks
│   │   └── App.tsx
│   ├── mcp-client/           # Browser MCP client
│   └── css/                  # Global styles
├── test/
│   └── e2e/                  # E2E tests
└── specs/                    # Specifications
```

---

## Conclusion

This instruction file provides everything needed for an AI assistant to generate features consistent with Cascade MCP's architecture and conventions. Key principles:

- **Functional over OOP**: Use functional objects and closures
- **Type Safety**: Full TypeScript with Zod validation
- **Separation of Concerns**: Tool handlers separate from core logic
- **Multi-Provider**: Support multiple OAuth providers and LLM models
- **Error Handling**: Auth errors trigger re-auth, others return helpful content
- **Consistency**: Follow established patterns for new features

For questions about specific patterns or conventions, refer to the domain documentation in `4-domains/` or style guides in `5-style-guides/`.
