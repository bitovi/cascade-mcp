# Improved Progress Notifications - Implementation Plan

## Problem Statement

Current progress notifications in `write-shell-stories` are:
- **Redundant**: Multiple messages for single operations (e.g., "Fetching epic", "Extracting content")
- **Sync/Async confusion**: Pre/post messages for synchronous operations (e.g., "Extracting Confluence links" → happens instantly)
- **Missing key info**: No mention of Figma comments, cache behavior unclear
- **Unclear caching**: "Analyzed 0 screens" without context is confusing

### Current Progress Flow (Verbose)

```
📝 Preparation: Fetching epic and Figma metadata...
Fetching epic from Jira...
Extracting epic content...
✅ Preparation Complete: 3 screens ready
Extracting Confluence links from epic...
Extracting Google Docs links from epic...
Processing 1 Google Docs...
📝 AI Screen Analysis: Starting analysis of 3 screens...
✅ AI Screen Analysis: Analyzed 0 screens
🔍 Checking for scope analysis...
📝 Generating scope analysis...
📝 Feature Identification: Analyzing features and scope...
✅ Feature Identification Complete: 3 areas, 7 questions
📝 Jira Update: Adding scope analysis section...
✅ Epic updated with scope analysis
⚠️ Found 7 unanswered questions (threshold: 5)...
⚠️ Clarification Needed: 7 unanswered questions...
```

### Target Progress Flow (Concise & Informative)

```
1. Fetching Jira epic and extracting linked resources...
2. Found 1 Figma link(s), 2 Confluence link(s), 1 Google Doc(s) [and existing scope analysis]
3. Figma: 3 screens, 4 notes, 6 comments. Analyzing screens...
4. Screen analysis complete: 3 cached, 0 new (cache up-to-date)
5. Generating scope analysis from 3 screens, 2 Confluence pages, 1 Google Doc...
6. Scope analysis complete: 7 questions (threshold: 5). Please answer ❓ questions and re-run.
```

## Goals

1. **Eliminate redundancy**: Single message per logical operation
2. **Remove sync pre/post**: Only notify for async operations
3. **Add missing context**: Figma comments, cache status, available services
4. **Clarify caching**: Explain "0 new" vs "3 cached" explicitly

## Architecture: Link Metadata Extraction Pattern

### Problem
Currently, link extraction happens **progressively** during separate phases:
- Figma URLs extracted in `setupFigmaScreens()`
- Confluence URLs extracted in `setupConfluenceContext()`
- Google Docs URLs extracted in `setupGoogleDocsContext()`

We want to report ALL link counts immediately after fetching the Jira issue, but keep the loading logic separated.

### Solution: Two-Phase Pattern

```typescript
// Phase 1: Extract metadata (fast, synchronous)
const jiraIssue = await fetchJiraIssue(epicKey);
const linkMetadata = extractAllLinkMetadata(jiraIssue);

await notify(
  `Found ${linkMetadata.figma.length} Figma link(s), ` +
  `${linkMetadata.confluence.length} Confluence link(s), ` +
  `${linkMetadata.googleDocs.length} Google Doc(s)` +
  `${linkMetadata.hasScopeAnalysis ? ' and existing scope analysis' : ''}`
);

// Phase 2: Load external data (slow, async, happens later)
const figmaData = await loadFigmaData(linkMetadata.figma);
const confluenceData = await loadConfluenceData(linkMetadata.confluence);
```

**Key principle:** **Extraction ≠ Loading**
- Extraction = parsing URLs from Jira description (instant)
- Loading = fetching external data from APIs (slow)

## Implementation Steps

### Step 1: Create Link Metadata Extractor Module

**File:** `server/providers/combined/tools/writing-shell-stories/link-metadata-extractor.ts`

Create a centralized module that extracts ALL link metadata from a Jira issue in one pass.

**Interface:**
```typescript
interface LinkMetadata {
  figma: Array<{ url: string; fileKey: string; nodeId: string }>;
  confluence: Array<{ url: string; pageId: string }>;
  googleDocs: Array<{ url: string; docId: string }>;
  hasScopeAnalysis: boolean;
  epicWithoutShellStories: { markdown: string; adf: ADFDocument };
}

export function extractAllLinkMetadata(
  epicDescriptionAdf: ADFDocument
): LinkMetadata;
```

**Implementation details:**
- Delegate to existing extractors:
  - `extractFigmaUrlsFromADF()` (already exists in `adf-utils.ts`)
  - `extractConfluenceUrlsFromADF()` (already exists in `confluence-helpers.ts`)
  - `extractGoogleDocsUrlsFromADF()` (already exists in `google-docs-helpers.ts`)
- Check for "Scope Analysis" section using existing helper
- Return structured metadata with counts available immediately

**Verification:**
- Unit test with sample ADF containing mixed links
- Verify counts match existing extraction logic
- Test with no links, single link, multiple links

### Step 2: Update `core-logic.ts` to Use Link Metadata Extractor

**File:** `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

Refactor Phase 1-3 to extract link metadata early and report comprehensive counts.

**Changes:**
1. After fetching Jira issue, call `extractAllLinkMetadata()`
2. Send single notification with ALL counts
3. Pass extracted metadata to `setupFigmaScreens()`, `setupConfluenceContext()`, `setupGoogleDocsContext()`
4. Update those functions to accept pre-extracted metadata (avoids re-extraction)

**New progress flow in core-logic:**
```typescript
// Fetch epic
await notify('Fetching Jira epic and extracting linked resources...');
const epicIssue = await fetchJiraIssue(...);
const linkMetadata = extractAllLinkMetadata(epicIssue.fields.description);

// Report findings
const availableServices = [
  'Figma',
  'Atlassian',
  ...(deps.googleClient ? ['Google Drive'] : [])
];
await notify(
  `Found ${linkMetadata.figma.length} Figma link(s), ` +
  `${linkMetadata.confluence.length} Confluence link(s), ` +
  `${linkMetadata.googleDocs.length} Google Doc(s)` +
  `${linkMetadata.hasScopeAnalysis ? ' and existing scope analysis' : ''}`
);
```

**Verification:**
- Run tool against real epic with mixed links
- Verify notification appears immediately after Jira fetch
- Confirm downstream loading still works correctly

### Step 3: Enhance Figma Screen Setup to Return Rich Metadata

**File:** `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`

Modify `setupFigmaScreens()` to return notes count and comments count alongside screens.

**Changes:**
1. Return `{ screens, notes, commentsCount }` instead of just screens
2. Notes count already available from `allNotes` array
3. Comments count comes from Figma comments API call (Phase 3.8)

**Updated return type:**
```typescript
interface FigmaSetupResult {
  screens: Screen[];
  allNotes: NoteMetadata[];
  commentsCount: number;  // NEW
  // ... other existing fields
}
```

**Verification:**
- Verify notes count matches actual notes extracted
- Verify comments count matches Figma API response
- Test with 0 comments, 0 notes scenarios

### Step 4: Update Figma Analysis Progress Message

**File:** `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

Replace current analysis messages with comprehensive single message.

**Before:**
```
📝 AI Screen Analysis: Starting analysis of 3 screens...
✅ AI Screen Analysis: Analyzed 0 screens
```

**After:**
```
Figma: 3 screens, 0 notes, 6 comments. Analyzing screens...
Screen analysis complete: 3 cached, 0 new (Figma file unchanged)
```

**Implementation:**
```typescript
// Always show notes count (decided: Q3)
await notify(
  `Figma: ${screens.length} screen(s), ${allNotes.length} note(s), ` +
  `${commentsCount} comment(s). Analyzing screens...`
);

const { analyzedCount, cachedCount } = await regenerateScreenAnalyses(...);

// Use format: "X cached, Y new (Figma file unchanged)" (decided: Q2)
await notify(
  `Screen analysis complete: ${cachedCount} cached, ${analyzedCount} new` +
  `${cachedCount > 0 && analyzedCount === 0 ? ' (Figma file unchanged)' : ''}`
);
```

**Verification:**
- Test with all-cached scenario (0 new, 3 cached)
- Test with all-new scenario (3 new, 0 cached)
- Test with mixed scenario (2 new, 1 cached)
- Test with 0 notes (should display "0 notes")

### Step 5: Remove Redundant Sync Pre/Post Messages

**Files:**
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- `server/providers/combined/tools/shared/confluence-setup.ts`
- `server/providers/combined/tools/shared/google-docs-setup.ts`

**Remove these patterns:**

1. **Sync extraction messages** (happens instantly):
```typescript
// REMOVE
await notify('Extracting Confluence links from epic...');
await notify('Extracting Google Docs links from epic...');
```

2. **Redundant "Checking" messages**:
```typescript
// REMOVE
await notify('🔍 Checking for scope analysis...');
await notify('📝 Generating scope analysis...');

// REPLACE WITH (only when actually generating)
await notify('Generating scope analysis...');
```

3. **Duplicate completion messages**:
```typescript
// REMOVE second warning (redundant)
⚠️ Clarification Needed: 7 unanswered questions. Please answer ❓ questions and run again.
```

**Verification:**
- Run tool and verify no sync operations have pre-notifications
- Confirm only async operations (API calls, AI analysis) have progress updates

### Step 6: Improve Scope Analysis Progress Message

**File:** `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

Replace multi-step scope analysis messages with context-aware notifications.

**Before:**
```
🔍 Checking for scope analysis...
📝 Generating scope analysis...
📝 Feature Identification: Analyzing features and scope...
✅ Feature Identification Complete: 3 areas, 7 questions
```

**After:**
```
Generating scope analysis from 3 screens, 2 Confluence pages, 1 Google Doc (existing scope analysis available)...
Scope analysis complete: 7 questions, 3 feature areas (threshold: 5). Please answer ❓ questions and re-run.
```

**Implementation:**
```typescript
// Build context summary - include existing scope analysis here (decided: Q5)
const contextParts = [];
if (screens.length > 0) contextParts.push(`${screens.length} screen(s)`);
if (confluenceDocs.length > 0) contextParts.push(`${confluenceDocs.length} Confluence page(s)`);
if (googleDocs.length > 0) contextParts.push(`${googleDocs.length} Google Doc(s)`);

// Mention existing scope analysis in this message instead of earlier (decided: Q5)
const existingNote = existingScopeAnalysis ? ' (existing scope analysis available)' : '';

await notify(
  `Generating scope analysis from ${contextParts.join(', ')}${existingNote}...`
);

// ... generate scope analysis ...

await notify(
  `Scope analysis complete: ${questionCount} question(s), ${featureAreas} feature area(s) ` +
  `(threshold: ${QUESTION_THRESHOLD}). ${actionMessage}`
);
```

**Verification:**
- Test with all context types present (screens, Confluence, Google Docs)
- Test with only some context types (e.g., screens only, no docs)
- Verify existing scope analysis mention appears when present
- Verify action message matches question threshold outcome

### Step 7: Add Service Availability Notification

**File:** `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

Add initial message listing available services (decided: Q1 - valuable for users).

**Implementation:**
```typescript
// At start of executeWriteShellStories (decided: Q1 - include this message)
const availableServices = [
  'Figma',
  'Atlassian (Jira + Confluence)',
  ...(deps.googleClient ? ['Google Drive'] : [])
];

// Simple list - no explicit "not authenticated" mentions (decided: Q4)
await notify(`Starting with ${availableServices.join(', ')} integration`);
```

**Verification:**
- Test with Google auth present (should include Google Drive)
- Test without Google auth (should omit Google Drive, no mention of missing auth)

## Testing Strategy

### Unit Tests

1. **Link Metadata Extractor**
   - Test with empty ADF
   - Test with single link type
   - Test with all link types
   - Test with scope analysis present/absent

2. **Progress Message Formatting**
   - Test pluralization (1 screen vs 3 screens)
   - Test with zero counts (0 notes, 0 comments)
   - Test with all-cached scenario

### Integration Tests

1. **Full Tool Execution**
   - Run against real epic with mixed resources
   - Verify message sequence matches spec
   - Count total messages (should be ~6 instead of ~17)

2. **Edge Cases**
   - Epic with no links
   - Epic with only Figma links
   - Epic with only docs links
   - All screens cached
   - No screens cached

## Migration Path

1. **Phase 1: Create extractor** (Step 1) - No behavior change
2. **Phase 2: Use extractor** (Step 2) - Minor message improvement
3. **Phase 3: Enhance Figma metadata** (Steps 3-4) - Add notes/comments
4. **Phase 4: Remove redundancy** (Steps 5-6) - Major cleanup
5. **Phase 5: Polish** (Step 7) - Final enhancements

Each phase can be tested independently.

## Expected Outcome

**Before (17 messages):**
```
📝 Preparation: Fetching epic and Figma metadata...
Fetching epic from Jira...
Extracting epic content...
✅ Preparation Complete: 3 screens ready
Extracting Confluence links from epic...
Extracting Google Docs links from epic...
Processing 1 Google Docs...
📝 AI Screen Analysis: Starting analysis of 3 screens...
✅ AI Screen Analysis: Analyzed 0 screens
🔍 Checking for scope analysis...
📝 Generating scope analysis...
📝 Feature Identification: Analyzing features and scope...
✅ Feature Identification Complete: 3 areas, 7 questions
📝 Jira Update: Adding scope analysis section...
✅ Epic updated with scope analysis
⚠️ Found 7 unanswered questions (threshold: 5)...
⚠️ Clarification Needed: 7 unanswered questions...
```
**After (7 messages):**
```
1. Starting with Figma, Atlassian (Jira + Confluence), Google Drive integration
2. Fetching Jira epic and extracting linked resources...
3. Found 1 Figma link(s), 0 Confluence link(s), 1 Google Doc(s)
4. Figma: 3 screen(s), 1 note(s), 33 comment(s). Analyzing screens...
5. Screen analysis complete: 0 cached, 3 new
6. Generating scope analysis from 3 screen(s), 1 Google Doc(s) (existing scope analysis available)...
7. Scope analysis complete: 6 question(s), 2 feature area(s). Please answer ❓ questions to bring unanswered questions under 5 and re-run.
```

**Improvements:**
- 59% fewer messages (17 → 7)
- No redundant pre/post for sync operations
- Clear cache behavior explanation with "X cached, Y new (Figma file unchanged)"
- Service availability listed upfront
- Comprehensive resource summary after Jira fetch
- Notes and comments always visible (even if 0)
## Design Decisions (Answered Questions)

### Q1: Service Availability Message
**Decision:** Include the service availability message - "Starting with Figma, Atlassian (Jira + Confluence), Google Drive integration"

**Rationale:** Valuable for users to know which providers the MCP tool has access to at the start of execution.

### Q2: Cache Status Message Format
**Decision:** Use format: "Screen analysis complete: 3 cached, 0 new (Figma file unchanged)"

**Rationale:** Clear and concise, "X cached, Y new" pattern is intuitive. The "(Figma file unchanged)" explanation only appears when all screens are cached.

### Q3: Notes Count Display
**Decision:** Always report note count, even if 0

**Format:** "Figma: 3 screen(s), 0 note(s), 6 comment(s)"

**Rationale:** Consistency in messaging format. Users can see at a glance what design annotations exist (or don't exist).

### Q4: Missing Google Drive Authentication
**Decision:** Silent omission from service list

**Format:** 
- With auth: "Starting with Figma, Atlassian (Jira + Confluence), Google Drive integration"
- Without auth: "Starting with Figma, Atlassian (Jira + Confluence) integration"

**Rationale:** Service availability message already provides the context. No need for explicit "not authenticated" mentions that add noise.

### Q5: Existing Scope Analysis Mention
**Decision:** Include in the scope analysis generation message, not earlier

**Format:** "Generating scope analysis from 3 screen(s), 2 Confluence page(s), 1 Google Doc(s) (existing scope analysis available)..."

**Rationale:** Keeps the resource summary (message #3) focused on external links. Existing scope analysis is mentioned when it's actually being used during generation.
5. Should the scope analysis message include whether there was an existing scope analysis section, or just focus on the new generation? Currently proposed: "Generating scope analysis from 3 screens, 2 Confluence pages, 1 Google Doc..." (omits existing analysis mention)

Sure we can include if it's available or not here instead of earlier.