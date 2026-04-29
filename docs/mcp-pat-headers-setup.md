# MCP PAT Headers Setup

Use Personal Access Tokens (PATs) to connect MCP clients to Cascade MCP without OAuth. This is the recommended approach for:

- **GitHub Copilot agent** (cloud-hosted, can't do browser OAuth)
- Other headless/cloud-hosted AI agents
- Programmatic or scripted MCP clients
- Local development and testing without OAuth setup

## Prerequisites

You'll need tokens for the providers you want to use. At least one is required.

### Atlassian (Jira/Confluence)

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token** and give it a name
3. Copy the generated token (starts with `ATATT...`)
4. Base64-encode your credentials:
   ```bash
   echo -n "your-email@example.com:ATATT..." | base64
   ```
5. The output (e.g., `eW91ci1lbWFpbEBleGFtcGxlLmNvbTpBVEFUVDN4...`) is your `X-Atlassian-Token` value

### Figma

1. Go to https://www.figma.com/settings (scroll to "Personal access tokens")
2. Generate a new token
3. Copy the token (starts with `figd_...`) — this is your `X-Figma-Token` value

### Google Drive (Optional)

Google uses encrypted service account credentials. See the [Google Drive Setup Guide](./google-drive-setup.md) for full instructions, then encrypt your credentials at the server's `/encrypt` page. The encrypted string (starts with `RSA-ENCRYPTED:`) is your `X-Google-Token` value.

### Anthropic API Key (for AI-powered tools)

Tools like `write-story` and `analyze-feature-scope` need an LLM. Provide your Anthropic key via the `X-Anthropic-Token` header.

1. Go to https://console.anthropic.com/settings/keys
2. Create an API key (starts with `sk-ant-...`)

## MCP Client Configuration

### VS Code Copilot

Add to your VS Code `settings.json` (user or workspace):

```json
{
  "mcp": {
    "servers": {
      "cascade-mcp": {
        "type": "http",
        "url": "https://cascade.bitovi.com/mcp",
        "headers": {
          "X-Atlassian-Token": "YOUR_BASE64_ENCODED_CREDENTIALS",
          "X-Figma-Token": "YOUR_FIGMA_PAT",
          "X-Anthropic-Token": "YOUR_ANTHROPIC_KEY"
        }
      }
    }
  }
}
```

> **Tip:** For local development, use `http://localhost:3000/mcp` as the URL.

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "cascade-mcp": {
      "type": "streamable-http",
      "url": "https://cascade.bitovi.com/mcp",
      "headers": {
        "X-Atlassian-Token": "YOUR_BASE64_ENCODED_CREDENTIALS",
        "X-Figma-Token": "YOUR_FIGMA_PAT",
        "X-Anthropic-Token": "YOUR_ANTHROPIC_KEY"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP config (`.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "cascade-mcp": {
      "type": "streamable-http",
      "url": "https://cascade.bitovi.com/mcp",
      "headers": {
        "X-Atlassian-Token": "YOUR_BASE64_ENCODED_CREDENTIALS",
        "X-Figma-Token": "YOUR_FIGMA_PAT",
        "X-Anthropic-Token": "YOUR_ANTHROPIC_KEY"
      }
    }
  }
}
```

### curl (Testing)

```bash
curl -X POST https://cascade.bitovi.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: YOUR_BASE64_ENCODED_CREDENTIALS" \
  -H "X-Figma-Token: YOUR_FIGMA_PAT" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "test-client", "version": "1.0" }
    },
    "id": 1
  }'
```

A successful response includes an `mcp-session-id` header — use it for subsequent requests.

## Important Notes

### `siteName` is required for Atlassian tools

When using PAT auth, all Atlassian tools require the `siteName` parameter (e.g., `"bitovi"` from `bitovi.atlassian.net`). The MCP client or LLM will be prompted to provide this when calling tools.

### Auth method is per-session

PAT headers and OAuth cannot be mixed. If a JWT Bearer token is present, PAT headers are ignored. A session is either fully OAuth or fully PAT.

### Google token format

The `X-Google-Token` value must be RSA-encrypted (same format as the REST API). See [Encryption Setup](./encryption-setup.md) for details.

### Only include tokens you need

You only need headers for providers you'll actually use:
- **Jira-only workflows**: `X-Atlassian-Token` (+ `X-Anthropic-Token` for AI tools)
- **Figma + Jira workflows**: `X-Atlassian-Token` + `X-Figma-Token` + `X-Anthropic-Token`
- **Full stack**: All four headers

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No Atlassian access token found` | Check that `X-Atlassian-Token` header is present and base64-encoded correctly |
| `siteName is required` | Pass `siteName` parameter when calling Atlassian tools (e.g., `"bitovi"`) |
| 401 from Atlassian API | Verify your API token is valid and the email:token are correct before base64 encoding |
| `No valid Figma access token` | Check that `X-Figma-Token` header is present with a valid `figd_...` token |
| Tools needing AI fail | Add `X-Anthropic-Token` header with a valid `sk-ant-...` key |
