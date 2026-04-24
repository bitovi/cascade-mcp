# 8-groupings-with-low-priority

**Status:** Partial

## What it proposes
The spec addresses two related issues: (1) low priority (⏬) features being pulled into their own separate Feature Groupings (e.g., "Status Tab Filtering", "Column Sorting" as standalone groups), and (2) the AI generating questions like "Should tabs be removed in initial implementation?" for low priority features. The fix targets `prompt-feature-identification-2.ts` (now replaced by `prompt-scope-analysis-2.ts`) to add explicit guidance that low priority features are well-defined and should not trigger implementation-timing questions.

## Architectural decisions made
- Low priority features should be listed within their parent functional area group, not in standalone groups.
- ❓ Questions should only cover genuinely unclear feature behavior — never implementation timing or phasing decisions (those are communicated by ☐ vs ⏬ markers).

## What still needs implementing
- No explicit grouping rule preventing the AI from creating standalone groups that contain only ⏬ low priority items. The current `prompt-scope-analysis-2.ts` GROUPING RULES say "group by user workflow" but do not explicitly say "do not create a separate feature area whose only features are ⏬ low priority items."
- The question-prevention guidance (Do NOT ask about timing/phasing, Do NOT ask whether to remove/hide/disable low priority features) is implemented in `prompt-scope-analysis-2.ts` lines 296–306.
