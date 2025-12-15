# Context Reduction Strategy

## Overview

As tools like `review-work-item` and `analyze-feature-scope` gather context from multiple sources (Confluence docs, Figma files, Jira hierarchy), the combined context can exceed LLM token limits or become cost-prohibitive. This spec outlines a strategy for dynamically reducing context based on document importance.

## Problem

When reviewing a work item with many linked resources:
- Multiple Confluence documents (PRD, DoR, technical specs, etc.)
- Multiple Figma files/screens
- Deep Jira hierarchy (task → story → epic → initiative)
- Linked blockers and dependencies

The total context may exceed practical limits:
- LLM context window limits (varies by model)
- Cost considerations (more tokens = higher cost)
- Quality degradation (too much context can dilute focus)

## Proposed Approach

### 1. Relevance Scoring (Already Implemented)

The Confluence integration (`specs/28-confluence.md`) already scores documents by relevance to the task. This provides the foundation for prioritization.

### 2. Tiered Context Inclusion

Documents are included at different detail levels based on relevance:

| Relevance Tier | Context Treatment |
|----------------|-------------------|
| **High** (score > 0.8) | Full content |
| **Medium** (0.5-0.8) | Summary only |
| **Low** (< 0.5) | Title + one-line description |
| **Very Low** | Omit entirely |

### 3. Dynamic Budget Allocation

Given a total token budget (e.g., 100K tokens):
1. Reserve tokens for core content (target work item, direct parent)
2. Allocate remaining budget proportionally by relevance score
3. Reduce detail level as budget is consumed

### 4. Progressive Summarization

For documents that don't fit at full detail:
1. First pass: Extract sections most relevant to the work item
2. Second pass: Summarize extracted sections
3. Third pass: One-line summary if still too large

### 5. Controlling Summary Length

LLMs can be instructed to limit response size:

**API-level hard limit (`maxTokens`)**
- Hard cuts the response at that token count
- Risk: Can truncate mid-sentence or break structured output
- Use as a safety cap, not primary control

**Prompt-based soft limit (recommended)**
- "Summarize in 2-3 paragraphs" or "Keep summary under 200 words"
- More natural output, respects sentence/paragraph boundaries
- Not perfectly precise but good enough for summaries

**Structured constraints**
- "Return at most 5 key points"
- Most reliable for list-based summaries

**Recommended approach**: Use prompt instructions for natural length control, combined with a `maxTokens` safety cap to prevent runaway responses.

```typescript
const summary = await generateText({
  prompt: `Summarize this document in 2-3 paragraphs (roughly 200 words)...`,
  maxTokens: 500  // Safety cap - should never hit this if prompt is followed
});
```

## Implementation Considerations

### Token Counting
- Need reliable token estimation before LLM call
- Consider using tiktoken or similar library
- Cache token counts for cached documents

### Summarization Cost
- Summarizing documents requires LLM calls
- Trade-off: summarization cost vs. main prompt cost
- May want to cache summaries at different detail levels

### User Feedback
- Should users be notified when context is reduced?
- Option to request full context at higher cost?

## Future Work

- Define specific token budgets per tool
- Implement token counting infrastructure  
- Create summarization pipeline with caching
- Add user controls for context/cost trade-offs

## Related Specs

- `specs/28-confluence.md` - Relevance scoring foundation
- `specs/29-work-item-review.md` - Primary consumer of this strategy
