# API Scripts

CLI scripts for calling the Cascade MCP API directly from the command line.

## Quick Reference

```bash
# 1. Analyze feature scope from Figma designs
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# 2. Generate shell stories from scope analysis
node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/PLAY-123

# 3. Write next story (run repeatedly to create all stories)
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