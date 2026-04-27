---
name: post-questions-to-figma
description: "Post generated design review questions as comments on Figma frames. Takes questions organized by frame (from generate-questions skill) and posts each question as a comment pinned to the correct Figma frame using the figma-post-comment MCP tool."
---

# Post Questions to Figma

Post design review questions as comments on Figma frames. Each question is posted as a comment pinned to the specific frame it belongs to.

## When to Use

Use after `generate-questions` has produced frame-specific questions and the user confirms they want to post them to Figma.

Typical trigger: User says "yes, post to Figma" after reviewing generated questions.

## Required Input

- Questions organized by Figma frame (output from `generate-questions`)
- Each frame section has a Figma URL with the file key and node ID

## Procedure

### 1. Parse questions by frame

From the generated questions output, extract:
- **File key** — from the Figma URL in each frame heading
- **Node ID** — from the frame heading (format `nodeId: 123:456`)
- **Frame URL** — the full Figma URL
- **Questions** — numbered list under each frame heading

### 2. Post questions to each frame

For each frame with questions:

1. Combine all questions for that frame into a single comment body:

   ```
   Design Review Questions:
   
   1. What is the expected behavior when the user clicks "Submit" with invalid data?
   2. Should the filter panel persist its state across page navigation?
   ```

2. Call MCP tool `figma-post-comment` with:
   - `url`: The Figma frame URL (e.g., `https://www.figma.com/design/{fileKey}?node-id=123-456`)
   - `message`: The combined questions text

### 3. Report results

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
- **Use the `url` parameter** — `figma-post-comment` accepts a Figma URL directly (no need to parse file key and node ID separately)
- **Preserve question numbering** — keep the numbered list format in the comment body
- **Idempotency**: If questions were already posted (visible in Figma comments), don't re-post duplicates. Check `.temp/cascade/figma/{fileKey}/comments/context.md` for existing comments before posting.
