# LLM Provider Guide

This directory contains provider modules that enable the API to work with multiple LLM providers. Each provider module handles authentication and configuration for a specific LLM service.

## Supported LLM Clients

### Simple API Key Providers

These providers require only an API key for authentication:

#### Anthropic (Claude)
- **Package**: `@ai-sdk/anthropic`
- **AI SDK Creation Function**: `createAnthropic({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key` (standard) or `X-Anthropic-Key` (legacy, backwards compatible)
  - Env Var: `PROVIDER_API_KEY` (standard) or `ANTHROPIC_API_KEY` (legacy, backwards compatible)
- **Default Model**: `claude-sonnet-4-5-20250929`
- **Get API Key**: https://console.anthropic.com/
- **Example Models**: `claude-opus-4-20250514`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-20250925`

#### OpenAI (GPT)
- **Package**: `@ai-sdk/openai`
- **AI SDK Creation Function**: `createOpenAI({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://platform.openai.com/api-keys
- **Example Models**: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`

#### Google (Gemini)
- **Package**: `@ai-sdk/google`
- **AI SDK Creation Function**: `createGoogle({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://aistudio.google.com/app/apikey
- **Example Models**: `gemini-2.0-flash-exp`, `gemini-1.5-pro`, `gemini-1.5-flash`

#### Mistral
- **Package**: `@ai-sdk/mistral`
- **AI SDK Creation Function**: `createMistral({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://console.mistral.ai/
- **Example Models**: `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`

#### DeepSeek
- **Package**: `@ai-sdk/deepseek`
- **AI SDK Creation Function**: `createDeepSeek({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://platform.deepseek.com/
- **Example Models**: `deepseek-chat`, `deepseek-coder`
- **Note**: Cost-effective option for high-volume usage

#### Groq
- **Package**: `@ai-sdk/groq`
- **AI SDK Creation Function**: `createGroq({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://console.groq.com/keys
- **Example Models**: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`
- **Note**: Speed-optimized inference

#### xAI (Grok)
- **Package**: `@ai-sdk/xai`
- **AI SDK Creation Function**: `createXai({ apiKey })`
- **Authentication**:
  - Header: `X-Provider-Api-Key`
  - Env Var: `PROVIDER_API_KEY`
- **Get API Key**: https://console.x.ai/
- **Example Models**: `grok-beta`, `grok-vision-beta`

### Multi-Credential Providers

#### AWS Bedrock
- **Package**: `@ai-sdk/amazon-bedrock`
- **AI SDK Creation Function**: `createAmazonBedrock({ region, accessKeyId, secretAccessKey, sessionToken })`
- **Authentication** (all credentials required):
  - Headers:
    - `X-Provider-Access-Key-Id` (required)
    - `X-Provider-Secret-Access-Key` (required)
    - `X-Provider-Region` (optional, defaults to `us-east-1`)
    - `X-Provider-Session-Token` (optional, for temporary credentials)
  - Env Vars:
    - `PROVIDER_ACCESS_KEY_ID` (required)
    - `PROVIDER_SECRET_ACCESS_KEY` (required)
    - `PROVIDER_REGION` (optional, defaults to `us-east-1`)
    - `PROVIDER_SESSION_TOKEN` (optional)
- **Get Credentials**: AWS IAM Console
- **Example Models**: `anthropic.claude-3-5-sonnet-20241022-v2:0`, `anthropic.claude-3-opus-20240229-v1:0`
- **Note**: Critical for enterprise customers, supports Claude and other models

## Naming Convention

All provider authentication follows a consistent pattern derived from the AI SDK's parameter names:

### Header Names
- Format: `X-Provider-{Param-Name}` (kebab-case)
- Case-insensitive (HTTP standard, Express normalizes to lowercase)
- Examples:
  - `apiKey` → `X-Provider-Api-Key`
  - `accessKeyId` → `X-Provider-Access-Key-Id`
  - `secretAccessKey` → `X-Provider-Secret-Access-Key`

### Environment Variable Names
- Format: `PROVIDER_{PARAM_NAME}` (UPPER_SNAKE_CASE)
- Examples:
  - `apiKey` → `PROVIDER_API_KEY`
  - `accessKeyId` → `PROVIDER_ACCESS_KEY_ID`
  - `secretAccessKey` → `PROVIDER_SECRET_ACCESS_KEY`

### Legacy Names (Backwards Compatibility)
- **Anthropic only**: Supports legacy header/env var names for seamless migration
  - Legacy header: `X-Anthropic-Key`
  - Legacy env var: `ANTHROPIC_API_KEY`
  - Standard names take precedence when both present

## Usage Examples

### Multi-Tenant API (Headers)

Users send their API keys via headers with each request:

```bash
# Use Anthropic (default) with standard naming
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Provider-Api-Key: sk-ant-..." \
  -d '{"epicKey": "PROJ-123"}'

# Use Anthropic with legacy naming (backwards compatible)
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Anthropic-Key: sk-ant-..." \
  -d '{"epicKey": "PROJ-123"}'

# Use OpenAI with specific model
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-LLM-Provider: openai" \
  -H "X-Provider-Api-Key: sk-..." \
  -H "X-LLM-Model: gpt-4o" \
  -d '{"epicKey": "PROJ-123"}'

# Use AWS Bedrock with Claude
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-LLM-Provider: bedrock" \
  -H "X-Provider-Access-Key-Id: AKIA..." \
  -H "X-Provider-Secret-Access-Key: ..." \
  -H "X-Provider-Region: us-east-1" \
  -H "X-LLM-Model: anthropic.claude-3-5-sonnet-20241022-v2:0" \
  -d '{"epicKey": "PROJ-123"}'

# Use Google Gemini
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-LLM-Provider: google" \
  -H "X-Provider-Api-Key: ..." \
  -H "X-LLM-Model: gemini-2.0-flash-exp" \
  -d '{"epicKey": "PROJ-123"}'
```

### Single-Tenant Deployment (Environment Variables)

Set environment variables once for the entire server:

```bash
# Anthropic (standard naming)
export PROVIDER_API_KEY=sk-ant-...
export LLM_MODEL=claude-sonnet-4-5-20250929

# Anthropic (legacy naming - still works)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export LLM_PROVIDER=openai
export PROVIDER_API_KEY=sk-...
export LLM_MODEL=gpt-4o

# AWS Bedrock
export LLM_PROVIDER=bedrock
export PROVIDER_ACCESS_KEY_ID=AKIA...
export PROVIDER_SECRET_ACCESS_KEY=...
export PROVIDER_REGION=us-east-1
export LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
```

## Architecture

### Provider Module Structure

Each provider is implemented as a module in this directory:

```
server/llm-client/providers/
├── README.md                    # This file
├── provider-helpers.ts          # Helper for standard providers
├── anthropic.ts                 # Anthropic provider
├── openai.ts                    # OpenAI provider
├── google.ts                    # Google provider
├── bedrock.ts                   # AWS Bedrock provider
├── mistral.ts                   # Mistral provider
├── deepseek.ts                  # DeepSeek provider
├── groq.ts                      # Groq provider
└── xai.ts                       # xAI provider
```

### Provider Module Interface

Each provider module exports a function:

```typescript
export function createProviderFromHeaders(headers: Record<string, string>): Provider;
```

This function:
1. Extracts credentials from headers (case-insensitive)
2. Falls back to environment variables if headers not provided
3. Validates required credentials are present
4. Calls the AI SDK's provider creation function
5. Returns a configured provider instance

### Main Factory Dispatcher

The `provider-factory.ts` file:
- Imports all provider modules
- Dispatches to the appropriate provider based on `X-LLM-Provider` header
- Defaults to Anthropic when no provider specified
- Handles model selection via `X-LLM-Model` header

### Helper Function

The `createSimpleProvider()` helper in `provider-helpers.ts`:
- Automatically derives header/env var names from AI SDK parameter names
- Handles credential extraction and validation
- Provides consistent error messages
- Supports legacy names for backwards compatibility

## Adding a New Provider

To add a new provider:

1. **Install the package**: Add `@ai-sdk/{provider}` to `package.json`
2. **Create provider module**: Add `server/llm-client/providers/{provider}.ts`
3. **Use the helper**: For simple API key providers, use `createSimpleProvider()`
4. **Register in factory**: Add to `PROVIDER_MODULES` in `provider-factory.ts`
5. **Update documentation**: Add to this README and `server/readme.md`

Example for a simple provider:

```typescript
// server/llm-client/providers/newprovider.ts
import { createNewProvider } from '@ai-sdk/newprovider';
import { createSimpleProvider } from './provider-helpers.js';

export const createProviderFromHeaders = createSimpleProvider({
  createFn: createNewProvider,
  providerName: 'NewProvider',
  keys: ['apiKey'],  // Matches AI SDK parameter names
});
```

The helper automatically creates:
- Header: `X-Provider-Api-Key`
- Env Var: `PROVIDER_API_KEY`

## Error Handling

Provider modules throw specific errors:

- **`MissingCredentialsError`**: Required credentials not provided
  - Lists exact header/env var names needed
  - User can fix by providing credentials
- **`UnsupportedProviderError`**: Provider name not in registry
  - Lists all supported providers
  - User can fix by choosing valid provider
- **`InvalidProviderError`**: Provider initialization failed
  - Indicates credential or configuration issue

## Testing

Each provider should have tests verifying:
- ✅ Provider loads with valid credentials
- ✅ Missing credentials throw `MissingCredentialsError`
- ✅ Header credentials take precedence over env vars
- ✅ Case-insensitive header matching works
- ✅ Legacy names work (Anthropic only)
- ✅ Error messages are clear and actionable

## Security Considerations

- **Credential isolation**: Fresh provider instance per request prevents credential leakage
- **Header precedence**: Headers override env vars, enabling multi-tenant usage
- **No credential logging**: Provider modules never log credentials
- **Environment pollution**: Bedrock explicitly passes all config to prevent env var pollution

## Reference

- **AI SDK Documentation**: https://sdk.vercel.ai/docs
- **Supported Providers**: https://sdk.vercel.ai/providers/ai-sdk-providers
- **HTTP Headers**: RFC 7230 (case-insensitive)
