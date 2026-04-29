---
name: cascade-answer-design-questions-post-to-figma
description: "Interactive Q&A flow for design behavior questions. Asks each question one at a time, collects the user's answer, and posts each Q&A pair as a Figma comment pinned to the correct frame with proper vertical spacing."
---

# Answer Design Questions — Post to Figma

Walk through design behavior questions one at a time, collecting answers from the user and posting Q&A pairs as Figma comments pinned to the correct frame.

## When to Use

Use after `generate-behavior-questions` has produced frame-specific questions and the user chooses to **answer questions here and post Q&A to Figma**.

## Required Input

- Questions organized by Figma frame (output from `generate-behavior-questions`)
- **Frame dimensions** from `manifest.json` (needed for comment positioning)

## Procedure

### 1. Read frame dimensions

Read `manifest.json` from `.temp/cascade/figma/{fileKey}/` to get `width` and `height` for each frame.

### 2. Flatten questions into ordered list

From the frame-organized questions, build a flat list preserving frame context:

```
Frame: Login Screen (nodeId: 1:234, fileKey: abc123, height: 1200)
  Q1: Should the "Remember me" checkbox be checked by default?
  Q2: What error message appears for invalid credentials?
Frame: Dashboard (nodeId: 5:678, fileKey: abc123, height: 1800)
  Q3: Is the widget layout user-configurable?
```

Count total questions per frame — this is needed for comment spacing.

### 3. Ask each question

For each question, use the **structured question UI** (`askQuestions` in Copilot, `AskUserQuestion` in Claude Code) with suggested answer options.

**Generate 2-4 suggested answers** based on context from:
- The frame's `analysis.md` and `context.md` (Figma annotations, designer notes)
- Scope analysis findings
- Common UX patterns for the component type
- Any partial information from Jira/Confluence/Google Docs

Always include a **"Skip"** option.

Example:

```
header: "Question 1 of 5 — Frame: Case Details"
question: "The designer note says 'show 4 voters before +X others,' but the Text-Listing component only has 3 entry slots. Should the tooltip show a max of 3 or 4 voter names before truncating?"
options:
  - label: "Show 4 names (match designer note)"
    description: "Add a 4th entry slot to the component"
  - label: "Show 3 names (match current component)"
    description: "Update the designer note to match the XML structure"
  - label: "Skip"
allowFreeformInput: true
```

**Ask one question at a time.** Wait for the user's response before proceeding.

The user can select a suggested answer, type a custom response, or skip. All are valid.

### 4. After each answer — post to Figma

Post a Q&A comment pinned to the correct frame using `figma-post-comment`:

- `fileKey`: from the frame context
- `message`: `Cascade🤖 💬 {question}\n\n→ {answer}`
- `nodeId`: from the frame context
- `nodeOffset`: Calculate position for even spacing along the left edge of the frame:
  - `x: -50` (left edge, slightly outside the frame)
  - `y`: Distribute between y=50 and y=(frameHeight - 50). For question index `i` out of `n` questions on this frame:
    - If `n = 1`: `y = frameHeight / 2`
    - If `n > 1`: `y = 50 + i * ((frameHeight - 100) / (n - 1))`
  - Where `i` is 0-indexed within that frame's questions, and `frameHeight` comes from `manifest.json`
  - If `frameHeight` is not available, omit `nodeOffset` (defaults to top-left)

For skipped questions, post: `Cascade🤖 ❓ {question}\n\n→ Skipped`

### 5. Completion summary

After all questions are answered (or skipped), report:

- Total questions answered / skipped / total
- How many comments posted, which frames

## Important Notes

- **One question at a time** — never batch multiple questions in a single prompt
- **Incremental posting** — post after EACH answer, not at the end. Partial progress is saved if the session is interrupted.
- **Figma rate limits** — `figma-post-comment` has Figma API rate limits. The agent posts one comment per answer (human typing speed), so rate limits are unlikely to be hit.
- **Skip handling** — if the user says "skip" or "I don't know", mark as "Skipped" in the comment
- **Emoji markers** — use `💬` for answered questions, `❓` for skipped/unanswered. Always prefix with `Cascade🤖` so comments are identifiable as bot-generated
