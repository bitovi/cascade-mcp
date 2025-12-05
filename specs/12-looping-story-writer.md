# Iterative Shell Story Generation - Specification

## Overview

This spec proposes an **iterative approach** to shell story generation that works in a loop:

1. **Identify next feature set** - AI selects the next logical group of features to turn into a story
2. **Generate shell story** - AI creates a single shell story from those features
3. **Update feature list** - Remove used features from the remaining list
4. **Repeat** - Continue until all in-scope features are covered

## Terminology Clarification

To avoid ambiguity, this spec uses consistent terminology:

- **☐ In-Scope** - Features to implement in normal priority stories within this epic
- **⏬ Low Priority** - Features to implement in later stories **within this epic** (never "deferred")
- **❌ Out-of-Scope** - Features excluded from this epic (may be deferred to future epics/phases)
- **❓ Questions** - Unclear or ambiguous features requiring clarification

The term "deferred" is **only used** for out-of-scope features, never for low priority features within the epic.

This approach provides several benefits over the current "generate all stories at once" method:
- **Better quality** - Each story gets focused attention
- **More incremental** - Natural progression from core features to enhancements
- **Better dependency management** - Earlier stories inform later ones
- **Token efficiency** - Smaller, focused prompts
- **Easier debugging** - Can inspect/adjust after each story

## Current Approach (Single Shot)

**Current workflow:**
1. Scope analysis identifies all features (✅/❌/❓)
2. Single AI call generates ALL shell stories at once
3. Stories are written to epic description

**Problems:**
- Complex 13-step process in one prompt (280 lines)
- AI must juggle all stories simultaneously
- Difficult to ensure coverage of all features
- Large token usage (up to 16K tokens)
- Hard to verify story-to-feature mapping

## Proposed Approach (Iterative)

### High-Level Loop

```
remainingFeatures = all ☐ in-scope features from scope analysis
existingStories = []

LOOP until remainingFeatures is empty:
  1. AI: Select next feature set (2-5 features that work well together)
  2. AI: Generate single shell story from selected features
  3. Update remainingFeatures (remove used features)
  4. Add story to existingStories
  5. Continue to next iteration

FINAL: Combine all existingStories into epic description
```

### Two-Prompt Pattern Per Iteration

Each iteration uses TWO AI calls:

#### Prompt 1: Feature Selection (Planning)

**Role:** Strategic planner identifying next story scope

**Input:**
- Remaining features (from scope analysis)
- Existing stories (for context/dependencies)
- Screen analyses (to understand feature relationships)
- Epic context (priorities, constraints)

**Output:** JSON structure:
```json
{
  "storyId": "st003",
  "storyTitle": "Add Basic Search Functionality",
  "selectedFeatures": [
    "Search input field with placeholder text",
    "Search button to trigger query",
    "Display search results in list format"
  ],
  "rationale": "These three features form the minimal viable search flow...",
  "screens": ["search-form", "search-results"],
  "dependencies": ["st001", "st002"]
}
```

**Constraints:**
- Select 2-5 features (unless naturally grouped differently)
- Features should form coherent user value
- Consider dependencies on existing stories
- Prefer core features before enhancements
- Must extract from remainingFeatures list (no invention)

#### Prompt 2: Story Generation (Execution)

**Role:** Product manager writing detailed shell story

**Input:**
- Selected features (from Prompt 1)
- Screen analyses for selected screens
- Existing stories (for dependency context)
- Epic context (priorities, constraints)

**Output:** Single shell story in markdown:
```markdown
- `st003` **Add Basic Search Functionality** ⟩ Allow users to search for items using text input
  * SCREENS: [search-form](figma-url), [search-results](figma-url)
  * DEPENDENCIES: st001, st002
  * ☐ Search input field with placeholder text
  * ☐ Search button to trigger query
  * ☐ Display search results in list format
  * ⏬ Advanced filters (low priority - implement in later story within this epic)
  * ❌ Saved searches (out of scope - excluded from this epic)
  * ❓ Should search be case-sensitive?
```

### Key Differences from Current Approach

| Aspect | Current (Single Shot) | Proposed (Iterative) |
|--------|----------------------|---------------------|
| **AI calls** | 1 large call | 2 small calls × N stories |
| **Prompt complexity** | 13 steps, 280 lines | 2 simpler prompts |
| **Feature tracking** | AI must remember all | Explicit list management |
| **Dependencies** | Declared after writing | Natural from sequence |
| **Quality** | Variable across stories | Consistent focus |
| **Debuggability** | All-or-nothing | Inspect each iteration |
| **Token usage** | Large upfront | Distributed across calls |

## Implementation Plan

### Phase 1: Create Feature Selection Prompt

**File:** `server/providers/combined/tools/writing-shell-stories/prompt-feature-selection.ts`

**Export:**
```typescript
export const FEATURE_SELECTION_SYSTEM_PROMPT = `You are a strategic product planner...`;
export const FEATURE_SELECTION_MAX_TOKENS = 2000;

export function generateFeatureSelectionPrompt(
  remainingFeatures: string[],
  existingStories: ShellStory[],
  scopeAnalysis: string,
  epicContext: string,
  screenAnalyses: Array<{ screenName: string; content: string; url: string }>
): string;
```

**Responsibilities:**
- Review remaining features from scope analysis
- Consider existing stories for dependencies
- Select 2-5 related features for next story
- Provide rationale for selection
- Identify relevant screens
- Suggest dependencies on existing stories

**Output format:**
```json
{
  "storyId": "st{number}",
  "storyTitle": "Brief title",
  "selectedFeatures": ["feature 1", "feature 2", ...],
  "rationale": "Why these features work together...",
  "screens": ["screen-name-1", "screen-name-2"],
  "dependencies": ["st001", "st002"],
  "lowPriorityFeatures": [
    {
      "feature": "Advanced version of feature",
      "reason": "Enhancement for later story within this epic"
    }
  ]
}
```

### Phase 2: Create Single Story Generation Prompt

**File:** `server/providers/combined/tools/writing-shell-stories/prompt-single-story.ts`

**Export:**
```typescript
export const SINGLE_STORY_SYSTEM_PROMPT = `You are a product manager writing a shell story...`;
export const SINGLE_STORY_MAX_TOKENS = 4000;

export function generateSingleStoryPrompt(
  selection: FeatureSelection,
  scopeAnalysis: string,
  epicContext: string,
  screenAnalyses: Array<{ screenName: string; content: string; url: string }>,
  existingStories: ShellStory[]
): string;
```

**Responsibilities:**
- Generate ONE shell story from selected features
- Include all required bullets (SCREENS, DEPENDENCIES, ☐/⏬/❌/❓)
- Reference scope analysis for out-of-scope items
- Add questions where scope is unclear
- Ensure story delivers coherent user value

**Output format:** Single story markdown (same as current format)

### Phase 3: Create Iteration Controller

**File:** `server/providers/combined/tools/writing-shell-stories/iterative-logic.ts`

**Export:**
```typescript
export interface IterativeStoryGeneratorParams {
  scopeAnalysis: string;
  epicContext: string;
  screenAnalyses: Array<{ screenName: string; content: string; url: string }>;
  screensYaml: string;
  generateText: GenerateTextFn;
  notify: NotifyFn;
}

export interface IterativeStoryGeneratorResult {
  stories: ShellStory[];
  totalIterations: number;
  featuresProcessed: number;
}

export async function generateShellStoriesIteratively(
  params: IterativeStoryGeneratorParams
): Promise<IterativeStoryGeneratorResult>;
```

**Main loop logic:**
```typescript
async function generateShellStoriesIteratively(params) {
  // 1. Extract all in-scope features from scope analysis
  const allFeatures = extractInScopeFeatures(params.scopeAnalysis);
  
  let remainingFeatures = [...allFeatures];
  const stories: ShellStory[] = [];
  let iteration = 0;
  
  while (remainingFeatures.length > 0) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}: ${remainingFeatures.length} features remaining`);
    
    // STEP 1: Feature Selection
    const selectionPrompt = generateFeatureSelectionPrompt(
      remainingFeatures,
      stories,
      params.scopeAnalysis,
      params.epicContext,
      params.screenAnalyses
    );
    
    const selectionResponse = await params.generateText({
      systemPrompt: FEATURE_SELECTION_SYSTEM_PROMPT,
      prompt: selectionPrompt,
      maxTokens: FEATURE_SELECTION_MAX_TOKENS
    });
    
    const selection = parseFeatureSelection(selectionResponse.text);
    console.log(`  📋 Selected ${selection.selectedFeatures.length} features for story: ${selection.storyTitle}`);
    
    // STEP 2: Single Story Generation
    const storyPrompt = generateSingleStoryPrompt(
      selection,
      params.scopeAnalysis,
      params.epicContext,
      params.screenAnalyses.filter(s => selection.screens.includes(s.screenName)),
      stories
    );
    
    const storyResponse = await params.generateText({
      systemPrompt: SINGLE_STORY_SYSTEM_PROMPT,
      prompt: storyPrompt,
      maxTokens: SINGLE_STORY_MAX_TOKENS
    });
    
    const story = parseShellStory(storyResponse.text, selection.storyId);
    stories.push(story);
    console.log(`  ✅ Generated story ${story.id}: ${story.title}`);
    
    // STEP 3: Update remaining features
    remainingFeatures = removeUsedFeatures(remainingFeatures, selection.selectedFeatures);
    console.log(`  📊 Features remaining: ${remainingFeatures.length}`);
    
    // Safety check: prevent infinite loops
    if (iteration > 50) {
      throw new Error('Too many iterations - possible infinite loop');
    }
  }
  
  console.log(`\n✅ All features processed in ${iteration} iterations`);
  
  return {
    stories,
    totalIterations: iteration,
    featuresProcessed: allFeatures.length
  };
}
```

### Phase 4: Helper Functions

**Feature extraction:**
```typescript
function extractInScopeFeatures(scopeAnalysis: string): string[] {
  // Parse scope analysis markdown
  // Extract all lines starting with "- ✅"
  // Return array of feature descriptions
}
```

**Feature removal:**
```typescript
function removeUsedFeatures(
  remaining: string[],
  used: string[]
): string[] {
  // Remove exact matches and semantic duplicates
  // Use fuzzy matching for slight wording differences
  // Return updated remaining list
}
```

**Selection parsing:**
```typescript
interface FeatureSelection {
  storyId: string;
  storyTitle: string;
  selectedFeatures: string[];
  rationale: string;
  screens: string[];
  dependencies: string[];
  deferredFeatures: Array<{ feature: string; reason: string }>;
}

function parseFeatureSelection(jsonText: string): FeatureSelection {
  // Parse JSON response from feature selection
  // Validate required fields
  // Return structured selection
}
```

**Story parsing:**
```typescript
interface ShellStory {
  id: string;
  title: string;
  description: string;
  screens: string[];
  dependencies: string[];
  included: string[]; // ☐ bullets
  lowPriority: string[]; // ⏬ bullets (low priority features for later stories within epic)
  excluded: string[]; // ❌ bullets
  questions: string[]; // ❓ bullets
  rawMarkdown: string;
}

function parseShellStory(markdown: string, expectedId: string): ShellStory {
  // Parse shell story markdown
  // Extract all bullets by type
  // Validate story ID matches expected
  // Return structured story
}
```

### Phase 5: Integration with Existing Tool

**Update:** `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

Add a feature flag or parameter to switch between approaches:

```typescript
export interface ExecuteWriteShellStoriesParams {
  // ... existing params
  iterative?: boolean; // NEW: Enable iterative generation
}

export async function executeWriteShellStories(params) {
  // ... existing setup code
  
  // PHASE 7: Generate shell stories
  let shellStoriesResult;
  
  if (params.iterative) {
    // NEW: Iterative approach
    shellStoriesResult = await generateShellStoriesIteratively({
      scopeAnalysis,
      epicContext: remainingContext,
      screenAnalyses: analysisFiles,
      screensYaml: screensYamlContent,
      generateText: params.generateText,
      notify: params.notify
    });
    
    // Combine stories into markdown text
    shellStoriesText = shellStoriesResult.stories
      .map(s => s.rawMarkdown)
      .join('\n\n');
      
  } else {
    // EXISTING: Single-shot approach
    const shellStoryPrompt = generateShellStoryPrompt(...);
    const response = await params.generateText({...});
    shellStoriesText = response.text;
  }
  
  // ... rest of existing code
}
```

## Comparison: Current vs Proposed

### Current Prompt (Single Shot)

**Strengths:**
- Works in one AI call
- Currently functional
- Simpler implementation

**Weaknesses:**
- Complex 13-step process in one prompt
- AI must track all features/stories simultaneously
- Large token usage (up to 16K)
- Variable quality across stories
- Hard to verify feature coverage
- Manual step 9 often needed to ensure low priority features have implementation stories

### Proposed Prompts (Iterative)

**Strengths:**
- Focused attention on each story
- Natural feature-to-story mapping
- Better dependency sequencing
- Easier debugging/inspection
- Guaranteed feature coverage
- No manual cleanup needed for low priority features
- Token usage distributed over iterations

**Weaknesses:**
- More AI calls (but smaller/cheaper)
- More complex orchestration
- Slightly longer total execution time

## Migration Strategy

### Phase 1: Implement Iterative Approach (New)
- Create new prompt files
- Create iteration controller
- Add feature flag to existing tool

### Phase 2: Test Both Approaches
- Run both approaches on same epics
- Compare quality, coverage, timing
- Gather metrics on token usage

### Phase 3: Evaluate and Decide
- If iterative is better → make it default
- If single-shot is good enough → keep it
- Could support both via parameter

## Open Questions

1. **Feature matching:** How fuzzy should feature matching be when removing used features?
   - Exact string match might miss semantically equivalent features
   - Too fuzzy might remove unrelated features
   - **Suggestion:** Use embedding similarity with threshold

2. **Story count estimation:** Should we estimate total stories upfront?
   - Could help with progress reporting
   - But estimation might be inaccurate
   - **Suggestion:** Show features remaining instead

3. **Error recovery:** What if feature selection fails mid-loop?
   - Restart from beginning?
   - Skip to next iteration?
   - **Suggestion:** Save progress after each story

4. **Feature ordering:** Should features be pre-sorted before iteration?
   - By priority (high to low)?
   - By screen (following screens.yaml)?
   - **Suggestion:** Let AI decide each iteration based on dependencies

5. **Low priority features:** How to handle features marked as ⏬?
   - Track separately and create stories at end?
   - Let AI naturally include them in later iterations?
   - **Suggestion:** AI includes them naturally in later iterations; final check ensures all have implementation stories

## Success Metrics

To evaluate the iterative approach:

- **Coverage:** % of in-scope features appearing in stories
- **Quality:** Story coherence and user value (subjective)
- **Dependencies:** Accuracy of dependency declarations
- **Token usage:** Total tokens vs single-shot
- **Time:** Total execution time vs single-shot
- **Low priority features:** % of ⏬ bullets that have implementation stories within the epic

## Example Iteration Sequence

**Iteration 1:**
- Features: Login form, password field, remember me checkbox
- Story: `st001` Basic Login Form → Core authentication UI

**Iteration 2:**
- Features: Error messages, validation, loading state
- Story: `st002` Login Error Handling → Make login robust
- Dependencies: st001

**Iteration 3:**
- Features: Forgot password link, password reset email
- Story: `st003` Password Reset Flow → Allow users to recover accounts
- Dependencies: st001

**Iteration 4:**
- Features: OAuth buttons, social login integration
- Story: `st004` Social Login Options → Add OAuth authentication
- Dependencies: st001

...and so on until all features covered.

## Recommendation

**I recommend implementing the iterative approach** for the following reasons:

1. **Better quality** - Each story gets focused AI attention
2. **Natural flow** - Dependencies emerge organically from sequence
3. **Easier verification** - Can check feature-to-story mapping at each step
4. **More maintainable** - Simpler prompts, clearer logic
5. **Guaranteed coverage** - Loop ensures all features become stories

The additional complexity of orchestration is worth the improved story quality and feature coverage. The two-prompt pattern (selection → generation) provides clear separation of concerns and makes debugging easier.

Start with the iterative approach as optional (feature flag), test on real epics, then make it the default if results are positive.
