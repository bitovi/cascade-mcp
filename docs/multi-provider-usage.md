# Multi-Provider LLM Usage Guide

This project now supports 8 different LLM providers via the Vercel AI SDK. You can switch between providers using environment variables or command-line options.

## Supported Providers

1. **Anthropic** - Claude models (default)
2. **OpenAI** - GPT models  
3. **Google** - Gemini models
4. **AWS Bedrock** - Multi-cloud access
5. **Mistral** - Mistral models
6. **DeepSeek** - DeepSeek models
7. **Groq** - Ultra-fast inference
8. **xAI** - Grok models

## Quick Start

### Using Environment Variables

Set these in your `.env` file:

```bash
# Choose your provider (defaults to anthropic if not set)
LLM_PROVIDER=openai

# Optional: specify model (uses provider default if not set)
LLM_MODEL=gpt-4o

# Provider API key (use appropriate prefix for your provider)
LLMCLIENT_OPENAI_API_KEY=sk-...
```

Then run any script normally:

```bash
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123
```

### Using Command-Line Options

Override provider on a per-run basis:

```bash
# Use OpenAI instead of default
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts \
  https://bitovi.atlassian.net/browse/PLAY-123 \
  --provider openai

# Use specific model
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts \
  https://bitovi.atlassian.net/browse/PLAY-123 \
  --provider openai \
  --model gpt-4o-mini
```

### Using Direct API Requests

Send provider headers with your API requests:

```bash
curl -X POST http://localhost:3000/api/analyze-feature-scope \
  -H "X-Atlassian-Token: $(echo -n 'email@example.com:ATATT...' | base64)" \
  -H "X-Figma-Token: figd_..." \
  -H "X-LLM-Provider: openai" \
  -H "X-LLMClient-OpenAI-Api-Key: sk-..." \
  -H "Content-Type: application/json" \
  -d '{"epicKey": "PROJ-123"}'
```

## Provider-Specific Configuration

### Anthropic (Default)

```bash
# Legacy naming (still supported)
ANTHROPIC_API_KEY=sk-ant-...

# Standard naming
LLMCLIENT_ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
```

### OpenAI

```bash
LLMCLIENT_OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o  # or gpt-4o-mini, gpt-4-turbo, etc.
```

### Google Gemini

```bash
LLMCLIENT_GOOGLE_API_KEY=AIza...
LLM_PROVIDER=google
LLM_MODEL=gemini-1.5-pro  # or gemini-1.5-flash, gemini-2.0-flash-exp
```

### AWS Bedrock

Requires multiple credentials:

```bash
LLMCLIENT_BEDROCK_ACCESS_KEY_ID=AKIA...
LLMCLIENT_BEDROCK_SECRET_ACCESS_KEY=...
LLMCLIENT_BEDROCK_REGION=us-east-1  # optional, defaults to us-east-1
LLM_PROVIDER=bedrock
LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
```

### Mistral

```bash
LLMCLIENT_MISTRAL_API_KEY=...
LLM_PROVIDER=mistral
LLM_MODEL=mistral-large-latest
```

### DeepSeek

```bash
LLMCLIENT_DEEPSEEK_API_KEY=sk-...
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
```

### Groq

```bash
LLMCLIENT_GROQ_API_KEY=gsk_...
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
```

### xAI (Grok)

```bash
LLMCLIENT_XAI_API_KEY=xai-...
LLM_PROVIDER=xai
LLM_MODEL=grok-beta
```

## Available Scripts

All API scripts support the `--provider` and `--model` options:

```bash
# Analyze feature scope
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts <jira-url> [--provider <name>] [--model <id>]

# Write shell stories
node --import ./loader.mjs scripts/api/write-shell-stories.ts <jira-url> [--provider <name>] [--model <id>]

# Write next story
node --import ./loader.mjs scripts/api/write-next-story.ts <jira-url> [--provider <name>] [--model <id>]
```

## Examples

### Switch from Anthropic to OpenAI

```bash
# Before (using default Anthropic)
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# After (using OpenAI)
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123 --provider openai
```

### Try Different Models

```bash
# Fast and cheap
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts \
  https://bitovi.atlassian.net/browse/PLAY-123 \
  --provider openai --model gpt-4o-mini

# More powerful
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts \
  https://bitovi.atlassian.net/browse/PLAY-123 \
  --provider openai --model gpt-4o
```

### Multi-Tenant API Usage

Different users can use different providers simultaneously:

```bash
# User A with Anthropic
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-LLMClient-Anthropic-Api-Key: user-a-key" \
  -H "X-LLM-Provider: anthropic" \
  -d '{"epicKey": "PROJ-123"}'

# User B with OpenAI
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "X-LLMClient-OpenAI-Api-Key: user-b-key" \
  -H "X-LLM-Provider: openai" \
  -d '{"epicKey": "PROJ-456"}'
```

## More Information

For detailed provider documentation including model IDs, rate limits, and advanced configuration:

📖 See [server/llm-client/providers/README.md](../server/llm-client/providers/README.md)
