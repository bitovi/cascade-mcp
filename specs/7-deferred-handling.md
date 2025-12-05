# Add Low Priority Status to Feature Identification

## Problem Statement

`server/providers/combined/tools/identify-features/strategies/prompt-feature-identification-2.ts` is incorrectly marking features as "out of scope" (❌) when they should be marked as "low priority" (⏬). These features ARE in scope for the epic but should be implemented at the end, not initially.

### Critical Distinction

We need to carefully distinguish between:
- **Out of Scope (❌)**: Features not mentioned in epic OR explicitly excluded from the epic entirely
- **Low Priority (⏬)**: Features explicitly mentioned in epic to implement later/at the end (in scope but lower priority)

**Ambiguous language requires context:**
- "later" could mean either out of scope or low priority depending on epic context
- "defer", "delay", "at the end" typically mean in-scope but lower priority
- "future epic", "not included", "exclude" typically mean out of scope

### Real Example

**Epic Context:**
```
We should delay filtering and sorting applications until the very end and just show all applicants.

We can delay TruthFilter until the end too.

We can delay showing the Location map until the end too.
```

**Screen Analysis (cache/default/PLAY-38/applicants-complete.analysis.md):**
```markdown
### Status Filter Tabs
Five pill-shaped filter buttons arranged horizontally...
⏸️ DEFERRED: Per design notes, filtering will be delayed until the very end

### Data Display
Column Headers with sort indicator (▼ downward arrow)...
⏸️ DEFERRED: Per epic priorities, "We should delay filtering and sorting applications 
until the very end and just show all applicants."
```

**Current (INCORRECT) Feature Identification Output:**
```markdown
❌ Status filter tabs (deferred per epic: "delay filtering and sorting until the very end")
❌ Column sorting controls (deferred per epic: "delay filtering and sorting until the very end")
```

**Expected (CORRECT) Feature Identification Output:**
```markdown
⏬ Status filter tabs (low priority per epic: "delay filtering and sorting until the very end")
⏬ Column sorting controls (low priority per epic: "delay filtering and sorting until the very end")
```

The features ARE part of the epic scope—they're just lower priority and should be implemented after core functionality.

## Goals

1. Add a fourth status category: **⏬ Low Priority** (in scope but implement later)
2. Update prompts to distinguish between out-of-scope and low priority features
3. Update parsing/processing to handle the low priority status
4. Maintain backwards compatibility with existing three-status system where possible
5. Establish foundation for future multi-level priority system (⏬ ⬇️ ↓)

## Current State

### Existing Status Categories

From `prompt-feature-identification-2.ts`:
- **☐ In-Scope**: New capabilities being added
- **✅ Already Done**: Existing functionality providing context
- **❌ Out-of-Scope**: Features deferred/excluded OR marked as future
- **❓ Questions**: Ambiguous behaviors, unclear requirements

### Related Systems

The screen analysis prompt (`prompt-screen-analysis.ts`) already uses:
- **⏸️ DEFERRED**: Features marked to "delay until end" (WILL be implemented later)
- **❌ Out-of-Scope**: Features marked as deferred/excluded (will NOT be implemented)
- **⚠️ SCOPE MISMATCH**: UI contradicts epic scope

This creates an inconsistency—screen analysis distinguishes low priority (deferred) vs out-of-scope, but feature identification conflates them.

### Future Priority Levels (Not Implemented Yet)

This spec introduces ⏬ for epic-specified low priority. In the future, we plan to add granular priority levels determined during analysis/prioritization:

- **⏬ Lowest Priority**: Epic-specified features to implement last (this spec)
- **⬇️ Low Priority**: Analysis-determined lower priority features (future)
- **↓ Medium-Low Priority**: Analysis-determined slightly lower priority (future)

The visual weight of the arrows indicates priority level, with heavier/double arrows meaning lower priority. This establishes a clear symbol family for future expansion.

## Implementation Plan

### Step 1: Update Feature Identification Categories

**Goal**: Add ⏬ Low Priority as a distinct status alongside existing categories

**Changes to `prompt-feature-identification-2.ts`**:

1. Update `CATEGORIZATION RULES` section in system prompt:
   - Add ⏬ Low Priority category
   - Clarify ❌ Out-of-Scope no longer includes low priority features
   - Provide clear keywords/patterns for each

2. Update `FEATURE DESCRIPTION VERBOSITY` section:
   - Add verbosity guidance for ⏬ Low Priority (brief, note when it will be implemented)

3. Update instruction steps that reference categorization

**Changes to `prompt-screen-analysis.ts`**:

1. Replace all instances of ⏸️ DEFERRED with ⏬ Low Priority:
   - Update the categorization list (currently shows ⏸️ DEFERRED)
   - Update all example text (e.g., "Example 5: ⏸️ DEFERRED: Pagination controls...")
   - Update the "Flag contradictions and deferrals" section
   - Update the "Analysis Guidelines" section at the end

2. Update language for consistency:
   - Change "DEFERRED: When features are marked to 'delay until end'" to "Low Priority: When features are marked to 'delay until end'"
   - Ensure parenthetical notes say "(low priority)" instead of "(deferred)"
   - Keep the clarification that these WILL be implemented later in the epic

**Verification**:
- System prompt clearly defines all five categories: ☐ ✅ ⏬ ❌ ❓
- Each category has clear examples showing when to use it
- Guidance distinguishes "low priority (implement later in epic)" vs "out of scope entirely"
- Screen analysis and feature identification use consistent ⏬ symbol
- No remaining instances of ⏸️ in either file

### Step 2: Define Clear Classification Rules

**Goal**: Create unambiguous rules for LLM to classify features correctly

**Decision logic to add**:

```
IF epic explicitly says "delay X until end/later" AND epic is focused on implementing X:
  → ⏬ Low Priority (in scope, lower priority)

IF epic says "X is out of scope" OR "X not included" OR "future epic":
  → ❌ Out of Scope (not part of this epic)

IF epic doesn't mention X at all AND X visible in screens:
  → ☐ In-Scope (assume it's part of the work if it's in the designs)

IF keyword is ambiguous (e.g., "later"):
  → Look at broader context:
    - If discussing implementation timeline within epic → ⏬ Low Priority
    - If discussing future epics or exclusions → ❌ Out of Scope
```

**Keyword indicators**:
- **⏬ Low Priority keywords**: "delay until end", "do at the end", "defer", "postpone", "save for later in epic", "implement last", "lower priority"
- **❌ Out of Scope keywords**: "out of scope", "not included", "future epic", "exclude", "won't implement", "not part of this"
- **Context matters**: Same word can indicate different categories depending on sentence structure

**Verification**:
- Rules handle the ambiguous "later" keyword correctly
- Rules prevent false positives (marking in-scope features as out-of-scope)
- Examples demonstrate each decision path

### Step 3: Update Output Format Documentation

**Goal**: Update the example output format to include ⏳ status

**Changes**:

1. Update `OUTPUT FORMAT` section in prompt:
```markdown
### {Feature Area Name}

[Screen Name](figma-url)

- ☐ {In-scope feature - work to be done}
- ⏬ {Low priority feature - in scope but implement at end}
- ✅ {Existing functionality - already implemented}
- ❌ {Out-of-scope feature - not part of this epic}
- ❓ {Question about this area}
```

2. Add example showing proper use:
```markdown
### Application Management

[applicants-complete](figma-url)

- ☐ Display applications table with columns: name, type, submitted, completed
- ☐ Show relative timestamps ("5 min ago") for recent submissions
- ⏬ Status filter tabs (low priority - delay until end per epic priorities)
- ⏬ Column sorting controls (low priority - delay until end per epic priorities)
- ✅ Header with logo, search, and contact info (already exists)
- ❓ Should pagination show 50 or 100 records per page?
```

**Verification**:
- Output format clearly shows all five categories
- Example demonstrates real-world usage with low priority features
- Example shows how to reference epic context in parenthetical notes

### Step 4: Update Epic Context Instructions

**Goal**: Ensure LLM properly interprets epic context for deferral vs exclusion

**Changes to epic context section**:

1. Update the "Use epic context as primary source of truth for:" list:
   - Split "Recognizing features deferred to future phases" into two bullets:
     - "Identifying low priority features within this epic (⏬)"
     - "Recognizing features excluded entirely or moved to future epics (❌)"

2. Update "Distinguishing between..." guidance:
   - Add clear examples of low priority language vs exclusion language
   - Show how to interpret ambiguous statements using context

3. Add new instruction:
```markdown
**CRITICAL: Low Priority ≠ Out of Scope**
- If epic says "delay X until end" → X is IN SCOPE, mark ⏬ (implement later this epic)
- If epic says "X out of scope" → X is NOT in scope, mark ❌ (won't implement this epic)
- When in doubt, check if epic discusses HOW to implement the feature (even if "later")
  - If yes → probably ⏬ Low Priority
  - If no → probably ❌ Out of Scope or ❓ Question
```

**Verification**:
- Instructions clearly separate low-priority-in-epic from excluded-from-epic
- Examples show how to interpret "delay", "defer", "later", "end", etc.
- Guidance handles edge cases (e.g., "delay to next sprint" within an epic)

### Step 5: Update Downstream Processing

**Goal**: Ensure systems that consume feature identification output handle ⏳ status

**Files to check/update**:

1. **Shell story generation** (`prompt-shell-stories.ts`):
   - Already mentions "deferred features have implementation stories"
   - Verify it handles ⏬ bullets from feature identification
   - May need to update parsing logic to recognize ⏬ alongside ❌

2. **Feature parsers/processors**:
   - Search codebase for pattern matching on ☐ ✅ ❌ ❓
   - Update to include ⏬ in categorization logic
   - Check if any code assumes only 4 categories

3. **Documentation/display**:
   - Update any user-facing docs that list feature statuses
   - Update tool descriptions if they mention categorization

**Verification**:
- Shell story generation correctly processes ⏬ features
- No errors when encountering ⏬ status in downstream systems
- Low priority features generate stories (just marked as later priority)

### Step 6: Test with Real Epic

**Goal**: Validate changes work correctly with the PLAY-38 epic

**Test steps**:

1. Run feature identification on PLAY-38 epic
2. Verify output shows:
   ```markdown
   ⏬ Status filter tabs (low priority - delay filtering until end per epic)
   ⏬ Column sorting controls (low priority - delay sorting until end per epic)
   ⏬ TruthFilter (low priority - delay until end per epic)
   ⏬ Location map (low priority - delay until end per epic)
   ```
3. Verify shell story generation creates stories for these features
4. Verify stories are marked as lower priority or later sequence

**Success criteria**:
- No features marked ❌ when epic says "delay until end"
- Low priority features properly grouped and explained
- Shell stories include low priority features in correct sequence
- No hallucination of low priority status for features not mentioned in epic

### Step 7: Add Test Cases

**Goal**: Prevent regression and document expected behavior

**Test cases to add**:

1. **Epic with "delay until end" language**
   - Input: Epic saying "delay filtering until end"
   - Expected: Feature marked ⏬ not ❌

2. **Epic with "out of scope" language**
   - Input: Epic saying "authentication is out of scope"
   - Expected: Feature marked ❌ not ⏬

3. **Ambiguous "later" keyword**
   - Input: Epic saying "implement later in this epic"
   - Expected: Feature marked ⏬ (context shows within-epic deferral)

4. **Ambiguous "later" keyword #2**
   - Input: Epic saying "save for later epic"
   - Expected: Feature marked ❌ (context shows cross-epic exclusion)

5. **Mixed priorities**
   - Input: Epic with some deferred, some excluded, some in-scope
   - Expected: Correct categorization of each based on epic language

**Verification**:
- All tests pass
- Edge cases covered
- Documentation updated with test examples

## Implementation Decisions

Based on answered questions, the following decisions have been made:

### Symbol Consistency
- **Use ⏬ everywhere**: Update screen analysis prompt to use ⏬ instead of ⏸️ for consistency across all prompts

### Story Numbering
- **Sequential numbering**: Low priority features should be numbered sequentially with other stories (st001-st020), not separated with different prefix

### Feature Grouping
- **Group by functionality first**: Low priority features appear inline within their functional areas in feature identification output
- **Rationale**: Related features should stay together regardless of priority. Other tools will handle prioritization and sequencing

### Conflict Resolution
- **Epic context always wins**: If a feature is marked differently in different screens, epic context is the source of truth

### Story Generation
- **Include in normal sequence**: write-next-story tool should include low priority stories in the normal sequence, not skip them

### Out of Scope (For Now)
- API documentation updates (will be needed later but not part of this spec)
- Additional status symbols (⚠️ 🔄 etc.) - not needed at this time
- Backward compatibility configuration - not needed, moving forward with 5 categories 