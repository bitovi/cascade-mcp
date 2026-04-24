# Add Low Priority Status to Feature Identification

**Status:** Implemented

## What it proposes
The spec proposes adding a fourth feature status category — ⏬ Low Priority — to distinguish features that are explicitly in-scope but deferred to the end of an epic from features that are truly out-of-scope (❌). It proposes updating the feature identification prompts and screen analysis prompt to use ⏬ consistently instead of conflating low-priority with out-of-scope.

## Architectural decisions made
- Use ⏬ everywhere (replacing ⏸️ DEFERRED in screen analysis for consistency)
- Low priority features are numbered sequentially with other stories (not separately prefixed)
- Epic context is the source of truth when screens and priorities conflict
- Low priority stories are included in the normal write-next-story sequence (not skipped)
- Five categories total: ☐ In-Scope, ✅ Already Done, ⏬ Low Priority, ❌ Out-of-Scope, ❓ Questions

## What still needs implementing
- Formal test cases (Step 7) validating correct classification for "delay until end" vs "out of scope" language were mentioned but no test files appear to exist
- The spec referenced `prompt-feature-identification-2.ts` which no longer exists (the tool was refactored to `analyze-feature-scope`); the ⏬ category is implemented in `prompt-scope-analysis-2.ts` but the legacy `prompt-scope-analysis-1.ts` and `prompt-scope-analysis.ts` still use ❌ for deferred features without a ⏬ distinction
