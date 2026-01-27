# Data Model: Self-Healing Story Writing Tools

**Feature**: 039-self-healing-tools  
**Date**: 2026-01-26

## Core Entities

### Question

Represents a clarifying question about unclear requirements, edge cases, or missing information.

**Attributes**:
- `text`: string - The question text
- `status`: `'unanswered' | 'answered'` - Whether the question has been answered
- `marker`: `'❓' | '💬'` - Visual marker in markdown output
- `source`: `'figma' | 'epic' | 'confluence' | 'analysis'` - Where the question originated

**State Transitions**:
```
[Analysis] → unanswered (❓)
           ↓
[User answers / Figma comment / Context added]
           ↓
        answered (💬)
```

**Validation Rules**:
- `text` must not be empty
- `marker` must match `status` (❓ = unanswered, 💬 = answered)
- LLM determines status by analyzing all context

**Business Rules**:
- Unanswered questions (❓) count toward threshold
- Answered questions (💬) do not block workflow
- Questions persist across tool runs (regenerated with updated status)

---

### ScopeAnalysisSection

Represents the "## Scope Analysis" section in a Jira epic containing categorized features and questions.

**Attributes**:
- `markdown`: string - Full markdown content of the section
- `featureAreas`: FeatureArea[] - List of categorized feature areas
- `questionCount`: number - Count of ❓ (unanswered) questions
- `hasContent`: boolean - Whether section exists and has content

**Relationships**:
- Contains multiple FeatureArea entities
- Each FeatureArea contains multiple Feature entities
- Each Feature may have Questions

**State Transitions**:
```
[No section] → [Generated] → [Regenerated on re-run]
                              ↓
                         [Updated with 💬 markers]
```

**Validation Rules**:
- `markdown` must start with "## Scope Analysis"
- `questionCount` must equal actual count of ❓ markers in markdown
- `hasContent = true` iff `markdown.length > 0`

**Size Constraints**:
- Total epic size (with scope analysis) must not exceed 43,838 characters (Jira limit)
- Warn at 90% of limit, error at 100%

---

### FeatureArea

Represents a functional grouping of related features (e.g., "Authentication Flow", "Profile Management").

**Attributes**:
- `name`: string - Name of the feature area
- `features`: Feature[] - List of features in this area
- `screens`: string[] - Figma screen URLs associated with this area

**Validation Rules**:
- `name` must not be empty
- `features` array must contain at least one feature
- `screens` array may be empty (not all features have screens)

**Business Rules**:
- Feature areas group by user workflow, not UI location
- Single feature area may span multiple screens
- Multiple feature areas may reference same screen

---

### Feature

Represents a single feature within a feature area, categorized by scope status.

**Attributes**:
- `description`: string - Brief description of the feature
- `category`: `'in-scope' | 'out-of-scope' | 'needs-clarification' | 'low-priority' | 'already-done'`
- `marker`: `'☐' | '❌' | '❓' | '⏬' | '✅'` - Visual marker in markdown
- `questions`: Question[] - Questions associated with this feature

**Category-to-Marker Mapping**:
- `in-scope` → ☐
- `out-of-scope` → ❌
- `needs-clarification` → ❓
- `low-priority` → ⏬
- `already-done` → ✅

**Validation Rules**:
- `description` must not be empty
- `marker` must match `category`
- Questions only valid for `needs-clarification` category

**Business Rules**:
- Only ☐ and ⏬ features create shell stories
- ❌ and ✅ features are skipped
- ❓ features block workflow until clarified

---

### ShellStory

Represents a high-level story outline created from scope analysis (existing entity, no changes needed).

**Attributes** (unchanged):
- `id`: string (e.g., "st001")
- `title`: string
- `description`: string
- `screens`: string[] - Figma URLs
- `dependencies`: string[] - Story IDs
- `deferrals`: Deferral[] - Features deferred to later stories

**Relationship to Scope Analysis**:
- Created from ☐ (in-scope) and ⏬ (low-priority) features
- Must cover all in-scope features
- May not implement ❌ (out-of-scope) features

---

## Supporting Types

### ScopeAnalysisResult

Result object returned by shared scope analysis function.

**Attributes**:
```typescript
interface ScopeAnalysisResult {
  markdown: string;           // Full markdown content
  questionCount: number;      // Count of ❓ markers
  hasAnalysis: boolean;       // Whether analysis was generated
  metadata: {
    featureAreasCount: number;
    inScopeCount: number;
    outOfScopeCount: number;
    lowPriorityCount: number;
    screensAnalyzed: number;
  };
}
```

**Usage**:
```typescript
const result = await generateScopeAnalysis(params, deps);
if (result.questionCount > QUESTION_THRESHOLD) {
  // Create/regenerate section
} else {
  // Proceed with shell stories
}
```

---

### SelfHealingDecision

Enum representing the decision made by self-healing logic.

```typescript
enum SelfHealingDecision {
  PROCEED_WITH_STORIES = 'proceed',        // ≤5 questions, create shell stories
  ASK_FOR_CLARIFICATION = 'clarify',       // >5 questions, create/regenerate scope analysis
  REGENERATE_ANALYSIS = 'regenerate'       // Existing section, update with 💬 markers
}
```

**Decision Logic**:
```typescript
function decideSelfHealingAction(
  scopeAnalysisExists: boolean,
  questionCount: number
): SelfHealingDecision {
  if (scopeAnalysisExists && questionCount > QUESTION_THRESHOLD) {
    return SelfHealingDecision.REGENERATE_ANALYSIS;
  }
  if (!scopeAnalysisExists && questionCount > QUESTION_THRESHOLD) {
    return SelfHealingDecision.ASK_FOR_CLARIFICATION;
  }
  return SelfHealingDecision.PROCEED_WITH_STORIES;
}
```

---

## Data Flow

### Initial Run (No Scope Analysis Exists)

```
1. User calls write-shell-stories
   ↓
2. Check for "## Scope Analysis" → Not found
   ↓
3. Generate scope analysis internally
   ↓
4. Count ❓ questions
   ↓
5a. If ≤5 questions → Proceed with shell stories
5b. If >5 questions → Create Scope Analysis section, ask user to re-run
```

### Re-run (Scope Analysis Exists)

```
1. User calls write-shell-stories (after answering questions)
   ↓
2. Extract existing "## Scope Analysis"
   ↓
3. Regenerate analysis (include previous in context)
   ↓
4. Count ❓ questions (💬 don't count)
   ↓
5a. If ≤5 questions → Create shell stories
5b. If >5 questions → Update Scope Analysis section, ask user to re-run again
```

### With Figma Comments

```
1. User previously ran figma-review-design
   ↓
2. Figma comments exist with answers
   ↓
3. write-shell-stories fetches comments
   ↓
4. LLM includes comments in analysis context
   ↓
5. LLM marks questions as answered (💬) if comments provide answers
   ↓
6. Fewer ❓ questions → More likely to proceed
```

---

## State Machines

### Scope Analysis Lifecycle

```
┌─────────────┐
│  No Section │
└──────┬──────┘
       │ Generate
       ↓
┌─────────────┐
│  Generated  │
└──────┬──────┘
       │ User answers questions
       ↓
┌─────────────┐
│ Regenerated │ ←──┐
└──────┬──────┘    │
       │ More       │ Re-run
       │ questions  │
       └────────────┘
       │ Questions answered
       ↓
┌─────────────┐
│  Satisfied  │ (≤5 questions, proceed to shell stories)
└─────────────┘
```

### Question Status Lifecycle

```
┌─────────────┐
│ Identified  │ (during analysis)
└──────┬──────┘
       │
       ↓
┌─────────────┐
│ Unanswered  │ (❓ marker)
└──────┬──────┘
       │
       ├──→ User edits epic context
       ├──→ Figma comment added
       ├──→ Confluence doc linked
       │
       ↓
┌─────────────┐
│  Answered   │ (💬 marker)
└─────────────┘
```

---

## Persistence

### Jira Epic Structure

```markdown
# Epic Title

## Epic Context
[User-provided context]

## Scope Analysis
### Feature Area 1: [Name]
- ☐ In-scope feature
- ⏬ Low priority feature
- ❌ Out-of-scope feature
- ❓ Question about unclear requirement
  - 💬 Follow-up or answer from context

**Figma screens**: [links]

### Questions
- ❓ Unanswered question 1
- 💬 Answered question 2 (marked because answer found in context)

## Shell Stories
- st001: [Story outline]
- st002: [Story outline]
```

**Update Strategy**:
1. Extract sections (Scope Analysis, Shell Stories)
2. Generate new section content
3. Replace section in epic description
4. Validate total size < 43,838 characters
5. Write updated description via Jira API

---

## Validation Rules Summary

| Entity | Rule | Enforcement |
|--------|------|-------------|
| Question | Text not empty | Runtime validation |
| Question | Marker matches status | LLM prompt instructions |
| ScopeAnalysisSection | Starts with "## Scope Analysis" | Regex validation |
| ScopeAnalysisSection | Question count matches ❓ markers | Post-generation count |
| Feature | Description not empty | LLM prompt instructions |
| Feature | Category matches marker | LLM prompt instructions |
| Epic | Total size < 43,838 chars | Pre-write validation |
| ShellStory | Covers all ☐ features | LLM prompt instructions |
| ShellStory | No ❌ features | LLM prompt instructions |
