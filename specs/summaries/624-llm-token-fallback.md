# 624-llm-token-fallback.md

## Status
Implemented

## What it proposes
Add `ANTHROPIC_API_KEY` to the CI workflow's `.env` generation so E2E tests can access an Anthropic API key without exposing that key in staging/production deployments. The spec codifies making the GitHub Actions secret available only to the CI `e2e-test` job while keeping deployment workflows free of that credential.

## Architectural decisions made
- CI workflow manually builds `.env` with explicit `echo` statements (matching the pattern in `deploy.yaml`) rather than calling `generate-build-env.sh`
- `ANTHROPIC_API_KEY` is added only to CI, not to staging/production deploy workflows
- Anthropic provider already supports a multi-level fallback: `x-anthropic-key` header → `x-anthropic-token` header → `ANTHROPIC_API_KEY` env → `x-llmclient-anthropic-api-key` header → `LLMCLIENT_ANTHROPIC_API_KEY` env
- E2E tests read `ANTHROPIC_API_KEY` from environment and pass it as `X-LLMClient-Anthropic-Api-Key` header

## What still needs implementing
Fully implemented.
