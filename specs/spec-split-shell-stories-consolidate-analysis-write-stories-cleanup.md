# Shell Story Generation - Consolidate, Generate, Validate

## Overview

This spec describes a solution for improving shell story generation: a three-prompt approach that consolidates screen analyses into a normalized feature catalog, generates stories with explicit feature citations, and validates/cleans the output.

**Core Innovation**: Create a deduplicated feature catalog with reference IDs, enabling automated validation of every feature mentioned in stories.

## Problem Statement

Current single-prompt approach has three critical issues:

1. **Hallucination**: AI adds deferrals like "- Filtering (defer)" to stories where filtering UI doesn't exist
2. **Missing Implementation Stories**: AI forgets to create stories for epic-deferred features
3. **Context Bloat**: Full analyses (~200KB) contain duplicate feature descriptions across screens

**Example Hallucination:**
```markdown
st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- + Pricing configuration table
- - Status filtering (defer to st015)  ← WRONG! No filtering on agreement tab
```

## Solution Architecture

### Three-Prompt Pipeline

```
Screen Analyses (200KB)
         ↓
[Prompt 1: Feature Compositor]
         ↓
Feature Catalog (50KB) ← Single source of truth
         ↓
[Prompt 2: Story Generator]
         ↓
Stories with [F###] Citations
         ↓
[Prompt 3: Validator & Cleanup]
         ↓
Clean Shell Stories ← No hallucinations
```

### Prompt 1: Feature Compositor

**Input:**
- All screen analysis files
- Epic context

**Process:**
1. Extract every feature and behavior from analyses
2. Deduplicate (feature on 3 screens → one entry)
3. Assign reference IDs `[F001]`, `[F002]`, etc.
4. For each feature, list which screens contain it

**Output Format:**
```markdown
# Feature Catalog

[F001] User Authentication
- Screens: login-screen, header
- Description: Email/password input fields with validation
- Behavior: Submit triggers backend auth, shows loading state

[F002] Status Filtering
- Screens: applicants-new, applicants-in-progress
- Description: Dropdown with "All", "New", "In Progress" options
- Behavior: Filters table on selection

[F003] Pricing Configuration
- Screens: application-agreement-fixed, application-agreement-rate
- Description: Table with rate options and terms
- Behavior: User selects pricing tier
```

**Success Criteria:**
- Every feature appears exactly once (no duplicates)
- All screens are represented
- Reference IDs are sequential with no gaps
- Epic-deferred features included with marker

### Prompt 2: Story Generator with Citations

**Input:**
- Feature catalog from Prompt 1
- Epic context
- Screens.yaml

**Process:**
- Uses existing 14-step process
- **NEW REQUIREMENT**: Must cite `[F###]` for every feature in `+` and `-` bullets

**Output Format:**
```markdown
st001: User Login - Basic authentication flow
- ANALYSIS: login-screen
- DEPENDENCIES: none
- + [F001] Email/password input fields
- + [F001] Login button with validation
- - [F001] OAuth providers (defer to st017)

st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- DEPENDENCIES: st001
- + [F003] Pricing configuration table
- + [F003] Rate selection controls
```

**Success Criteria:**
- Every `+` and `-` bullet has a `[F###]` citation
- Story numbering is sequential
- Deferred implementation stories created at end

### Prompt 3: Validator & Cleanup

**Input:**
- Stories with citations from Prompt 2
- Feature catalog from Prompt 1

**Process:**
1. **Validation Phase:**
   - Check every `[F###]` exists in catalog
   - For each story, verify cited features appear on story's screens
   - Flag errors: "st011 references [F002] but F002 is on different screens"

2. **Cleanup Phase:**
   - Remove all `[F###]` reference IDs
   - Final formatting check
   - Ensure sequential story numbering

**Output Format:**
```markdown
st001: User Login - Basic authentication flow
- ANALYSIS: login-screen
- DEPENDENCIES: none
- + Email/password input fields
- + Login button with validation
- - OAuth providers (defer to st017)
```

**Success Criteria:**
- No validation errors
- No `[F###]` IDs in final output
- Stories are clean and user-ready

## Implementation Plan

### Step 1: Create Strategy Interface

**Goal**: Enable switching between shell story generation strategies via environment variable

**Files to Create:**
- `server/providers/combined/tools/writing-shell-stories/strategy-interface.ts`

**Interface Definition:**
```typescript
export interface ShellStoryGenerationStrategy {
  /**
   * Strategy name for logging
   */
  name: string;

  /**
   * Generate shell stories from screen analyses
   * 
   * @param params - Input context
   * @param deps - Injected dependencies
   * @returns Generated markdown content
   */
  generateShellStories(
    params: ShellStoryGenerationInput,
    deps: ToolDependencies
  ): Promise<ShellStoryGenerationResult>;
}

export interface ShellStoryGenerationInput {
  screens: Array<{ name: string; url: string; notes: string[] }>;
  tempDirPath: string;
  yamlPath: string;
  epicContext?: string;
}

export interface ShellStoryGenerationResult {
  shellStoriesContent: string;  // The generated markdown
}
```

**Validation:**
- [ ] Interface compiles without errors
- [ ] Type exports work from other files

---

### Step 2: Refactor Current Single-Prompt to Strategy

**Goal**: Move existing code into strategy pattern without changing behavior

**Files to Create:**
- `server/providers/combined/tools/writing-shell-stories/strategy-single-prompt/`
  - `index.ts` - Strategy implementation
  - `generator.ts` - Extracted generation logic
  - `prompt-shell-stories.ts` - Moved from parent directory

**Changes to `core-logic.ts`:**

```typescript
// Add imports
import type { ShellStoryGenerationStrategy } from './strategy-interface.js';
import { SinglePromptStrategy } from './strategy-single-prompt/index.js';

// In generateShellStoriesFromAnalyses function (around line 240):
// BEFORE:
const shellStoryPrompt = generateShellStoryPrompt(screensYaml, analysisFiles, epicContext);
const response = await generateText({ ... });
const shellStoriesText = response.text;

// AFTER:
const strategy = getShellStoryStrategy();
const result = await strategy.generateShellStories(
  { screens, tempDirPath, yamlPath, epicContext },
  { generateText, notify }
);
const shellStoriesContent = result.shellStoriesContent;

// Save to file (orchestration layer responsibility)
const shellStoriesPath = path.join(tempDirPath, 'shell-stories.md');
await fs.writeFile(shellStoriesPath, shellStoriesContent, 'utf-8');
```

**Add Strategy Factory Function:**
```typescript
function getShellStoryStrategy(): ShellStoryGenerationStrategy {
  const strategyName = process.env.SHELL_STORY_STRATEGY || 'single-prompt';
  
  switch (strategyName) {
    case 'single-prompt':
      return new SinglePromptStrategy();
    case 'consolidate-generate-validate':
      return new ConsolidateGenerateValidateStrategy();
    default:
      console.warn(`Unknown strategy "${strategyName}", defaulting to single-prompt`);
      return new SinglePromptStrategy();
  }
}
```

**Validation:**
- [ ] Run existing epic through refactored code
- [ ] Output matches exactly (character-by-character)
- [ ] All temp files created in same locations
- [ ] No regression in functionality

---

### Step 3: Implement Feature Compositor (Prompt 1)

**Goal**: Extract and deduplicate features from screen analyses

**Files to Create:**
- `server/providers/combined/tools/writing-shell-stories/strategy-consolidate-generate-validate/`
  - `feature-compositor.ts`

**Core Function:**
```typescript
export interface Feature {
  id: string;              // "F001", "F002", etc.
  name: string;            // "User Authentication"
  screens: string[];       // ["login-screen", "header"]
  description: string;     // Main description
  behavior?: string;       // Behavioral description
  isEpicDeferred?: boolean; // From epic context
}

export async function composeFeatureCatalog(
  analysisFiles: Array<{ screenName: string; content: string }>,
  epicContext: string,
  deps: { generateText: Function; notify: Function }
): Promise<{ catalogContent: string; features: Feature[] }> {
  // Implementation
}
```

**Prompt Structure:**
```markdown
You are analyzing screen designs to create a comprehensive feature catalog.

# TASK
Extract every feature and behavior from the screen analyses below.
For each feature:
1. List ALL screens where it appears
2. Provide a concise description
3. Note any behavioral details
4. Assign a unique reference ID [F###]

# CRITICAL RULES
- Deduplicate: If feature appears on multiple screens, create ONE entry listing all screens
- Sequential IDs: Start at [F001], no gaps
- Epic deferrals: Mark features mentioned in epic context as deferred

# EPIC CONTEXT
${epicContext}

# SCREEN ANALYSES
${analysisFiles.map(f => `## ${f.screenName}\n${f.content}`).join('\n\n')}

# OUTPUT FORMAT
[F001] Feature Name
- Screens: screen1, screen2
- Description: ...
- Behavior: ...

[F002] Next Feature
...
```

**Validation Tests:**
1. **Deduplication Test**:
   - Input: 3 analyses mentioning "status filter"
   - Expected: Single [F###] entry with 3 screens
   - Verify: Parse catalog, count entries for "filter"

2. **Coverage Test**:
   - Input: 5 screen analyses
   - Expected: All 5 screens appear in catalog
   - Verify: Extract screen names, check against input

3. **Sequential ID Test**:
   - Input: Any analyses
   - Expected: IDs are [F001], [F002], [F003], ... (no gaps)
   - Verify: Regex match `\[F\d{3}\]`, check sequence

4. **Epic Deferral Test**:
   - Input: Epic says "defer filtering"
   - Expected: Filtering feature marked with `isEpicDeferred: true`
   - Verify: Parse catalog, check marker

**Validation:**
- [ ] All validation tests pass
- [ ] Catalog is ~25-30% size of original analyses
- [ ] Manual review: No duplicate features
- [ ] Manual review: All screens represented

---

### Step 4: Modify Story Generator to Require Citations

**Goal**: Add citation requirement to existing 14-step prompt

**Files to Modify:**
- `server/providers/combined/tools/writing-shell-stories/strategy-consolidate-generate-validate/`
  - `prompt-shell-stories-with-citations.ts` (copy from existing prompt)

**Changes to System Prompt:**
```typescript
export const SHELL_STORY_SYSTEM_PROMPT = `
You are a product manager creating shell stories...

**CRITICAL NEW REQUIREMENT:**
- Every + bullet MUST cite a feature ID from the catalog: "+ [F###] description"
- Every - bullet MUST cite a feature ID: "- [F###] feature name (defer to st###)"
- Only reference features that appear in the feature catalog provided
- Do NOT invent features that aren't in the catalog
`;
```

**Changes to User Prompt:**
```typescript
export function generateShellStoryPromptWithCitations(
  screensYaml: string,
  featureCatalog: string,  // NEW: Instead of full analyses
  epicContext?: string
): string {
  return `
# TASK
Generate shell stories using the feature catalog below.

# FEATURE CATALOG (Your single source of truth)
${featureCatalog}

# SCREENS.YAML (For ordering)
${screensYaml}

# EPIC CONTEXT
${epicContext || 'None provided'}

# INSTRUCTIONS
[... existing 14 steps ...]

STEP 5 (MODIFIED): **ADD MUST-INCLUDE BULLETS**
- Each + bullet MUST start with [F###] citation
- Example: "+ [F001] Email/password input fields"
- Only reference features from the catalog above

STEP 6 (MODIFIED): **ADD DEFER/EXCLUDE BULLETS**  
- Each - bullet MUST start with [F###] citation
- Example: "- [F003] OAuth providers (defer to st017)"
- Only defer features from the catalog above

[... rest of existing steps ...]
`;
}
```

**Validation Tests:**
1. **Citation Presence Test**:
   - Input: Feature catalog with [F001]-[F010]
   - Expected: All + and - bullets have [F###]
   - Verify: Regex match `[+-]\s*\[F\d{3}\]`

2. **Valid Citation Test**:
   - Input: Catalog with [F001]-[F010]
   - Expected: Stories only reference F001-F010 (no F011, F999, etc.)
   - Verify: Extract all [F###] from stories, check against catalog

3. **Output Format Test**:
   - Input: Any catalog
   - Expected: Stories follow existing format + citations
   - Verify: Parse structure, check ANALYSIS/DEPENDENCIES/bullets present

**Validation:**
- [ ] Citation presence test passes (100% of bullets have [F###])
- [ ] Valid citation test passes (no invalid IDs)
- [ ] Output format test passes
- [ ] Manual review: Stories make logical sense

---

### Step 5: Implement Validator & Cleanup (Prompt 3)

**Goal**: Validate feature citations and remove IDs from final output

**Files to Create:**
- `server/providers/combined/tools/writing-shell-stories/strategy-consolidate-generate-validate/`
  - `story-validator.ts`

**Core Functions:**

```typescript
export interface ValidationError {
  storyId: string;
  errorType: 'missing_feature' | 'screen_mismatch' | 'invalid_id';
  featureId: string;
  message: string;
  suggestedFix: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: string[];
  isValid: boolean;
}

/**
 * Validate story citations against feature catalog
 */
export function validateStoryCitations(
  shellStoriesContent: string,
  features: Feature[]
): ValidationResult {
  // Parse stories, extract all [F###] references
  // For each story:
  //   1. Get story's ANALYSIS screens
  //   2. For each [F###] reference:
  //      - Check feature exists in catalog
  //      - Check feature appears on at least one of story's screens
  //   3. Flag errors if validation fails
}

/**
 * Remove [F###] citations from stories
 */
export function removeFeatureCitations(
  shellStoriesContent: string
): string {
  // Replace "+ [F###] description" with "+ description"
  // Replace "- [F###] name (defer)" with "- name (defer)"
}
```

**Validation Logic:**
```typescript
function validateStoryCitations(content: string, features: Feature[]): ValidationResult {
  const errors: ValidationError[] = [];
  const stories = parseShellStories(content); // Extract story objects
  
  for (const story of stories) {
    const storyScreens = new Set(story.analysisFiles); // From ANALYSIS bullets
    
    for (const bullet of [...story.plusBullets, ...story.minusBullets]) {
      const featureIdMatch = bullet.text.match(/\[F(\d{3})\]/);
      if (!featureIdMatch) {
        // Missing citation (shouldn't happen after Step 4)
        continue;
      }
      
      const featureId = featureIdMatch[0]; // "[F001]"
      const feature = features.find(f => f.id === featureId);
      
      // Validation 1: Feature exists
      if (!feature) {
        errors.push({
          storyId: story.id,
          errorType: 'missing_feature',
          featureId,
          message: `Story ${story.id} references ${featureId} which doesn't exist in catalog`,
          suggestedFix: `Remove this bullet or check feature ID`
        });
        continue;
      }
      
      // Validation 2: Feature appears on story's screens
      const overlap = feature.screens.some(screen => storyScreens.has(screen));
      if (!overlap) {
        errors.push({
          storyId: story.id,
          errorType: 'screen_mismatch',
          featureId,
          message: `Story ${story.id} references ${featureId} (${feature.name})
            Feature appears on: ${feature.screens.join(', ')}
            Story analyzes: ${Array.from(storyScreens).join(', ')}
            No overlap! Feature not visible on story's screens.`,
          suggestedFix: `Remove this bullet (feature not in story's screens)`
        });
      }
    }
  }
  
  return {
    errors,
    warnings: [],
    isValid: errors.length === 0
  };
}
```

**AI-Assisted Cleanup Prompt (if validation fails):**
```markdown
You are reviewing shell stories for errors.

# VALIDATION ERRORS FOUND
${errors.map(e => `- ${e.message}\n  Suggested fix: ${e.suggestedFix}`).join('\n')}

# STORIES WITH ERRORS
${shellStoriesContent}

# TASK
Fix all validation errors by removing or correcting the flagged bullets.
Then remove all [F###] reference IDs for clean output.

# OUTPUT
Return the corrected stories without [F###] IDs.
```

**Validation Tests:**

1. **Detect Missing Feature Test**:
   - Input: Story with [F999], catalog has F001-F010
   - Expected: Error flagged
   - Verify: `errors.some(e => e.featureId === 'F999')`

2. **Detect Screen Mismatch Test**:
   - Input: st011 (agreement screens) references [F002] (filter, only on applicant screens)
   - Expected: Error flagged
   - Verify: `errors.some(e => e.storyId === 'st011' && e.featureId === 'F002')`

3. **Citation Removal Test**:
   - Input: `"+ [F001] Email field"`
   - Expected: `"+ Email field"`
   - Verify: Output has no `[F\d{3}]` patterns

4. **Format Preservation Test**:
   - Input: Stories with ANALYSIS, DEPENDENCIES, bullets
   - Expected: Same structure after citation removal
   - Verify: Parse before/after, check structure matches

**Validation:**
- [ ] All validation tests pass
- [ ] Screen mismatch detection works (catches hallucinations)
- [ ] Citation removal is clean (no artifacts)
- [ ] Format preservation test passes

---

### Step 6: Integrate Strategy into Core Logic

**Goal**: Wire up the three-prompt strategy

**Files to Create:**
- `server/providers/combined/tools/writing-shell-stories/strategy-consolidate-generate-validate/`
  - `index.ts` - Strategy implementation
  - `generator.ts` - Orchestrates 3 prompts

**Strategy Implementation:**
```typescript
// index.ts
import type { 
  ShellStoryGenerationStrategy,
  ShellStoryGenerationInput,
  ShellStoryGenerationResult
} from '../strategy-interface.js';
import type { ToolDependencies } from '../../types.js';
import { generateWithConsolidateValidate } from './generator.js';

export class ConsolidateGenerateValidateStrategy implements ShellStoryGenerationStrategy {
  name = 'consolidate-generate-validate';

  async generateShellStories(
    params: ShellStoryGenerationInput,
    deps: ToolDependencies
  ): Promise<ShellStoryGenerationResult> {
    console.log('  Using consolidate-generate-validate strategy (3-prompt)');
    return generateWithConsolidateValidate(params, deps);
  }
}
```

**Generator Orchestration:**
```typescript
// generator.ts
export async function generateWithConsolidateValidate(
  params: ShellStoryGenerationInput,
  deps: ToolDependencies
): Promise<ShellStoryGenerationResult> {
  const { screens, tempDirPath, yamlPath, epicContext } = params;
  const { generateText, notify } = deps;
  
  // Read all analysis files
  const analysisFiles = await readAllAnalysisFiles(screens, tempDirPath);
  
  // ===== PROMPT 1: Feature Compositor =====
  console.log('  Phase 5.1: Composing feature catalog...');
  await notify('📝 Creating feature catalog from screen analyses...');
  
  const { catalogContent, features } = await composeFeatureCatalog(
    analysisFiles,
    epicContext || '',
    deps
  );
  
  // Save catalog for debugging
  await fs.writeFile(
    path.join(tempDirPath, 'feature-catalog.md'),
    catalogContent,
    'utf-8'
  );
  console.log(`    ✅ Feature catalog created: ${features.length} features`);
  
  // ===== PROMPT 2: Story Generator =====
  console.log('  Phase 5.2: Generating stories with citations...');
  await notify('📝 Generating shell stories...');
  
  const screensYaml = await fs.readFile(yamlPath, 'utf-8');
  const prompt = generateShellStoryPromptWithCitations(
    screensYaml,
    catalogContent,
    epicContext
  );
  
  const response = await generateText({
    systemPrompt: SHELL_STORY_SYSTEM_PROMPT_WITH_CITATIONS,
    prompt,
    maxTokens: SHELL_STORY_MAX_TOKENS
  });
  
  const storiesWithCitations = response.text;
  
  // Save for debugging
  await fs.writeFile(
    path.join(tempDirPath, 'shell-stories-with-citations.md'),
    storiesWithCitations,
    'utf-8'
  );
  console.log(`    ✅ Stories generated with citations`);
  
  // ===== PROMPT 3: Validator & Cleanup =====
  console.log('  Phase 5.3: Validating and cleaning up...');
  await notify('🔍 Validating story citations...');
  
  const validationResult = validateStoryCitations(storiesWithCitations, features);
  
  if (!validationResult.isValid) {
    console.warn(`    ⚠️ Found ${validationResult.errors.length} validation errors`);
    
    // Log errors for debugging
    for (const error of validationResult.errors) {
      console.warn(`      - ${error.message}`);
    }
    
    // Optionally: Use AI to fix errors
    // const fixedStories = await fixValidationErrors(storiesWithCitations, validationResult, deps);
    
    // For now: Proceed with cleanup despite errors (let user review)
  } else {
    console.log(`    ✅ All citations valid`);
  }
  
  // Remove [F###] IDs
  const cleanStories = removeFeatureCitations(storiesWithCitations);
  
  await notify('✅ Shell Story Generation Complete');
  
  return {
    shellStoriesContent: cleanStories
  };
}
```

**Changes to `core-logic.ts`:**
```typescript
// Add import
import { ConsolidateGenerateValidateStrategy } from './strategy-consolidate-generate-validate/index.js';

// Update factory function
function getShellStoryStrategy(): ShellStoryGenerationStrategy {
  const strategyName = process.env.SHELL_STORY_STRATEGY || 'single-prompt';
  
  switch (strategyName) {
    case 'single-prompt':
      return new SinglePromptStrategy();
    case 'consolidate-generate-validate':
      return new ConsolidateGenerateValidateStrategy();
    default:
      console.warn(`Unknown strategy "${strategyName}", defaulting to single-prompt`);
      return new SinglePromptStrategy();
  }
}
```

**Environment Variable Usage:**
```bash
# Use current single-prompt approach (default)
npm run start-local

# Use new consolidate-generate-validate approach
SHELL_STORY_STRATEGY=consolidate-generate-validate npm run start-local
```

**Validation:**
- [ ] Strategy factory returns correct strategy based on env var
- [ ] Both strategies work without errors
- [ ] Temp directory contains debug artifacts:
  - `single-prompt`: `shell-stories-prompt.md`, `shell-stories.md`
  - `consolidate-generate-validate`: `feature-catalog.md`, `shell-stories-with-citations.md`, `shell-stories.md`
- [ ] Final output is clean markdown without [F###] IDs

---

### Step 7: End-to-End Testing

**Goal**: Validate the new strategy works on real epics

**Test Cases:**

#### Test 1: Hallucination Detection
**Setup:**
- Epic with: "Defer filtering and location map to end"
- Screens: `applicants-new` (has filtering), `application-agreement` (no filtering), `application-map` (has map)

**Expected Behavior:**
1. **Feature Catalog** should show:
   ```markdown
   [F003] Status Filtering
   - Screens: applicants-new
   
   [F008] Location Map
   - Screens: application-map
   ```

2. **Story for Agreement Tab** should NOT reference filtering:
   ```markdown
   st011: Display Application Agreement Tab
   - ANALYSIS: application-agreement-fixed, application-agreement-rate
   - + Pricing configuration
   (No - bullets for filtering because not on these screens)
   ```

3. **Validation** should catch if AI tries to add filtering:
   ```
   ❌ Error: st011 references [F003] Status Filtering
      Feature appears on: applicants-new
      Story analyzes: application-agreement-fixed, application-agreement-rate
      No overlap!
   ```

**Validation:**
- [ ] Feature catalog correctly maps features to screens
- [ ] Agreement tab story has NO filtering deferral
- [ ] If AI adds filtering deferral, validator catches it
- [ ] Final output is clean (no hallucinations)

#### Test 2: Deduplication
**Setup:**
- 3 screen analyses all mention "user authentication"
- Each describes it slightly differently

**Expected Behavior:**
1. **Feature Catalog** has ONE entry:
   ```markdown
   [F001] User Authentication
   - Screens: login-screen, header, profile-menu
   - Description: Email/password authentication with validation
   ```

2. **Stories** reference same [F001]:
   ```markdown
   st001: Login Screen
   - + [F001] Email/password fields
   
   st005: Header Navigation  
   - + [F001] Login status indicator
   ```

**Validation:**
- [ ] Catalog has exactly ONE authentication entry (not 3)
- [ ] Entry lists all 3 screens
- [ ] Multiple stories reference same [F001]
- [ ] Context size is significantly smaller than original analyses

#### Test 3: Epic Deferral Implementation Stories
**Setup:**
- Epic says: "Defer advanced reporting and export to end"
- Screens show report viewing UI but no advanced features

**Expected Behavior:**
1. **Feature Catalog** marks deferred features:
   ```markdown
   [F015] Advanced Reporting (epic deferred)
   - Screens: reports-basic
   - Description: Complex multi-dimensional reports
   
   [F016] Data Export (epic deferred)
   - Screens: reports-basic
   - Description: Export to CSV, Excel, PDF
   ```

2. **Stories** create implementation stories at end:
   ```markdown
   st012: Implement Advanced Reporting
   - ANALYSIS: reports-basic
   - DEPENDENCIES: st003
   - + [F015] Multi-dimensional report builder
   
   st013: Implement Data Export
   - ANALYSIS: reports-basic
   - DEPENDENCIES: st003
   - + [F016] CSV export
   - + [F016] Excel export
   ```

**Validation:**
- [ ] Catalog correctly identifies epic-deferred features
- [ ] Implementation stories created at end of list
- [ ] Implementation stories reference correct features
- [ ] Story numbering is sequential

#### Test 4: Comparison with Single-Prompt
**Setup:**
- Run same epic through both strategies
- Compare outputs

**Metrics to Track:**

| Metric | Single Prompt | Consolidate-Generate-Validate |
|--------|--------------|-------------------------------|
| Stories with hallucinated deferrals | ? | 0 |
| Context size (KB) | ~200KB | ~50KB |
| Missing implementation stories | ? | 0 |
| Total AI calls | 1 | 3 |
| Generation time | ~45s | ~60-90s |
| Manual corrections needed | ? | <2 |

**Validation:**
- [ ] New strategy has significantly fewer hallucinations
- [ ] Context size is ~25-30% of original
- [ ] No missing implementation stories
- [ ] Total time is acceptable (<2 minutes)
- [ ] Quality improvement justifies extra AI calls

---

### Step 8: Documentation & Migration

**Goal**: Document the new strategy and provide migration guidance

**Files to Create/Update:**
- `server/providers/combined/tools/writing-shell-stories/README.md` - Strategy documentation
- `server/readme.md` - Update API documentation

**README.md Content:**
```markdown
# Shell Story Generation Strategies

This tool supports multiple strategies for generating shell stories from screen analyses.

## Available Strategies

### Single Prompt (Default)
- **Usage**: `SHELL_STORY_STRATEGY=single-prompt` (or omit variable)
- **Approach**: One large prompt with 14 steps
- **Best For**: Simple epics, established workflow
- **Known Issues**: May hallucinate deferrals, context-heavy

### Consolidate-Generate-Validate (Recommended)
- **Usage**: `SHELL_STORY_STRATEGY=consolidate-generate-validate`
- **Approach**: Three prompts (feature catalog → stories → validation)
- **Best For**: Complex epics, preventing hallucinations
- **Benefits**: 
  - Automated validation catches hallucinations
  - Smaller context (25-30% of original)
  - Deduplication across screens
  - Explicit feature citations

## Strategy Selection

Strategies are selected via the `SHELL_STORY_STRATEGY` environment variable:

```bash
# Use single-prompt (current behavior)
npm run start-local

# Use consolidate-generate-validate (recommended)
SHELL_STORY_STRATEGY=consolidate-generate-validate npm run start-local
```

## Debug Artifacts

Each strategy creates debug files in the epic's temp directory:

**Single Prompt:**
- `shell-stories-prompt.md` - The prompt sent to AI
- `shell-stories.md` - Final output

**Consolidate-Generate-Validate:**
- `feature-catalog.md` - Deduplicated feature catalog
- `shell-stories-with-citations.md` - Stories with [F###] IDs
- `shell-stories.md` - Final cleaned output

## Migration Guide

To migrate from single-prompt to consolidate-generate-validate:

1. Test on 3-5 sample epics
2. Compare outputs manually
3. If quality improves, set as default in `.env`:
   ```
   SHELL_STORY_STRATEGY=consolidate-generate-validate
   ```
4. Monitor for issues over 1-2 weeks
5. Consider removing single-prompt strategy if no longer needed
```

**Validation:**
- [ ] README is clear and complete
- [ ] Examples work as documented
- [ ] Migration guide is actionable

---

## Questions

### Question 1: Feature Catalog Deduplication Logic
When the same feature is described differently across screens, how should we merge them?

**Example:**
- `login-screen.analysis.md`: "Email and password input fields with real-time validation"
- `header.analysis.md`: "User login area with email/password entry"
- `profile.analysis.md`: "Authentication credentials form"

**Options:**
a) Use the most detailed description
b) Concatenate all descriptions
c) Use AI to synthesize a unified description
d) Use the first occurrence

**Your Answer:**


### Question 2: Validation Error Handling
When validation finds errors (e.g., st011 references filtering but it's not on those screens), what should we do?

**Options:**
a) Fail the entire operation and ask user to retry
b) Log errors but proceed with cleanup (let user review warnings)
c) Use AI to automatically fix errors (Prompt 3 becomes corrective)
d) Remove the problematic bullets automatically

**Your Answer:**


### Question 3: Epic-Deferred Feature Detection
How should we identify which features are "deferred" in the epic context?

**Options:**
a) Look for explicit keywords: "defer", "delay", "later", "phase 2"
b) Use AI judgment to interpret epic intent
c) Require structured epic format (e.g., "## Deferred Features" section)
d) Mark all features as potentially deferrable, let AI decide in Prompt 2

**Your Answer:**


### Question 4: Context Size Optimization
If the feature catalog is still too large (>50KB), what optimizations should we apply?

**Options:**
a) Summarize feature descriptions to key points only
b) Omit behavioral details, keep descriptions
c) Group related features (e.g., "Authentication Features [F001-F005]")
d) Split catalog by screen groups (only load relevant subset in Prompt 2)

**Your Answer:**


### Question 5: Citation Format
What citation format should we use in Prompt 2?

**Current proposal:** `"+ [F003] Status filter dropdown"`

**Alternative formats:**
a) `"+ Status filter dropdown [F003]"` (ID at end)
b) `"+ Status filter dropdown (F003)"` (parentheses)
c) `"+ @F003 Status filter dropdown"` (@ prefix)
d) Keep current format

**Your Answer:**


### Question 6: Parallel Processing
Should we parallelize any of the three prompts?

**Opportunities:**
- Prompt 1 could process screens in parallel (merge results)
- Prompt 2 must be sequential (needs catalog from Prompt 1)
- Prompt 3 validation is fast (regex), but AI cleanup could be parallelized per story

**Your Answer:**


### Question 7: Strategy Default
Once tested, should we make `consolidate-generate-validate` the default strategy?

**Considerations:**
- If validation shows significant improvement, yes
- If generation time is too slow (>2 min), keep single-prompt as default
- If users prefer explicit control, keep single-prompt as default

**Your Answer:**


### Question 8: Catalog Caching
Should we cache the feature catalog if the same epic is processed multiple times?

**Use Case:**
- User runs tool, reviews output, runs again with minor epic edits
- Recomputing catalog takes ~15s, could be saved

**Options:**
a) Cache catalog by epic ID + screen hashes
b) Always regenerate (epics change frequently)
c) Cache only within same session (temp directory)

**Your Answer:**


---

## Success Criteria

The implementation is complete and successful when:

### Functional Requirements
- [ ] Both strategies (single-prompt and consolidate-generate-validate) work without errors
- [ ] Environment variable correctly switches between strategies
- [ ] Feature catalog deduplicates features across screens
- [ ] Story generator requires [F###] citations for all bullets
- [ ] Validator detects screen mismatches (hallucinations)
- [ ] Final output is clean markdown without [F###] IDs

### Quality Requirements
- [ ] Hallucination rate <20% (preferably <5%)
- [ ] No missing implementation stories for epic deferrals
- [ ] Context size reduced by 70-80% (from ~200KB to ~50KB)
- [ ] Story quality equal to or better than single-prompt

### Performance Requirements
- [ ] Total generation time <2 minutes for typical epic (10-15 stories)
- [ ] Feature catalog generation <20 seconds
- [ ] Validation <5 seconds

### Developer Experience
- [ ] Debug artifacts clearly show each pipeline stage
- [ ] Validation errors are actionable
- [ ] Strategy switching is seamless
- [ ] Documentation is clear and complete

### Testing Coverage
- [ ] All 4 end-to-end tests pass
- [ ] Unit tests for validation logic pass
- [ ] Tested on at least 5 real epics
- [ ] Comparison metrics collected

---

## Implementation Notes

### File Structure After Completion
```
server/providers/combined/tools/writing-shell-stories/
├── core-logic.ts (modified - uses strategy pattern)
├── strategy-interface.ts (new)
├── README.md (new)
├── strategy-single-prompt/
│   ├── index.ts
│   ├── generator.ts
│   └── prompt-shell-stories.ts (moved from parent)
├── strategy-consolidate-generate-validate/
│   ├── index.ts
│   ├── generator.ts
│   ├── feature-compositor.ts
│   ├── prompt-shell-stories-with-citations.ts
│   └── story-validator.ts
└── ...other files (screen-setup, temp-directory, etc.)
```

### Estimated Complexity
- **Step 1-2** (Strategy refactor): 4-6 hours
- **Step 3** (Feature compositor): 8-12 hours
- **Step 4** (Citation requirement): 4-6 hours
- **Step 5** (Validator): 8-12 hours
- **Step 6** (Integration): 4-6 hours
- **Step 7** (Testing): 8-12 hours
- **Step 8** (Documentation): 2-4 hours

**Total**: 38-58 hours (~1-1.5 weeks for one developer)

### Risk Mitigation
1. **Risk**: Feature compositor creates poor deduplication
   - **Mitigation**: Test on diverse epics, manual review of catalogs, iterate on prompt

2. **Risk**: Citation requirement breaks story generation
   - **Mitigation**: Start with loose requirement, tighten gradually, validate with unit tests

3. **Risk**: Validation is too strict (false positives)
   - **Mitigation**: Log warnings instead of errors initially, tune thresholds based on feedback

4. **Risk**: Generation time too slow (>2 min)
   - **Mitigation**: Optimize prompts, reduce max tokens, consider parallelization

### Rollback Plan
If new strategy has critical issues:
1. Set `SHELL_STORY_STRATEGY=single-prompt` as default
2. Mark consolidate-generate-validate as experimental
3. Debug issues offline
4. Re-release when stable

### Future Enhancements
- Parallel processing of feature catalog generation
- AI-assisted error correction in Prompt 3
- Catalog caching for faster re-runs
- Per-story validation metrics dashboard
- A/B testing framework for strategy comparison
