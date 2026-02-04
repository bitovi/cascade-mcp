# 053: Handle Unattached Figma Comments

## Problem

Figma comments with `Vector: (0, 0)` position are incorrectly being associated with frames that happen to be positioned near the canvas origin. These are **unattached/file-level comments** that have no explicit frame association in Figma.

### Current Behavior

The `formatCommentsForContext()` function in `figma-comment-utils.ts` uses a 50px proximity threshold for Vector-positioned comments:

```typescript
const PROXIMITY_THRESHOLD = 50;
const inBoundsX = position.x >= frame.x - PROXIMITY_THRESHOLD && 
                  position.x <= frame.x + frame.width + PROXIMITY_THRESHOLD;
const inBoundsY = position.y >= frame.y - PROXIMITY_THRESHOLD && 
                  position.y <= frame.y + frame.height + PROXIMITY_THRESHOLD;
```

When a frame is positioned at `(0, 0)` (like "Create New Case - Desktop" with bounds `x=0, y=0, width=1440, height=1024`), any comment with `Vector: (0, 0)` matches because `0` falls within the `-50 to 1490` range.

### Affected Tools

Comments flow through several places:

| Tool | Uses Comments | Uses Notes | Source |
|------|---------------|------------|--------|
| `screen-analyses-workflow` | ✅ Yes - via `fetchAndAssociateAnnotations()` | ✅ Yes | Comments & notes passed to screen analyzer prompts |
| `write-shell-stories` | ✅ Yes - via `formatCommentsForContext()` | ✅ Yes | `prompt-shell-stories.ts` - FIGMA COMMENTS section |
| `write-story` | ✅ Yes - via `LoadedContext.figmaComments` | ✅ Yes (via analyzedScreens.notes) | `prompt-story-content.ts` - Figma Comments section |
| ~~`analyze-feature-scope`~~ | ~~Yes~~ | ~~Yes~~ | **DEPRECATED** - not updating |

## Solution

### 1. Identify Unattached Comments

A comment is **unattached** when BOTH conditions are true:
1. It has **no `node_id`** (Vector position type, not FrameOffset)
2. Its position is exactly `(0, 0)`

This distinguishes:
- **Vector at `(0, 0)`** → Unattached (Figma's default fallback for comments without position)
- **Vector at `(500, 300)`** → Try proximity matching (user intentionally placed it somewhere)
- **FrameOffset with any offset** → Attached (has explicit `node_id` frame association)

### 2. Label Unattached Comments Explicitly

Add a new `source` value or property to distinguish unattached comments so prompts can handle them appropriately:
- Attached comments → `source: 'comments'` (current behavior)
- Unattached comments → `source: 'unattached-comments'` (new)

### 3. Update Prompts to Handle Unattached Comments

Prompts should treat unattached comments as **potentially** relevant but not definitely scoped to the current screens/features:
- Include them in a separate section (e.g., "File-Level Comments")
- Add guidance: "Only incorporate if clearly relevant to the screens being analyzed"

## Implementation Plan

### Step 1: Filter `(0, 0)` Vector comments in `formatCommentsForContext()`

**File:** `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts`

**Changes:**
1. Add early check for Vector position at exactly `(0, 0)` → treat as unattached
2. Return unattached comments separately in the result

**Verification:**
- Run existing tests (should still pass)
- Test with Figma file containing `(0, 0)` comments - they should no longer match frames at origin

### Step 2: Update `ScreenAnnotation` type to support unattached source

**File:** `server/providers/combined/tools/shared/screen-annotation.ts`

**Changes:**
1. Add `'unattached-comments'` to the `source` union type
2. For unattached comments, set `screenId` and `screenName` to indicate file-level

**Verification:**
- TypeScript compiles without errors
- Existing code continues to work

### Step 3: Return unattached comments from `formatCommentsForContext()`

**File:** `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts`

**Changes:**
1. Update return type to include `unattachedComments: ScreenAnnotation[]`
2. Format unattached comments into a separate array with `source: 'unattached-comments'`
3. Set `screenName: 'File-Level'` or similar for these

**Verification:**
- Unit tests for the function verify unattached comments are correctly separated
- Integration: debug cache `comments.md` still shows all comments

### Step 4: Update annotation-associator to pass through unattached comments

**File:** `server/providers/figma/screen-analyses-workflow/annotation-associator.ts`

**Changes:**
1. Update `AnnotationResult` to include `unattachedComments: ScreenAnnotation[]`
2. Pass the unattached comments array through from `formatCommentsForContext()` to consumers

**Verification:**
- Log output shows unattached comments being passed through
- Consumers can use `.length` to get counts

### Step 5: Update notification message to show unattached/attached breakdown

**File:** `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.ts`

**Changes:**
1. Update the notification message format from:
   ```
   🤖 Analyzing Figma: 5 screen(s) [...], 1 note(s), 3 of 22 comment thread(s)...
   ```
   To:
   ```
   🤖 Analyzing Figma: 5 screen(s) [...], 1 note(s), 1 matched and 3 unattached of 22 comment thread(s)...
   ```
2. Use `annotationResult.stats.matchedCommentThreads` and `annotationResult.unattachedComments.length` for the counts

**Verification:**
- Run screen analysis on Figma file with unattached comments
- Notification shows correct breakdown (e.g., "1 matched and 3 unattached of 22 comment thread(s)")

### Step 6: Update `prompt-shell-stories.ts` to handle unattached comments

**File:** `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts`

**Changes:**
1. Separate unattached comments into their own section
2. Add prompt guidance:
   ```
   **FILE-LEVEL COMMENTS (not attached to specific screens):**
   
   These comments are not attached to specific screens in Figma. Only incorporate 
   their context if it clearly pertains to the features and screens you are 
   analyzing. They may relate to other parts of the design.
   ```

**Verification:**
- Run write-shell-stories on a file with unattached comments
- Verify they appear in a separate section with appropriate guidance

### Step 6: Update `prompt-story-content.ts` to handle unattached comments

**File:** `server/providers/combined/tools/write-story/prompt-story-content.ts`

**Changes:**
1. Filter and separate unattached comments (check `source === 'unattached-comments'`)
2. Add separate section with guidance similar to Step 5

**Verification:**
- Run write-story on an issue linked to a Figma file with unattached comments
- Verify appropriate handling

### Step 7: Update `comments.md` debug output to indicate unattached comments

**File:** `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts`

**Changes:**
1. In `formatCommentsAsDebugMarkdown()`, add indicator for unattached comments
2. Show them in a separate section labeled "Unattached Comments (File-Level)"

**Verification:**
- Generate comments.md for a file with `(0, 0)` comments
- Verify they're clearly labeled as unattached

## Testing

### Unit Tests

Add tests to verify:
1. `formatCommentsForContext()` correctly identifies Vector `(0, 0)` comments (no `node_id`) as unattached
2. `formatCommentsForContext()` does NOT mark FrameOffset comments as unattached, even if `node_offset` is `(0, 0)` (they have explicit `node_id` frame association)
3. `formatCommentsForContext()` does NOT mark Vector comments at non-zero positions as unattached (e.g., `(500, 300)` should still try proximity matching)
4. Unattached comments are formatted with `source: 'unattached-comments'`

### Integration Tests

1. Run `write-shell-stories` on Figma file `7QW0kJ07DcM36mgQUJ5Dtj` (the one from this investigation)
2. Verify "Create New Case" screens no longer show the 3 unattached comments
3. Verify unattached comments appear in a separate file-level section

## Questions

1. Should we also handle comments with **negative** coordinates (e.g., `Vector: (-100, -50)`) as potentially unattached, or only exact `(0, 0)`? Negative coordinates suggest comments placed outside the canvas bounds.

No

2. For the `ScreenAnnotation` type, should we use a new source value (`'unattached-comments'`) or add a separate boolean property (`attached: boolean`)? The source value approach seems cleaner for filtering.

Source.

3. Should unattached comments be included in the prompt context at all, or should we filter them out entirely? Current plan is to include them with guidance, but filtering might be simpler.

Lets include them for now.  

4. The `groupAnnotationsBySource()` function currently only handles `'notes'` and `'comments'`. Should we update it to also handle `'unattached-comments'`, or create a new grouping function?

Update `groupAnnotationsBySource()` → return `{ notes, comments, unattachedComments }`.

---

## Spec Review Notes

### Clarity & Coherence

The spec is well-structured and clearly articulates the problem:
- Vector `(0, 0)` comments with no `node_id` are incorrectly matching frames positioned at the canvas origin
- The solution distinguishes unattached comments and labels them separately for downstream handling

### Issues Identified

1. **Duplicate Step Numbers**: There are two "Step 6" sections:
   - Step 6 updates `prompt-shell-stories.ts` 
   - Step 6 (again) updates `prompt-story-content.ts`
   
   These should be renumbered as Steps 6 and 7, shifting "Step 7: Update comments.md" to Step 8.

2. ~~**Missing Step 4 Details**: Step 4 mentions updating `AnnotationResult.stats` to include `unattachedCommentThreads`, but doesn't mention that we also need to actually populate this value.~~ **RESOLVED** - Step 4 now passes the array instead of stats. Consumers use `.length`.

3. ~~**Notification Message Format Issue**~~ **RESOLVED** - Updated to use `1 matched and 3 unattached of 22 comment thread(s)`.

4. **No Existing Unit Tests for `figma-comment-utils.ts`**: The spec mentions adding unit tests for `formatCommentsForContext()`, but the file currently has no test file (`figma-comment-utils.test.ts`). This is actually fine as a new addition, but worth noting the test file needs to be created.

5. **`analyze-feature-scope` Deprecation**: The spec notes this tool is deprecated, which is consistent with `figma-review-design/README.md`. However, `analyze-feature-scope` is still referenced in many docs (README.md, copilot-instructions.md, contributing.md). The spec correctly skips updating it, but this creates technical debt.

### Potential Gaps

1. **Return Type Change for `formatCommentsForContext()`**: Step 3 says to update the return type to include `unattachedComments: ScreenAnnotation[]`, but the current return type is:
   ```typescript
   { contexts: ScreenAnnotation[]; matchedThreadCount: number; unmatchedThreadCount: number }
   ```
   
   Adding `unattachedComments` is additive and shouldn't break existing consumers. However, the spec should clarify whether unattached comments are counted in `matchedThreadCount` or `unmatchedThreadCount` (presumably unmatchedThreadCount since they don't match any frame).

2. **What happens to currently "unmatched" Vector comments?**: The current implementation puts Vector comments that don't match any frame into `unassociatedThreads`. The spec focuses on `(0,0)` Vector comments, but doesn't clarify:
   - Are `(0,0)` Vector comments **also** being excluded from `unassociatedThreads` (to avoid double-counting)?
   - Or are they a subset of unassociated threads that we're now labeling differently?

3. **`write-shell-stories` uses `formatCommentsForContext` differently**: In `writing-shell-stories/core-logic.ts`, comments flow through `fetchAndAssociateAnnotations` → `annotationResult.frames[].annotations`. The spec should verify the plumbing from `formatCommentsForContext` unattached array → through `annotation-associator` → to `core-logic.ts` → to `prompt-shell-stories.ts`.

### Minor Redundancy

- The "Solution" section (Section 1-3) and "Implementation Plan" (Steps 1-7) repeat similar information. This is acceptable for clarity but could be tightened.

### Implementation Readiness

The spec provides sufficient detail to implement. The key files and changes are clearly identified:
- Primary change: `figma-comment-utils.ts` → `formatCommentsForContext()`  
- Type update: `screen-annotation.ts` → add `'unattached-comments'` source
- Stats: `annotation-associator.ts` → add `unattachedCommentThreads`
- Prompts: `prompt-shell-stories.ts` and `prompt-story-content.ts` → separate sections

---

## Questions

5. For the notification message, should we distinguish between "matched to these screens" vs "unattached (file-level)"? The proposed "3 unattached and 1 attached" might be confusing since "attached" in Figma terms means "attached to a specific frame" but here it means "matched to the screens being analyzed."

Use: `1 matched and 3 unattached of 22 comment thread(s)`

6. Should unattached `(0,0)` comments be excluded from the `unmatchedThreadCount` in the return value, or should there be a new separate count? Currently, the spec adds `unattachedComments` array but doesn't clarify how counts should work.

No separate stats needed. Return the `unattachedComments` array and consumers can use `.length` for counts.

7. The duplicate "Step 6" should be fixed - confirm this is just a numbering typo and Steps 6-7 should become 6-7-8.

Typo - will fix.
