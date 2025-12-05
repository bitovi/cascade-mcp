# Multi-Provider Support (Follow-up)

## Scope

This spec builds on `19-ai-sdk.md` to support multiple LLM providers for the REST API. Since users choose their provider via request headers, the server must have all major providers installed and ready.

**What's Included**: Provider factory with header-based selection, comprehensive provider installation, error handling

**Prerequisites**: Complete `19-ai-sdk.md` first (API abstraction layer)

## Current State (After Spec 19)

- Only `@ai-sdk/anthropic` is installed
- Provider selection via `LLM_PROVIDER` environment variable works
- Single-provider focus (Anthropic)

## Goal

Support 7+ major LLM providers so users can choose their preferred provider and API key via request headers. Users control which provider processes their requests in this multi-tenant API.

## Implementation Plan

### Phase 1: Install All Major Provider Packages

**1.1 Add provider dependencies to package.json**
- File: `package.json`
- Install these major providers as regular dependencies:
  - `@ai-sdk/anthropic` - Claude (already installed, default)
  - `@ai-sdk/openai` - GPT models
  - `@ai-sdk/google` - Gemini models
  - `@ai-sdk/amazon-bedrock` - AWS Bedrock (critical for enterprise)
  - `@ai-sdk/mistral` - Mistral models
  - `@ai-sdk/deepseek` - DeepSeek models (cost-effective)
  - `@ai-sdk/groq` - Groq models (speed-focused)
  - `@ai-sdk/xai` - Grok models (growing popularity)
- Keep core `ai` package as regular dependency
- **Rationale**: Multi-tenant API needs all providers available for user choice
- **Success criteria**: All 8 provider packages installed successfully

**1.2 Document supported providers**
- File: `server/llm-client/providers/README.md`
- Create comprehensive provider guide with:
  - Provider name
  - Package name
  - AI SDK parameter names (determines header/env var names)
  - Naming convention: `apiKey` → `x-provider-api-key` / `PROVIDER_API_KEY`
  - Typical API key format
  - Links to get API keys
- Note: Headers are case-insensitive (HTTP standard), Express normalizes to lowercase
- **Success criteria**: Clear documentation of naming convention and all supported providers

### Phase 2: Implement Provider Selection Logic

**2.1 Define provider module structure**
- Directory: `server/llm-client/providers/`
- Each provider gets its own module file
- Each module exports: `createProviderFromHeaders(headers: Record<string, string>)`
- Each module decides which headers to look for
- Each module imports its AI SDK package directly
- **Success criteria**: Clear structure for adding new providers

**2.2 Create provider-specific modules**
- Files: `server/llm-client/providers/anthropic.ts`, `openai.ts`, `google.ts`, etc.
- Each module exports a function: `createProviderFromHeaders(headers: Record<string, string>)`
- Each provider module:
  1. Imports its AI SDK package (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.)
  2. Defines which headers it needs (with legacy support where applicable)
  3. Extracts credentials from headers with env var fallbacks
  4. Calls AI SDK's creation function with config
- Example for simple API key providers:
  ```typescript
  // server/llm-client/providers/anthropic.ts
  import { createAnthropic } from '@ai-sdk/anthropic';
  
  export function createProviderFromHeaders(headers: Record<string, string>) {
    // Support both legacy and new standard naming
    const apiKey = headers['x-anthropic-key'] || // Legacy (current)
                   headers['x-provider-api-key'] || // New standard
                   process.env.ANTHROPIC_API_KEY || // Legacy (current)
                   process.env.PROVIDER_API_KEY;     // New standard
    if (!apiKey) {
      throw new MissingCredentialsError('Anthropic API key required');
    }
    return createAnthropic({ apiKey });
  }
  ```
- **Note**: Anthropic uses legacy naming (`x-anthropic-key`, `ANTHROPIC_API_KEY`) but will support new standard for consistency
- **Success criteria**: Each provider has its own module that knows how to configure itself

**2.3 Create helper for standard providers**
- File: `server/llm-client/providers/provider-helpers.ts`
- Function: `createSimpleProvider(config: SimpleProviderConfig)`
- Helper that generates provider module functions matching AI SDK parameter names
- Automatically derives header and env var names from AI SDK config keys
- Naming convention:
  - AI SDK param: `apiKey` → Header: `x-provider-api-key` → Env: `PROVIDER_API_KEY`
  - Headers normalized to lowercase by Express
  - Environment variables uppercase with underscores
- Example:
  ```typescript
  interface SimpleProviderConfig<T> {
    createFn: (config: T) => Provider;
    providerName: string;
    keys: (keyof T)[];  // Matches createFn parameter names
    legacyNames?: Partial<Record<keyof T, { header?: string; env?: string }>>;  // Backwards compatibility
  }
  
  export function createSimpleProvider<T extends Record<string, any>>(
    config: SimpleProviderConfig<T>
  ) {
    return function createProviderFromHeaders(headers: Record<string, string>) {
      const providerConfig = {} as T;
      const missingKeys: string[] = [];
      
      for (const key of config.keys) {
        const keyStr = String(key);
        // Convert camelCase to kebab-case for header
        const headerKey = `x-provider-${keyStr.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
        // Convert camelCase to UPPER_SNAKE_CASE for env var
        const envKey = `PROVIDER_${keyStr.replace(/[A-Z]/g, m => `_${m}`).toUpperCase()}`;
        
        // Check legacy names first for backwards compatibility, then new standard names
        const legacyHeader = config.legacyNames?.[key]?.header;
        const legacyEnv = config.legacyNames?.[key]?.env;
        const value = (legacyHeader ? headers[legacyHeader] : undefined) ||
                      (legacyEnv ? process.env[legacyEnv] : undefined) ||
                      headers[headerKey] || 
                      process.env[envKey];
        if (!value) {
          missingKeys.push(`${headerKey} header or ${envKey} env var`);
        } else {
          providerConfig[key] = value;
        }
      }
      
      if (missingKeys.length > 0) {
        throw new MissingCredentialsError(
          `${config.providerName} requires: ${missingKeys.join(', ')}`
        );
      }
      
      return config.createFn(providerConfig);
    };
  }
  ```
- **Success criteria**: Helper derives names from AI SDK parameter names

**2.4 Implement main factory dispatcher**
- File: `server/llm-client/provider-factory.ts`
- Function: `async createProviderFromHeaders(headers: Record<string, string>)`
- Imports all provider modules at top of file (no dynamic imports)
- Switches on provider name to call appropriate provider module
- Example:
  ```typescript
  import * as anthropicProvider from './providers/anthropic.js';
  import * as openaiProvider from './providers/openai.js';
  import * as googleProvider from './providers/google.js';
  import * as bedrockProvider from './providers/bedrock.js';
  // ... other providers
  
  const PROVIDER_MODULES = {
    'anthropic': anthropicProvider,
    'openai': openaiProvider,
    'google': googleProvider,
    'bedrock': bedrockProvider,
    'mistral': mistralProvider,
    'deepseek': deepseekProvider,
    'groq': groqProvider,
    'xai': xaiProvider,
  } as const;
  
  export function createProviderFromHeaders(headers: Record<string, string>) {
    const providerName = headers['x-llm-provider'] || 'anthropic';
    const providerModule = PROVIDER_MODULES[providerName];
    
    if (!providerModule) {
      throw new UnsupportedProviderError(
        `Provider "${providerName}" not supported. ` +
        `Supported: ${Object.keys(PROVIDER_MODULES).join(', ')}`
      );
    }
    
    return providerModule.createProviderFromHeaders(headers);
  }
  ```
- **Success criteria**: Main factory delegates to provider-specific modules

**2.5 Create custom error types**
- File: `server/llm-client/provider-errors.ts`
- `UnsupportedProviderError`: When provider name not in registry
- `InvalidProviderError`: When provider initialization fails
- `MissingCredentialsError`: When API key not provided
- Each with helpful messages listing supported providers
- **Success criteria**: Clear, actionable error messages

### Phase 3: Implement Header-Based Provider Creation

**3.1 Implement standard provider modules using helper**
- Files: `server/llm-client/providers/{provider}.ts` for each simple provider
- Use helper with AI SDK parameter names
- Example implementations:
  ```typescript
  // server/llm-client/providers/anthropic.ts
  import { createAnthropic } from '@ai-sdk/anthropic';
  import { createSimpleProvider } from './provider-helpers.js';
  
  export const createProviderFromHeaders = createSimpleProvider({
    createFn: createAnthropic,
    providerName: 'Anthropic',
    keys: ['apiKey'],  // Matches createAnthropic({ apiKey }) parameter
    legacyNames: {
      apiKey: {
        header: 'x-anthropic-key',     // Current/legacy header (primary for backwards compatibility)
        env: 'ANTHROPIC_API_KEY',       // Current/legacy env var (primary for backwards compatibility)
      },
    },
  });
  // Looks for (in order of precedence):
  // 1. x-anthropic-key header (current/legacy, primary for Anthropic)
  // 2. ANTHROPIC_API_KEY env var (current/legacy, primary for Anthropic)
  // 3. x-provider-api-key header (new standard, also supported)
  // 4. PROVIDER_API_KEY env var (new standard, also supported)
  // Note: Legacy names checked first for backwards compatibility
  
  // server/llm-client/providers/openai.ts
  import { createOpenAI } from '@ai-sdk/openai';
  import { createSimpleProvider } from './provider-helpers.js';
  
  export const createProviderFromHeaders = createSimpleProvider({
    createFn: createOpenAI,
    providerName: 'OpenAI',
    keys: ['apiKey'],
  });
  // Looks for: x-provider-api-key header or PROVIDER_API_KEY env var
  ```
- Headers are case-insensitive (Express normalizes to lowercase)
- Consistent naming: `x-provider-{param-name}` header, `PROVIDER_{PARAM_NAME}` env var
- **Success criteria**: Standard providers use helper with AI SDK parameter names

**3.2 Implement Bedrock provider module**
- File: `server/llm-client/providers/bedrock.ts`
- Bedrock uses the helper with multiple keys for its AWS credentials
- Implementation using helper:
  ```typescript
  import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
  import { createSimpleProvider } from './provider-helpers.js';
  
  export const createProviderFromHeaders = createSimpleProvider({
    createFn: createAmazonBedrock,
    providerName: 'AWS Bedrock',
    keys: ['region', 'accessKeyId', 'secretAccessKey', 'sessionToken'],
  });
  // Looks for:
  // x-provider-region / PROVIDER_REGION
  // x-provider-access-key-id / PROVIDER_ACCESS_KEY_ID (required)
  // x-provider-secret-access-key / PROVIDER_SECRET_ACCESS_KEY (required)
  // x-provider-session-token / PROVIDER_SESSION_TOKEN (optional)
  ```
- **Note**: The helper will handle all required vs optional key validation
- **Note**: Region defaults can be handled by AI SDK itself or in helper
- **Success criteria**: Bedrock module handles multi-part credentials with consistent naming using the helper

**3.3 Add model selection helper**
- File: `server/llm-client/provider-factory.ts`
- Function: `getModelFromHeaders(headers: Record<string, string>, defaultModel?: string)`
- Extracts model ID from `X-LLM-Model` header
- Falls back to `LLM_MODEL` environment variable or provided default
- Example:
  ```typescript
  export function getModelFromHeaders(
    headers: Record<string, string>,
    defaultModel?: string
  ): string {
    return headers['x-llm-model'] || 
           process.env.LLM_MODEL || 
           defaultModel ||
           'claude-sonnet-4-5-20250929';
  }
  ```
- **Success criteria**: Model selection works from headers or env vars

**3.4 Update REST API endpoints to use factory**
- Files: `server/api/write-shell-stories.ts`, `server/api/write-next-story.ts`, etc.
- Replace direct Anthropic client creation with factory calls
- Simplified flow:
  1. Call `createProviderFromHeaders(headers)`
  2. Get model ID via `getModelFromHeaders(headers, defaultModel)`
  3. Create model from provider: `const model = provider(modelId)`
  4. Use model with AI SDK functions (`generateText`, `streamText`, etc.)
- Example:
  ```typescript
  const provider = createProviderFromHeaders(req.headers);
  const modelId = getModelFromHeaders(req.headers, 'claude-sonnet-4-5-20250929');
  const model = provider(modelId);
  
  const result = await generateText({ model, prompt: '...' });
  ```
- **Success criteria**: API endpoints use headers for both provider and model selection

### Phase 4: Special Provider Handling

**4.1 Test AWS Bedrock special handling**
- File: `server/llm-client/providers/bedrock.test.ts`
- Verify Bedrock module extracts multi-part credentials correctly:
  - `x-provider-access-key-id` (required) / `PROVIDER_ACCESS_KEY_ID`
  - `x-provider-secret-access-key` (required) / `PROVIDER_SECRET_ACCESS_KEY`
  - `x-provider-region` (optional, defaults to `us-east-1`) / `PROVIDER_REGION`
  - `x-provider-session-token` (optional) / `PROVIDER_SESSION_TOKEN`
- Verify all values explicitly passed to AI SDK (even `undefined`)
- Test error cases: missing access key, missing secret key
- Test header case-insensitivity (Express normalizes to lowercase)
- **Success criteria**: Bedrock authentication tests pass with multi-part credentials

**4.2 Add provider-specific model validation**
- File: `server/llm-client/provider-factory.ts`
- Validate model names match provider requirements
- Map generic model names to provider-specific IDs if needed
- Example: User requests "claude-3-sonnet" → map to provider-specific model ID
- **Success criteria**: Model validation prevents runtime errors

### Phase 5: Testing and Documentation

**5.1 Create provider integration tests**
- Test file: `server/llm-client/provider-factory.test.ts`
- Tests for each provider:
  - Provider loads successfully with valid API key
  - Missing API key → helpful error message
  - Invalid provider name → helpful error message
  - Provider-specific authentication works (especially Bedrock)
- **Success criteria**: All providers tested with proper error handling

**5.2 Update REST API documentation**
- File: `server/llm-client/providers/README.md` (comprehensive provider guide)
- Also update `server/readme.md` with link to provider guide
- Document consistent naming convention:
  - Headers: `x-provider-{param-name}` (lowercase, Express normalizes)
  - Env vars: `PROVIDER_{PARAM_NAME}` (uppercase with underscores)
  - AI SDK param names determine both (e.g., `apiKey` → `x-provider-api-key` / `PROVIDER_API_KEY`)
- For each provider: header names, env var names, AI SDK params, model IDs, example request
- Special section for AWS Bedrock multi-credential setup
- Document `X-LLM-Model` header for model selection
- Example:
  ```bash
  # Use Anthropic (default provider and model) - Legacy naming (primary)
  curl -H "X-Anthropic-Key: sk-ant-..." \
       -d '{"epicKey": "PROJ-123"}'
  
  # Use Anthropic with new standard naming (also supported)
  curl -H "X-Provider-Api-Key: sk-ant-..." \
       -d '{"epicKey": "PROJ-123"}'
  
  # Use Anthropic with specific model
  curl -H "X-Anthropic-Key: sk-ant-..." \
       -H "X-LLM-Provider: anthropic" \
       -H "X-LLM-Model: claude-opus-4-20250514" \
       -d '{"epicKey": "PROJ-123"}'
  
  # Use OpenAI
  curl -H "X-Provider-Api-Key: sk-..." \
       -H "X-LLM-Provider: openai" \
       -H "X-LLM-Model: gpt-4o" \
       -d '{"epicKey": "PROJ-123"}'
  
  # Use AWS Bedrock
  curl -H "X-Provider-Access-Key-Id: AKIA..." \
       -H "X-Provider-Secret-Access-Key: ..." \
       -H "X-Provider-Region: us-east-1" \
       -H "X-LLM-Provider: bedrock" \
       -H "X-LLM-Model: anthropic.claude-3-5-sonnet-20241022-v2:0" \
       -d '{"epicKey": "PROJ-123"}'
  ```
- Note: Headers are case-insensitive but shown in title case for readability
- **Success criteria**: Clear documentation with consistent naming convention

**5.3 Test environment variable fallbacks**
- Test files: Each provider module's test file
- Verify environment variables used as fallback when headers not provided
- Test consistent naming convention:
  - `PROVIDER_API_KEY` for simple providers (Anthropic, OpenAI, Google, etc.)
  - `PROVIDER_ACCESS_KEY_ID`, `PROVIDER_SECRET_ACCESS_KEY`, `PROVIDER_REGION`, `PROVIDER_SESSION_TOKEN` for Bedrock
- Verify headers take precedence over environment variables
- Test that helper maintains consistent fallback behavior
- Test header case-insensitivity (uppercase, lowercase, mixed case all work)
- Test Anthropic backwards compatibility:
  - `x-anthropic-key` header works (primary/legacy)
  - `ANTHROPIC_API_KEY` env var works (primary/legacy)
  - `x-provider-api-key` header also works (new standard)
  - `PROVIDER_API_KEY` env var also works (new standard)
  - Legacy names take precedence when both present (for backwards compatibility)
- **Success criteria**: Both header and env var patterns work with consistent naming, Anthropic legacy names work

## File Structure Changes

```
server/llm-client/
├── provider-factory.ts          # UPDATED: Main dispatcher + getModelFromHeaders()
├── provider-errors.ts           # NEW: Custom error types with helpful messages
└── providers/
    ├── provider-helpers.ts      # NEW: Helper to create standard provider modules
    ├── anthropic.ts             # NEW: Anthropic provider module
    ├── openai.ts                # NEW: OpenAI provider module
    ├── google.ts                # NEW: Google provider module
    ├── bedrock.ts               # NEW: Bedrock provider module (special case)
    ├── mistral.ts               # NEW: Mistral provider module
    ├── deepseek.ts              # NEW: DeepSeek provider module
    ├── groq.ts                  # NEW: Groq provider module
    └── xai.ts                   # NEW: xAI provider module
```

## Success Criteria Summary

- ✅ **Phase 1**: All 8 major provider packages installed
- ✅ **Phase 2**: Provider modules created with consistent helper, main factory dispatches
- ✅ **Phase 3**: Provider modules use helper for consistency, Bedrock special-cased, REST API updated
- ✅ **Phase 4**: AWS Bedrock multi-credential authentication works, model validation implemented
- ✅ **Phase 5**: Testing, documentation, and env var fallbacks complete

## Design Decisions

1. **Install all major providers**: Since this is a multi-tenant API where users choose their provider via headers, all major providers must be pre-installed. This ensures requests work regardless of user choice.

2. **Use AI SDK provider creation functions**: Each provider has its own creation function (`createAnthropic`, `createOpenAI`, `createAmazonBedrock`, etc.) that accepts configuration objects. This is the official AI SDK pattern for configuring providers.

3. **Consistent naming convention derived from AI SDK**: 
   - Helper function uses AI SDK parameter names (e.g., `apiKey`, `accessKeyId`)
   - Automatically derives header names: `x-provider-{param-name}` (kebab-case)
   - Automatically derives env var names: `PROVIDER_{PARAM_NAME}` (UPPER_SNAKE_CASE)
   - Headers are case-insensitive (HTTP standard, Express normalizes to lowercase)
   - Examples:
     - `apiKey` → `x-provider-api-key` / `PROVIDER_API_KEY`
     - `accessKeyId` → `x-provider-access-key-id` / `PROVIDER_ACCESS_KEY_ID`

4. **AWS Bedrock explicit configuration**: Enterprise customers heavily use Bedrock. Must explicitly pass all configuration values (even `undefined` for unused ones) to prevent environment variable pollution in serverless environments, per AI SDK documentation.

5. **Modular provider architecture**: Each provider has its own module that knows how to configure itself from headers. Consistent helper function ensures uniform header-to-config mapping. Main factory dispatches to appropriate module.

6. **Provider instance per request**: Create fresh provider instances per request with user credentials rather than singleton pattern. Ensures proper credential isolation in multi-tenant setup.

7. **Environment variable fallbacks**: Support both header-based (multi-tenant) and env var (single-tenant) patterns. Headers take precedence when both present. Model selection via `X-LLM-Model` header or `LLM_MODEL` environment variable.

8. **Backward compatibility**: 
   - Default to Anthropic when no provider specified
   - Anthropic provider maintains legacy naming as primary for backwards compatibility:
     - `X-Anthropic-Key` (current/legacy, checked first) and `x-provider-api-key` (new standard, also supported)
     - `ANTHROPIC_API_KEY` (current/legacy, checked first) and `PROVIDER_API_KEY` (new standard, also supported)
   - Legacy names take precedence to ensure existing deployments continue working
   - New providers (OpenAI, Google, etc.) use only the new standard naming
   - Existing code continues working without changes

## Related Specs

- **Previous**: `19-ai-sdk.md` - API abstraction layer using Vercel AI SDK
- **Related**: `server/readme.md` - Will be updated with provider installation guide
