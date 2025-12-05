# Shell Story Generation - Strategy Refactoring

## Overview

Refactor the `writing-shell-stories` tool to support multiple generation strategies, following the same pattern used in `identify-features`. This lays the groundwork for implementing alternative approaches (like the three-prompt consolidate-generate-validate pipeline) without disrupting the current single-prompt strategy.

**Goal**: Extract the current single-prompt approach into its own strategy module, enabling future strategies to be swapped by changing imports (not environment variables).

## Current Architecture

The `writing-shell-stories` tool currently has a flat structure:

```
server/providers/combined/tools/writing-shell-stories/
├── core-logic.ts                    # Main orchestration
├── prompt-shell-stories.ts          # Prompt generation
├── (other helper files...)
```

The prompt generation logic is tightly coupled to `core-logic.ts` via direct imports:
```typescript
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './prompt-shell-stories.js';
```

## Target Architecture

Following the `identify-features` pattern, move strategy-specific code into a `strategies/` folder:

```
server/providers/combined/tools/writing-shell-stories/
├── core-logic.ts                    # Imports from strategies/
├── strategies/
│   └── prompt-shell-stories-1.ts    # Current single-prompt strategy
├── figma-screen-setup.ts
├── screen-analyzer.ts
├── (other helper files...)
```

The strategy is selected by changing the import in `core-logic.ts`:
```typescript
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './strategies/prompt-shell-stories-1.js';  // Easy to swap
```

## Implementation Steps

### Step 1: Create strategies directory and move existing prompt

**Goal**: Extract current prompt logic into a versioned strategy file

**Actions:**
1. Create directory: `server/providers/combined/tools/writing-shell-stories/strategies/`
2. Copy `prompt-shell-stories.ts` to `strategies/prompt-shell-stories-1.ts`
3. Verify the copied file contains:
   - `SHELL_STORY_SYSTEM_PROMPT` constant
   - `SHELL_STORY_MAX_TOKENS` constant  
   - `generateShellStoryPrompt()` function

**Validation:**
- [ ] New file exists at correct path
- [ ] New file compiles without errors (`npm run typecheck`)
- [ ] All three exports are present in the new file

---

### Step 2: Update imports in core-logic.ts

**Goal**: Switch core-logic.ts to import from the new strategy location

**Changes to make:**
```typescript
// BEFORE (around lines 23-27):
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './prompt-shell-stories.js';

// AFTER:
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './strategies/prompt-shell-stories-1.js';
```

**No other changes needed** - The function signatures and behavior remain identical.

**Validation:**
- [ ] File compiles without errors (`npm run typecheck`)
- [ ] No other files import from `./prompt-shell-stories.js` (search workspace)
- [ ] Build succeeds (`npm run build`)

---

### Step 3: Test behavioral equivalence

**Goal**: Verify the refactoring doesn't change any functionality

**Test procedure:**
1. Run the tool against a test epic with Figma screens
2. Compare output with previous runs (if available)
3. Verify:
   - Shell stories are generated successfully
   - Output format matches expectations
   - All temp files are created (prompt, analyses, shell-stories.md)
   - No errors or warnings in logs

**Commands:**
```bash
# Start the server
npm run start-local

# Use MCP client or API to trigger write-shell-stories on test epic
# Check cache/{session}/shell-stories.md output
```

**Validation:**
- [ ] Tool executes without errors
- [ ] Shell stories are generated
- [ ] Output quality is equivalent to before refactoring
- [ ] All debug artifacts (prompt, analyses) are created

---

### Step 4: Clean up old prompt file (optional)

**Goal**: Remove the original `prompt-shell-stories.ts` file to avoid confusion

**Actions:**
1. Verify no other files import from `./prompt-shell-stories.js`
2. Delete `server/providers/combined/tools/writing-shell-stories/prompt-shell-stories.ts`

**Search command:**
```bash
# Check for any remaining imports
grep -r "from './prompt-shell-stories" server/providers/combined/tools/writing-shell-stories/
```

**Validation:**
- [ ] Search returns no results (or only the deleted file)
- [ ] Build succeeds after deletion (`npm run build`)
- [ ] Tool continues to work (repeat Step 3 test)

---

### Step 5: Document the pattern

**Goal**: Add README or comments explaining how to add new strategies

**Add to `writing-shell-stories/README.md`:**
```markdown
## Strategy Pattern

Shell story generation uses a strategy pattern similar to `identify-features`.

### Current Strategies

- **prompt-shell-stories-1.ts** - Single-prompt approach (current default)
  - Generates stories directly from screen analyses
  - Uses 14-step process with evidence-based rules
  - Outputs: shell-stories.md

### Adding a New Strategy

1. Create `strategies/prompt-shell-stories-{n}.ts`
2. Export the same interface:
   - `SHELL_STORY_SYSTEM_PROMPT: string`
   - `SHELL_STORY_MAX_TOKENS: number`
   - `generateShellStoryPrompt(screensYaml, analysisFiles, epicContext?): string`
3. Update the import in `core-logic.ts`:
   ```typescript
   import { ... } from './strategies/prompt-shell-stories-{n}.js';
   ```

### Future Strategies (Planned)

- **prompt-shell-stories-2.ts** - Three-prompt approach
  - Consolidate features → Generate with citations → Validate & clean
  - Reduces hallucinations via feature catalog validation
```

**Validation:**
- [ ] README clearly documents the pattern
- [ ] Examples match actual code structure
- [ ] Instructions are actionable for future developers

---

## Success Criteria

The refactoring is complete when:

1. ✅ **Structure matches identify-features pattern**
   - Strategy code lives in `strategies/` subdirectory
   - Files are versioned (`-1`, `-2`, etc.)
   - Imports use relative paths from core-logic.ts

2. ✅ **No behavior changes**
   - Tool generates identical output
   - All tests pass (if they exist)
   - No new errors or warnings

3. ✅ **Easy to extend**
   - Clear export interface documented
   - Adding new strategy requires only:
     - Create new file in strategies/
     - Change one import line in core-logic.ts

4. ✅ **Build system works**
   - TypeScript compilation succeeds
   - No circular dependencies
   - Runtime behavior unchanged

## Benefits

This refactoring enables:

- **Experimentation**: Test new approaches (like three-prompt pipeline) without risk
- **A/B Comparison**: Run same epic through different strategies, compare outputs
- **Incremental Migration**: Keep old strategy working while developing new one
- **Version History**: Clear evolution of prompt engineering approaches

## Questions

1. Should we keep the old `prompt-shell-stories.ts` file as `prompt-shell-stories-legacy.ts` for reference, or delete it entirely after confirming the refactoring works?

2. Do we want to add a simple test that verifies both strategies produce valid output? (e.g., check that output has `st001`, `SCREENS:`, `DEPENDENCIES:` sections)

3. Should we add a comment in `core-logic.ts` next to the import explaining that this line controls which strategy is used?

4. Do we want to expose the strategy selection via CLI flag or config file for easier switching during development, or is manually editing the import sufficient?
