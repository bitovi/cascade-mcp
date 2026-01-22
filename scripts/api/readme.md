# API Scripts

CLI scripts for calling the Cascade MCP API directly from the command line.

## Quick Reference

```bash
# 1. Get Google Drive user info
node --import ./loader.mjs scripts/api/drive-about-user.ts

# 2. Convert Google Doc to Markdown
node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts "https://docs.google.com/document/d/YOUR_DOC_ID/edit"

# 3. Analyze feature scope from Figma designs
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# 4. Generate shell stories from scope analysis
node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/PLAY-123

# 5. Write next story (run repeatedly to create all stories)
node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123
```

## Prerequisites

### Environment Variables

Set these in your `.env` file:

```bash
ATLASSIAN_TEST_PAT=your-atlassian-pat
FIGMA_TEST_PAT=your-figma-pat
ANTHROPIC_API_KEY=your-anthropic-key
API_BASE_URL=http://localhost:3000  # Optional, defaults to localhost:3000
```

### Google Service Account (for Drive scripts)

For `drive-about-user.ts` and `drive-doc-to-markdown.ts`:
- Place `google.json` (service account credentials) in project root
- Or use `--file` to specify a custom path
- Or use `--json` to pass credentials as argument
- See [docs/google-service-account.md](../../docs/google-service-account.md) for setup

### Validate Tokens

Before running the scripts for the first time, validate your tokens:

```bash
npm run validate-pat-tokens
```

### Running Server

The API server must be running:

```bash
npm run start-local
```

## Options

All scripts support these options:

- `--cloud-id <id>` - Override cloud ID (rarely needed - auto-resolved from site name)
- `--help`, `-h` - Show help message

**Note:** The cloud ID is automatically resolved from the Jira URL's site name using the `/_edge/tenant_info` endpoint. This works with both OAuth and PAT tokens. You only need `--cloud-id` if you want to override this for testing purposes.

**Example with cloud ID override:**
```bash
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts \
  https://bitovi.atlassian.net/browse/PLAY-123 \
  --cloud-id abc123xyz
```