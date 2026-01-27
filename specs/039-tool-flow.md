# Tool Flow Documentation

## Overview

This document describes the user-facing story writing tools in cascade-mcp and how they work together.

## User-Facing Story Writing Tools

### `figma-review-design`

**Purpose**: Designer-focused tool for early design review and feedback (no Jira required).

**Key Features**:
- Analyzes Figma screen designs directly from Figma URLs
- Reads existing Figma comments and design notes as context
- Generates clarifying questions about unclear behaviors, edge cases, and missing requirements
- Posts questions as comments directly on relevant Figma frames
- Returns list of generated questions organized by screen
- Handles Figma rate limits (25 req/min) with consolidation fallback
- Requires only Figma authentication (no Atlassian needed)

**Parameters**:
- `figmaUrls` (array): One or more Figma URLs to analyze
- `contextDescription` (optional): Context including scope guidance (what's in-scope, out-of-scope, already implemented, etc.)

**Use Case**: Early design review - get feedback on Figma designs before creating Jira stories.

---

### `write-shell-stories`

**Purpose**: Epic planning - create high-level story plan for breaking down large features.

**Key Features**:
- **Self-healing**: Automatically checks if enough information exists to write stories
- If questions need clarification: Creates "## Scope Analysis" section and asks user to re-run
- If questions are answered: Creates "## Shell Stories" section with implementation plan
- Reads Figma comments from `figma-review-design` to reduce questions
- References linked Confluence pages and Google Docs for story planning context
- Handles Jira's 43,838 character limit by moving Scope Analysis to comments if needed

**Parameters**:
- `epicKey`: Jira epic key (e.g., "PROJ-123")
- `cloudId` (optional): Jira cloud ID
- `siteName` (optional): Jira site subdomain (alternative to cloudId)

**Use Case**: Breaking down an epic into implementation chunks. Run multiple times until tool is ready.

**Example flow:**
```
User: write-shell-stories(PROJ-123)
Tool: "Found 8 questions. Added Scope Analysis section. Please answer and re-run."

[User answers questions]

User: write-shell-stories(PROJ-123)  
Tool: "All questions answered. Shell stories created ✓"
```

---

### `write-next-story`

**Purpose**: Write the next detailed story from an epic's shell stories.

**Key Features**:
- **PREREQUISITE**: Epic must contain "## Shell Stories" section (created by `write-shell-stories`)
- Writes one detailed story at a time from shell story plan
- Validates dependencies before writing
- References linked Confluence and Google Docs for technical details
- Creates new Jira issue with full acceptance criteria

**Parameters**:
- `epicKey`: Jira epic key (e.g., "PROJ-123")
- `cloudId` (optional): Jira cloud ID
- `siteName` (optional): Jira site subdomain (alternative to cloudId)

**Use Case**: Incremental story generation from an epic - write stories one at a time as team is ready.

---

### `write-story` (Planned)

**Purpose**: One-shot story creation for small features and bug fixes (no epic needed).

**Key Features**:
- **Self-healing**: Automatically checks if enough information exists
- If many questions (>5): Returns questions and asks for clarification
- If few questions (≤5): Writes the story immediately
- Reads Figma comments if designs are linked
- No intermediate artifacts unless questions need answering

**Parameters** (proposed):
- `issueKey`: Jira issue key (e.g., "PROJ-456")
- `figmaUrls` (optional): Figma design URLs
- `contextDescription` (optional): Additional context

**Use Case**: Quick story writing for small features, bug fixes, or standalone work.

---

## Recommended Workflows

### Epic with Figma Designs

**Option 1: With designer review**
```
1. figma-review-design → Designer answers questions in Figma
2. write-shell-stories → Creates shell story plan (fewer questions due to Figma answers)
3. write-next-story → Write detailed stories one at a time
```

**Option 2: Without designer review**
```
1. write-shell-stories → May need multiple runs to answer questions
2. write-next-story → Write detailed stories one at a time
```

### Single Story

```
write-story → Self-healing, may need re-run if questions arise
```

---

## Deprecated Tools

### `analyze-feature-scope` (Deprecated)

**Replaced by:** Self-healing behavior in `write-shell-stories`

**Migration:** Just call `write-shell-stories` directly. It will automatically check for questions and create a Scope Analysis section only if needed.

**Why deprecated:** Forced users to understand and manually orchestrate a multi-step workflow. New approach: tools guide users through iterations automatically.

## Documentation Context

All combined tools automatically process linked documentation:
- **Confluence pages**: Cached with 7-day retention, timestamp-based validation
- **Google Docs**: Cached with modifiedTime-based invalidation
- Scored for relevance to each tool's specific needs
- Prompts include source tags for AI disambiguation



## The issue 

Some background:

We originally just wanted  `write-shell-stories`. 

However, we added `analyze-feature-scope` because:

- There were almost always so many questions that needed answering to build stories
- `analyze-feature-scope` did some pre-thinking about what the features were, so when we ran `write-shell-stories` stories later, `write-shell-stories` was more accurate as it just had to focus on moving the features to build around.  


However, designers wanted the `figma-review-design` feature because they wanted the feedback on their design.

Now I want to solve two different problems:

- I want to allow `figma-design-review` to work well with the other tools. 

  The other tools are able to make use of the comments and answers we'd get from figma.

  However, we might not need to have people run both `analyze-feature-scope` and `write-shell-stories`. I'm thinking it might be easier if `write-shell-stories` can see if `analyze-feature-scope` didn't run (by checking for a Scope Analysis section), it will run analyze-feature-scope and if there aren't many questions, it will run `write-shell-stories`.

  Perhaps `write-shell-stories` just does this by default.  

- Also, sometimes instead of creating an epic with stories, I want to be able to create a single story.  Instead of `write-next-story`, we might want a `write-story`. It should also run something like `analyze-feature-scope` automatically, and see how many questions come out. If most questions are answered, it should write the story.

## Feedback

### Problem 1: `write-shell-stories` auto-running `analyze-feature-scope`

**Proposal:** If no "Scope Analysis" section exists, `write-shell-stories` should automatically run scope analysis, and only proceed with shell stories if there aren't many questions.

**Concerns:**

1. **Time/Cost** - Running both tools sequentially could take 5-10+ minutes and multiple LLM calls. Users might want to review scope analysis questions before continuing.

2. **Question threshold** - "If there aren't many questions" is subjective. What's the cutoff? 5? 10? Per screen?

3. **User expectation mismatch** - If auto-running generates many questions, users get both scope analysis AND questions but no shell stories (the thing they asked for). Better to fail fast with clear instructions.

**Alternative approach:**

Make `write-shell-stories` auto-run a lightweight scope check:
- Analyze Figma designs + comments + epic context (don't write Scope Analysis section yet)
- Count questions that need clarification
- **If questions ≤ threshold (e.g., 3)**: Generate shell stories directly (skip Scope Analysis artifact)
- **If questions > threshold**: Write Scope Analysis section with questions, return to user for clarification
- On re-run after questions answered: Generate shell stories

**Key insight:** Scope Analysis is a tool for asking questions, not a required artifact. If there are no/few questions, skip it and go straight to shell stories.

**Benefits:**
- Simple cases (designer answered everything in Figma) → One-click shell stories
- Complex cases (many unclear requirements) → Force clarification first via Scope Analysis
- Epic description stays cleaner when no questions need asking

---

### Problem 2: Single story creation with `write-story`

**Proposal:** A new tool that analyzes scope automatically and writes a single story if questions are mostly answered.

**This makes more sense!** Here's why:

- **Smaller scope** - Single story = fewer questions to surface
- **Faster iteration** - Perfect for small features or bug fixes
- **Self-contained** - Users expect a "one-shot" tool to do everything needed

**Suggested flow:**

```
write-story({issueKey, figmaUrls?}) →
  1. Fetch issue/epic context
  2. Analyze Figma designs (mini scope analysis, not written anywhere)
  3. Count questions
  4. If <5 questions: Write the story
  5. If ≥5 questions: Return questions and ask user to clarify context
```

**Key difference from epic workflow:**

- **Epic workflow**: Scope analysis → Shell stories → Full stories (multi-stage, saves intermediate results)
- **Single story**: Quick analysis → Write story (single-stage, no intermediate artifacts unless it fails)

**Integration with `figma-review-design`:**

If `figma-review-design` has already been run on the linked Figma designs:
- Read resolved comment threads as answered questions
- Use unresolved threads as additional context
- Reduce the question count based on what's already been clarified

---

## Proposed Solution: Self-Healing Tools

### Deprecate `analyze-feature-scope` as a standalone tool

**New user experience:**
- Users call `write-shell-stories` or `write-story` directly
- Tools automatically check if they have enough information to proceed
- If questions need answering, tool returns questions and asks user to re-run after clarification
- User iterates until tool considers itself ready

**Example flow:**

```
User: write-shell-stories(PROJ-123)
Tool: "I found 12 questions that need clarification. I've added them to the Scope Analysis section. 
      Please answer these questions and run write-shell-stories again."

[User answers questions in Jira]

User: write-shell-stories(PROJ-123)
Tool: "I found 2 remaining questions, but proceeding with shell stories since most are answered.
      Shell stories created ✓"
```

**Benefits:**
1. **Simpler mental model** - "Just run the tool you want, it'll tell you if it needs help"
2. **Fewer artifacts** - Scope Analysis only created when needed
3. **Iterative refinement** - Tools guide users through clarification process
4. **Designer-friendly** - If `figma-review-design` was used first, fewer iterations needed

**Migration:**
- Keep `analyze-feature-scope` for backward compatibility but mark as deprecated
- Document new workflow in readme
- Update tool descriptions to recommend direct usage of `write-shell-stories`/`write-story` 

