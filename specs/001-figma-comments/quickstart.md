# Quickstart: Figma Comments Integration

**Feature Branch**: `001-figma-comments`

## Prerequisites

1. **Figma OAuth Scopes**: Ensure your Figma OAuth configuration includes:
   - `file_comments:read` (existing)
   - `file_comments:write` (new - required for posting)

2. **Environment Variables**:
   ```bash
   # For debug output of comments (optional)
   SAVE_FIGMA_COMMENTS_TO_CACHE=true
   ```

3. **Authentication**: Valid Figma OAuth token or PAT with comment permissions

## Quick Test: Verify Setup

### 1. Test Comment Reading

Run `analyze-feature-scope` on a Figma file that has existing comments:

```bash
# Via REST API
curl -X POST http://localhost:3000/api/analyze-feature-scope \
  -H "Content-Type: application/json" \
  -H "X-Figma-Token: your-figma-pat" \
  -H "X-Atlassian-Token: user@email:api-token" \
  -H "X-Anthropic-Token: your-anthropic-key" \
  -d '{
    "jiraUrl": "https://yoursite.atlassian.net/browse/PROJ-123"
  }'
```

**Expected**: The scope analysis output should reference or incorporate information from the Figma comments.

### 2. Test New analyze-figma-scope Tool

Run the new standalone Figma analysis tool:

```bash
# Via REST API
curl -X POST http://localhost:3000/api/analyze-figma-scope \
  -H "Content-Type: application/json" \
  -H "X-Figma-Token: your-figma-pat" \
  -H "X-Anthropic-Token: your-anthropic-key" \
  -d '{
    "figmaUrls": ["https://www.figma.com/design/YOUR_FILE_KEY/Design-Name"]
  }'
```

**Expected**: Returns scope analysis markdown with questions posted to Figma frames.

### 3. Test via MCP (VS Code Copilot / Claude Desktop)

```
Analyze the Figma design at https://www.figma.com/design/ABC123/My-Design and post questions to the frames
```

**Expected**: 
1. Scope analysis returned in chat
2. Comments appear on relevant Figma frames with `Cascade🤖:` prefix

## Debug Mode

Enable comment caching for debugging:

```bash
SAVE_FIGMA_COMMENTS_TO_CACHE=true npm run start-local
```

Then check `cache/figma-files/{fileKey}/` for `.comments.md` files:

```
cache/figma-files/ABC123xyz/
├── 1-100.png
├── 1-100.comments.md  # Debug output
└── ...
```

## Common Issues

### "Missing Figma scope: file_comments:write"

**Cause**: OAuth token doesn't have comment write permission.

**Fix**: Users need to re-authorize through the OAuth flow to grant the new scope.

### Rate Limit Errors

**Cause**: Posting too many comments in quick succession.

**Behavior**: 
- If >25 questions: Comments are consolidated (one per screen)
- If still exceeded: Questions returned in response but not posted
- All generated questions are always returned regardless of posting success

### Comments Not Associated with Frames

**Cause**: Comments with Vector (absolute position) metadata may not be near any frame.

**Behavior**: These comments are included as "unassociated" context and appear in the general context section.

## Feature Verification Checklist

- [ ] Comments are read from Figma and included in scope analysis
- [ ] Threaded comments (replies) are grouped correctly
- [ ] Resolved comments are marked as such
- [ ] New `analyze-figma-scope` tool works standalone
- [ ] Questions are posted with `Cascade🤖: {Question}❓` format
- [ ] Rate limits are handled gracefully
- [ ] Debug cache files are created when env var is set
- [ ] Both MCP and REST API work identically
