# Research: Self-Healing Story Writing Tools

**Feature**: 039-self-healing-tools  
**Date**: 2026-01-26

## Research Questions

### 1. How to Extract and Reuse Scope Analysis Logic

**Context**: `analyze-feature-scope` currently contains the scope analysis LLM logic. We need to extract this so `write-shell-stories` can call it internally.

**Decision**: Extract scope analysis into `server/providers/combined/tools/shared/scope-analysis-helpers.ts`

**Rationale**:
- Avoids code duplication
- Both tools can use identical logic
- Makes testing easier (test once, use twice)
- Follows existing pattern (`shared/` folder already has `confluence-setup.ts`, `google-docs-setup.ts`, etc.)

**Implementation Details**:
- Extract `executeAnalyzeFeatureScope` from `analyze-feature-scope/core-logic.ts`
- Create new function: `generateScopeAnalysis(params, deps): Promise<ScopeAnalysisResult>`
- Result includes: `{ markdown: string, questionCount: number, hasAnalysis: boolean }`
- Both tools will call this shared function

**Alternatives Considered**:
- Option A: Duplicate the logic - Rejected: Violates DRY principle, maintenance burden
- Option B: Make `write-shell-stories` call `analyze-feature-scope` via internal API - Rejected: Circular dependency risk, more complex
- Option C: Extract to shared module - **SELECTED**: Clean separation, testable, reusable

---

### 2. Question Counting Strategy

**Context**: Need to parse LLM output to count ❓ markers reliably.

**Decision**: Parse markdown output using regex `/^\\s*-\\s*❓/gm` to count question bullets

**Rationale**:
- LLM consistently uses ❓ marker format (established pattern in existing `analyze-feature-scope`)
- Regex parsing is fast and reliable for markdown
- No need for additional LLM call (parsing is deterministic)
- Threshold comparison is simple: `questionCount > 5`

**Implementation Details**:
```typescript
function countUnansweredQuestions(scopeAnalysisMarkdown: string): number {
  const questionMatches = scopeAnalysisMarkdown.match(/^\\s*-\\s*❓/gm);
  return questionMatches ? questionMatches.length : 0;
}
```

**Alternatives Considered**:
- Option A: Separate LLM call to count questions - Rejected: Unnecessary latency, cost, and complexity
- Option B: Parse markdown with regex - **SELECTED**: Fast, reliable, deterministic
- Option C: Parse ADF (Jira format) - Rejected: Adds complexity, not needed

---

### 3. Scope Analysis Section Detection

**Context**: `write-shell-stories` needs to detect if "## Scope Analysis" section exists before deciding whether to run analysis.

**Decision**: Use existing `extractScopeAnalysis()` helper in `core-logic.ts`

**Rationale**:
- Function already exists and works correctly
- Returns `{ scopeAnalysis: string | null, remainingContext: string }`
- `scopeAnalysis === null` means no section exists
- No changes needed to this logic

**Implementation Details**:
- Already implemented: `/## Scope Analysis\\s+([\\s\\S]*?)(?=\\n## |$)/i`
- Handles edge cases: section at end of epic, multiple sections, etc.

**Alternatives Considered**:
- N/A - Existing solution is optimal

---

### 4. LLM Provider Integration

**Context**: Scope analysis needs to work with existing LLM infrastructure (supports 8 providers via AI SDK).

**Decision**: Use existing `ToolDependencies.generateText` injection pattern

**Rationale**:
- Already handles multiple LLM providers (Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, xAI)
- Works for both MCP (OAuth) and REST API (PAT + `X-Anthropic-Token` header)
- No changes needed to LLM infrastructure

**Implementation Details**:
- `generateScopeAnalysis` accepts `deps: ToolDependencies`
- Calls `deps.generateText(systemPrompt, userPrompt, maxTokens)`
- Error handling: If LLM call fails, throw error and preserve existing content (per FR clarification)

**Alternatives Considered**:
- N/A - Existing pattern is optimal

---

### 5. Figma Comment Integration

**Context**: Need to include Figma comment threads in LLM context so answered questions reduce ❓ count.

**Decision**: Use existing `figma-comment-utils.ts` infrastructure

**Rationale**:
- Already implemented: `fetchCommentsForFile`, `groupCommentsIntoThreads`, `formatCommentsForContext`
- Works with `figma-review-design` output
- No changes needed - just pass comments to scope analysis prompt

**Implementation Details**:
- Call `fetchCommentsForFile(figmaClient, fileKey, frameNodes)`
- Pass `figmaComments: ScreenAnnotation[]` to scope analysis prompt
- LLM determines if comment threads answer questions (mark with 💬)

**Alternatives Considered**:
- N/A - Existing solution is optimal

---

### 6. Scope Analysis Regeneration on Re-run

**Context**: When user re-runs `write-shell-stories` after answering questions, need to regenerate Scope Analysis section with updated ❓/💬 markers.

**Decision**: Always regenerate scope analysis section when it exists, include previous section in LLM context

**Rationale**:
- LLM needs to see previous questions to avoid duplication
- LLM can detect answered questions and mark them with 💬
- Regeneration ensures section stays current with latest context (new Figma comments, user edits)

**Implementation Details**:
1. Extract existing Scope Analysis section
2. Include it in LLM context with label "Previous Scope Analysis:"
3. Generate new section with updated markers
4. Replace old section with new section in epic

**Alternatives Considered**:
- Option A: Never regenerate (keep original) - Rejected: Can't detect answered questions
- Option B: Always regenerate - **SELECTED**: Ensures accuracy, detects answers
- Option C: Only regenerate if user requests - Rejected: Adds complexity, unclear UX

---

### 7. Threshold Configuration

**Context**: Default threshold is 5 questions. Need to decide if it should be configurable.

**Decision**: Use hardcoded default of 5, no configuration in initial implementation

**Rationale**:
- Spec explicitly states "Out of Scope: Custom per-user or per-project question thresholds"
- Can add configuration later if user feedback indicates need
- Simpler implementation, fewer edge cases

**Implementation Details**:
```typescript
const QUESTION_THRESHOLD = 5;
if (questionCount > QUESTION_THRESHOLD) {
  // Create/regenerate scope analysis
} else {
  // Proceed with shell stories
}
```

**Alternatives Considered**:
- Option A: Hardcoded default - **SELECTED**: Matches spec, simpler
- Option B: Environment variable - Rejected: Out of scope per spec
- Option C: Tool parameter - Rejected: Out of scope per spec

---

### 8. Backward Compatibility for `analyze-feature-scope`

**Context**: Tool must remain functional but be marked as deprecated.

**Decision**: No changes to tool logic, only add deprecation notices in description and README

**Rationale**:
- Maintains backward compatibility for users with existing workflows
- Allows gradual migration to new pattern
- Follows deprecation best practices (announce, don't break)

**Implementation Details**:
- Update tool description: "**DEPRECATED**: Use `write-shell-stories` directly instead. This tool is maintained for backward compatibility only."
- Update README.md with deprecation notice and migration guide
- Update documentation to recommend `write-shell-stories`

**Alternatives Considered**:
- Option A: Remove tool immediately - Rejected: Breaks existing users
- Option B: Deprecate gracefully - **SELECTED**: User-friendly migration path
- Option C: Keep both without deprecation - Rejected: Confusing for new users

---

## Summary of Decisions

| Question | Decision | Key Benefit |
|----------|----------|-------------|
| Extract scope logic | Shared module `scope-analysis-helpers.ts` | Reusable, testable, DRY |
| Question counting | Regex parsing of ❓ markers | Fast, deterministic, no extra LLM call |
| Section detection | Use existing `extractScopeAnalysis()` | Already works, no changes needed |
| LLM integration | Use existing `ToolDependencies.generateText` | Works with 8 providers, dual auth |
| Figma comments | Use existing `figma-comment-utils.ts` | Already implemented, no changes |
| Regeneration | Always regenerate when section exists | Detects answered questions |
| Threshold config | Hardcoded default of 5 | Matches spec (out of scope) |
| Backward compat | Deprecate gracefully with notices | User-friendly migration |

---

## Technical Risks

### Risk 1: LLM Inconsistency with Markers

**Risk**: LLM might not consistently use ❓/💬 markers in all scenarios.

**Mitigation**: 
- Add strict instructions to system prompt
- Test with multiple examples
- Add validation that output contains markers
- If parsing fails, treat as error and ask user to retry

**Likelihood**: Low (existing `analyze-feature-scope` already uses this pattern successfully)

---

### Risk 2: Performance Degradation

**Risk**: Running scope analysis internally might make `write-shell-stories` too slow.

**Mitigation**:
- Performance target: 30 seconds for 3-5 designs (spec requirement)
- Use existing caching for Figma files
- LLM call is async, non-blocking
- If >30s, consider parallelizing Figma fetches

**Likelihood**: Low (existing tools already meet performance targets)

---

### Risk 3: Jira Character Limit

**Risk**: Adding Scope Analysis section might push epic over 43,838 character limit.

**Mitigation**:
- Check size before writing (existing `wouldExceedLimit()` helper)
- Warn user if approaching limit
- Error if limit exceeded with guidance to split content
- This is existing behavior, no new risk

**Likelihood**: Low (existing tools handle this)

---

## Next Steps (Phase 1)

1. Create data model (`data-model.md`) defining Question, ScopeAnalysisResult, etc.
2. Design API contracts for new scope analysis functions
3. Generate quickstart guide for users migrating from `analyze-feature-scope`
4. Update agent context with new self-healing workflow patterns
