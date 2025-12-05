# Simplify Logging for identify-features Tool

## Goal

Simplify and streamline console logging to make it easier to read and understand the flow of execution, while maintaining enough detail for debugging. Focus on hierarchical indentation to show nested operations and use emojis to identify key operations (especially Figma API requests).

## Current State Analysis

### Entry Points
1. **REST API Handler** (`server/api/identify-features.ts`)
   - Entry point logging with basic request info
   - Cloud ID resolution logging
   - Success/error logging

2. **Core Logic** (`server/providers/combined/tools/identify-features/core-logic.ts`)
   - Function entry logging
   - Phase-by-phase progress logging
   - AI token usage details
   - Jira update operations

3. **Shared Pipeline** (`server/providers/combined/tools/shared/screen-analysis-pipeline.ts`)
   - Pipeline initialization
   - Temp directory setup
   - Phase coordination

4. **Figma Screen Setup** (`server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`)
   - Epic fetching
   - URL extraction
   - Figma metadata fetching (batch operations)
   - Frame/note association
   - File generation

5. **Screen Analysis** (`server/providers/combined/tools/writing-shell-stories/screen-analysis-regenerator.ts`)
   - Cache checking
   - Batch image downloading
   - Individual screen analysis
   - Progress tracking

6. **Figma Helpers** (`server/providers/figma/figma-helpers.ts` and `figma-api-client.ts`)
   - Low-level API calls
   - Request/response details
   - Error handling

### Current Issues

1. **Inconsistent Indentation**: Some logs use 2 spaces, some use 4, many have no indentation
2. **Redundant Messages**: Multiple logs saying similar things at different levels
3. **Missing Figma Indicators**: No consistent emoji for Figma API requests
4. **Verbose Details**: Too many implementation details (response status, character counts)
5. **Multi-line Messages**: Some logs span multiple console.log calls
6. **Mixed Concerns**: Low-level API details mixed with high-level workflow logs

## Target Logging Style

```
Tool call: identify-features {epicKey: "PROJ-123"}
  Resolved: my-site (abc123)
  Fetching epic PROJ-123...
  Found 2 Figma URLs
  
  Phase 1-3: Setting up epic and Figma screens
    Epic context: 1234 chars
    🎨 https://figma.com/file/abc?node-id=1:2
    🎨 https://figma.com/file/abc?node-id=3:4
    Found 5 frames, 3 notes
  ✅ Preparation Complete: 5 screens ready
  
  Phase 4: Downloading images and analyzing screens
    🎨 Batch downloading 5 images (200)
    🤖 Analyzing: Home
    🤖 Analyzing: Profile
    🤖 Analyzing: Settings
    🤖 Analyzing: Dashboard
    🤖 Analyzing: Reports
  ✅ AI Screen Analysis: Analyzed 5 screens
  
  Phase 5: Generating scope analysis
    🤖 Scope analysis (15234 chars / 8000 max tokens)
    ✅ Generated: 3 areas, 7 questions
  
  Phase 6: Updating epic with scope analysis
    Updating epic description... (204)
  ✅ Epic updated
  
✅ Jira Update Complete: 3 feature areas, 7 questions
```

**With cache:**
```
Tool call: identify-features {epicKey: "PROJ-123"}
  Resolved: my-site (abc123)
  Fetching epic PROJ-123...
  Found 2 Figma URLs
  
  Phase 1-3: Setting up epic and Figma screens
    Epic context: 1234 chars
    🎨 https://figma.com/file/abc?node-id=1:2
    🎨 https://figma.com/file/abc?node-id=3:4
    Found 5 frames, 3 notes
  ✅ Preparation Complete: 5 screens ready
  
  Phase 4: Downloading images and analyzing screens
    ♻️ Cached: Home, Profile, Settings
    🎨 Batch downloading 2 images (200)
    🤖 Analyzing: Dashboard
    🤖 Analyzing: Reports
  ✅ AI Screen Analysis: Analyzed 5 screens
  
  Phase 5: Generating scope analysis
    🤖 Scope analysis (15234 chars / 8000 max tokens)
    ✅ Generated: 3 areas, 7 questions
  
  Phase 6: Updating epic with scope analysis
    Updating epic description... (204)
  ✅ Epic updated
  
✅ Jira Update Complete: 3 feature areas, 7 questions
```

### Emoji Key
- 🎨 - Figma API request (metadata, images, nodes)
- 🤖 - LLM/AI request
- 📝 - Processing/analyzing
- ✅ - Success/completion
- ⚠️ - Warning/skipping
- ❌ - Error
- ♻️ - Using cache

## Implementation Plan

### Step 1: Add Figma Request Emoji to Low-Level Helpers

**Files to modify:**
- `server/providers/figma/figma-helpers.ts`
- `server/providers/figma/figma-api-client.ts`

**Changes:**
- Replace "Fetching Figma file/node" with `🎨 {url}` showing the actual request URL
- Replace "Downloading Figma image" with `🎨 Batch downloading {count} images ({statusCode})`
- Keep status code in parentheses for all Figma requests (per answer #10)
- Consolidate multi-line messages into single log statements
- Remove verbose debug messages like "Figma API response:", "Figma file data received successfully"

**Verification:**
Run identify-features and verify each Figma API call shows 🎨 with URL and status code.

### Step 2: Simplify Figma Screen Setup Logging

**File:** `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`

**Changes:**
- Remove function-level "Setting up Figma screens..." (redundant with phase logs)
- Remove "Resolved Jira site:" log (handled at API level)
- Remove "Epic fetched successfully:" log (redundant)
- Log each Figma URL on its own line with 🎨 and status code: `🎨 {url} ({statusCode})`
- Keep "Found {count} Figma URLs" summary before listing them
- Remove "📦 Batch fetching" message (individual URLs already show 🎨)
- Keep "Found X frames and Y notes" summary
- Show epic context: `Epic context: {chars} chars` (just count per answer #7)
- Remove all "✅ Saved X.md" messages per answer #8

**Verification:**
Run identify-features and verify each Figma request shows on its own line with 🎨.

### Step 3: Simplify Screen Analysis Pipeline Logging

**File:** `server/providers/combined/tools/shared/screen-analysis-pipeline.ts`

**Changes:**
- Remove "executeScreenAnalysisPipeline called" (redundant)
- Remove "Creating temporary directory" and "Temp directory ready" messages (per answer #4)
- Remove "Phase 1-3: Setting up..." log (redundant with notify message)
- Remove "Phase 1-3 complete: X Figma URLs..." (redundant with setupFigmaScreens output)
- Remove "Phase 4: Downloading images and analyzing screens..." (redundant)
- Remove "Phase 4 complete: X/Y screens analyzed" (redundant with regenerateScreenAnalyses output)

**Verification:**
Run identify-features and verify phases flow clearly without repetition.

### Step 4: Simplify Screen Analysis Regenerator Logging

**File:** `server/providers/combined/tools/writing-shell-stories/screen-analysis-regenerator.ts`

**Changes:**
- Remove "Regenerating analysis for X screens..." (redundant with phase log)
- Keep cache message but list screens: `♻️ Cached: {screenName1}, {screenName2}, ...` (per answer #9)
- Change "📥 Batch downloading images" to `🎨 Batch downloading {count} images ({statusCode})`
- Remove "⚠️ Frame not found" individual logs (keep as warnings per answer #6)
- Change "Processing screen X/Y: name" to `🤖 Analyzing: {screenName}` (per answer #5)
- Remove all "✅ Prepared notes" messages (per answer #8)
- Remove "Loaded X/Y analysis files" log
- Remove individual "✅ Read analysis:" logs

**Verification:**
Run identify-features and verify each screen shows `🤖 Analyzing: {name}` as it's processed.

### Step 5: Simplify Core Logic Logging

**File:** `server/providers/combined/tools/identify-features/core-logic.ts`

**Changes:**
- Remove "executeIdentifyFeatures called" (redundant with API handler)
- Remove "Starting feature identification for epic" (redundant)
- Remove function-level phase headers (already in pipeline)
- In generateScopeAnalysis:
  - Remove "Phase 5: Generating scope analysis from analyses..."
  - Remove all "✅ Read analysis: X.analysis.md" logs (per answer #8)
  - Remove "Loaded X/Y analysis files"
  - Remove "✅ Saved prompt: scope-analysis-prompt.md" (per answer #8)
  - Change AI request to: `🤖 Scope analysis ({chars} chars / {maxTokens} max tokens)` (per answer #1)
  - Remove "⏳ Waiting for AI API response..." (redundant)
  - Remove "✅ Scope analysis generated (X characters)" (redundant)
  - Remove token metadata logging (consolidated into request line)
  - Simplify success to: `✅ Generated: {areas} areas, {questions} questions`
  - Remove "✅ Saved scope analysis: scope-analysis.md" (per answer #8)
- In updateEpicWithScopeAnalysis:
  - Remove "Phase 6: Updating epic with scope analysis..."
  - Remove "Converting scope analysis section to ADF..."
  - Remove "✅ Scope analysis converted to ADF"
  - Change "Updating epic description..." to `Updating epic description... ({statusCode})`
  - Simplify success to: `✅ Epic updated`
  - Keep warning messages (per answer #6)

**Verification:**
Run identify-features and verify core logic shows clean phase progression with status codes.

### Step 6: Simplify REST API Handler Logging

**File:** `server/api/identify-features.ts`

**Changes:**
- Change "REST API: identify-features called" to `Tool call: identify-features {epicKey: "{epicKey}"}`
- Remove "Processing epic: X" (redundant with tool call line)
- Remove "Site name: X" and "Cloud ID: X" detail lines (shown at resolution)
- Remove "Resolving cloud ID..." (too verbose)
- Simplify resolved to: `Resolved: {siteName} ({cloudId})`
- Remove "Comment context ready" (internal detail)
- Keep final success message
- Keep error logging

**Verification:**
Run identify-features and verify API handler shows concise entry and exit.

### Step 7: Apply Consistent Indentation Rules

**Across all files:**
- Top-level operation (tool call): No indentation
- Phase/major step: 2 spaces
- Sub-operation within phase: 4 spaces
- Detail within sub-operation: 6 spaces (rare, only for critical info)

**Update all modified files to follow this convention.**

**Verification:**
Run identify-features and verify indentation creates clear visual hierarchy.

### Step 8: Test and Validate

**Test scenarios:**
1. Fresh run (no cache)
2. Cached run (with DEV_CACHE_DIR)
3. Error scenarios (invalid epic, no Figma URLs, API failures)
4. Multiple Figma URLs
5. Large epic (many screens)

**Validation checklist:**
- [ ] All Figma API requests show 🎨
- [ ] All AI requests show 🤖
- [ ] Indentation is consistent
- [ ] No redundant messages
- [ ] Phase progression is clear
- [ ] Error messages are preserved
- [ ] Progress tracking works
- [ ] Cache messages are clear

## Answered Questions

1. **AI logging format**: Use `({chars} chars / {maxTokens} max tokens)` format
2. **Figma URLs**: Log each request on its own line with 🎨 emoji
3. **Batch operations**: Assume success, only show errors as warnings
4. **Temp directory**: Don't log temp directory creation (shown at server startup only)
5. **Screen analysis**: Show `🤖 Analyzing: {screenName}` for each screen
6. **Warnings**: Keep on their own line (simplifying happy-path only)
7. **Epic context**: Show character count only, no preview
8. **File saves**: Remove all "✅ Saved X.md" messages
9. **Cached screens**: List screen names: `♻️ Cached: Name1, Name2, ...`
10. **Status codes**: Keep status codes in parentheses for all API requests

