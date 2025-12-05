# Issue: Shell Stories Being Created From Unanswered Questions

## Problem

Shell stories are being created from ❓ questions in the scope analysis, even when there's no corresponding ☐ or ⏬ checkbox indicating the feature is in scope.

### Example

In `specs/11-out-of-scope/out-of-scope-2.md`, a story was created:

```markdown
st010 Verify WCAG Color Contrast Compliance ⟩ Audit and adjust colors to meet WCAG AA or AAA standards for accessibility
```

This story was generated solely from this question in "Remaining Questions":

```markdown
❓ Have color contrast ratios been verified for WCAG AA or AAA compliance?
```

There was **no ☐ checkbox** in the scope analysis for WCAG verification work.

## Root Cause

The prompt currently says:
- "❓ Questions → Include in relevant story bullets"

This is ambiguous and doesn't distinguish between:
- **Unanswered questions** (uncertainty, needs clarification) → Should NOT create stories
- **Answered questions - implementation details** (clarify HOW to build existing features) → Include as notes in stories
- **Answered questions - new features** (reveal significant new work) → SHOULD create new stories

## Correct Behavior

❓ questions serve two purposes:
1. **Capture uncertainties** about features that ARE in scope (marked with ☐ or ⏬)
2. **Ask about the current state** (like "Have X been verified?")

### Unanswered Questions
Unanswered questions (just the ❓ line with no answer below it) should **never** create standalone stories. They should only be included as ❓ question bullets within stories that implement related features.

### Answered Questions - Two Types

#### Type A: Implementation Details (Do NOT create new stories)
Answers that clarify HOW to implement existing ☐ features should be included within the relevant feature's story. Include the answer in a ☐ implementation bullet or as a ❓ question bullet with the answer.

**Examples:**
- ❓ Is search case-sensitive or case-insensitive? **Case insensitive.**
  - This clarifies the existing ☐ search feature - include in story as: `☐ Case-insensitive search matching`
- ❓ Should status and priority capitalization be consistent? **Yes. Title case.**
  - This clarifies the existing ☐ filter feature - include in story as: `☐ Title case capitalization for status and priority labels`

#### Type B: New Features (Create new stories)
Answers that reveal significant NEW functionality not covered by existing ☐/⏬ checkboxes should generate new stories.

**Examples:**
- ❓ Should search terms persist across browser sessions? **Yes, add the query to the url via pushstate.**
  - This reveals NEW work (URL state management) - create a story for it
- ❓ How are large task lists handled? **Pagination with load more button.**
  - This reveals NEW work (pagination) - create a story for it

**Key distinction:** If the answer requires non-trivial additional implementation beyond the basic feature, it should become a story.

## Solution

Clarify how to handle different types of questions. The minimal changes needed:

### Change 1: FUNDAMENTAL RULE section (appears twice in prompt)

**Before:**
```
• When scope analysis has ❓ questions, include them in relevant story bullets
```

**After:**
```
• ❓ Unanswered questions should be included as ❓ question bullets within relevant stories, but DO NOT create standalone stories from unanswered questions
• ❓ Answered questions that clarify implementation details should be incorporated into ☐ implementation bullets within relevant stories (capturing the answer as implementation detail)
• ❓ Answered questions that reveal significant new functionality not covered by existing ☐/⏬ features MAY create new stories if the new work is substantial
• Stories primarily come from ☐ In-Scope or ⏬ Low Priority checkboxes, but answered questions revealing new features are also valid sources
```

### Change 2: PROCESS Step 1 (REVIEW SCOPE ANALYSIS)

**Before:**
```
- ❓ Questions → Include in relevant story bullets
```

**After:**
```
- ❓ Unanswered questions → Include as ❓ question bullets in relevant stories (do NOT create new stories)
- ❓ Answered questions (implementation details) → Incorporate answers into ☐ implementation bullets in relevant stories
- ❓ Answered questions (new features) → May create new stories if work is substantial and not covered by existing ☐/⏬ features
```

**Add at end of step 1:**
```
• **CRITICAL**: Stories come from two sources:
  1. Features with ☐ or ⏬ checkboxes (primary source)
  2. Answered ❓ questions that reveal significant new functionality not covered by existing checkboxes
• Do NOT create stories from unanswered questions or questions that merely clarify existing features
```

## Files to Update

1. `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts`
   - Update `SHELL_STORY_SYSTEM_PROMPT` (line ~17)
   - Update main prompt's FUNDAMENTAL RULE section (line ~94)
   - Update PROCESS step 1 (line ~116)

## Expected Outcome

After these changes:
- Stories are primarily created from ☐ or ⏬ checkboxes in scope analysis
- Unanswered ❓ questions are included as ❓ question bullets in relevant stories (no new stories created)
- Answered ❓ questions that clarify implementation are incorporated into ☐ implementation bullets in relevant stories (no new stories created)
- Answered ❓ questions that reveal significant new functionality MAY create new stories if the work is substantial and not covered by existing checkboxes
- No standalone stories are created just because an unanswered question was asked

### Examples of Correct Handling

**Unanswered Question:**
- ❓ Have color contrast ratios been verified for WCAG AA or AAA compliance?
- **Action:** Include as ❓ question bullet in accessibility-related story, do NOT create st010 "Verify WCAG Compliance"

**Answered Question - Implementation Detail:**
- ❓ Is search case-sensitive or case-insensitive? **Case insensitive.**
- **Action:** Include answer in search story as ☐ implementation bullet: "☐ Case-insensitive search matching"

**Answered Question - New Feature:**
- ❓ Should search terms persist across sessions? **Yes, add the query to the url via pushstate.**
- **Action:** Create new story: "Add URL State Management for Search and Filters" with implementation of pushstate
