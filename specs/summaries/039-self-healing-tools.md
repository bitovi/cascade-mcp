# 039-self-healing-tools

## Status
Implemented

## What it proposes
Make `write-shell-stories` self-healing by automatically running scope analysis internally, counting unanswered questions (❓ markers), and deciding whether to proceed with shell stories (≤5 questions) or surface a Scope Analysis section asking for clarification (>5 questions). This eliminates the need for users to manually run `analyze-feature-scope` as a prerequisite, which is deprecated in favor of this integrated flow.

## Architectural decisions made
- `write-shell-stories` automatically checks for an existing "## Scope Analysis" section before proceeding
- If no analysis exists, runs scope analysis internally (LLM call with ❓/💬 markers); if one exists, regenerates it with previous answers as context
- `decideSelfHealingAction()` function in `scope-analysis-helpers.ts` encodes the three outcomes: `PROCEED_WITH_STORIES`, `ASK_FOR_CLARIFICATION`, `REGENERATE_ANALYSIS`
- Threshold is hardcoded at 5 (comparison `> 5`); exactly 5 unanswered questions proceeds
- Figma comment threads are included in LLM context to reduce duplicate questions
- `analyze-feature-scope` remains functional but is marked `@deprecated` in its description and README, pointing users to `write-shell-stories`
- Contract tests live in `write-shell-stories-self-healing.contract.test.ts`

## What still needs implementing
Fully implemented.
