# 14-questions-into-stories.md

## Status
Not Implemented

## What it proposes
Shell stories were incorrectly being created from unanswered ❓ questions in scope analysis (with no ☐/⏬ checkbox present). The spec proposes updating `prompt-shell-stories.ts` to distinguish between unanswered questions (include as ❓ bullets, never create stories), answered questions clarifying existing features (incorporate as implementation bullets), and answered questions revealing new functionality (may create new stories if substantial).

## Architectural decisions made
- Unanswered ❓ questions should never create standalone stories — only be included as ❓ bullets within related stories
- Answered questions clarifying HOW to implement existing scope items → incorporate answer into ☐ implementation bullets, no new story
- Answered questions revealing significant new functionality not covered by ☐/⏬ → may create new stories
- Stories must primarily come from ☐ In-Scope or ⏬ Low Priority checkboxes; answered questions are a secondary source
- Changes are localized to `SHELL_STORY_SYSTEM_PROMPT` and the main prompt's FUNDAMENTAL RULE and PROCESS Step 1 sections in `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts`

## What still needs implementing
- Update FUNDAMENTAL RULE section (appears at lines ~24 and ~199 in prompt-shell-stories.ts) to replace the single ❓ bullet with three separate rules for unanswered, answered-detail, and answered-new-feature questions
- Update PROCESS Step 1 "REVIEW SCOPE ANALYSIS" (lines ~170 and ~225) to replace `- ❓ Questions → Include in relevant story bullets` with the three-way distinction
- Add CRITICAL note at end of Step 1 clarifying the two valid story sources and explicitly prohibiting story creation from unanswered questions
