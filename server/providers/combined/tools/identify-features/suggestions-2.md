# Suggestions for Improving Feature Area Granularity

## Problem
The prompt encourages grouping features too broadly, leading to combined areas like "Search and Filtering" when these should be separate feature areas. The current guidance doesn't emphasize **independent implementability** as the key criterion for splitting.

## Core Principle
**Features that can be implemented independently should be separate feature areas.**

Examples:
- ✅ Separate: "Text Search" and "Filter Panel" - different UI controls, different implementation, different behaviors
- ✅ Separate: "Login Form" and "Password Reset" - independent user flows
- ❌ Combined: "Form Validation" and "Error Messages" - cannot implement separately, tightly coupled

## Changes Needed

### 1. System Prompt - GROUPING RULES (line ~34)
**Current:**
```typescript
- Group features by user workflow and functional areas (e.g., "Authentication Flow", "User Profile Management", "Data Entry Workflow")
```

**Suggested:**
```typescript
- Group features by distinct capabilities that can be implemented independently
- Prefer focused, granular areas over broad categories
- Examples of proper granularity:
  - ✅ Separate: "Text Search Input" and "Status/Priority Filters" (different controls, independent implementation)
  - ✅ Separate: "Email Login" and "Password Reset" (separate user flows)
  - ❌ Too broad: "Search and Filtering" (combines two independent capabilities)
  - ❌ Too broad: "User Authentication" (combines login, registration, password reset)
```

**Rationale:** The current examples are too broad ("Authentication Flow", "User Profile Management") which encourages over-grouping. The new examples explicitly show search/filter as separate and explain WHY they should be split.

---

### 2. System Prompt - FEATURE DESCRIPTION VERBOSITY (line ~40-42)
**Current:**
```typescript
- ☐ In-Scope: Concise for obvious features (e.g., "Email/password login"), detailed for complex features (e.g., "Multi-step form with validation, error handling, and progress indicators")
- ✅ Already Done: Keep brief since they're not part of new work (e.g., "Checkbox interaction to toggle task status")
- ❌ Out-of-Scope: Keep brief since they won't be implemented (e.g., "OAuth authentication (deferred)")
```

**Suggested:**
```typescript
- ☐ In-Scope: Concise for obvious features (e.g., "Email/password login"), detailed for complex features (e.g., "Multi-step wizard with validation, error handling, and progress indicators")
- ✅ Already Done: Keep brief since they're not part of new work (e.g., "User profile avatar display")
- ❌ Out-of-Scope: Keep brief since they won't be implemented (e.g., "Social media login (deferred)")
```

---

### 2. Main Prompt - Step 3 Instructions (line ~158-164)
**Current:**
```typescript
**Step 3: Identify feature areas by workflow**
- Group related functionality by user workflow (e.g., "Authentication Flow", "Dashboard Interaction", "Settings Management")
- Focus on functional areas that represent how users accomplish tasks
- Aim for 3-8 feature areas (not too granular, not too broad)
- Each area should represent a cohesive set of related features from the user's perspective
```

**Suggested:**
```typescript
**Step 3: Identify feature areas by independent capabilities**
- Group features by distinct capabilities that can be implemented independently
- Split features if they have:
  - Different UI controls or entry points (search input vs filter dropdown)
  - Different technical implementations (client-side text filtering vs server query parameters)
  - Different behaviors or user interactions (typing to search vs selecting filter checkboxes)
  - Could be assigned to different developers or completed in different sprints
- Examples of proper granularity:
  - ✅ "Text Search" (separate from) "Filter Panel" - independent controls and implementations
  - ✅ "Login Form" (separate from) "Password Reset Flow" - different user journeys
  - ❌ "Search and Filtering" - too broad, these are independent capabilities
  - ❌ "User Management" - too broad, split into specific capabilities
- Aim for 6-15 feature areas depending on project complexity
- Each area should be focused enough to complete in a single development iteration
```

**Rationale:** This is the most critical change. It explicitly instructs the AI to split based on independent implementability and provides clear criteria with search/filter as the canonical example.

---

### 3. Add New Step: Validate Granularity (after current Step 6)
**Add this as Step 7:**
```typescript
**Step 7: Validate feature area granularity**
Before finalizing, review each feature area:
- Does this area combine multiple independent capabilities? If yes, split them
- Could features in this area be implemented by different developers simultaneously? If yes, consider splitting
- Look for "and" in area names (e.g., "Search and Filtering") - this usually indicates over-grouping
- If an area has >8 features, consider whether it should be split into more focused areas
- Each area should have a single, clear purpose describable in one sentence

Common patterns requiring splits:
- "Search and Filter" → "Text Search" + "Filter Controls"
- "Create and Edit" → "Create Form" + "Edit Form"  
- "User Authentication" → "Login" + "Registration" + "Password Reset"
```

**Rationale:** Adds a validation step to catch over-grouping before output. Uses search/filter as the primary example of what NOT to do.
---

### 4. Update Step 4 Examples (line ~169-179)
**Current:**
```typescript
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step form with validation, error handling, and progress indicators"
- ✅ Already Done: Epic mentions this as existing functionality (e.g., under "Out of Scope: We already have X")
  - Keep brief: "Checkbox interaction to toggle task status"
```

**Suggested:**
```typescript
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step wizard with validation, error recovery, and progress tracking"
- ✅ Already Done: Epic mentions this as existing functionality (e.g., under "Out of Scope: We already have X")
  - Keep brief: "User avatar upload capability"
```

**Rationale:** Removes task-specific examples to keep prompt domain-agnostic.

---

## Rationale

The key insight is that **search and filtering are almost always independently implementable** - they have different UI controls, different implementations, and different behaviors. By emphasizing independent implementability as the primary grouping criterion and using search/filter as the canonical example of what to split, we guide the AI to create more granular, actionable feature areas.

## Impact

**High Priority Changes:**
1. **Change #2 (Step 3 rewrite)** - Most impactful. This is where the AI actively decides how to group features. The new instructions explicitly teach the splitting criteria.
2. **Change #3 (Add Step 7)** - Catches over-grouping before output with validation rules.
3. **Change #1 (System prompt examples)** - Sets the right mental model from the start.

**Lower Priority:**
4. **Change #4** - Just removes domain-specific bias, doesn't affect splitting logic.

## Expected Outcome

With these changes, the AI should produce:
```markdown
### Text Search Capability
- ☐ Search input field with search icon
- ☐ Real-time filtering as user types
- ☐ Clear button to reset search
- ❓ Does search cover title only or also description/assignee?

### Filter Controls
- ☐ Filter dropdown with status checkboxes (Todo, In Progress, Review, Done)
- ☐ Filter dropdown with priority checkboxes (High, Medium, Low)
- ☐ Multi-select capability for both filter types
- ☐ Visual feedback for selected filters
- ❓ Should filters persist across sessions?
```

Instead of combining them into "Search and Filtering".
