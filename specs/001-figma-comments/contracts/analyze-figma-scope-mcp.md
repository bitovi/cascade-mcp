# MCP Tool Contract: analyze-figma-scope

## Tool Definition

```json
{
  "name": "analyze-figma-scope",
  "description": "Analyze Figma designs and optionally post clarifying questions as comments on Figma frames. Generates scope analysis markdown and identifies questions about interactions, states, edge cases, and accessibility.",
  "inputSchema": {
    "type": "object",
    "required": ["figmaUrls"],
    "properties": {
      "figmaUrls": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 1,
        "description": "One or more Figma URLs to analyze. Supports file URLs and node-specific URLs."
      },
      "contextDescription": {
        "type": "string",
        "description": "Optional text providing additional context for the AI analysis (business context, user personas, focus areas)."
      },
      "postQuestionsToFigma": {
        "type": "boolean",
        "default": true,
        "description": "Whether to post generated questions as comments on Figma frames. If false, questions are returned but not posted."
      }
    }
  }
}
```

## Expected Responses

### Success Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "## Scope Analysis\n\n### Login Screen\n\nThis screen provides...\n\n### Questions\n\n1. ❓ What happens if user enters invalid email format?\n..."
    }
  ],
  "isError": false
}
```

The text content contains:
1. Markdown scope analysis
2. List of generated questions with ❓ markers
3. Posting summary (e.g., "Posted 5/7 questions to Figma")

### Error Response - Missing Scope

```json
{
  "content": [
    {
      "type": "text",
      "text": "Missing Figma scope: file_comments:write. Please re-authorize with the required scope to post comments."
    }
  ],
  "isError": true
}
```

### Partial Success - Rate Limited

```json
{
  "content": [
    {
      "type": "text",
      "text": "## Scope Analysis\n\n...\n\n### Questions (7 generated, 5 posted)\n\n✅ Posted to Login Screen:\n- What happens if user enters invalid email?\n\n❌ Rate limited (not posted):\n- What is the loading state duration?\n- How does error recovery work?\n"
    }
  ],
  "isError": false
}
```

## Authentication Flow

### MCP OAuth Flow
1. Tool checks for valid OAuth token in MCP session context
2. Token must include `file_comments:read` scope (existing)
3. For posting, token must also include `file_comments:write` scope
4. If scope missing, returns error with re-authorization guidance

### LLM Client Resolution
1. Prefer MCP sampling if client supports it
2. Fall back to `X-Anthropic-Token` header if provided
3. Error if no LLM client available

## Rate Limit Handling

```
Question count check:
  ≤25 → Post individually to each frame
  >25 → Consolidate to 1 comment per frame
  >25 frames → Return error with all questions
  
On 429:
  → Check Retry-After header
  → Retry up to 3 times
  → Return partial results with questions
```

## Example Tool Calls

### Basic Analysis
```json
{
  "name": "analyze-figma-scope",
  "arguments": {
    "figmaUrls": ["https://www.figma.com/design/ABC123xyz/My-Design"]
  }
}
```

### With Context
```json
{
  "name": "analyze-figma-scope",
  "arguments": {
    "figmaUrls": [
      "https://www.figma.com/design/ABC123xyz/My-Design?node-id=1-100",
      "https://www.figma.com/design/DEF456abc/Settings"
    ],
    "contextDescription": "Mobile banking app checkout flow. Focus on security and accessibility."
  }
}
```

### Analysis Only (No Posting)
```json
{
  "name": "analyze-figma-scope",
  "arguments": {
    "figmaUrls": ["https://www.figma.com/design/ABC123xyz/My-Design"],
    "postQuestionsToFigma": false
  }
}
```
