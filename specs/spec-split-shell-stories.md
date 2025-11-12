# Split Shell Story Generation - Design Spec

## Problem Statement

The current single-prompt shell story generation process (14 steps) is complex and error-prone:
- AI sometimes forgets to create deferred implementation stories
- AI sometimes replaces stories instead of appending them
- **AI hallucinates features not present in screens or epic context** (e.g., adding "- Filtering (defer)" to stories where filtering UI doesn't exist)
- Long prompt with many instructions increases chance of mistakes
- Difficult to debug which phase is causing issues
- Epic context guidance gets misinterpreted as feature requirements, leading to speculative stories

## Proposed Solutions

### **Option A: Two-Prompt Split (Planning + Detailing)**

Split into conceptually distinct phases that mirror human workflow.

#### **Prompt 1: Story Planning**
**Goal**: Generate prioritized list of story titles only

**Steps** (simplified from current steps 1-3, 11):
1. Extract epic context (hard constraints, deferrals)
2. Create comprehensive story name list (core + deferred implementation stories)
3. Prioritize by user value (deferred implementations last)
4. Verify sequential numbering

**Input**: 
- Epic description
- Screen analysis files
- Figma metadata summaries

**Output**: Simple numbered list
```markdown
# Final Prioritized Stories

st001: User Login - Basic authentication flow
st002: Dashboard View - Show user overview
st003: Profile Settings - Update user info
...
st015: Implement Advanced Filtering
st016: Implement Data Export
```

**Benefits**:
- Focused task: "What stories exist and in what order?"
- Shorter prompt = less context to track
- Epic context and prioritization are global decisions made together
- Creates stable story numbering that won't change
- **Anti-hallucination: Must cite ANALYSIS screens for each story, making fabricated stories obvious**

#### **Prompt 2: Story Detailing**
**Goal**: Add ANALYSIS, DEPENDENCIES, +, -, ¿ bullets to each story

**Steps** (from current steps 4-9, 12-13):
1. For each story in the list:
   - Cross-reference screens & analysis files
   - Add ANALYSIS bullets
   - Add DEPENDENCIES
   - Add + bullets (must include)
   - Add - bullets (defer/exclude)
   - Add ¿ bullets (questions)
2. Verify evidence for all + bullets
3. Final structure validation

**Input**:
- Story list from Prompt 1
- Epic description
- Full screen analysis files (complete content)
- Figma metadata

**Output**: Fully detailed stories
```markdown
# Final Prioritized Stories

st001: User Login - Basic authentication flow
- ANALYSIS: 
  - login-screen.analysis.md
  - auth-flow.analysis.md
- DEPENDENCIES: none
- + Email/password input fields
- + "Login" button
- + Basic form validation
- - OAuth providers (defer to st017)
- ¿ Password reset flow in this story?
```

**Benefits**:
- Focused task: "What details go in each story?"
- Full screen analysis content only loaded when needed
- Can focus on evidence-based detailing
- Story list is fixed, only adding details
- **Anti-hallucination: Guard checks enforce that + and - bullets reference features from loaded analysis files only**

#### **Handling Prompt 2 Discovered Stories**

**Challenge**: What if Prompt 2 discovers new stories while adding - bullets?

**Solution 1: Allow Controlled Addition**
- Prompt 2 can ADD stories, but CANNOT renumber existing stories
- New stories get appended with next sequential number
- Example:
  ```
  Original list: st001-st016
  Prompt 2 discovers "Export to CSV" should be its own story
  Adds: st017: Export to CSV - Download data as spreadsheet
  Updates dependencies: st003 now depends on st017
  ```
- **Pros**: Flexible, captures missed stories
- **Cons**: Story order might not be optimal

**Solution 2: Two-Pass Detailing**
- Prompt 2A: Detail all stories, collect new story candidates
- Re-run Prompt 1 with new candidates
- Prompt 2B: Detail final story list
- **Pros**: Optimal story order maintained
- **Cons**: More AI calls, more complex orchestration

**Solution 3: Strict No-Addition**
- Prompt 2 CANNOT add stories
- If story is too large, split into +/- bullets only
- Manual review step to identify missing stories
- **Pros**: Simple, predictable
- **Cons**: May miss important stories

**Recommendation**: Start with Solution 3 (no addition), rely on Prompt 1 being comprehensive. If we find this insufficient, move to Solution 1.

---

### **Option B: Three-Prompt Split (Gather, Prioritize, Detail)**

Split the planning phase further for even better focus.

#### **Prompt 1: Story Gatherer**
**Goal**: Identify ALL possible stories from screens

**Steps**:
1. Extract epic context (hard constraints, deferrals)
2. For each screen analysis, identify potential stories
3. For each epic deferral, create implementation story
4. Output comprehensive unsorted list with ANALYSIS references

**Output**:
```markdown
# Discovered Stories (Unsorted)

- User Login
  - ANALYSIS: login-screen.analysis.md
- Dashboard View
  - ANALYSIS: dashboard.analysis.md, sidebar.analysis.md
- Implement Advanced Filtering (epic deferred)
  - ANALYSIS: product-list.analysis.md, filter-panel.analysis.md
...
```

**Benefits**:
- Simple task: "Find all stories"
- Already includes ANALYSIS references for context
- No prioritization complexity
- **Anti-hallucination: Forces explicit citation of which screens contain each feature, evidence trail from the start**

#### **Prompt 2: Story Prioritizer**
**Goal**: Order stories by user value

**Steps**:
1. Review epic priorities
2. Order stories by incremental user value
3. Ensure deferred implementations go last
4. Assign story IDs (st001, st002, etc.)

**Input**: Unsorted story list from Prompt 1

**Output**:
```markdown
# Prioritized Stories

st001: User Login
st002: Dashboard View
...
st015: Implement Advanced Filtering
```

**Benefits**:
- Focused task: "What order?"
- Epic context fresh in mind for prioritization
- Clean separation from story discovery

#### **Prompt 3: Shell Story Detailer (Per-Story)**
**Goal**: Add detailed bullets to ONE story at a time

**Steps**:
1. Load screen analyses referenced in story's ANALYSIS bullets
2. Add DEPENDENCIES (reference other story IDs)
3. Add + bullets (must include)
4. Add - bullets (defer/exclude with forward references)
5. Add ¿ bullets (questions)
6. Verify all + bullets have evidence

**Input**:
- Single story with ANALYSIS references
- Full story list (for dependencies and forward references)
- Full screen analysis files for this story
- Epic description

**Output**: One fully detailed story

**Benefits**:
- Can be parallelized (detail multiple stories at once)
- Only loads relevant screen analyses
- Very focused context
- Easy to retry individual stories
- **Anti-hallucination: Physical constraint - AI can ONLY reference features from the 2-3 analysis files loaded for this story**

#### **Handling Prompt 3 Discovered Stories**

When detailing story st003, if AI discovers new story from - bullets:

**Workflow**:
```typescript
async function detailStory(story, allStories) {
  const result = await ai.generate({
    prompt: buildDetailingPrompt(story, allStories),
    allowNewStories: true
  });
  
  if (result.newStories.length > 0) {
    // Re-run prioritizer with new stories
    const updatedList = await ai.generate({
      prompt: buildPrioritizerPrompt([...allStories, ...result.newStories])
    });
    
    // Re-detail stories that reference the new stories
    // (to update forward references)
    await reDetailAffectedStories(result.newStories, updatedList);
  }
  
  return result.detailedStory;
}
```

**Example Flow**:
1. Detailing st003: "Profile Settings"
2. AI discovers "Avatar Upload" should be separate story
3. Re-run Prioritizer: Inserts "st004: Avatar Upload", renumbers st004→st005, st005→st006, etc.
4. Re-detail st003 with updated forward reference: "- Avatar upload (split to st004)"
5. Continue with st005 (formerly st004)

**Pros**:
- Optimal story order maintained
- Each story is appropriately sized
- Natural discovery process

**Cons**:
- More complex orchestration
- Potential cascading updates
- Need to track which stories need re-detailing

---

## Comparison

| Aspect | Option A (2-Prompt) | Option B (3-Prompt) |
|--------|---------------------|---------------------|
| **Complexity** | Medium | High |
| **AI Calls** | 2 | 3+ (can parallelize Prompt 3) |
| **Context Size** | Prompt 2 loads all analyses | Prompt 3 loads only relevant analyses |
| **Story Discovery** | All upfront in Prompt 1 | Gradual (Prompt 1 initial, Prompt 3 refinement) |
| **Debugging** | Two points of failure | Three points, but easier to isolate |
| **Story Quality** | Good | Potentially better (more focused attention per story) |
| **Epic Context** | Fresh in Prompts 1-2 | Fresh in Prompts 1-2, might fade by Prompt 3 |
| **Hallucination Prevention** | Good (guard checks in Prompt 2) | Excellent (physical context constraint per story) |

## Hallucination Prevention

A critical benefit of splitting prompts is preventing the AI from creating stories or deferrals for features that don't exist in screens or epic context.

### The Hallucination Problem

**Current Single-Prompt Issue:**
```
Epic says: "Defer filtering, sorting, and location map until the end"

AI processes st011: Application Agreement Tab
- Screen shows: Pricing configuration, no filtering/sorting/maps
- AI thinks: "Epic mentioned filtering, I should defer it here"
- Result: st011 gets "- Filtering (defer to st013)" even though filtering UI doesn't exist on this screen
```

This creates noise and confusion - stories reference features that aren't relevant to them.

### How Option A (Two-Prompt Split) Prevents Hallucination

#### **Prompt 1: Story Planning**
```markdown
TASK: Generate story list with ANALYSIS citations

OUTPUT REQUIREMENT:
- st001: Display Basic Applicant List
  * ANALYSIS: applicants-new
- st011: Display Application Agreement Tab
  * ANALYSIS: application-agreement-fixed, application-agreement-rate
- st013: Implement Filtering Feature (epic deferred)
  * ANALYSIS: applicants-new, applicants-in-progress  ← Must cite screens!
```

**Prevention Mechanism:**
- Forces AI to cite which screens contain each feature
- If AI tries to create `st014: Advanced AI Recommendations` without citing screens, it's immediately detectable
- ANALYSIS bullets act as an evidence trail

**Example Validation:**
```
Story: st013: Implement Filtering Feature
ANALYSIS: applicants-new, applicants-in-progress

✅ Valid - Filtering UI appears in these screens
❌ Invalid - If no filtering UI in these screens, prompt fails validation
```

#### **Prompt 2: Story Detailing**
```markdown
TASK: Add details to st011 using ONLY its cited screens

INPUT CONTEXT:
- Story: st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- Loaded files: application-agreement-fixed.md, application-agreement-rate.md

AI searches loaded context for features to defer...
Searches: No filtering, no sorting, no maps found
Result: Clean story with only agreement-related bullets
```

**Prevention Mechanism:**
- Only loads analysis files cited in story's ANALYSIS bullets
- Guard check in Step 6: "Before adding - bullet, can you point to screen where feature is visible?"
- Step 10.D validates every bullet against loaded screen content
- Physical scoping: Can only reference what's loaded

**Guard Check Example:**
```markdown
AI attempts: "- Filtering (defer to st013)"

Guard Check Triggers:
Q: "Can you point to the screen where filtering is visible?"
A: Searches application-agreement-fixed.md and application-agreement-rate.md
   Result: No filtering UI found
Action: DO NOT add this - bullet, remove it entirely
```

### How Option B (Three-Prompt Split) Is Even Better

#### **Prompt 1: Story Gatherer**
```markdown
TASK: List every feature you see + epic-commanded features

OUTPUT:
- Display Application Agreement Tab
  ANALYSIS: application-agreement-fixed, application-agreement-rate
  VISIBLE FEATURES: Pricing config, rate table, term controls
  
- Implement Filtering (epic commanded)
  ANALYSIS: applicants-new, applicants-in-progress
  EPIC DIRECTIVE: "Defer filtering until end"
  VISIBLE FEATURES: Filter dropdowns, status buttons
```

**Prevention Mechanism:**
- Separates feature discovery from prioritization
- Explicit listing of visible features per story
- Epic directives distinguished from screen observations

#### **Prompt 3: Per-Story Detailer**
```markdown
TASK: Detail ONLY st011 using ONLY its 2 analysis files

LOADED CONTEXT (physically constrained):
- application-agreement-fixed.md (15KB)
- application-agreement-rate.md (12KB)

AI cannot possibly reference filtering/sorting/maps because:
- Those files aren't loaded
- No information about those features in context
- Physical impossibility to hallucinate what isn't present
```

**Prevention Mechanism:**
- **Strongest constraint**: AI literally cannot see other features
- Minimal context = minimal hallucination surface area
- Per-story isolation = one story's hallucination doesn't spread to others
- Parallelization allows independent validation per story

**Example Flow:**
```typescript
// Detailing st011: Application Agreement Tab
const story = {
  id: "st011",
  analyses: ["application-agreement-fixed", "application-agreement-rate"]
};

// Load ONLY these 2 files (total ~27KB)
const context = loadAnalyses(story.analyses);

// AI works with minimal, focused context
// Cannot reference filtering (not loaded)
// Cannot reference sorting (not loaded)
// Cannot reference maps (not loaded)

// Output: Clean story with only agreement-specific bullets
```

### Comparison of Anti-Hallucination Mechanisms

| Mechanism | Single Prompt | Option A | Option B |
|-----------|---------------|----------|----------|
| **Context Size** | All analyses (~200KB) | All analyses (~200KB) | Per-story (~30KB) |
| **Evidence Trail** | Post-hoc validation | ANALYSIS citations upfront | ANALYSIS + loaded files list |
| **Scope Enforcement** | Instructions only | Guard checks + loaded context | Physical file constraint |
| **Validation Points** | 3 steps (8, 10.D, 13) | 2 prompts × 2 steps each | 3 prompts with isolated validation |
| **Cascading Errors** | High (one mistake spreads) | Medium (Prompt 1 errors affect all) | Low (per-story isolation) |
| **Debuggability** | Hard to trace | Moderate (2 artifacts) | Easy (per-story artifacts) |

### Real-World Example: Agreement Tab Story

**Current Single Prompt (Hallucination):**
```markdown
st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- DEPENDENCIES: st001
- + Pricing configuration table
- + Rate selection dropdown
- ❌ Status filtering (defer to st013)  ← HALLUCINATED
- ❌ Sorting by columns (defer to st014)  ← HALLUCINATED
- ❌ Location map integration (defer to st015)  ← HALLUCINATED
- ¿ How to validate pricing rules?
```

**Option A (Guard Check Prevention):**
```markdown
st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- DEPENDENCIES: st001
- + Pricing configuration table
- + Rate selection dropdown
- ¿ How to validate pricing rules?

Guard Check Results:
- "Status filtering" - NOT FOUND in application-agreement-* files → REMOVED
- "Sorting" - NOT FOUND in application-agreement-* files → REMOVED
- "Location map" - NOT FOUND in application-agreement-* files → REMOVED
```

**Option B (Physical Constraint Prevention):**
```
Prompt 3 Input Context (only these files loaded):
---
application-agreement-fixed.md:
# Page Structure
Shows pricing configuration table with fixed rate options...

application-agreement-rate.md:
# Page Structure  
Shows rate selection dropdown and term controls...
---

AI searches for features to defer: Finds only pricing/rate features
Result: No filtering/sorting/maps mentioned because they're not in loaded context
```

### Implementation: Adding Hallucination Guards

Both options require specific prompt changes:

**Option A - Prompt 2 Guard Check (Step 6):**
```markdown
6. **PROMOTE MINUSES INTO CANDIDATE STORIES**
   • Turn meaningful - items into new top-level stories
   • GUARD CHECK: Before promoting a - item, verify feature exists:
     ◦ Search THIS story's ANALYSIS files for the feature
     ◦ Can you quote the section describing this feature?
     ◦ Or does epic explicitly command "implement [feature]"?
     ◦ If neither: DO NOT promote - remove the - bullet entirely
   
   EXAMPLE VALIDATION:
   Story: st011 (ANALYSIS: application-agreement-fixed, application-agreement-rate)
   Attempted - bullet: "Filtering (defer to st013)"
   
   Check: Search application-agreement-*.md for "filter" or "filtering"
   Result: Not found
   Action: Remove this - bullet (feature not in story's screens)
```

**Option B - Prompt 3 Context Constraint:**
```typescript
// Build prompt with explicit file list
const prompt = `
You are detailing story st011: Display Application Agreement Tab

LOADED ANALYSIS FILES (these are your ONLY sources):
1. application-agreement-fixed.md
2. application-agreement-rate.md

CRITICAL RULE:
- Only add + or - bullets for features explicitly described in these 2 files
- Do NOT reference features from other stories
- Do NOT assume features that "should" exist
- If a feature isn't in these 2 files, it doesn't exist for this story

[Full content of 2 files follows...]
`;
```

### Success Metrics for Hallucination Prevention

Track these metrics before/after split:

| Metric | Single Prompt | Target (Split) |
|--------|---------------|----------------|
| **Stories with hallucinated - bullets** | 12/17 (71%) | <20% |
| **False deferrals per story** | 3.2 avg | <0.5 avg |
| **Stories requiring manual cleanup** | 8/17 (47%) | <3/17 (18%) |
| **Evidence validation failures** | 45% of bullets | <10% of bullets |
| **User-reported "irrelevant deferral" issues** | 5 per epic | <1 per epic |

### Future Enhancement: Automated Validation

Add post-generation validation:
```typescript
async function validateStoryEvidence(story, analysisFiles) {
  for (const bullet of story.plusBullets) {
    const evidence = findEvidence(bullet.text, analysisFiles);
    if (!evidence) {
      console.warn(`❌ No evidence for: ${bullet.text}`);
      bullet.flagged = true;
    }
  }
  
  for (const bullet of story.minusBullets) {
    const evidence = findEvidence(bullet.feature, story.analysisFiles);
    if (!evidence) {
      console.warn(`❌ Hallucinated deferral: ${bullet.feature} not in ${story.id}'s screens`);
      bullet.flagged = true;
    }
  }
}
```

This automated check could run after generation to flag suspicious bullets for human review.

## Recommendations

### **Start with Option A (Two-Prompt Split)**

**Rationale**:
1. Significant improvement over current single-prompt with manageable complexity
2. Clean conceptual split: planning vs. detailing
3. Solves the immediate problems (deferred stories, story replacement, **feature hallucination**)
4. Easier to implement and debug
5. **ANALYSIS citations provide evidence trail, guard checks prevent fabricated deferrals**

**Implementation Priority**:
1. Create `prompt-shell-stories-planning.ts` (steps 1-3, 11)
2. Create `prompt-shell-stories-detailing.ts` (steps 4-9, 12-13)
3. Update tool orchestration to call sequentially
4. Test with real epic

### **Consider Option B as Future Enhancement**

If Option A still has issues:
- Story Gatherer makes story discovery even simpler
- Per-story detailing allows parallelization for speed
- Better memory efficiency (only load relevant analyses per story)
- **Strongest hallucination prevention (physical context constraint)**

**Trigger Points for Upgrade**:
- Prompt 1 consistently misses stories
- Prompt 2 discovers many new stories (indicates Prompt 1 insufficient)
- Very large epics with 30+ stories where context size becomes issue
- **Hallucination rate still >20% with Option A (Option B's physical constraint would help)**

---

## Implementation Notes

### Context Passing Between Prompts

**Option A**:
```typescript
// Prompt 1 output
const storyList = `
st001: User Login
st002: Dashboard View
...
`;

// Prompt 2 input
const detailingPrompt = `
${epicContext}

# Story List to Detail
${storyList}

# Screen Analyses
${screenAnalyses}

Instructions: For each story above, add ANALYSIS, DEPENDENCIES, +, -, ¿ bullets...
`;
```

**Option B**:
```typescript
// Prompt 1 output (with ANALYSIS already)
const discoveredStories = [
  { title: "User Login", analyses: ["login-screen.analysis.md"] },
  { title: "Dashboard View", analyses: ["dashboard.analysis.md", "sidebar.analysis.md"] }
];

// Prompt 2 input
const prioritizerPrompt = `
${epicContext}
${JSON.stringify(discoveredStories)}
Instructions: Order these stories by user value...
`;

// Prompt 3 input (per story)
const detailingPrompt = `
${epicContext}

# Story to Detail
st003: ${story.title}

# All Stories (for dependencies/references)
${allStoryIds}

# Relevant Analyses
${loadAnalyses(story.analyses)}

Instructions: Add detailed bullets...
`;
```

### File Organization

```
server/providers/combined/tools/writing-shell-stories/
├── index.ts                           # Tool entry point, orchestration
├── prompt-shell-stories.ts            # DEPRECATED (current single prompt)
├── prompt-story-planning.ts           # NEW: Prompt 1 (Option A)
├── prompt-story-detailing.ts          # NEW: Prompt 2 (Option A)
├── prompt-story-gatherer.ts           # FUTURE: Prompt 1 (Option B)
├── prompt-story-prioritizer.ts        # FUTURE: Prompt 2 (Option B)
├── prompt-story-detailer.ts           # FUTURE: Prompt 3 (Option B)
└── prompt-screen-analysis.ts          # Existing screen analysis prompt
```

### Error Handling

**Option A**:
- If Prompt 1 fails: Retry or fail entire operation
- If Prompt 2 fails: Could retry just detailing with same story list

**Option B**:
- If Prompt 1 fails: Retry or fail
- If Prompt 2 fails: Retry prioritization with same discovered stories
- If Prompt 3 fails for story X: Retry just that story, others unaffected

---

## Success Metrics

Track these to validate improvement:
1. **Correctness**: % of runs where all deferred stories are created
2. **Stability**: % of runs where story numbering is sequential with no gaps/replacements
3. **Completeness**: Average number of stories discovered vs. expected
4. **Evidence Quality**: % of + bullets that have clear evidence in analyses
5. **Manual Edits**: How many stories need human correction after generation
6. **Hallucination Rate**: % of stories with irrelevant - bullets (features not in their screens)
7. **False Deferral Count**: Average number of incorrect deferrals per story

Compare before/after split implementation.

---

## Migration Strategy

1. **Phase 1**: Implement Option A alongside existing single-prompt
   - Keep `prompt-shell-stories.ts` as fallback
   - Add feature flag to use new two-prompt system
   - A/B test on real epics

2. **Phase 2**: Default to Option A if metrics improve
   - Deprecate single-prompt
   - Document known limitations

3. **Phase 3** (if needed): Implement Option B
   - Start with Story Gatherer + Prioritizer (reuse existing detailer)
   - If that works, split detailer into per-story prompts
   - Enable parallelization

---

## Open Questions

1. **Token costs**: Will 2-3 prompts cost significantly more than 1 large prompt?
   - Mitigation: Prompt 1 uses less context (no full analyses), Prompt 3 can be parallelized

2. **Consistency**: Will splitting reduce coherence across stories?
   - Mitigation: Pass epic context to all prompts, include story list for cross-references

3. **Latency**: Will sequential prompts take too long?
   - Mitigation: Option B allows parallelization, streaming could show progress

4. **When to stop iterating**: If Prompt 3 keeps discovering new stories, when do we stop?
   - Mitigation: Set max iterations (e.g., 2 rounds of discovery), or require manual approval for new stories

---

## Implementation Plan (Option A - Two-Prompt Split)

### Phase 1: Create Prompt Files

#### File 1: `prompt-story-planning.ts`

**Purpose**: Extract steps 1-3, 11 from current prompt to generate prioritized story list with titles only.

**Key Changes from Current Prompt**:
- Remove all detailing steps (4-9, 12-13)
- Focus only on story discovery and prioritization
- Input uses screen analysis **summaries** instead of full content (lighter context)
- Output is simple numbered list with ANALYSIS references (which screens each story relates to)
- Creates implementation stories for epic-deferred features at the end

**Function Signature**:
```typescript
export function generateStoryPlanningPrompt(
  screensYaml: string,
  analysisFileSummaries: Array<{ screenName: string; summary: string }>,
  epicContext?: string
): string
```

**Output Format**:
```markdown
# Final Prioritized Stories

- st001: Display Basic Applicant List - Show applicant names in a simple list
  * ANALYSIS: applicants-new
- st002: Display In Progress Applicants - Show applicants with in-progress status
  * ANALYSIS: applicants-in-progress
...
- st013: Implement Sorting Feature - Add sortable columns to applicant lists
  * ANALYSIS: applicants-new, applicants-in-progress, applicants-complete
- st014: Implement Location Map - Add interactive map for applicant location
  * ANALYSIS: application-map
```

**Critical Rules Added**:
- "Only create implementation stories for features that actually appear in the screen analyses" (prevents speculative stories)
- "Do NOT add detailed bullets yet - this is planning phase only"
- Epic context section emphasizes creating implementation stories at END of list
- **"Each story MUST cite ANALYSIS screens - if you cannot cite a screen, the story is invalid"**
- **"Distinguish between epic commands ('implement X') and epic context ('X is important') - only commands create stories"**

#### File 2: `prompt-story-detailing.ts`

**Purpose**: Extract steps 4-9, 12-13 from current prompt to add detailed bullets to pre-existing story list.

**Key Changes from Current Prompt**:
- Remove story discovery and prioritization steps (1-3, 11)
- Input includes **prioritized story list from Prompt 1** as context
- Input uses **full screen analysis content** (needed for evidence-based detailing)
- **CRITICAL NEW RULE**: Only defer features visible in THIS story's screens

**Function Signature**:
```typescript
export function generateStoryDetailingPrompt(
  storyList: string,
  analysisFiles: Array<{ screenName: string; content: string }>,
  epicContext?: string
): string
```

**Critical Rules Added**:

```markdown
## CRITICAL RULE: DEFER ONLY VISIBLE FEATURES

• Only add - bullets for features that appear in THIS story's screen analyses
• Do NOT add global deferrals to unrelated stories
• GUARD CHECK: Before adding any - bullet, search the story's ANALYSIS files for the feature
• If feature not found in story's screens, DO NOT add the - bullet
• Example violations to AVOID:
  ❌ Adding "- Filtering (defer)" to Agreement Tab story when filtering isn't on Agreement tab
  ❌ Adding "- Location map (defer)" to every story when location map only appears in Location tab story
  ❌ Adding "- TruthFilter (defer)" to stories that don't involve the Checks screen
```

**Strong Examples Section**:
```markdown
### CORRECT: Deferring features visible in story's screens

Story: st001: Display Basic Applicant List
- ANALYSIS: applicants-new
- Screen shows: Table with names, status filter buttons, sort arrows
- ✅ Correct - bullets:
  * ❌ Status filtering (defer to st013) ← Filter buttons are VISIBLE
  * ❌ Sorting by Submitted column (defer to st014) ← Sort arrows are VISIBLE

### INCORRECT: Deferring features not in story's screens

Story: st011: Display Application Agreement Tab
- ANALYSIS: application-agreement-fixed, application-agreement-rate
- Screen shows: Pricing configuration, no filtering/sorting/maps
- ❌ WRONG - bullets:
  * ❌ Status filtering (defer) ← NO filtering UI on Agreement tab
  * ❌ Location map (defer) ← NO map on Agreement tab
- ✅ Correct: NO - bullets for filtering/maps (they don't appear here)
```

### Phase 2: Update Tool Orchestration

Modify `generateShellStoriesFromAnalyses` function in `write-shell-stories.ts`:

**Current Flow (Single Prompt)**:
```typescript
// Read all analysis files (full content)
const analysisFiles = await readAllAnalysisFiles(screens, tempDirPath);

// Generate single prompt with everything
const prompt = generateShellStoryPrompt(screensYaml, analysisFiles, epicContext);

// One AI call
const shellStories = await mcp.sampling.createMessage(prompt, ...);
```

**New Flow (Two Prompts)**:
```typescript
// PROMPT 1: Planning - use analysis summaries only
const analysisSummaries = await generateAnalysisSummaries(screens, tempDirPath);

const planningPrompt = generateStoryPlanningPrompt(
  screensYaml,
  analysisSummaries,
  epicContext
);

await notify('Phase 5.1: Planning story list...', startProgress);

const storyListResponse = await mcp.server.request({
  method: "sampling/createMessage",
  params: {
    messages: [{ role: "user", content: { type: "text", text: planningPrompt } }],
    systemPrompt: STORY_PLANNING_SYSTEM_PROMPT,
    maxTokens: STORY_PLANNING_MAX_TOKENS,
    speedPriority: 0.5
  }
}, CreateMessageResultSchema);

const storyList = storyListResponse.content?.text as string;

// Save intermediate result for debugging
await fs.writeFile(
  path.join(tempDirPath, 'story-list.md'),
  storyList,
  'utf-8'
);

// PROMPT 2: Detailing - use full analysis content
const analysisFiles = await readAllAnalysisFiles(screens, tempDirPath);

const detailingPrompt = generateStoryDetailingPrompt(
  storyList,
  analysisFiles,
  epicContext
);

await notify('Phase 5.2: Adding story details...', startProgress + 0.5);

const shellStoriesResponse = await mcp.server.request({
  method: "sampling/createMessage",
  params: {
    messages: [{ role: "user", content: { type: "text", text: detailingPrompt } }],
    systemPrompt: STORY_DETAILING_SYSTEM_PROMPT,
    maxTokens: STORY_DETAILING_MAX_TOKENS,
    speedPriority: 0.5
  }
}, CreateMessageResultSchema);

const shellStoriesText = shellStoriesResponse.content?.text as string;
```

**Helper Function to Add**:
```typescript
/**
 * Generate analysis summaries for story planning
 * Extracts just the key metadata from each analysis file
 */
async function generateAnalysisSummaries(
  screens: Array<{ name: string; url: string; notes: string[] }>,
  tempDirPath: string
): Promise<Array<{ screenName: string; summary: string }>> {
  const summaries: Array<{ screenName: string; summary: string }> = [];
  
  for (const screen of screens) {
    const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      
      // Extract first ~500 chars or first section as summary
      // This gives AI enough context to identify stories without full details
      const lines = content.split('\n');
      const summaryLines = lines.slice(0, 20); // First 20 lines
      const summary = summaryLines.join('\n');
      
      summaries.push({ screenName: screen.name, summary });
    } catch (error: any) {
      console.log(`    ⚠️ Could not read analysis for ${screen.name}: ${error.message}`);
    }
  }
  
  return summaries;
}
```

### Phase 3: Add Feature Flag

Add environment variable or configuration to toggle between approaches:

```typescript
// In write-shell-stories.ts
const USE_SPLIT_PROMPTS = process.env.USE_SPLIT_SHELL_STORY_PROMPTS === 'true';

if (USE_SPLIT_PROMPTS) {
  console.log('  Using two-prompt split approach (planning + detailing)');
  return await generateShellStoriesWithSplitPrompts({
    mcp, screens, tempDirPath, yamlPath, notify, startProgress, epicContext
  });
} else {
  console.log('  Using single-prompt approach (legacy)');
  return await generateShellStoriesFromAnalyses({
    mcp, screens, tempDirPath, yamlPath, notify, startProgress, epicContext
  });
}
```

**Environment Variable**:
```bash
# Enable split prompts
export USE_SPLIT_SHELL_STORY_PROMPTS=true

# Use legacy single prompt (default)
export USE_SPLIT_SHELL_STORY_PROMPTS=false
```

### Phase 4: Testing Strategy

**Test Cases**:

1. **Test: Excessive Deferral Repetition (The Original Issue)**
   - Epic with: "delay filtering, sorting, TruthFilter, location map until the end"
   - Screens: applicants-new, applicants-in-progress, application-agreement, application-map
   - **Expected**: 
     - Stories st001-st002 (applicant lists) defer filtering/sorting (visible in those screens)
     - Story for Agreement tab has NO deferrals (filtering/sorting not visible)
     - Implementation stories st0XX-st0YY at end for filtering, sorting, TruthFilter, map
   - **Validates**: Fix for excessive repetition issue

2. **Test: Deferred Implementation Stories Created**
   - Epic with: "defer advanced reporting and export until the end"
   - **Expected**:
     - Early stories defer these features with forward references
     - Final stories implement "Implement Advanced Reporting" and "Implement Export Feature"
   - **Validates**: Epic deferrals produce implementation stories

3. **Test: Out of Scope Features Excluded**
   - Epic with: "Header and footer are out of scope"
   - Screens showing header/footer
   - **Expected**: No stories for header/footer created
   - **Validates**: Out-of-scope exclusion works

4. **Test: Story Numbering Sequential**
   - Any epic with 10+ stories
   - **Expected**: Stories numbered st001, st002, ..., st010, st011 with no gaps
   - **Validates**: No story replacement issues

**Comparison Metrics**:

Run same epic through both approaches and compare:

| Metric | Single Prompt | Split Prompts | Target |
|--------|--------------|---------------|--------|
| Stories with irrelevant - bullets | 12/17 (71%) | 2/17 (12%) | <20% |
| Epic deferrals with implementation stories | 2/4 (50%) | 4/4 (100%) | 100% |
| Story numbering gaps | 1 | 0 | 0 |
| Manual corrections needed | 8 | 2 | <3 |
| Total tokens used | ~12K | ~15K | <20K |
| Generation time | 45s | 65s | <90s |

### Phase 5: Rollout Plan

1. **Week 1: Implementation**
   - Create `prompt-story-planning.ts` and `prompt-story-detailing.ts`
   - Add `generateShellStoriesWithSplitPrompts` function
   - Add feature flag
   - Test with 3 sample epics

2. **Week 2: Validation**
   - A/B test on 10 real epics (5 single, 5 split)
   - Collect metrics
   - Gather user feedback on story quality

3. **Week 3: Decision**
   - If metrics show improvement: Set `USE_SPLIT_SHELL_STORY_PROMPTS=true` as default
   - If no improvement: Keep as opt-in, investigate issues
   - If worse: Deprecate and analyze failure modes

4. **Week 4: Cleanup**
   - If successful: Deprecate single prompt, update docs
   - If failed: Remove split prompt code

### Known Risks & Mitigations

**Risk 1: Increased Token Cost**
- Split prompts may use 20-30% more tokens
- **Mitigation**: Monitor costs, optimize if needed (e.g., more aggressive summary for Prompt 1)

**Risk 2: Inconsistency Between Prompts**
- Story list from Prompt 1 might not perfectly align with details in Prompt 2
- **Mitigation**: Pass epic context to both prompts, include clear cross-references

**Risk 3: Longer Execution Time**
- Two sequential AI calls vs. one
- **Mitigation**: Acceptable tradeoff for quality, can optimize later with parallel processing

**Risk 4: Prompt 1 Misses Stories**
- Planning prompt might not identify all necessary stories
- **Mitigation**: Comprehensive testing, allow Prompt 2 to flag missing stories in future iteration

### Future Enhancements (Option B)

If Option A shows promise but still has issues:

1. **Per-Story Parallelization**
   - Split Prompt 2 into individual story detailing calls
   - Run in parallel for speed
   - Only load relevant analyses per story

2. **Iterative Discovery**
   - Allow Prompt 2 to suggest new stories
   - Re-run Prompt 1 with discoveries
   - Maximum 2 iterations to prevent infinite loops

3. **Three-Prompt Split**
   - Implement full Option B (Gatherer, Prioritizer, Detailer)
   - For very large epics (30+ stories)
