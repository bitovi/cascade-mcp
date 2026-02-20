# 056 — Reducing Rate Limits in `writing-shell-stories`

## Problem

The `writing-shell-stories` tool makes redundant Figma API calls for comments:
- Phase 3.8 calls `fetchCommentsForFile()` explicitly ([core-logic.ts:272](server/providers/combined/tools/writing-shell-stories/core-logic.ts#L272))
- Phase 4 calls `analyzeScreens()` which calls `fetchAndAssociateAnnotations()` → `fetchCommentsForFile()` internally
- **Redundant: 1 Tier 2 call per file key**

## Solution

Remove the explicit comment fetch in Phase 3.8 and use the comments already fetched by `analyzeScreens()` in Phase 4.

---

## Implementation

### Remove redundant comment fetch in `writing-shell-stories` (saves 1 Tier 2 call)

Phase 3.8 fetches comments explicitly, then Phase 4 calls `analyzeScreens()` which fetches them again internally. The annotations from `analyzeScreens()` already contain all comment data.

**Changes:**

**Part 1: Extend `analyzeScreens()` return type**
- Modify `FrameAnalysisResult` in [types.ts](server/providers/figma/screen-analyses-workflow/types.ts) to include `unattachedComments?: ScreenAnnotation[]`
- Update `analyzeScreens()` in [analysis-orchestrator.ts](server/providers/figma/screen-analyses-workflow/analysis-orchestrator.ts) to return `annotationResult.unattachedComments` in the result

**Part 2: Update `writing-shell-stories` to use workflow data**
- Remove Phase 3.8 comment fetch entirely from [core-logic.ts](server/providers/combined/tools/writing-shell-stories/core-logic.ts)
- After Phase 4's `analyzeScreens()` call, extract:
  - Matched comments from `analysisWorkflowResult.frames[].annotations` (filter `type === 'comment'`)
  - Unattached comments from `analysisWorkflowResult.unattachedComments`
- Create helper function `frameAnnotationsToScreenAnnotations(frames: AnalyzedFrame[]): ScreenAnnotation[]` to convert between formats:
  ```typescript
  function frameAnnotationsToScreenAnnotations(frames: AnalyzedFrame[]): ScreenAnnotation[] {
    return frames.flatMap(frame =>
      frame.annotations
        .filter(a => a.type === 'comment')
        .map(a => ({
          screenId: frame.nodeId,
          screenName: frame.name,
          screenUrl: frame.url,
          source: 'comments' as const,
          markdown: a.author ? `**${a.author}:** ${a.content}` : a.content,
          annotation: a.content,
          author: a.author,
        }))
    );
  }
  ```
- Merge matched and unattached into `figmaCommentContexts: ScreenAnnotation[]`
- Keep Phase 3.9 (notes) unchanged — it doesn't fetch from API

**Note on unattached comments:** These are file-level comments at the canvas root (position `Vector(0,0)`, no `node_id`). They provide general design context not tied to specific frames. Examples: "This flow requires authentication", "Reference: [link to PRD]", "Color palette notes".

**Verification:** Run `writing-shell-stories`. Confirm:
- Comment context is still included in the story output (matched comments)
- Unattached comments are still captured and included
- No `GET /v1/files/{key}/comments` call is made (completely eliminated)

---

## Summary

**Net savings per `writing-shell-stories` invocation: 1 Tier 2 call.**
