# 32-context-reduction-strategy.md

## Status
Partial

## What it proposes
When tools like `review-work-item` and `analyze-feature-scope` gather context from multiple sources (Confluence, Figma, Jira hierarchy), the combined content can exceed LLM token limits or become cost-prohibitive. The spec proposes a tiered context inclusion strategy driven by relevance scores, with dynamic token budget allocation and progressive summarization to keep context within practical limits.

## Architectural decisions made
- Use existing Confluence relevance scores (from spec 28) as the foundation for prioritization
- Four-tier inclusion model: high relevance (>0.8) → full content; medium (0.5–0.8) → summary only; low (<0.5) → title + one-line description; very low → omit entirely
- Reserve tokens first for core content (target work item, direct parent), then allocate remainder proportionally by relevance score
- Progressive three-pass summarization: extract relevant sections → summarize → one-line fallback
- Use prompt-based soft limits for natural output length control, with `maxTokens` as a safety cap only

## What still needs implementing
- Tiered context inclusion logic consuming relevance scores to select full/summary/title/omit detail levels
- Dynamic token budget allocation across gathered documents
- Token counting infrastructure (e.g., tiktoken integration) for pre-call estimation
- Progressive summarization pipeline with caching at multiple detail levels
- Integration of context reduction into `review-work-item` and `analyze-feature-scope` tools
- User-facing controls or notifications when context is reduced
