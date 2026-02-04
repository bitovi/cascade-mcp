# figma-review-design

Quick prompt:

> ```
> MCP call figma-review-design with https://www.figma.com/design/abc123/MyDesign?node-id=1-1
> ```

## Purpose

The `figma-review-design` tool posts AI-generated questions as Figma comments to clarify design requirements. It reviews Figma screens, generates questions about ambiguities and missing details, then posts those questions directly on the relevant frames for designers to answer.

**Primary use cases:**
- Post AI-generated questions as Figma comments to gather clarifications from designers
- Surface ambiguities and missing requirements before implementation begins
- Enable async collaboration by putting questions directly where designers work

**What problem it solves:**
- **Missing requirements discovered late**: Questions appear during development instead of during design review
- **Context switching**: Developers have to leave Figma to ask questions elsewhere
- **Incomplete design review**: Human reviewers miss edge cases and ambiguities that AI can catch
- **Comment overload**: Automatically consolidates questions to respect Figma's rate limits

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `figmaUrls` | string[] | ✅ Yes | Array of Figma frame/screen URLs to analyze (e.g., `["https://www.figma.com/design/abc123/MyDesign?node-id=1-1"]`) |
| `contextDescription` | string | Optional | Additional context to guide the analysis (e.g., "Mobile app onboarding flow for task management") |

### Returns

The tool returns a structured response with:

```typescript
{
  content: [
    {
      type: "text",
      text: string  // Markdown-formatted scope analysis
    }
  ]
}
```

**Output format includes:**
- **Feature Areas**: Grouped by screen/function with Figma links
- **In-Scope Items (☐)**: Features clearly visible in designs
- **Low Priority Items (⏬)**: Nice-to-have features
- **Out-of-Scope Items (❌)**: Items explicitly not included
- **Questions (❓)**: Clarifications posted as Figma comments

## Usage

### MCP Interface

```json
{
  "name": "figma-review-design",
  "arguments": {
    "figmaUrls": [
      "https://www.figma.com/design/abc123/MyDesign?node-id=1-1",
      "https://www.figma.com/design/abc123/MyDesign?node-id=2-2"
    ],
    "contextDescription": "Mobile app onboarding flow"
  }
}
```

### REST API

```bash
curl -X POST http://localhost:3000/api/figma-review-design \
  -H "Content-Type: application/json" \
  -H "X-Figma-Token: your-figma-token" \
  -H "X-Anthropic-Token: your-anthropic-token" \
  -d '{
    "figmaUrls": ["https://www.figma.com/design/abc123/MyDesign?node-id=1-1"],
    "contextDescription": "Mobile task management app"
  }'
```

## How It Works

1. **Fetch Design Context**: Downloads Figma screens and existing comments
2. **AI Analysis**: Generates scope analysis with feature areas and questions
3. **Post Questions**: Creates Figma comments for clarifications (respects rate limits)
4. **Return Analysis**: Provides markdown-formatted scope document

### Comment Integration

- **Read Comments**: Fetches existing comments and uses them as context
- **Post Questions**: Generated questions appear as Figma comments on relevant screens
- **Thread Awareness**: Preserves conversation context and grouping
- **Rate Limiting**: Automatically handles Figma's 25 requests/minute limit

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SAVE_FIGMA_COMMENTS_TO_CACHE` | Set to `true` or `1` to save fetched comments to debug cache files at `cache/figma-files/{fileKey}/comments.md` |
| `SAVE_FIGMA_NOTES_TO_CACHE` | Set to `true` or `1` to save extracted sticky notes to debug cache files at `cache/figma-files/{fileKey}/notes.md` |

## Related Tools

- **write-shell-stories**: Generates shell stories from Jira epics with Figma designs (includes automatic scope analysis)
- **analyze-feature-scope** (deprecated): Use `write-shell-stories` instead for Jira-integrated analysis
