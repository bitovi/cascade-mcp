# Research: Figma Comments Integration

**Feature Branch**: `001-figma-comments`  
**Date**: January 24, 2026

## Research Tasks

### 1. Figma Comments API Endpoints

**Decision**: Use `GET /v1/files/:file_key/comments` for reading and `POST /v1/files/:file_key/comments` for writing.

**Rationale**: These are the official Figma API endpoints for comment operations. The GET endpoint returns all comments in a file with threading via `parent_id` field. The POST endpoint requires `message` and optionally `client_meta` for positioning.

**Alternatives Considered**:
- No batch endpoint exists for posting multiple comments at once - must post sequentially
- No endpoint to post replies (would require specifying `parent_id` in POST) - avoided for simplicity

**Key Fields from GET Response**:
```typescript
interface FigmaComment {
  id: string;              // Unique comment ID
  message: string;         // Comment text content
  created_at: string;      // ISO timestamp
  resolved_at?: string;    // ISO timestamp if resolved
  user: {
    handle: string;        // User's @handle
    img_url: string;       // Avatar URL
  };
  parent_id?: string;      // If this is a reply
  client_meta?: {
    node_id?: string;      // Frame/node association (FrameOffset type)
    node_offset?: { x: number; y: number };  // Offset within frame
  } | { x: number; y: number };  // Vector type (absolute position)
  order_id?: number;       // For ordering
}
```

**POST Body Requirements**:
```typescript
interface PostCommentRequest {
  message: string;         // Comment text (required)
  client_meta?: {          // Positioning (optional)
    node_id: string;       // Target frame node ID
    node_offset?: { x: number; y: number };
  };
}
```

---

### 2. OAuth Scope Requirements

**Decision**: Add `file_comments:write` scope to OAuth configuration. `file_comments:read` already exists.

**Rationale**: Figma OAuth scopes are granular. Reading comments requires `file_comments:read` (already configured). Writing comments requires `file_comments:write` (needs to be added).

**Alternatives Considered**:
- `files:read` alone is insufficient for comments access
- Could use PAT tokens instead of OAuth, but this breaks the MCP OAuth flow

**Implementation Note**: Adding a new scope will require existing users to re-authorize. This should be documented in release notes.

---

### 3. Rate Limit Strategy

**Decision**: Assume Dev/Full seat limits (25/min). Consolidate if >25 questions. Fail gracefully with questions in response.

**Rationale**: 
- Cannot programmatically determine user's seat type
- Dev/Full seats get 25-50 req/min for Tier 2 endpoints
- Comments endpoint is Tier 2
- Enterprise seats get up to 600 req/min but we can't assume this

**Implementation Strategy**:
1. Count total questions generated
2. If ≤25: Post each as individual comment on target frame
3. If >25: Consolidate all questions per screen into single bullet-list comment
4. If consolidated count still >25: Return error with all questions in response
5. On 429: Respect `Retry-After` header, retry up to 3 times

**Alternatives Considered**:
- Parallel posting: Rejected - would hit rate limits faster
- User-configurable rate limit: Rejected - adds complexity, most users don't know their tier

---

### 4. Comment-to-Frame Association

**Decision**: Use existing spatial proximity logic from frame association code. For `node_id` type, direct association. For `Vector` type, find nearest frame. Ties associate with all equidistant frames.

**Rationale**: The existing `figma-helpers.ts` already implements frame identification. Comments with `client_meta.node_id` have explicit association. Comments with Vector positions need geometric proximity calculation.

**Implementation Approach**:
```typescript
function associateCommentWithFrames(
  comment: FigmaComment,
  frames: FigmaFrame[]
): string[] {  // Returns array of frame node IDs
  if (comment.client_meta?.node_id) {
    return [comment.client_meta.node_id];  // Direct association
  }
  if (isVectorPosition(comment.client_meta)) {
    return findNearestFrames(comment.client_meta, frames);  // Spatial
  }
  return [];  // Unassociated - page-level context
}
```

**Alternatives Considered**:
- Only associate comments with explicit node_id: Rejected - would lose context from old Vector-positioned comments
- Random assignment for ties: Rejected - deterministic behavior preferred

---

### 5. Caching Strategy

**Decision**: No persistent caching for comments. Fetch fresh each run. Optional debug output via `SAVE_FIGMA_COMMENTS_TO_CACHE` env var.

**Rationale**: Empirically verified that Figma comments do NOT trigger `last_touched_at` updates on file metadata. This means the existing cache invalidation strategy (based on `last_touched_at`) would not work for comments.

**Evidence**:
- Created test script `temp/check-figma-metadata.ts`
- Added comments to Figma file, fetched metadata before/after
- `last_touched_at` remained unchanged
- Conclusion: Comments are stored separately from file versioning

**Debug Output Format** (when `SAVE_FIGMA_COMMENTS_TO_CACHE=true`):
```markdown
# Comments for {frame_name} ({node_id})

## Thread 1
**@designer_handle** (2026-01-24 10:30:00)
This button should be primary color.

**@pm_handle** (2026-01-24 10:35:00) [reply]
Agreed, updated in latest version.

✅ Resolved at 2026-01-24 11:00:00

## Thread 2
**@dev_handle** (2026-01-24 14:00:00)
What's the hover state for this?
```

---

### 6. Error Handling Patterns

**Decision**: Follow existing project patterns - throw descriptive errors, use `InvalidTokenError` for auth failures.

**Rationale**: Constitution mandates "Functions throw descriptive errors (no error objects returned)" and "use `InvalidTokenError` pattern for OAuth re-authentication".

**Error Scenarios**:
| Scenario | Error Type | User Message |
|----------|------------|--------------|
| Missing `file_comments:read` scope | AuthError (warning) | Logs warning, proceeds without comment context |
| Missing `file_comments:write` scope | ToolError | "Missing Figma scope: file_comments:write. Please re-authorize." |
| 429 rate limit exceeded after retries | ToolError | "Rate limit exceeded. Questions generated but not posted: [questions list]" |
| 403 forbidden on file | ToolError | "Cannot access Figma file. Check file permissions." |
| Invalid file key | ToolError | "Invalid Figma file URL or key." |

---

### 7. Dual Interface Pattern

**Decision**: New `analyze-figma-scope` tool follows dual interface pattern - MCP + REST API with shared core logic.

**Rationale**: Constitution mandates "Every tool exposes both MCP protocol and REST API without code duplication."

**File Structure**:
```
server/providers/combined/tools/analyze-figma-scope/
├── index.ts                    # export { registerAnalyzeFigmaScopeTool }
├── core-logic.ts               # executeAnalyzeFigmaScope() - shared logic
├── analyze-figma-scope.ts      # MCP tool wrapper
└── figma-comment-utils.ts      # Comment fetching, association, formatting

server/api/
└── analyze-figma-scope.ts      # REST API wrapper
```

---

### 8. Existing Code Reuse Analysis

**Decision**: Leverage existing infrastructure where possible.

**Reusable Components**:
| Component | Location | Purpose |
|-----------|----------|---------|
| `FigmaClient` | `server/providers/figma/figma-api-client.ts` | Authenticated API requests |
| `fetchFigmaFileMetadata` | `server/providers/figma/figma-helpers.ts` | File metadata fetching |
| Frame identification | `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` | Screen/frame detection |
| LLM client | `server/llm-client/` | AI inference for generating questions |
| Progress notification | `server/providers/combined/tools/writing-shell-stories/progress-notifier.ts` | User feedback during execution |

**New Components Needed**:
- `figma-comment-utils.ts`: Comment fetching, threading, association, formatting
- `analyze-figma-scope` tool folder: Complete new tool implementation
- Integration points in `analyze-feature-scope` and `write-shell-stories` for comment context

## Summary

All NEEDS CLARIFICATION items resolved. Key implementation decisions:
1. **API**: Standard Figma REST API endpoints, no batch operations available
2. **Scopes**: Add `file_comments:write` to OAuth config
3. **Rate Limits**: Conservative 25/min assumption with consolidation fallback
4. **Association**: Leverage existing spatial logic, handle ties by multi-association
5. **Caching**: None for comments (fresh each run), optional debug output
6. **Errors**: Follow constitution patterns, always return questions even on failure
7. **Structure**: Dual interface pattern with shared core logic
