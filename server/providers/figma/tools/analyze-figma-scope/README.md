# Analyze Figma Scope Tool

This tool provides AI-powered analysis of Figma designs without requiring Jira integration. It generates scope analysis with feature areas, implementation priorities, and questions for the design team.

## Overview

The `analyze-figma-scope` tool allows you to:
- Analyze Figma designs independently of Jira
- Read and incorporate existing Figma comments as context
- Post AI-generated questions back to Figma as comments
- Provide optional additional context to guide the analysis

## Features

### Standalone Figma Analysis
Unlike `analyze-feature-scope` which requires a Jira epic, this tool works directly with Figma URLs and doesn't require Atlassian authentication.

### Comment Integration
- **Read Comments**: Fetches existing comments from Figma files and uses them as context for the AI analysis
- **Post Questions**: Generates clarifying questions and posts them back to Figma as comments
- **Thread Awareness**: Groups comments into threads and preserves conversation context

### Rate Limit Handling
- Respects Figma's 25 requests/minute rate limit for comment posting
- Automatically consolidates questions when count exceeds threshold
- Includes retry logic with exponential backoff

## Usage

### MCP Tool

```json
{
  "tool": "analyze-figma-scope",
  "params": {
    "figmaUrls": [
      "https://www.figma.com/design/abc123/MyDesign?node-id=1-1",
      "https://www.figma.com/design/abc123/MyDesign?node-id=2-2"
    ],
    "contextDescription": "This is a mobile app for task management. Focus on the onboarding flow."
  }
}
```

### REST API

```bash
curl -X POST http://localhost:3000/api/analyze-figma-scope \
  -H "Content-Type: application/json" \
  -H "X-Figma-Token: your-figma-token" \
  -H "X-Anthropic-Token: your-anthropic-token" \
  -d '{
    "figmaUrls": ["https://www.figma.com/design/abc123/MyDesign?node-id=1-1"],
    "contextDescription": "Mobile task management app onboarding"
  }'
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `figmaUrls` | `string[]` | Yes | Array of Figma frame/screen URLs to analyze |
| `contextDescription` | `string` | No | Additional context to guide the analysis |

## Output

The tool returns a scope analysis in markdown format including:

- **Feature Areas**: Grouped by screen/function
- **In-Scope Items (☐)**: Features clearly visible in designs
- **Low Priority Items (⏬)**: Nice-to-have features
- **Out-of-Scope Items (❌)**: Items explicitly not included
- **Questions (❓)**: Clarifications needed from design team

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SAVE_FIGMA_COMMENTS_TO_CACHE` | Set to `true` or `1` to save fetched comments to debug cache files |

## Debug Output

When `SAVE_FIGMA_COMMENTS_TO_CACHE=true`, the tool writes a `comments.md` file to the Figma file cache directory containing:

- Comment summary statistics
- Comments grouped by user
- Full thread details with positions and timestamps

## File Structure

```
analyze-figma-scope/
├── index.ts                  # Tool registration export
├── analyze-figma-scope.ts    # MCP tool wrapper
├── core-logic.ts             # Shared business logic
├── prompt-figma-analysis.ts  # AI prompt generation
├── figma-comment-utils.ts    # Comment fetch/post utilities
└── README.md                 # This file
```

## Dependencies

### Required
- Figma authentication (OAuth or PAT via X-Figma-Token)
- LLM provider (MCP sampling or X-Anthropic-Token header)

### Optional
- Atlassian authentication (not required for standalone analysis)

## Related Tools

- **analyze-feature-scope**: Full Jira epic analysis with Figma integration
- **write-shell-stories**: Generates shell stories from scope analysis (uses comment context)

## Error Handling

- **Rate Limit (429)**: Retries with exponential backoff, then consolidates if needed
- **Missing Auth**: Clear error messages indicating which auth is required
- **Invalid URLs**: Validates Figma URL format before processing
