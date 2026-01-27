# Quickstart: Self-Healing Story Writing

**Feature**: 039-self-healing-tools  
**Audience**: Users migrating from `analyze-feature-scope` workflow

## What Changed?

### Old Workflow (Manual Two-Step)
```
1. Run analyze-feature-scope → Creates "## Scope Analysis" section
2. Answer questions in Jira
3. Run write-shell-stories → Creates "## Shell Stories" section
```

### New Workflow (Automatic One-Step)
```
1. Run write-shell-stories → Automatically checks for questions
   - If ≤5 questions: Creates shell stories immediately
   - If >5 questions: Creates Scope Analysis, asks you to re-run
2. Answer questions in Jira (if needed)
3. Re-run write-shell-stories → Recognizes answers, proceeds
```

## Quick Start

### Scenario 1: Well-Documented Designs (Happy Path)

Your Figma designs are complete with clear descriptions.

```bash
# Just run write-shell-stories - it handles everything!
POST /api/write-shell-stories
{
  "epicKey": "PROJ-123",
  "siteName": "yourcompany"
}

# Response: Shell stories created immediately
{
  "success": true,
  "action": "proceed",
  "storyCount": 8,
  "questionCount": 2,
  "message": "Shell stories created successfully!"
}
```

**Result**: Epic now has "## Shell Stories" section with 8 stories. The 2 remaining questions are below the threshold, so you can address them later if needed.

---

### Scenario 2: Incomplete Requirements (Needs Clarification)

Your Figma designs have some unclear areas.

```bash
# Step 1: Run write-shell-stories
POST /api/write-shell-stories
{
  "epicKey": "PROJ-456",
  "siteName": "yourcompany"
}

# Response: Too many questions, Scope Analysis created
{
  "success": true,
  "action": "clarify",
  "questionCount": 12,
  "message": "Scope Analysis created with 12 questions. Please answer and re-run.",
  "nextSteps": [
    "Review the Scope Analysis section in the epic",
    "Answer the ❓ questions",
    "Re-run 'write-shell-stories'"
  ]
}
```

**Step 2: Answer Questions**

Go to Jira, find the "## Scope Analysis" section, and add answers:

```markdown
## Scope Analysis

### Questions
- ❓ How should errors be handled?
  → Display toast notification and log to console
  
- ❓ What are the performance requirements?
  → Page load < 2 seconds, API response < 500ms
```

**Step 3: Re-run**

```bash
POST /api/write-shell-stories
{
  "epicKey": "PROJ-456",
  "siteName": "yourcompany"
}

# Response: Analysis regenerated, fewer questions
{
  "success": true,
  "action": "regenerate",
  "questionCount": 4,
  "message": "Scope Analysis regenerated. 4 questions remain."
}
```

Continue answering questions and re-running until `questionCount ≤ 5`, then shell stories will be created automatically.

---

### Scenario 3: Using Figma Comments (Advanced)

Designer runs `figma-review-design` first, answering questions in Figma comments.

```bash
# Step 1: Designer reviews designs
POST /api/figma-review-design
{
  "figmaUrl": "https://figma.com/file/abc123...",
  "siteName": "yourcompany"
}

# Figma now has comment threads with answers

# Step 2: PM runs write-shell-stories (automatically reads comments)
POST /api/write-shell-stories
{
  "epicKey": "PROJ-789",
  "siteName": "yourcompany"
}

# Response: Fewer questions because Figma comments provided answers
{
  "success": true,
  "action": "proceed",
  "storyCount": 10,
  "questionCount": 3,
  "message": "Shell stories created! Figma comments resolved 8 questions."
}
```

**Result**: The tool automatically reads Figma comments and marks questions as answered (💬) if comments provide sufficient context.

---

## Migration Guide

### If You Were Using `analyze-feature-scope`

**Before (deprecated workflow)**:
```bash
# Step 1: Analyze scope
POST /api/analyze-feature-scope
{ "epicKey": "PROJ-123", "siteName": "yourcompany" }

# Step 2: Answer questions in Jira

# Step 3: Write stories
POST /api/write-shell-stories
{ "epicKey": "PROJ-123", "siteName": "yourcompany" }
```

**After (new workflow)**:
```bash
# Just run write-shell-stories - it does scope analysis automatically!
POST /api/write-shell-stories
{ "epicKey": "PROJ-123", "siteName": "yourcompany" }

# If questions > 5, answer them and re-run
POST /api/write-shell-stories
{ "epicKey": "PROJ-123", "siteName": "yourcompany" }
```

### Backward Compatibility

`analyze-feature-scope` still works if you prefer the manual workflow:

```bash
# Still supported (but deprecated)
POST /api/analyze-feature-scope
{ "epicKey": "PROJ-123", "siteName": "yourcompany" }

# Tool description shows deprecation notice
# Documentation recommends using write-shell-stories instead
```

---

## Understanding the Response

### Response Fields

| Field | Description | When Present |
|-------|-------------|--------------|
| `action` | Decision made by tool | Always |
| `questionCount` | Number of ❓ questions | Always |
| `storyCount` | Number of shell stories | Only when `action="proceed"` |
| `scopeAnalysisContent` | Markdown of analysis | Only when `action="clarify"` or `"regenerate"` |
| `shellStoriesContent` | Markdown of stories | Only when `action="proceed"` |
| `nextSteps` | Suggested actions | Always |

### Action Values

| Action | Meaning | What to Do |
|--------|---------|------------|
| `proceed` | Stories created | Review shell stories, use `write-next-story` |
| `clarify` | New scope analysis created | Answer ❓ questions, re-run tool |
| `regenerate` | Existing analysis updated | Answer remaining ❓, re-run tool |

### Question Markers

| Marker | Meaning | Counts Toward Threshold? |
|--------|---------|--------------------------|
| ❓ | Unanswered question | Yes (blocks if >5) |
| 💬 | Answered question | No (doesn't block) |

---

## Tips & Best Practices

### 1. Start with Clear Designs

The better your Figma designs (descriptions, labels, flows), the fewer questions the tool will ask.

**Good**: "Login button - validates email format, shows error toast if invalid"
**Bad**: "Button"

### 2. Use Epic Context

Add high-level context to your epic description before running the tool:

```markdown
# Mobile Banking App - MVP

This MVP focuses on basic account viewing and transfers.

**In Scope**:
- View account balance
- Transfer between own accounts
- Transaction history

**Out of Scope**:
- Bill payments
- External transfers
- Budgeting features
```

This helps the LLM understand scope boundaries and ask better questions.

### 3. Answer Questions in Context

When answering questions, add context inline rather than just "yes/no":

**Good**:
```markdown
- ❓ How should errors be handled?
  → Show toast notification with retry button. Log errors to Sentry.
```

**Bad**:
```markdown
- ❓ How should errors be handled?
  → Yes
```

### 4. Leverage Figma Comments

If you're working with designers, have them run `figma-review-design` first. Their answers in Figma comments will automatically reduce the questions you see.

### 5. Iterate Quickly

Don't try to answer all questions perfectly on first pass. Answer the obvious ones, re-run, and let the tool refine the analysis with each iteration.

---

## Troubleshooting

### "Failed to generate scope analysis: LLM timeout"

**Cause**: LLM service is slow or unavailable.

**Solution**: Wait a moment and retry. Your epic content is preserved.

### "Question count seems wrong"

**Cause**: LLM didn't use ❓ markers consistently.

**Solution**: Report as a bug. The system prompt should enforce marker usage.

### "Epic size limit exceeded"

**Cause**: Adding Scope Analysis pushed epic over 43,838 character limit.

**Solution**: Split your epic into smaller epics, or shorten epic context before running tool.

### "Tool keeps asking the same questions"

**Cause**: Your answers might not be clear enough for LLM to recognize them.

**Solution**: Be more explicit in your answers. Add a clear response after each ❓.

---

## Next Steps

After shell stories are created:

1. **Review Shell Stories**: Check that all in-scope features are covered
2. **Run write-next-story**: Create detailed stories from each shell story
3. **Iterate**: If new questions arise, answer them and re-generate

For more details, see [full documentation](../../../docs/self-healing-tools.md).
