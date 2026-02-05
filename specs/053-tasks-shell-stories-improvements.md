# Shell Stories Hallucination and Ordering Issues

## Problem Statement

The `write-shell-stories` tool is generating stories for features that were **explicitly excluded** by stakeholder feedback, and the story ordering doesn't follow a logical development sequence.

### Source Data

The source context for this analysis is from Figma file `7QW0kJ07DcM36mgQUJ5Dtj` cached at:
- `cache/figma-files/7QW0kJ07DcM36mgQUJ5Dtj/`

The raw output of write-shell-stories is documented in `specs/053-source-data.md`.

---

## Issue 1: Hallucinated Features

### Observed Problem

The tool generated stories for features that stakeholders explicitly said "None for now" or "No" to:

| Story | Feature | Stakeholder Response |
|-------|---------|---------------------|
| st008 | Advanced Form Validation | "The 'Create Task' button should not be enabled until the user has filled out a Task Title and a Task Description. All other fields are optional." (No validation messages requested) |
| st009 | Task Filtering and Sorting | "Should there be task filtering or sorting capabilities available? → **None for now**" |
| st010 | Task Search Capabilities | "Are there search capabilities for finding specific tasks in the list? → **None for now**" |
| st011 | Task List Pagination | "How should large task lists be handled? → **Show all tasks for now**" |
| st013 | Task Creation from Case Details | Never mentioned in any stakeholder response |
| st014 | Advanced Navigation Patterns | Never mentioned in any stakeholder response |

### Root Cause Analysis

The issue occurs at two levels:

#### 1. Scope Analysis Phase

The scope analysis correctly captures the Q&A conversations using 💬 markers:

```
💬 Should there be task filtering or sorting capabilities available? → None for now
💬 Are there search capabilities for finding specific tasks in the list? → None for now  
💬 How should large task lists be handled? → Show all tasks for now
```

The screen analysis files **correctly** mark these as ❌ out-of-scope:
```
❌ **Task Filtering/Sorting** - Design notes specify "None for now"
❌ **Task Search** - Design notes specify "None for now"
```

**But** the scope analysis prompt does not instruct the AI to treat "None for now" or "No" answers as **explicit exclusions** (❌). Instead, they're treated as answered questions that could still become ⏬ low-priority features.

#### 2. Shell Story Generation Phase

The shell story prompt has this instruction in Step 6:

> **PROMOTE LOW PRIORITY ITEMS INTO STORIES**
> - Turn meaningful ⏬ items into new top-level stories
> - Add them to the prioritized list

And Step 9:

> **CREATE STORIES FOR DEFERRED FEATURES (MANDATORY)**
> - CRITICAL: This step ensures no ⏬ deferrals are orphaned
> - For any feature that was deferred with ⏬ bullets:
>   - Verify there's a corresponding implementation story later in the list

This creates a problematic chain:
1. Scope analysis sees "None for now" as an answered question, not an exclusion
2. Shell story generation treats it as a potential future feature (⏬)
3. The mandatory "deferred feature story" step creates stories for these ⏬ items
4. Result: Stories for explicitly excluded features

### Proposed Solution

#### Option A: Stronger Scope Analysis Categorization

Update `prompt-scope-analysis.ts` to explicitly handle negative stakeholder responses.

**Key Insight**: "None for now" / "Not for now" means **out of scope**, not **deferred priority**. These are explicit decisions to NOT build a feature in this epic.

The output should include BOTH:
1. 💬 The answered question (preserves stakeholder context)
2. ❌ An explicit out-of-scope marker (prevents story creation)

```typescript
// Add to FEATURE_IDENTIFICATION_SYSTEM_PROMPT

NEGATIVE RESPONSE HANDLING:
- When Q&A responses decline a feature ("None for now", "Not for now", "No", "Not needed", etc.)
  → Include BOTH the answered question AND an explicit ❌ exclusion
- "None for now" / "Not for now" = OUT OF SCOPE (not deferred/low priority)
- These are stakeholder decisions to NOT build the feature in this epic

OUTPUT FORMAT for declined features:
💬 Should there be task filtering? → None for now
❌ Task filtering (declined by stakeholder)

💬 How should large lists be handled? → Show all tasks for now
❌ Pagination (declined by stakeholder - show all tasks)

CRITICAL DISTINCTION:
- "None for now" / "Not for now" → ❌ Out of Scope (do NOT build)
- "Later" / "Phase 2" / "Nice to have" → ⏬ Low Priority (build at end of epic)
- Unanswered questions → ❓ Questions (needs clarification)
```

#### Option B: Shell Story Prompt Guard Rails

Update `prompt-shell-stories.ts` to add explicit guards:

```typescript
// Add to QUALITY RULES section

EXCLUSION DETECTION:
- If scope analysis contains "→ None for now", "→ Not for now", "→ No", "→ Not needed" after a question
  → That feature is OUT OF SCOPE, not deferred
  → Do NOT create ⏬ bullets or future stories for it
  → Do NOT promote it to a story in Step 6 or Step 9
- "None for now" / "Not for now" = "Do not build this" (NOT "build it later")
- Only ⏬ Low Priority items become future stories, never ❌ Out of Scope items
```

#### Recommendation: Both Options

Implement both changes to create defense in depth:
1. Scope analysis should output BOTH 💬 (context) AND ❌ (exclusion) for declined features
2. Shell story generation should have guard rails against promoting excluded features

---

## Issue 2: Story Ordering

### Observed Problem

The generated stories have poor ordering for incremental development:

**Current Order:**
1. st001 - Task Creation Basic Form
2. st002 - Task List Display
3. st003 - Task Details Viewing
4. st004 - Task Details Inline Editing
5. st005 - Task Deletion
6. st006 - Case-Task Relationship Display
7. st007 - Tasks Navigation Integration ← Should be FIRST

**Problems:**
- Navigation (st007) comes after the features it enables
- Creating a task (st001) before you can see the list (st002) or navigate to tasks (st007)
- Users can't test the happy path: Navigate → See List → Create Task → See in List

### Expected Order

A logical development sequence would be:

1. **Navigation Integration** - Add tasks section to navigation (enables everything else)
2. **Task List Display** - Show empty list with "Create New Task" button
3. **Task Creation Form** - Create a task from the list view
4. **Task Details Viewing** - Click a task to see its details
5. **Task Details Editing** - Edit task fields inline
6. **Task Deletion** - Delete tasks from detail view
7. **Case-Task Relationship** - Show related tasks on case details

### Root Cause Analysis

The prompt instructs to prioritize by:
1. Customer/User Value (highest first)
2. Dependencies
3. Blockers
4. Risk

But it doesn't explicitly call out:
- **Scaffolding first**: Navigation, routing, and structural elements enable all other features
- **Progressive disclosure**: List → Create → View → Edit → Delete follows natural user flow
- **Empty state handling**: A list should exist before items can be added to it

### Proposed Solution

Update `prompt-shell-stories.ts` Step 3 (PRIORITIZE):

```typescript
3. **PRIORITIZE**
   • Reorder stories by:
     - **Scaffolding & Navigation**: Routes, navigation items, and structural elements come FIRST
       (users must be able to reach features before using them)
     - **User Flow Sequence**: Follow the natural user journey:
       1. Navigate to feature area
       2. See list/dashboard (even if empty)
       3. Create new items
       4. View item details
       5. Edit items
       6. Delete items
       7. Cross-feature relationships
     - Customer/User Value (highest first within each flow stage)
     - Dependencies (sequence stories so that later ones build on earlier ones)
     - Blockers (unblock future stories early)
     - Risk (tackle high-risk elements earlier)
   • ⏬ Low Priority features should appear in later stories
   • Prefer implementing basic versions of many features before polishing any one feature area
```

Add to QUALITY RULES:

```typescript
• **NAVIGATION FIRST**: Any story adding navigation items must come before stories for the features being navigated to
• **LIST BEFORE CREATE**: List views should be created before create forms, so the create button has a home
• **VIEW BEFORE EDIT**: Detail viewing should come before inline editing
```

---

## Implementation Plan

### Phase 1: Fix Exclusion Detection

1. Update `prompt-scope-analysis.ts`:
   - Add NEGATIVE RESPONSE HANDLING section to system prompt
   - Add examples of "None for now" → ❌ categorization

2. Update `prompt-shell-stories.ts`:
   - Add EXCLUSION DETECTION to QUALITY RULES
   - Add guard in Step 9 to skip explicitly excluded features

### Phase 2: Fix Story Ordering

1. Update `prompt-shell-stories.ts`:
   - Enhance Step 3 (PRIORITIZE) with scaffolding-first guidance
   - Add NAVIGATION FIRST, LIST BEFORE CREATE rules to QUALITY RULES
   - Update STRONG SPLITTING EXAMPLES with ordering context

### Testing

Run write-shell-stories on `7QW0kJ07DcM36mgQUJ5Dtj` and verify:

1. **No hallucinated stories** for:
   - Task filtering/sorting
   - Task search
   - Pagination
   - Advanced form validation (beyond button disable)
   - Task creation from case details
   - Advanced navigation patterns

2. **Correct story order**:
   - Navigation comes first
   - List comes before create
   - Create comes before view/edit

---

## Appendix: Evidence from Source Data

### Stakeholder Responses (from comments.md)

```markdown
### Thread 5: 💬 OPEN
**@Justin Meyer**: Cascade:robot_face:: What validation messages should appear for required fields when they are left empty?
**@Justin Meyer**: The "Create Task" button should not be enabled until the user has filled out a Task Title and a Task Description. All other fields are optional.

### Thread 7: 💬 OPEN
**@Justin Meyer**: Cascade:robot_face:: Should there be task filtering or sorting capabilities available?
**@Justin Meyer**: None for now.

### Thread 8: 💬 OPEN
**@Justin Meyer**: Cascade:robot_face:: Are there search capabilities for finding specific tasks in the list?
**@Justin Meyer**: None for now.

### Thread 9: 💬 OPEN
**@Justin Meyer**: Cascade:robot_face:: How should large task lists be handled - pagination, infinite scroll, or show all tasks?
**@Justin Meyer**: Show all tasks for now.
```

### Screen Analysis Correctly Identified Exclusions

From `task-list-mobile_3502-6413.analysis.md`:
```markdown
❌ **Task Status Indicators** - Design notes confirm no status indicators beyond titles
❌ **Task Filtering/Sorting** - Design notes specify "None for now"
❌ **Task Search** - Design notes specify "None for now"  
❌ **Pagination/Infinite Scroll** - Design notes specify "Show all tasks for now"
```

### But Scope Analysis Lost the Exclusions

From the scope analysis output in `053-source-data.md`:
```markdown
💬 Should there be task filtering or sorting capabilities available? → None for now
💬 Are there search capabilities for finding specific tasks in the list? → None for now
💬 How should large task lists be handled - pagination, infinite scroll, or show all tasks? → Show all tasks for now
```

These are marked as 💬 answered questions only, without ❌ exclusion markers.

**Expected output should be:**
```markdown
💬 Should there be task filtering or sorting capabilities available? → None for now
❌ Task filtering/sorting (declined by stakeholder)

💬 Are there search capabilities for finding specific tasks in the list? → None for now
❌ Task search (declined by stakeholder)

💬 How should large task lists be handled - pagination, infinite scroll, or show all tasks? → Show all tasks for now
❌ Pagination (declined by stakeholder - show all tasks)
```

### And Shell Stories Created Features Anyway

```markdown
st009 Task Filtering and Sorting ⟩ Add filtering and sorting capabilities to task list
st010 Task Search Capabilities ⟩ Enable search functionality for finding specific tasks
st011 Task List Pagination ⟩ Add pagination support for handling large task lists
```
