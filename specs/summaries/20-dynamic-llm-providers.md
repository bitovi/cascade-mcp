# 20-dynamic-llm-providers.md

## Status
Implemented

## What it proposes
Extend the REST API to support multiple LLM providers (Anthropic, OpenAI, Google, Bedrock, Mistral, DeepSeek, Groq, xAI) selectable via request headers (`X-LLM-Provider`, `X-LLM-Model`, and provider-specific credential headers). Users bring their own API keys per request enabling a multi-tenant API pattern.

## Architectural decisions made
- All 8 provider packages installed as regular dependencies in `package.json`
- Each provider has its own module in `server/llm-client/providers/` that exports `createProviderFromHeaders()`
- A `createSimpleProvider()` helper in `provider-helpers.ts` derives header/env var names from AI SDK parameter names (`apiKey` → `x-provider-api-key` / `PROVIDER_API_KEY`)
- Main `provider-factory.ts` dispatches to provider modules based on `X-LLM-Provider` header (defaults to `anthropic`)
- `getModelFromHeaders()` extracts model from `X-LLM-Model` header, falling back to `LLM_MODEL` env var or a default
- Custom error types (`UnsupportedProviderError`, `MissingCredentialsError`, `InvalidProviderError`) in `provider-errors.ts`
- Anthropic supports legacy header/env names (`x-anthropic-key`, `ANTHROPIC_API_KEY`) for backwards compatibility
- All exports centralized through `server/llm-client/index.ts`

## What still needs implementing
Fully implemented.
