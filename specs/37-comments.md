# Figma Comments Integration - Implementation Plan

## Overview

Integrate Figma comments into the cascade-mcp workflow in two parts:

1. **Read Figma comments as context**: Existing tools (`write-shell-stories`, `analyze-feature-scope`) should be able to read Figma comments as additional context for generating better output.

2. **Post questions to Figma**: Create a new tool (`analyze-figma-scope`) similar to `analyze-feature-scope`, but instead of posting questions to Jira, it posts questions directly as comments on Figma frames/nodes.

---

## Requirements

### 1. Read Figma Comments as Context

**Goal**: When `write-shell-stories` and `analyze-feature-scope` analyze Figma screens, they should also read existing comments on those screens/frames to incorporate designer/stakeholder feedback.

**Behavior** (similar to existing Note component support):
- Fetch all comments for a Figma file using `GET /v1/files/:key/comments`
- Use `client_meta` position data to associate each comment with the closest screen frame (same spatial proximity logic as `associateNotesWithFrames()`)
- Include threaded replies (comments where `parent_id` references a root comment)
- Cache comments to `{nodeId}.comments.md` files alongside existing `.analysis.md` and `.notes.md` files
- Pass comment text as additional context to the AI when generating scope analysis or shell stories
- Optional: Support `as_md=true` query param to get comments in markdown format

**Comment Data to Extract**:
- `message` - The comment text
- `client_meta` - Position info (node_id if FrameOffset, or x/y coordinates for Vector)
- `resolved_at` - Whether comment is resolved (filter out resolved by default?)
- `user.handle` - Who wrote the comment
- `created_at` - When comment was written
- Threaded structure via `parent_id`

**Spatial Association** (reuse existing pattern from `screen-analyzer.ts`):
- If comment has `client_meta.node_id` → directly associate with that node
- If comment has `client_meta` as Vector (x, y coordinates) → use proximity calculation to find closest frame (same as `associateNotesWithFrames()` but for points instead of rectangles)
- Group threaded replies under their parent comment
- Store in `{nodeId}.comments.md` cache file per screen

**Scope**: `file_comments:read` (already in default OAuth scopes)

---

### 2. New Tool: `analyze-figma-scope`

**Goal**: Similar to `analyze-feature-scope`, but instead of posting questions to Jira, post questions as comments directly on Figma frames.

**Input**:
- `figmaUrls` - One or more Figma URLs (file, page, or frame links)
- `contextDescription` (optional) - Text description of epic/feature context

**Behavior**:
1. Fetch Figma file metadata to identify frames/screens
2. Download and analyze each screen (same as `analyze-feature-scope`)
3. Generate scope analysis with feature areas and questions
4. For each question (❓), post a comment to the relevant Figma frame/node
5. Return the scope analysis markdown

**Posting Comments**:
- Use `POST /v1/files/:file_key/comments`
- Position comment at the top-left of the relevant frame using `client_meta` with `FrameOffset` type:
  ```json
  {
    "node_id": "123:456",
    "node_offset": { "x": 0, "y": 0 }
  }
  ```
- All questions for a frame are posted at the same location (Figma stacks them with a count badge)
- Questions associated with a specific screen → comment on that frame
- General questions (from "Remaining Questions") → comment on the page or first frame

**Future Enhancement**: Have AI identify approximate feature locations in each screen image so questions can be positioned near the relevant UI elements.

**Scope Required**: `file_comments:write` (need to add to OAuth scopes)

---

## Implementation Steps

### Step 1: Add Comment Fetching to Figma Client

**What to do**:
- Add `getComments(fileKey: string): Promise<FigmaComment[]>` method to `FigmaClient` in `figma-api-client.ts`
- Define `FigmaComment` interface matching Figma API response
- Support `as_md=true` query param option

**How to verify**:
- Run test script `scripts/test-figma-annotations.ts` which already fetches comments
- Confirm comments are parsed with position data and threading info

---

### Step 2: Create Comment Association Helper

**What to do**:
- Create `server/providers/figma/figma-comments.ts`
- Define `FigmaComment` and `CommentThread` interfaces
- Implement `associateCommentsWithFrames(frames: FigmaNodeMetadata[], comments: FigmaComment[], baseUrl: string)`:
  - Reuse spatial proximity logic from `screen-analyzer.ts`
  - If comment has `client_meta.node_id` → direct association
  - If comment has Vector position → calculate distance to each frame, associate with closest
  - Group replies under parent comments
  - Return `{ screenComments: Map<string, CommentThread[]>, unassociatedComments: CommentThread[] }`
- Implement `formatCommentsForPrompt(comments: CommentThread[]): string` - formats for AI context

**How to verify**:
- Unit test with sample comment data embedded in the test file
- Verify comments with node_id are directly associated
- Verify comments with Vector position use proximity
- Verify threaded comments are grouped correctly

---

### Step 3: Add Comment Caching

**What to do**:
- Add `comments` type to `getCachedNodePath()` in `figma-cache.ts` → `{nodeId}.comments.md`
- In `figma-screen-setup.ts`, after associating notes with frames:
  - Fetch comments for the Figma file
  - Associate comments with frames using new helper
  - Write `{nodeId}.comments.md` files to cache directory
- Cache format: Markdown with author, date, thread structure

**How to verify**:
- Run `analyze-feature-scope` on Figma file with comments
- Verify `.comments.md` files created in `cache/figma-files/{fileKey}/`
- Verify content includes author and thread structure

---

### Step 4: Integrate Comments into Screen Analysis Prompts

**What to do**:
- In `analyze-feature-scope` core logic, include comment content in AI prompts
- Update prompt templates to reference "Designer/Stakeholder Comments" section
- Similar to how notes are included, add comments as additional context per screen

**How to verify**:
- Run `analyze-feature-scope` on a Figma file with comments
- Confirm scope analysis references information from comments
- Check prompt debug file includes comment context

---

### Step 5: Update OAuth Scopes (for write capability)

**What to do**:
- Add `file_comments:write` to default Figma OAuth scopes in `.env.example`
- Update `server/providers/figma/config.ts` if scope configuration exists there
- Update documentation

**How to verify**:
- New OAuth authorizations include write scope
- Existing tokens may need re-authorization

---

### Step 6: Add Comment Posting to Figma Client

**What to do**:
- Add `postComment(fileKey: string, message: string, clientMeta: ClientMeta): Promise<Comment>` to `FigmaClient`
- Define `ClientMeta` types (`Vector`, `FrameOffset`, etc.)

**How to verify**:
- Test posting a comment via script
- Verify comment appears in Figma at correct position

---

### Step 7: Create `analyze-figma-scope` Tool

**What to do**:
- Create `server/providers/figma/tools/analyze-figma-scope/` folder
- Implement tool registration similar to `analyze-feature-scope`
- Input: `figmaUrls` (array of Figma URLs), `contextDescription` (optional text)
- Reuse screen analysis logic from shared modules
- Post questions as comments instead of updating Jira

**How to verify**:
- Call tool with Figma file URLs
- Verify scope analysis is returned
- Verify question comments appear in Figma on correct frames

---

### Step 8: Integrate Comments into `write-shell-stories`

**What to do**:
- Comments are already cached from Step 3 during `setupFigmaScreens()`
- Update `regenerateScreenAnalyses()` to include comment content in prompts
- Update prompts to reference designer feedback from comments

**How to verify**:
- Run `write-shell-stories` on epic with Figma file that has comments
- Confirm generated stories incorporate comment context

---

## Questions

1. Should resolved Figma comments be excluded from context, or included with a "resolved" indicator? 

Answer: Included.

2. For `analyze-figma-scope`, should we require a Jira epic for context, or allow standalone analysis with just a text description? Standalone. 

Answer: This should be figma to figma.

3. When posting questions as comments, should we use a specific format/prefix (e.g., "❓ [AI Question]") to distinguish AI-generated questions from human comments?

Yes, post with `Cascade🤖P: {Question}❓` like `Cascade🤖: Should search be case sensitive❓`

4. Should we support posting comments on replies (adding to existing threads), or only create new top-level comments?

Only create new top-level comments.


5. For comments that span multiple frames (general questions), where should they be posted? Options:
   - First frame in the file
   - Page-level (if Figma supports this)
   - A designated "Overview" frame if one exists


If it associates stonger for one than the others, post in that frame. Otherwise, page-level. 