# Split Shell Story Generation - Design Spec

## Problem Statement

The current single-prompt shell story generation process (13 steps) is complex and error-prone:
- AI sometimes forgets to create deferred implementation stories
- AI sometimes replaces stories instead of appending them
- Long prompt with many instructions increases chance of mistakes
- Difficult to debug which phase is causing issues

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
- Screen analysis file list (titles only, not full content)
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

## Recommendations

### **Start with Option A (Two-Prompt Split)**

**Rationale**:
1. Significant improvement over current single-prompt with manageable complexity
2. Clean conceptual split: planning vs. detailing
3. Solves the immediate problems (deferred stories, story replacement)
4. Easier to implement and debug

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

**Trigger Points for Upgrade**:
- Prompt 1 consistently misses stories
- Prompt 2 discovers many new stories (indicates Prompt 1 insufficient)
- Very large epics with 30+ stories where context size becomes issue

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
