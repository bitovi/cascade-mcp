See specs/7-deferred-handling.md for the recent changes that caused this problem.

We just finished updating server/providers/combined/tools/identify-features/strategies/prompt-feature-identification-2.ts

## Solution - Fix Unnecessary Questions About Low Priority Features

**Problem**: The AI is generating questions like "Should tabs be removed in initial implementation?" when features are marked ⏬ Low Priority.

**Root Cause**: The prompt's ❓ Questions guidance says "Behavior unclear, requirements ambiguous" but doesn't clarify that low priority features have CLEAR requirements - they're just implemented later.

**Minimal Fix**: Add explicit guidance under ⏬ Low Priority that these features are well-defined, just deferred timing-wise.

## Problem

Each "low priority" item is pulled into its own Feature Grouping.

In the example below, groups were created for the low priority items:

__Status Tab Filtering__
__Column Sorting__
__Pagination Controls__

These shouldn't be put in their own groups. They are part of the applications list display. Also, we don't need questions on the initial implementation behavior at this point.


### Example

You can see the analysis files in cache/default/PLAY-38 that lead to the following feature identification:


__Applications List Display__

applicants-new applicants-in-progress applicants-pending applicants-complete applicants-incomplete

☐ Applications data table with columns: Applicant name, Type, Submitted/activity timestamps, Scrubber, Affiliate, Status, Notes

☐ Clickable applicant names linking to application detail view

☐ Row-level navigation with arrow icons

☐ Display of multiple application types (Individual, Business, Joint, Trust, Foundation)

☐ Mixed timestamp formats (relative time for recent, absolute dates for older)

☐ Empty state handling for optional fields (Affiliate, Sales rep, Status)

☐ Multi-line notes field with text expansion

☐ Flexible table width that expands to full width when needed

☐ Distinct column sets for different status views (e.g., "Sent to client" and "Client time" columns in Pending view)

☐ Processing time calculation and display (in Complete view)

✅ Header with logo, search, contact info, navigation menu

✅ Footer with copyright and legal links

❓ How many applications load initially - is there a default page size?

❓ What is the complete list of possible Status and Type values?

❓ How should empty cells be visually distinguished from cells with data?

❓ Are notes character-limited and how is truncation handled?

❓ Do entire rows navigate to detail view or only arrow icons?

__Status Tab Filtering__

applicants-new applicants-in-progress applicants-pending applicants-complete applicants-incomplete

⏬ Five status filter tabs (New, In progress, Pending client, Complete, Incomplete) with active/inactive visual states (low priority - delay filtering until end per epic)

❓ Should tabs be removed, disabled, or show all statuses simultaneously in initial implementation given epic states to "delay filtering and sorting until the very end and just show all applicants"?

__Column Sorting__

applicants-new applicants-in-progress applicants-pending applicants-complete applicants-incomplete

⏬ Column header sort indicators and functionality (low priority - delay sorting until end per epic)

❓ Should sort indicators be removed from column headers in initial implementation given epic guidance to delay sorting?

__Pagination Controls__

applicants-complete

⏬ Pagination with Previous/Next buttons and page number controls (low priority - only shows if needed, use large page size per design note)

❓ What is the threshold for showing pagination - based on record count or performance?

❓ What is the optimal page size that doesn't degrade performance?

## Implementation Plan

### Step 1: Clarify low priority features don't need implementation questions

**Problem**: AI interprets "low priority" as "unclear how to implement" and generates questions like:
- "Should tabs be removed in initial implementation?"
- "Should sort indicators be removed from column headers?"

**Root cause**: Step 4 says ⏬ features "WILL be implemented in this epic, just later" but doesn't explicitly say they're well-defined.

**Change in prompt-feature-identification-2.ts Step 4**:

Under ⏬ Low Priority section, add:
```
- Do NOT ask questions about whether to remove/hide/disable low priority features
- Do NOT ask questions about incremental implementation strategies
- Only ask questions if the feature itself is unclear (same as ☐ features)
```

**Verification**: Read updated guidance, confirm it prevents implementation timing/phasing questions while allowing legitimate feature clarity questions

### Step 2: Update ❓ Questions guidance to exclude timing questions

**Change in prompt-feature-identification-2.ts Step 4**:

Under ❓ Questions section, change from:
```
- ❓ Questions: Behavior unclear, requirements ambiguous
  - Mark ambiguous features as questions rather than guessing
  - Include enough context: "Should filters persist across sessions?"
```

To:
```
- ❓ Questions: Feature behavior unclear, requirements ambiguous, missing specifications
  - Mark ambiguous features as questions rather than guessing
  - Include enough context: "Should filters persist across sessions?"
  - Do NOT ask about implementation timing or phasing (that's determined by ☐ vs ⏬)
  - Do NOT ask whether low priority features should be removed/hidden
```

**Verification**: Questions section explicitly excludes timing/phasing questions

### Step 3: Test with PLAY-38 cache files

**Steps**:
- Run feature identification on PLAY-38 cached analyses
- Check "Status Tab Filtering", "Column Sorting", "Pagination" sections
- Verify NO questions about:
  - "Should tabs be removed/disabled in initial implementation"
  - "Should sort indicators be removed"
  - Implementation phasing or timing

**Expected result**: Only legitimate questions about unclear requirements remain (e.g., "What is optimal page size?")

**Verification**: All low priority features listed with ⏬ but no questions about whether to implement them

## Questions

1. Should we also add this guidance to prompt-screen-analysis.ts where features are first categorized? Or is fixing it in prompt-feature-identification-2.ts sufficient?