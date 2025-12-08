# LLM Provider Guide

This guide documents all supported LLM providers and how to configure them via headers or environment variables.

## Table of Contents

- [Overview](#overview)
- [Naming Convention](#naming-convention)
- [Supported Providers](#supported-providers)
  - [Anthropic (Claude)](#anthropic-claude)
  - [OpenAI (GPT)](#openai-gpt)
  - [Google (Gemini)](#google-gemini)
  - [AWS Bedrock](#aws-bedrock)
  - [Mistral](#mistral)
  - [DeepSeek](#deepseek)
  - [Groq](#groq)
  - [xAI (Grok)](#xai-grok)
- [Usage Examples](#usage-examples)

## Overview

The REST API supports multiple LLM providers. Users choose their provider and supply credentials via request headers. This enables multi-tenant usage where different users can use different providers and API keys.

**Key Headers:**
- `X-LLM-Provider`: Provider name (default: `anthropic`)
- `X-LLM-Model`: Model ID (default: `claude-sonnet-4-5-20250929`)
- Provider-specific credential headers (see sections below)

**Note:** All HTTP headers are case-insensitive. Express normalizes them to lowercase internally.

## Naming Convention

All providers use a consistent naming pattern that includes the `llmclient` prefix for easy identification:

- **Headers**: `x-llmclient-{provider}-{param-name}` (kebab-case with `x-llmclient-{provider}-` prefix)
- **Environment Variables**: `LLMCLIENT_{PROVIDER}_{PARAM_NAME}` (UPPER_SNAKE_CASE with `LLMCLIENT_{PROVIDER}_` prefix)

**Examples:**
- OpenAI `apiKey` → Header: `x-llmclient-openai-api-key` | Env: `LLMCLIENT_OPENAI_API_KEY`
- Bedrock `accessKeyId` → Header: `x-llmclient-bedrock-access-key-id` | Env: `LLMCLIENT_BEDROCK_ACCESS_KEY_ID`
- Google `apiKey` → Header: `x-llmclient-google-api-key` | Env: `LLMCLIENT_GOOGLE_API_KEY`

**Exception:** Anthropic maintains `x-anthropic-key` / `ANTHROPIC_API_KEY` (legacy) as primary, but also supports the standard `x-llmclient-anthropic-api-key` / `LLMCLIENT_ANTHROPIC_API_KEY` naming.

## Supported Providers

### Anthropic (Claude)

**Provider Name:** `anthropic` (default)

**AI SDK Package:** `@ai-sdk/anthropic`

**Credentials:**
- **API Key** (required)
  - Legacy headers: `X-Anthropic-Key` or `x-anthropic-key` `X-Anthropic-Token` or `x-anthropic-token`
  - Standard header: `X-LLMClient-Anthropic-Api-Key` or `x-llmclient-anthropic-api-key`
  - Legacy env: `ANTHROPIC_API_KEY` 
  - Standard env: `LLMCLIENT_ANTHROPIC_API_KEY`

**Get API Key:** https://console.anthropic.com/account/keys

**Typical Model IDs:**
- `claude-sonnet-4-5-20250929` (default)
- `claude-opus-4-20250805`
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`

**Example Request:**
```bash
# Using legacy naming (current/primary)
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-Anthropic-Key: sk-ant-..." \
  -H "X-LLM-Model: claude-sonnet-4-5-20250929" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'

# Using standard naming (also works)
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-Anthropic-Api-Key: sk-ant-..." \
  -H "X-LLM-Provider: anthropic" \
  -H "X-LLM-Model: claude-sonnet-4-5-20250929" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### OpenAI (GPT)

**Provider Name:** `openai`

**AI SDK Package:** `@ai-sdk/openai`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-OpenAI-Api-Key`
  - Env var: `LLMCLIENT_OPENAI_API_KEY`

**Get API Key:** https://platform.openai.com/api-keys

**Typical Model IDs:**
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-OpenAI-Api-Key: sk-..." \
  -H "X-LLM-Provider: openai" \
  -H "X-LLM-Model: gpt-4o" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### Google (Gemini)

**Provider Name:** `google`

**AI SDK Package:** `@ai-sdk/google`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-Google-Api-Key`
  - Env var: `LLMCLIENT_GOOGLE_API_KEY`

**Get API Key:** https://makersuite.google.com/app/apikey

**Typical Model IDs:**
- `gemini-2.0-flash-exp`
- `gemini-1.5-pro`
- `gemini-1.5-flash`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-Google-Api-Key: AIza..." \
  -H "X-LLM-Provider: google" \
  -H "X-LLM-Model: gemini-1.5-pro" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### AWS Bedrock

**Provider Name:** `bedrock`

**AI SDK Package:** `@ai-sdk/amazon-bedrock`

**Credentials (all required):**
- **Access Key ID**
  - Header: `X-LLMClient-Bedrock-Access-Key-Id`
  - Env var: `LLMCLIENT_BEDROCK_ACCESS_KEY_ID`
- **Secret Access Key**
  - Header: `X-LLMClient-Bedrock-Secret-Access-Key`
  - Env var: `LLMCLIENT_BEDROCK_SECRET_ACCESS_KEY`
- **Region** (optional, defaults to `us-east-1`)
  - Header: `X-LLMClient-Bedrock-Region`
  - Env var: `LLMCLIENT_BEDROCK_REGION`
- **Session Token** (optional, for temporary credentials)
  - Header: `X-LLMClient-Bedrock-Session-Token`
  - Env var: `LLMCLIENT_BEDROCK_SESSION_TOKEN`

**Get Credentials:** AWS IAM Console → Security Credentials

**Typical Model IDs:**
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `anthropic.claude-3-opus-20240229-v1:0`
- `meta.llama3-70b-instruct-v1:0`
- `mistral.mistral-large-2402-v1:0`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-Bedrock-Access-Key-Id: AKIA..." \
  -H "X-LLMClient-Bedrock-Secret-Access-Key: ..." \
  -H "X-LLMClient-Bedrock-Region: us-east-1" \
  -H "X-LLM-Provider: bedrock" \
  -H "X-LLM-Model: anthropic.claude-3-5-sonnet-20241022-v2:0" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### Mistral

**Provider Name:** `mistral`

**AI SDK Package:** `@ai-sdk/mistral`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-Mistral-Api-Key`
  - Env var: `LLMCLIENT_MISTRAL_API_KEY`

**Get API Key:** https://console.mistral.ai/api-keys

**Typical Model IDs:**
- `mistral-large-latest`
- `mistral-medium-latest`
- `mistral-small-latest`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-Mistral-Api-Key: ..." \
  -H "X-LLM-Provider: mistral" \
  -H "X-LLM-Model: mistral-large-latest" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### DeepSeek

**Provider Name:** `deepseek`

**AI SDK Package:** `@ai-sdk/deepseek`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-DeepSeek-Api-Key`
  - Env var: `LLMCLIENT_DEEPSEEK_API_KEY`

**Get API Key:** https://platform.deepseek.com/api_keys

**Typical Model IDs:**
- `deepseek-chat`
- `deepseek-coder`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-DeepSeek-Api-Key: sk-..." \
  -H "X-LLM-Provider: deepseek" \
  -H "X-LLM-Model: deepseek-chat" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### Groq

**Provider Name:** `groq`

**AI SDK Package:** `@ai-sdk/groq`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-Groq-Api-Key`
  - Env var: `LLMCLIENT_GROQ_API_KEY`

**Get API Key:** https://console.groq.com/keys

**Typical Model IDs:**
- `llama-3.3-70b-versatile`
- `llama-3.1-70b-versatile`
- `mixtral-8x7b-32768`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-Groq-Api-Key: gsk_..." \
  -H "X-LLM-Provider: groq" \
  -H "X-LLM-Model: llama-3.3-70b-versatile" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

### xAI (Grok)

**Provider Name:** `xai`

**AI SDK Package:** `@ai-sdk/xai`

**Credentials:**
- **API Key** (required)
  - Header: `X-LLMClient-XAI-Api-Key`
  - Env var: `LLMCLIENT_XAI_API_KEY`

**Get API Key:** https://console.x.ai/

**Typical Model IDs:**
- `grok-beta`
- `grok-vision-beta`

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLMClient-XAI-Api-Key: xai-..." \
  -H "X-LLM-Provider: xai" \
  -H "X-LLM-Model: grok-beta" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

---

## Usage Examples

### Using Environment Variables

Set provider credentials as environment variables for server-wide configuration:

```bash
# For Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...
export LLM_MODEL=claude-sonnet-4-5-20250929

# For OpenAI
export LLMCLIENT_OPENAI_API_KEY=sk-...
export LLM_MODEL=gpt-4o

# For AWS Bedrock
export LLMCLIENT_BEDROCK_ACCESS_KEY_ID=AKIA...
export LLMCLIENT_BEDROCK_SECRET_ACCESS_KEY=...
export LLMCLIENT_BEDROCK_REGION=us-east-1
export LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0

npm run start-local
```

Then make requests without credential headers:

```bash
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Atlassian-Token: ..." \
  -H "X-Figma-Token: ..." \
  -H "X-LLM-Provider: openai" \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

### Multi-Tenant Usage

Different users can use different providers in the same request cycle:

```bash
# User A with Anthropic
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-Anthropic-Key: user-a-key" \
  -d '{"epicKey": "PROJ-123"}'

# User B with OpenAI
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-LLMClient-OpenAI-Api-Key: user-b-key" \
  -H "X-LLM-Provider: openai" \
  -d '{"epicKey": "PROJ-456"}'
```

### Error Handling

If credentials are missing or provider is unsupported, you'll receive clear error messages:

```bash
# Missing API key
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-LLM-Provider: openai" \
  -d '{"epicKey": "PROJ-123"}'
# Error: "OpenAI requires: x-llmclient-openai-api-key header or LLMCLIENT_OPENAI_API_KEY env var"

# Unsupported provider
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-LLM-Provider: unknown" \
  -d '{"epicKey": "PROJ-123"}'
# Error: "Provider 'unknown' not supported. Supported providers: anthropic, openai, google, bedrock, mistral, deepseek, groq, xai"
```

---

## Architecture Notes

- **Provider Modules**: Each provider has its own module in `server/llm-client/providers/` that knows how to configure itself from headers
- **Factory Dispatcher**: Main `createProviderFromHeaders()` function in `provider-factory.ts` routes to appropriate provider module
- **Consistent Naming**: Helper function in `provider-helpers.ts` automatically derives header/env names from AI SDK parameter names
- **Backward Compatibility**: Anthropic maintains legacy naming (`X-Anthropic-Key`, `ANTHROPIC_API_KEY`) as primary for existing deployments
