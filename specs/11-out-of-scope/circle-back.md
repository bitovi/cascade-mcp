# Improving Shell Story "Circle Back" for Low-Priority Features

## Problem Statement

The shell story generation process creates ⏬ (low priority) bullets with forward references like "implement in st015", but then fails to create the actual implementation stories. This results in:

1. **Orphaned deferrals**: 10+ features marked as "implement in st015" but st015 is about TruthFinder
2. **Incomplete epic scope**: Low-priority features that ARE in scope don't get stories
3. **Validation failure**: Step 9 says "Verify all ⏬ Low Priority features have implementation stories at end of list" but this check isn't enforced

## Root Cause Analysis

### Current Process Flow Issues:

**Steps 1-8**: Initial story creation phase
- AI creates core stories (st001-st014)
- Adds ⏬ bullets pointing to future stories (e.g., "implement in st015")
- Continues until "all major flows" are covered

**Step 9**: Review for scope coverage (CURRENT)
```markdown
9. REVIEW FOR SCOPE COVERAGE
   • Verify all ⏬ Low Priority features have implementation stories at end of list
```

**Problem**: This is a passive "verify" instruction, not an active "create" instruction. The AI:
1. Checks if stories exist (they don't)
2. Doesn't know it needs to CREATE them
3. Moves on to steps 10-12 (formatting/validation)

### Why Current Instructions Fail:

1. **Step 6 happens too early**: "PROMOTE LOW PRIORITY ITEMS INTO STORIES" runs during initial creation, before all ⏬ bullets are written
2. **Step 9 is passive**: Says "verify" but doesn't say "if missing, create them now"
3. **No explicit collection phase**: Doesn't tell AI to gather all ⏬ bullets at the end
4. **No story count tracking**: AI doesn't realize it's creating forward references to non-existent stories

## Proposed Solutions

### Option 1: Add Explicit "Low-Priority Story Creation" Step (RECOMMENDED)

Insert between current Step 8 and Step 9:

```markdown
8. REPEAT
   • For the next highest-priority story, repeat steps 3–7 until all major flows and incremental user-value slices are represented as shell stories.

**9. CREATE STORIES FOR DEFERRED FEATURES**
   • Review ALL stories created so far (st001-stXXX)
   • Extract EVERY ⏬ bullet that references "implement in stYYY"
   • For each unique deferred feature:
     a. Create a new story at the end of the list
     b. Use the ⏬ bullet text as the story's main feature
     c. Add SCREENS from the original story
     d. Set DEPENDENCIES to the story that deferred it
     e. Add relevant ☐ bullets for implementation
   • Update all ⏬ bullets to reference the correct new story IDs
   • Example transformation:
     - Original st006 has: ⏬ Request history tracking (implement in st015)
     - Create: st017 Add Request History Tracking ⟩ Track and display history of information requests
     - Update st006 to: ⏬ Request history tracking (implement in st017)

10. REVIEW FOR SCOPE COVERAGE (updated from old step 9)
   • Verify all ☐ In-Scope features from scope analysis have stories
   • Verify all ⏬ Low Priority features now have corresponding implementation stories
   • Verify NO ⏬ bullets reference non-existent story IDs
   • Verify NO ❌ Out-of-Scope features have stories
   • Verify NO ✅ Already Done features have stories
   • Verify ❓ questions are included in relevant story bullets
   • Ensure stories follow incremental value delivery (core features first, enhancements later)
   • Verify story dependencies create a logical build order
   • Add missing stories if scope features are not covered

11. VERIFY STORY NUMBERING (updated from old step 10)
   • Confirm all stories are numbered sequentially (st001, st002, st003...)
   • Update any dependency references to match final story IDs
   • Update all ⏬ bullets to reference correct implementation story IDs

12. FINAL STRUCTURE VALIDATION (updated from old step 11)
   • Confirm file contains exactly one story list
   • Verify each story has all required sub-bullets (SCREENS, DEPENDENCIES, ☐, ⏬, ❌, ❓)
   • Ensure no incomplete or draft story entries remain

13. FINAL SCOPE VALIDATION (updated from old step 12)
   • Re-read scope analysis and verify all in-scope features are addressed
   • Confirm story bullets reference features from scope analysis
   • Verify ❓ questions are included where scope analysis had uncertainties
   • Ensure no stories implement ❌ Out-of-Scope features
```

**Why this works:**
- Makes deferral resolution explicit and mandatory
- Provides concrete algorithm for creating missing stories
- Happens AFTER all core stories are written
- Forces validation that no ⏬ bullets are orphaned

### Option 2: Strengthen Step 9 with Explicit Action Verbs

Replace current Step 9 with:

```markdown
9. COLLECT AND CREATE LOW-PRIORITY FEATURE STORIES
   • COLLECT: Search through all stories st001-stXXX and extract every ⏬ bullet
   • IDENTIFY: Group ⏬ bullets by the story ID they reference (e.g., all "implement in st015")
   • CHECK: For each referenced story ID, verify the story exists and implements that feature
   • CREATE: If story doesn't exist or doesn't implement the feature:
     - Add new story to the end of the list
     - Title based on the ⏬ bullet content
     - Copy SCREENS from the story that deferred it
     - Set DEPENDENCIES appropriately
   • UPDATE: Correct all ⏬ bullet references to point to the actual implementation story IDs
   • VERIFY: Confirm no ⏬ bullets reference non-existent stories
```

**Why this works:**
- Uses imperative verbs (COLLECT, IDENTIFY, CHECK, CREATE)
- Breaks down into explicit sub-steps
- Includes validation at the end

### Option 3: Two-Pass Story Generation

Restructure the entire process into two passes:

```markdown
## PROCESS - PASS 1: CORE STORIES (follow in order)

1-8. [Keep existing steps]

## PROCESS - PASS 2: LOW-PRIORITY STORIES (follow in order)

1. **EXTRACT DEFERRED FEATURES**
   • Read through all Pass 1 stories
   • Create a list of all ⏬ bullets
   • Note which story deferred each feature

2. **CREATE IMPLEMENTATION STORIES**
   • For each deferred feature, create a new story
   • Number sequentially after Pass 1 stories
   • Include implementation details for the deferred feature

3. **UPDATE FORWARD REFERENCES**
   • Go back to Pass 1 stories
   • Update all ⏬ bullet references to correct story IDs

4. **VALIDATE COMPLETENESS**
   • Verify every ⏬ bullet has a corresponding story
   • Verify no forward references to non-existent stories
```

**Why this works:**
- Clear mental model: two distinct phases
- Can't skip Pass 2 (it's a separate section)
- Forces re-reading of all stories

### Option 4: Add "⏬ Tracking Table" Requirement

Add to Step 5 (when creating ⏬ bullets):

```markdown
5. REFINE THE FIRST STORY
   • Add sub-bullets under the first story:
     - SCREENS: (Figma links from scope analysis)
     - DEPENDENCIES: Other story IDs this story depends on (or `none`)
     - ☐ Features from scope analysis to include now (core functionality)
     - ⏬ Features from scope analysis to defer to later stories (enhancements, lower priority)
       **IMPORTANT**: Do NOT use forward references like "(implement in st015)" yet
       Use temporary placeholder: "(implement later)"
     - ❌ Features explicitly out of scope
     - ❓ Questions from scope analysis or new questions about implementation
```

Then add before Step 9:

```markdown
8.5. RESOLVE ALL "implement later" PLACEHOLDERS
   • Search for every instance of "(implement later)"
   • For each one:
     a. Create a new story that implements that feature
     b. Replace "(implement later)" with "(implement in stXXX)" using the new story ID
   • Continue until no "(implement later)" placeholders remain
```

**Why this works:**
- Forces AI to defer resolution until all core stories are done
- Placeholder makes it obvious something is unfinished
- Can't complete the process with unresolved placeholders

## Recommended Implementation

**Use Option 1** (Add Explicit "Low-Priority Story Creation" Step) because:

1. ✅ Most explicit and prescriptive
2. ✅ Provides step-by-step algorithm
3. ✅ Minimal change to existing structure (just insert one step)
4. ✅ Includes example transformation
5. ✅ Can be validated programmatically (check for ⏬ references to non-existent stories)

## Additional Safeguards

### Add to Quality Rules:

```markdown
• CRITICAL: Every ⏬ bullet with "implement in stXXX" MUST have a corresponding stXXX story
• When creating ⏬ bullets, initially use "(implement later)" placeholder
• Only assign story IDs to ⏬ bullets after creating all implementation stories
• Final output must have ZERO ⏬ bullets referencing non-existent stories
```

### Add Final Validation Check (Step 13):

```markdown
13. FINAL ⏬ BULLET VALIDATION
   • Search entire document for pattern: "(implement in st\d+)"
   • Extract all referenced story IDs
   • Verify each referenced story exists
   • If any ⏬ bullet references non-existent story, STOP and create that story
   • Repeat until validation passes
```

## Testing the Fix

After implementing the recommended changes, test with:

1. **Simple epic**: 5-6 features, 2-3 deferrals → Should create 7-9 stories
2. **Complex epic**: 15+ features, 10+ deferrals → Should create 25+ stories  
3. **Edge case**: Epic with all features deferred → Should still create implementation stories

Success criteria:
- ✅ Every ⏬ bullet references an existing story
- ✅ Referenced stories actually implement the deferred feature
- ✅ No orphaned deferrals
- ✅ Story IDs are sequential with no gaps
