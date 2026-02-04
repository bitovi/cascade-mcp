# 052 - Screen Analyzer Prompt Alignment

## Background

Two files contain screen analysis prompt logic:
1. **Old:** `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts` - The original, feature-complete prompt
2. **New:** `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts` - The refactored version with some missing features

The new `screen-analyzer.ts` was created during a refactor but doesn't include all behavior from the old prompt. This spec documents what needs to be aligned.

## Parameter Mapping

| Old (`prompt-screen-analysis.ts`) | New (`screen-analyzer.ts`) | Status |
|-----------------------------------|----------------------------|--------|
| `screenName` | `frame.frameName \|\| frame.name` | ✅ Equivalent |
| `screenUrl` | `frame.url` | ✅ Equivalent |
| `screenPosition` | *Not present* | ❌ **Missing** |
| `notesContent` (markdown string) | `frame.annotations[]` (structured) | ✅ Converted differently |
| `epicContext` | `contextMarkdown` | ⚠️ Renamed, but prompt text still says "epic context" - change to "feature context" |
| `semanticXml` | `semanticXml` (generated in function) | ✅ Equivalent |

## Missing Features in `screen-analyzer.ts`

### 1. ❌ Screen Position / Order Display

**Old behavior:**
```typescript
- **Screen Order:** ${screenPosition}
```

**Current behavior:** Not present in new prompt.

**Fix:** Add `screenPosition` or `screenOrder` to `AnalyzedFrame` type and include in prompt header.

---

### 2. ⚠️ "Epic Context" Terminology in Prompt Text

The parameter is now called `contextMarkdown` (generic), but the **prompt text** still hardcodes "epic context" language:

**Current prompt text (problematic):**
```
- **Has Epic Context:** Yes
...
## Epic Context & Priorities
...
No epic context available for this analysis.
...
**How to use epic context:**
...
- Read epic context and design notes first
```

**Issue:** The context might not be from an epic - it could be from a Jira issue, user description, or any other source.

**Solution:** Use "Feature Context" throughout.

**Text to update in `buildAnalysisPrompt`:**
- `Has Epic Context` → `Has Feature Context`
- `## Epic Context & Priorities` → `## Feature Context & Priorities`
- `No epic context available` → `No feature context provided`
- `How to use epic context` → `How to use feature context`
- `in epic context` → `in the feature context`
- `epic priorities` → `feature priorities`
- `epic constraints` → `feature constraints`
- References to "epic" throughout the emoji category descriptions

---

### 3. ❌ "CRITICAL - Scope Limiting Notes" Section

**Old behavior:** This section doesn't exist in old prompt.

**New behavior:** Added this section:
```
**CRITICAL - Scope Limiting Notes:**
If any note specifies scope limitations...
```

**Status:** This is a NEW feature in `screen-analyzer.ts` that should be KEPT. ✅

---

### 3. ⚠️ Figma Node URL Display

**Old behavior:**
```
- **Figma Node URL:** ${screenUrl}
```

**New behavior:**
```
- **Figma Node URL:** ${frame.url}
```

**Status:** Equivalent, but old prompt has it on line 2, new has it on line 2 as well. ✅

---

### 4. ⚠️ Section Name Context

**Old behavior:** Not present.

**New behavior:**
```
${frame.sectionName ? `- **Section**: ${frame.sectionName}` : ''}
```

**Status:** This is a NEW feature in `screen-analyzer.ts` that should be KEPT. ✅

---

## Feature Comparison Matrix

| Feature | Old | New | Action |
|---------|-----|-----|--------|
| Screen Name header | ✅ | ✅ | None |
| Figma Node URL | ✅ | ✅ | None |
| Screen Order/Position | ✅ | ❌ | **Add to new** |
| Has Notes indicator | ✅ | ✅ | None |
| Has Epic Context indicator | ✅ | ✅ | None |
| Has Semantic Structure indicator | ✅ | ✅ | None |
| Section Name | ❌ | ✅ | Keep (enhancement) |
| Breakpoint note (IMPORTANT) | ✅ | ✅ | None |
| Design Notes section | ✅ | ✅ | None |
| Scope Limiting Notes section | ❌ | ✅ | Keep (enhancement) |
| Epic Context section | ✅ | ✅ | None |
| Epic emoji categories | ✅ | ✅ | None |
| Semantic XML section | ✅ | ✅ | None |
| Page Structure section | ✅ | ✅ | None |
| Layout Structure Analysis | ✅ | ✅ | None |
| Primary UI Elements | ✅ | ✅ | None |
| Data Display section | ✅ | ✅ | None |
| Interactive Behaviors | ✅ | ✅ | None |
| Content & Data section | ✅ | ✅ | None |
| Unique Features section | ✅ | ✅ | None |
| Technical Considerations | ✅ | ✅ | None |
| Analysis Guidelines | ✅ | ✅ | None (new has extra scope note) |

## Detailed Diff Analysis

### Summary: Will Output Match?

**Yes, after the proposed changes, output should be functionally equivalent.**

The prompts are nearly identical. The core sections that drive AI behavior are the same:
- Same emoji categorization system (☐, ⏬, ✅, ❌, ❓, ⚠️)
- Same 6 examples
- Same section headers (Page Structure, Layout Analysis, UI Elements, etc.)
- Same "How to use epic/feature context" guidance
- Same Analysis Guidelines structure

### Differences Summary

| Difference | Impact on Output | Action |
|------------|------------------|--------|
| Missing "Screen Order" line | Minor - AI loses position context | **Add** |
| "epic context" → "feature context" | None - just terminology | **Rename** |
| Added "Section" line | Enhancement - more context | Keep ✅ |
| Added "CRITICAL - Scope Limiting Notes" | Enhancement - better scope handling | Keep ✅ |
| Added scope guideline in Analysis Guidelines | Enhancement - reinforces scope | Keep ✅ |
| Notes formatting (structured vs string) | None - same content, different format | Already handled ✅ |

### Prompt Header Section

**Old:**
```
# Screen: ${screenName}

- **Figma Node URL:** ${screenUrl}
- **Screen Order:** ${screenPosition}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Epic Context:** ${hasEpicContext ? 'Yes' : 'No'}
- **Has Semantic Structure:** ${hasSemanticXml ? 'Yes' : 'No'}
```

**New:**
```
# Screen: ${screenName}

- **Figma Node URL:** ${frame.url}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Epic Context:** ${hasEpicContext ? 'Yes' : 'No'}
- **Has Semantic Structure:** ${hasSemanticXml ? 'Yes' : 'No'}
${frame.sectionName ? `- **Section**: ${frame.sectionName}` : ''}
```

**Differences:**
1. ❌ Missing `Screen Order` line
2. ✅ Added `Section` line (enhancement)

### Design Notes Section

**Old:**
```
## Design Notes & Annotations

${notesContent ? notesContent : 'No design notes available for this screen.'}
```

**New:**
```
## Design Notes & Annotations

${notesContent || 'No design notes available for this screen.'}

**CRITICAL - Scope Limiting Notes:**
If any note specifies scope limitations (e.g., "This is for X only", "Ignore Y", "Focus on Z"), treat these as AUTHORITATIVE constraints:
- Only document features within the specified scope as in-scope (☐)
- Features outside the specified scope should be marked as out-of-scope (❌) or already done (✅)
- The note's scope guidance OVERRIDES what is visible in the UI
```

**Differences:**
1. ✅ Same fallback behavior
2. ✅ New has additional "CRITICAL - Scope Limiting Notes" guidance (enhancement)

### Analysis Guidelines (End Section)

**Old:**
```
## Analysis Guidelines

- Read epic context and design notes first to understand priorities and scope
- **Analyze layout systematically based on the pattern you observe:**
  ...
```

**New:**
```
## Analysis Guidelines

- Read epic context and design notes first to understand priorities and scope
- **If notes specify scope limitations, ONLY document features within that scope as ☐ In-Scope**
- **Analyze layout systematically based on the pattern you observe:**
  ...
```

**Differences:**
1. ✅ New has additional scope limitation guidance (enhancement)

## Required Changes

### 1. Add Screen Position/Order Support

**File:** `screen-analyzer.ts`

**Finding:** `AnalyzedFrame` already has `order?: number` field in `types.ts`:
```typescript
/** Calculated order index (top-to-bottom, left-to-right) */
order?: number;
```

**Change needed:** Update `buildAnalysisPrompt` to use `frame.order` and format it with total count.

The old prompt received `screenPosition` as a pre-formatted string like "1 of 5". To replicate this:
- Option A: Pass `totalFrames` to `buildAnalysisPrompt` and format as `${frame.order} of ${totalFrames}`
- Option B: Add a `screenPosition?: string` field that callers pre-format
- Option C: Just show the order number without total (simpler, less context)

**Recommended:** Option A - pass total count and format in the function.

**Change location:** In `buildAnalysisPrompt`, add after Figma Node URL:
```typescript
${typeof frame.order === 'number' ? `- **Screen Order:** ${frame.order + 1}${totalFrames ? ` of ${totalFrames}` : ''}` : ''}
```

### 2. Verify All Prompt Sections Match

The prompts are now nearly identical. Both contain:
- ✅ All emoji categories (☐, ⏬, ✅, ❌, ❓, ⚠️)
- ✅ All examples (1-6)
- ✅ All section headers
- ✅ Semantic XML integration
- ✅ Layout analysis guidance
- ✅ Technical considerations

## Implementation Plan

1. **Update `buildAnalysisPrompt` signature** to accept optional `totalFrames` parameter
2. **Add screen order line to prompt header** using `frame.order` and `totalFrames`
3. **Replace "epic context" with "feature context"** throughout the prompt template
4. **Update `analyzeFrame` and `analyzeFrames`** to pass total count through
5. **Verify the old `prompt-screen-analysis.ts` can be deprecated** after alignment
6. **Update any callers** that were using the old prompt generator

## Files to Modify

- `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts` - Add screen order to prompt
  - Update `buildAnalysisPrompt` signature
  - Add screen order line to prompt template
  - Update `analyzeFrame` to pass totalFrames (optional)
  - Update `analyzeFrames` to pass `inputs.length` as totalFrames

## Files to Eventually Delete

- `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts` - Can be removed once alignment is complete and callers are updated

## Verification

After changes:
1. Compare generated prompts side-by-side
2. Ensure all fields are present in new prompt
3. Test with actual Figma analysis to confirm behavior matches

## Answer: Will Output Match Closely?

**Yes.** After implementing the two changes (add screen order, rename to "feature context"), the output should be functionally equivalent to what was produced before. 

The new prompt actually has **improvements**:
- Section context (parent Figma section name)
- Stronger scope-limiting guidance from notes
- Extra reminder in Analysis Guidelines about scope

These enhancements should make the AI output **better**, not different in a breaking way.
