I want to update the "writing shell stories" prompt to benefit from the results of:

server/providers/combined/tools/analyze-feature-scope/strategies/prompt-scope-analysis-2.ts

You can see some example results here:

specs/9-example-scope-analysis.md


The writing shell stories prompt is here: 

server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts

How can we make these prompts better coordinate together?

Please ask any questions and provide suggestions below:

## Questions

### 0. Do we need individual screen analysis files for shell story generation?

**Answer: NO - Shell stories only need scope analysis!**

**Reasoning:**
- Shell stories are high-level planning artifacts that define WHAT to build and in what order
- They don't need implementation details like exact button labels, validation rules, or color codes
- Scope analysis already provides:
  - Feature categorization (☐/⏬/❌/❓)
  - Functional groupings (feature areas)
  - Links to Figma screens
  - High-level questions

**Full story writing (write-next-story) needs screen analyses:**
- That's where implementation details matter (HOW to build it)
- Screen analyses provide UI specifications, interaction behaviors, content details

**Simplified flow:**
```
Screen Analyses → Scope Analysis → Shell Stories → Full Story
     ↓                   ↓              ↓              ↓
  Details          Categories      Planning      Implementation
                                                    (uses both
                                                   shell + screens)
```

**Implications:**
- Shell story prompt can be **significantly simpler** - just needs scope analysis + screens.yaml
- Remove all screen analysis file processing from shell story generation
- Keep screen analyses only for full story writing

### 1. Should shell stories directly reference scope analysis categories?
Currently, the shell story prompt doesn't explicitly reference the scope analysis output. Should stories:
- Reference scope analysis section names (e.g., "implements features from 'Application List Display' section")?
- Map their bullets to scope analysis categories (☐/✅/⏬/❌/❓)?
- Use scope analysis as an input file alongside screen analyses?

### 2. How should low priority features (⏬) flow between prompts?
Scope analysis marks features as ⏬ (low priority - implement at end). Shell stories use:
- `⏬` Low priority functionality (visible but implement in later stories)
- `-` Deferred/excluded functionality

Should these align? For example:
- Scope analysis: "⏬ Pagination controls (low priority - delay until end per epic)"
- Shell story st001: "⏬ Pagination controls (defer to st015)"
- Shell story st015: "☐ Pagination controls"

### 3. Should scope analysis questions inform shell story questions?
Scope analysis surfaces ❓ questions about requirements. Should shell stories:
- Inherit unanswered scope questions as ❓ bullets?
- Only include questions about implementation details?
- Reference scope analysis questions by ID/section?

### 4. Should scope analysis feature areas map to story groupings?
Scope analysis groups by functional area (e.g., "Application List Display", "Status-Based Filtering"). Should shell stories:
- Explicitly reference these groupings in story descriptions?
- Use same grouping logic when splitting stories?
- Create one story per feature area (or allow many-to-many mapping)?

### 5. How do we handle scope analysis "Figma screen links" vs shell story "SCREENS"?
Both prompts reference Figma URLs:
- Scope analysis: Lists screens per feature area
- Shell stories: Lists screens per story under SCREENS bullet

Should there be validation that:
- Every screen referenced in scope analysis has a corresponding story?
- Every story references screens mentioned in scope analysis?
- Or are these independent views that may not fully overlap?

## Suggestions

### 1. Add validation instructions to shell story review step

**Problem**: No explicit validation that stories cover all in-scope features from scope analysis.

**Solution**: Add new step to shell story PROCESS section (after step 10):

```markdown
11. **VALIDATE AGAINST SCOPE ANALYSIS (IF PROVIDED)**
   • For each ☐ In-Scope feature in scope analysis:
     ◦ Verify there's at least one story implementing this feature
     ◦ If missing, add a new story or flag as ❓ question
   • For each ⏬ Low Priority feature in scope analysis:
     ◦ Verify early stories defer it with ⏬ bullets
     ◦ Verify there's an implementation story later in the list
     ◦ If missing, add an implementation story at the end
   • For each ❌ Out-of-Scope feature in scope analysis:
     ◦ Verify NO stories implement this feature
     ◦ If accidentally included, mark with ❌ or remove
   • For each ❓ Question in scope analysis:
     ◦ If question is relevant to a story, include it as ❓ bullet
     ◦ If question blocks implementation, flag in DEPENDENCIES
```

### 2. Update scope analysis to include implementation hints

**Problem**: Scope analysis categorizes features but doesn't suggest how to split them into incremental stories.

**Solution**: Add optional implementation hints to scope analysis features (for complex areas):

```markdown
## Scope Analysis

### Application List Display

[applicants-new](url) [applicants-in-progress](url)

☐ Data table displaying applications (CORE - implement first)
☐ Clickable applicant names navigating to detail view (CORE - implement first)
☐ Display of application types (ENHANCEMENT - implement after basic table)
☐ Timestamp display with relative formats (ENHANCEMENT - implement after basic table)
⏬ Pagination controls (low priority - delay until end per epic)
❓ How many applications load initially before pagination?
```

These hints could guide story splitting without being prescriptive.

### 3. Create a "scope coverage" output format

**Problem**: No easy way to verify that all scope analysis features are addressed by stories.

**Solution**: Add a final coverage check to shell story output:

```markdown
## Scope Coverage

| Scope Feature | Story | Status |
|---------------|-------|--------|
| Data table display | st001 | ☐ Implementing |
| Clickable names | st001 | ☐ Implementing |
| Pagination controls | st015 | ⏬ Deferred |
| Sort columns | - | ❌ Out of scope |
| Initial load count | st001 | ❓ Question |
```

This would make it obvious if any scope features are missing stories.

### 4. Unify evidence-based principles across both prompts

**Problem**: Both prompts emphasize evidence-based analysis but use slightly different language.

**Solution**: Create a shared "EVIDENCE-BASED PRINCIPLES" section that both prompts reference:

```markdown
## EVIDENCE-BASED PRINCIPLES (applies to both prompts)

✅ DO:
- Reference actual UI elements described in screen analyses
- Quote specific text from analysis files when categorizing features
- Convert unclear behaviors to ❓ questions
- Cite screen names when describing functionality

❌ DON'T:
- Infer features that "should" exist but aren't shown
- Assume standard patterns (like auth, validation) without evidence
- Implement speculative enhancements
- Add features because they're "industry standard"

WHEN IN DOUBT:
- Mark as ❓ question rather than implementing assumed behavior
- Defer to later story (⏬) rather than expanding current scope
- Reference epic context for explicit scope guidance
```

This could be extracted to a shared file both prompts import.

---

## Prompt Simplification Opportunities

Since scope analysis has already done categorization work, here are ways to simplify the shell stories prompt:

### 5. Estimated Size Reduction

By removing screen analyses and leveraging scope analysis:

**Removed entirely:**
- Screen analysis file input/processing (~20 lines in function)
- All "EVIDENCE-BASED ONLY" instructions (~40 lines)
- Evidence violation examples (~15 lines)
- Screen-evidence audit steps (~30 lines)
- "FUNDAMENTAL RULE: EVIDENCE-BASED ONLY" section (~10 lines)

**Simplified drastically:**
- Step 1: Review epic → Review scope analysis (~5 lines)
- Step 2: Identify features → Map features to stories (~10 lines)
- Step 9-10: Evidence checks → Simple scope coverage check (~50 lines → 10 lines)
- Quality rules: Remove all evidence-checking rules (~20 lines)

**Added:**
- Simple scope-to-story mapping instructions (~15 lines)

**Net reduction: ~150-170 lines** (~50% smaller prompt!)

**Additional benefits:**
- Much smaller token count (no screen analysis content in input)
- Clearer prompt focus (planning vs implementation)
- Faster execution (less to process) 


