# Feature Identification Prompt Improvement Suggestions

## Issue Summary

When analyzing the task search/filter feature, the AI output included existing functionality that was explicitly marked as "out of scope" in the epic context. The grouping title was too broad, and questions weren't focused enough on the new capabilities.

## Specific Issues Identified

### 1. **Existing Functionality Being Marked as In-Scope (✅)**

**Problem:** The output included existing features like "Checkbox interaction to toggle task status" with ✅, even though the epic context explicitly stated this was existing functionality under "Out of Scope."

**Current Prompt Section:**
```
- ✅ In-Scope: Epic context says it's in-scope, OR UI is present with clear behavior (when epic doesn't specify)
```

**Issue:** The "OR UI is present" fallback is causing the AI to mark visible existing features as in-scope.

**Suggestion:** Add explicit guidance about existing functionality:
```
- ✅ In-Scope: Epic context says it's in-scope AND not listed as existing/out-of-scope
  - If epic mentions a feature under "Out of Scope" or describes it as existing, do NOT mark it ✅
  - Only mark features ✅ if they are new capabilities being added
  - When epic provides scope context, existing UI elements may be shown for context but aren't new features
```

### 2. **Grouping Title Too Broad**

**Problem:** "Task List Display" describes what's visible on screen, not the new feature workflow being implemented (search and filter functionality).

**Current Guidance:**
```
Group features by user workflow and functional areas (e.g., "Authentication Flow", "User Profile Management", "Data Entry Workflow")
```

**Suggestion:** Add more explicit guidance about naming feature areas based on epic intent:
```
**Step 3: Identify feature areas by workflow**
- Group related functionality by user workflow (e.g., "Authentication Flow", "Dashboard Interaction", "Settings Management")
- When epic context describes a specific user goal (e.g., "search and filter tasks"), use that goal as the feature area name
- Feature area names should reflect NEW capabilities being added, not existing UI structure
- Examples:
  - Good: "Task Search and Filtering", "User Profile Editing", "Data Export Workflow"
  - Avoid: "Task List Display", "Profile Page", "Settings Screen" (these describe UI, not new functionality)
```

### 3. **Questions Not Focused on New Features**

**Problem:** Questions like "Are task cards clickable?" and "How are tasks sorted?" apply to the existing task list, not specifically to the new search/filter feature.

**Suggestion:** Add guidance to focus questions on the scope of new work:
```
**Step 6: Collect and deduplicate questions**
- Focus questions on new features and capabilities being added
- For existing functionality mentioned in epic context, only ask questions if they interact with new features
- Examples:
  - Relevant: "Should search filter existing results or query the backend?"
  - Relevant: "Can filters be combined with search terms?"
  - Less relevant: "Are existing task cards clickable?" (unless clickability changes with search)
```

### 4. **Data Quality Issues Mixed with Feature Questions**

**Problem:** The duplicate initials "AJ" issue is a data quality concern, not a feature identification question.

**Suggestion:** Add a separate section for data quality observations:
```
## OUTPUT FORMAT

\`\`\`markdown
## Scope Analysis

### {Feature Area Name}

[Screen Name](figma-url)

- ✅ {In-scope feature}
- ❌ {Out-of-scope feature}
- ❓ {Question about this area}

### Data Quality Observations (optional)

- ⚠️ {Data inconsistency or quality issue observed in mockups}
- ⚠️ {Another data issue}

### Remaining Questions

- ❓ {General question}
\`\`\`
```

### 5. **Ambiguity About "Out of Scope" Context Usage**

**Problem:** The prompt emphasizes that epic context lists "out-of-scope" features, but doesn't clearly explain that sometimes epic authors use "Out of Scope" to mean "existing functionality we're not changing" vs "deferred features."

**Current Text:**
```
**Use epic context as primary source of truth for:**
- Identifying features explicitly marked as in-scope or out-of-scope
- Understanding project priorities and goals
- Recognizing features deferred to future phases
```

**Suggestion:** Clarify the different meanings of "out of scope":
```
**Use epic context as primary source of truth for:**
- Identifying features explicitly marked as in-scope or out-of-scope
- Understanding project priorities and goals
- Recognizing features deferred to future phases
- Distinguishing between "out-of-scope = existing" vs "out-of-scope = future work"
  - If epic says "We already have X" under out-of-scope, that's EXISTING functionality
  - If epic says "Future: X" or "Not included: X" under out-of-scope, that's DEFERRED functionality
  - Existing features visible in screens provide context but aren't new work (don't mark ✅)
  - Deferred features might not be visible yet or marked as "future phase" in analyses (mark ❌)
```

## Implementation Priority

1. **High Priority:** Fix issue #1 (existing functionality marked as in-scope) - this causes incorrect scope understanding
2. **High Priority:** Fix issue #2 (grouping titles) - helps focus on actual deliverables
3. **Medium Priority:** Fix issue #3 (question focus) - improves quality of ambiguity surfacing
4. **Low Priority:** Fix issue #4 (data quality section) - nice to have for cleaner organization
5. **Low Priority:** Fix issue #5 (clarity on "out of scope" meanings) - helps but existing text mostly works

### 6. **Emoji Semantics - ✅ Means "Done" Not "To-Do"**

**Problem:** Using ✅ for "in-scope work to be done" is semantically incorrect. Checkmarks universally mean "completed" or "already done," not "needs to be built."

**Current Usage:**
- ✅ In-Scope (work to be done)
- ❌ Out-of-Scope
- ❓ Questions

**Suggestion:** Switch to task-oriented emojis that match universal conventions:
- ☐ In-Scope (work to be done - empty checkbox signals a task)
- ✅ Already done (existing functionality - checkmark means completed)
- ❌ Out-of-Scope (deferred/excluded)
- ❓ Questions (needs clarification)

**Prompt Changes Required:**

1. Update categorization rules in system prompt:
```
CATEGORIZATION RULES:
- ☐ In-Scope: Features explicitly listed as in-scope in epic context, OR features with complete UI and clear implementation path (when epic context doesn't specify)
- ✅ Already Done: Existing functionality mentioned in epic context that provides context but isn't new work
- ❌ Out-of-Scope: Features explicitly mentioned in epic context as deferred/excluded, OR features marked as future/optional in analyses
- ❓ Questions: Ambiguous behaviors, unclear requirements, missing information, or features that could be either in/out of scope
```

2. Update Step 4 instructions:
```
**Step 4: Categorize features within each area**
- ☐ In-Scope: Epic context says it's in-scope, OR UI is present with clear behavior (when epic doesn't specify)
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step form with validation, error handling, and progress indicators"
- ✅ Already Done: Epic mentions this as existing functionality (e.g., under "Out of Scope: We already have X")
  - Keep brief: "Checkbox interaction to toggle task status"
  - These provide context but aren't part of new work
- ❌ Out-of-Scope: Epic context says it's deferred/excluded, OR marked as future in analyses
  - Keep brief: "OAuth authentication (deferred)"
- ❓ Questions: Behavior unclear, requirements ambiguous, or could be either in/out of scope
```

3. Update output format example:
```markdown
### {Feature Area Name}

[Screen Name](figma-url)

- ☐ {In-scope feature - work to be done}
- ☐ {Another in-scope feature}
- ✅ {Existing functionality - already implemented}
- ❌ {Out-of-scope feature - deferred}
- ❓ {Question about this area}
```

**Benefits:**
- Semantically correct - ☐ signals work to be done
- Clear distinction between new work (☐) and existing baseline (✅)
- Aligns with universal task list conventions
- Reduces confusion about what needs to be implemented

## Implementation Priority

1. **High Priority:** Fix issue #1 (existing functionality marked as in-scope) - this causes incorrect scope understanding
2. **High Priority:** Fix issue #2 (grouping titles) - helps focus on actual deliverables
3. **High Priority:** Fix issue #6 (emoji semantics) - improves clarity about what's new vs existing
4. **Medium Priority:** Fix issue #3 (question focus) - improves quality of ambiguity surfacing
5. **Low Priority:** Fix issue #4 (data quality section) - nice to have for cleaner organization
6. **Low Priority:** Fix issue #5 (clarity on "out of scope" meanings) - helps but existing text mostly works

## Testing Recommendation

After implementing changes, test with the original example:
- Epic states: "Out of Scope: We already have a tasks page with checkboxes for status changes"
- Expected: Checkbox functionality should appear with ✅ (already done) in output
- Expected: New search/filter features should appear with ☐ (in-scope work to do)
- Expected: Feature area name should be "Task Search and Filtering" not "Task List Display"
- Expected: Questions should focus on search/filter behavior, not existing task list behavior
