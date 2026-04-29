---
name: cascade-post-design-questions-to-figma
description: "Post generated design behavior questions as comments on Figma frames. Takes questions organized by frame (from generate-behavior-questions skill) and posts each question as a comment pinned to the correct Figma frame using the figma-post-comment MCP tool."
---

# Post Questions to Figma

Post behavior questions as comments on Figma frames. Each question is posted as a comment pinned to the specific frame it belongs to.

## When to Use

Use after `generate-behavior-questions` has produced frame-specific questions and the user confirms they want to post them to Figma.

Typical trigger: User says "yes, post to Figma" after reviewing generated questions.

## Required Input

- Questions organized by Figma frame (output from `generate-behavior-questions`)
- Each frame section has a Figma URL with the file key and node ID

## Procedure

### 1. Parse questions by frame

From the generated questions output, extract:
- **File key** — from the Figma URL in each frame heading
- **Node ID** — from the frame heading (format `nodeId: 123:456`)
- **Frame URL** — the full Figma URL
- **Questions** — numbered list under each frame heading

### 2. Read frame dimensions

Read `manifest.json` from `.temp/cascade/figma/{fileKey}/` to get frame dimensions (`width`, `height`) for each frame. These are needed for comment positioning.

### 3. Post questions to each frame

For each frame with questions:

1. Combine all questions for that frame into a single comment body:

   ```
   Cascade🤖 ❓ Behavior Questions:
   
   1. What is the expected behavior when the user clicks "Submit" with invalid data?
   2. Should the filter panel persist its state across page navigation?
   ```

2. Call MCP tool `figma-post-comment` with:
   - `fileKey`: The Figma file key (from the URL path)
   - `message`: The combined questions text (prefixed with `Cascade🤖 ❓`)
   - `nodeId`: The frame node ID (e.g., `123:456`)
   - `nodeOffset`: Position the comment on the left edge of the frame:
     - `x: -50` (left edge, slightly outside the frame boundary)
     - `y: frameHeight / 2` (centered vertically — since it's one comment per frame)
     - If `frameHeight` is not available, omit `nodeOffset` (defaults to top-left)

### 4. Report results

After posting all comments, report to the user:
- How many frames received comments
- Total number of questions posted
- Any frames where posting failed (with error details)

## Example

Given this questions output:

```markdown
## [Frame: Login Screen (nodeId: 1:234)](https://www.figma.com/design/abc123?node-id=1-234)

1. Should the "Remember me" checkbox be checked by default?
2. What error message appears for invalid credentials?

## [Frame: Dashboard (nodeId: 5:678)](https://www.figma.com/design/abc123?node-id=5-678)

1. Is the widget layout user-configurable?
```

This posts 2 comments:
- Comment on frame `1:234` with questions 1-2
- Comment on frame `5:678` with question 1

## Important Notes

- **One comment per frame** — combine all questions for a frame into a single comment, not individual comments per question
- **Use `fileKey` + `nodeId`** — extract the file key from the URL path and node ID from the frame heading
- **Cascade prefix** — always prefix the comment with `Cascade🤖:` so it's identifiable as bot-generated
- **Preserve question numbering** — keep the numbered list format in the comment body
- **Idempotency**: If questions were already posted (visible in Figma comments), don't re-post duplicates. Check the per-frame `context.md` files for existing comments before posting.
- **Comment positioning**: Use `nodeOffset` to place comments on the left edge of the frame. This prevents comments from piling up at the top-left corner.
