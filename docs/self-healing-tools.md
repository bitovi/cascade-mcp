# Automatic Scope Analysis

> **Version**: 1.0.0  
> **Last Updated**: January 2026

## Overview

The `write-shell-stories` tool now **automatically generates scope analysis** before creating shell stories. It handles the entire workflow for you - analyzing Figma designs, identifying questions, and only creating stories when requirements are clear enough.

This eliminates the need to run `analyze-feature-scope` separately (that tool is now deprecated).

## How It Works

### Automatic Workflow

When you run `write-shell-stories`:

1. **Check for Scope Analysis**: Tool looks for a `## Scope Analysis` section in the epic
2. **Generate if Missing**: If no section exists, automatically generates one
3. **Count Questions**: Counts unanswered questions (marked with ❓)
4. **Decision Point**:
   - **≤5 questions**: Proceeds to generate shell stories
   - **>5 questions**: Creates/updates Scope Analysis section, asks for clarification

### Question Markers

The scope analysis uses visual markers to track question status:

| Marker | Meaning | Example |
|--------|---------|---------|
| ❓ | Unanswered question | `❓ Should login support SSO?` |
| 💬 | Answered (in comments/epic) | `💬 Yes, SSO required per stakeholder` |
| ☐ | In-scope feature | `☐ Email/password login` |
| ✅ | Already done | `✅ Basic form validation` |
| ⏬ | Low priority | `⏬ Password recovery (delay until end)` |
| ❌ | Out of scope | `❌ OAuth login (future epic)` |

## Iterative Refinement

### First Run: Many Questions

```
write-shell-stories({ epicKey: "PROJ-123" })

Result:
⚠️ Found 8 unanswered questions (threshold: 5). 
Please answer the questions marked with ❓ in the epic's Scope Analysis section, 
then run this tool again.
```

### Answer Questions in Epic

Edit the epic description to answer questions:

```diff
- ❓ Should login support SSO?
+ 💬 Yes, SSO required per stakeholder feedback
```

### Re-run: Questions Answered

```
write-shell-stories({ epicKey: "PROJ-123" })

Result:
✅ Jira Update Complete: Successfully generated 12 shell stories
```

## Figma Comments Integration

Questions can also be answered via Figma comment threads:

1. Designer asks question in Figma
2. Stakeholder replies with answer
3. Tool reads Figma comments
4. LLM recognizes answer → marks as 💬

This allows answering questions directly where the design context is visible.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicKey` | Yes | Jira epic key (e.g., "PROJ-123") |
| `cloudId` | No | Atlassian cloud ID (alternative to siteName) |
| `siteName` | No | Jira site subdomain (e.g., "mycompany") |

## Response Types

### Success: Shell Stories Created

```json
{
  "success": true,
  "action": "proceed",
  "storyCount": 12,
  "screensAnalyzed": 8,
  "shellStoriesContent": "## Shell Stories\n..."
}
```

### Clarification Needed

```json
{
  "success": true,
  "action": "clarify",
  "questionCount": 8,
  "scopeAnalysisContent": "### Authentication Flow\n- ❓ Should login support SSO?..."
}
```

### Regeneration (Re-run with Answers)

```json
{
  "success": true,
  "action": "regenerate",
  "questionCount": 3,
  "hadExistingAnalysis": true,
  "scopeAnalysisContent": "### Authentication Flow\n- 💬 Yes, SSO required..."
}
```

## Migration from analyze-feature-scope

The `analyze-feature-scope` tool is **deprecated**. Simply use `write-shell-stories` instead:

```diff
- // Old workflow (two steps)
- analyze-feature-scope({ epicKey: "PROJ-123" })
- // ... wait for questions to be answered ...
- write-shell-stories({ epicKey: "PROJ-123" })

+ // New workflow (single step, self-healing)
+ write-shell-stories({ epicKey: "PROJ-123" })
```

The tool automatically:
- Generates scope analysis if missing
- Handles the question/answer loop
- Proceeds when questions are sufficiently answered

## Performance

| Operation | Typical Duration |
|-----------|-----------------|
| Scope analysis generation | 15-30 seconds |
| Scope analysis regeneration | 15-30 seconds |
| Shell story generation | 30-60 seconds |
| Full workflow (first run) | 60-120 seconds |

## Error Handling

### LLM Failure

```json
{
  "success": false,
  "action": "clarify",
  "error": "Failed to generate scope analysis: AI service timeout"
}
```

**Resolution**: Wait a moment and try again. The tool will retry from where it left off.

### Missing Figma Designs

```json
{
  "success": false,
  "error": "No Figma URLs found in epic description"
}
```

**Resolution**: Add Figma design links to the epic description.

## Best Practices

1. **Rich Epic Context**: Include project context, constraints, and priorities in the epic description
2. **Answer Questions Promptly**: The faster you answer ❓ questions, the faster you get shell stories
3. **Use Figma Comments**: Answer design questions directly in Figma for context
4. **Review Generated Stories**: AI-generated stories should be reviewed before creating Jira tickets

## Related Documentation

- [REST API Documentation](./rest-api.md) - Using the REST API endpoint
- [Multi-Provider Usage](./multi-provider-usage.md) - OAuth and token configuration
- [Getting Started with Figma Links](./getting-started-creating-an-epic-with-figma-links.md) - Setting up epics
