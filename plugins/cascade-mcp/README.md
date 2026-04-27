# Cascade MCP Plugin

AI agent skills for Jira/Figma/Google workflow orchestration powered by [Cascade MCP](https://cascade.bitovi.com).

## Prerequisites

- **Cascade MCP server** — production at `https://cascade.bitovi.com` or self-hosted
- **Authentication** — OAuth (via MCP client) or PAT tokens (Figma, Atlassian)
- For local development, set `CASCADE_MCP_URL=http://localhost:3000`

## Installation

### Claude Code

```bash
# Add marketplace
claude plugin marketplace add bitovi/cascade-mcp

# Install plugin
claude plugin install cascade-mcp@cascade-mcp-marketplace
```

Or install from source:

```bash
claude plugin marketplace add ./path/to/cascade-mcp
claude plugin install cascade-mcp@cascade-mcp-marketplace
```

### VS Code Copilot

Add to your VS Code settings (`settings.json`):

```json
{
  "chat.plugins.marketplaces": ["bitovi/cascade-mcp"]
}
```

Then install via the **Agent Customizations** panel → **Plugins** → **Browse Marketplace**.

Alternatively, use **Command Palette** → "Chat: Install Plugin From Source" and enter:
```
https://github.com/bitovi/cascade-mcp
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CASCADE_MCP_URL` | `https://cascade.bitovi.com` | MCP server URL (override for local dev) |

## Available Skills

### Parent Skills (user-facing workflows)

| Skill | Trigger Phrases | Description |
|-------|----------------|-------------|
| **generate-questions** | "generate questions for PROJ-123", "what questions should we ask about this design" | Loads Figma/Jira data, analyzes frames, generates clarifying questions |
| **post-questions-to-figma** | "post questions to Figma" | Takes generated questions and posts them as pinned Figma comments |
| **post-questions-to-jira** | "post questions to Jira" | Takes generated questions and posts them as a Jira issue comment |
| **review-design** | "review the design for PROJ-123" | End-to-end: load → analyze → generate → post questions |
| **write-story** | "write story PROJ-456" | Generates a full user story description from Figma analysis + Jira context |

### Sub-Skills (building blocks)

| Skill | Purpose |
|-------|---------|
| **load-content** | Batch-fetch Figma frames + Jira/Google data to `.temp/cascade/` |
| **analyze-content** | Orchestrate per-frame analysis using subagents |
| **analyze-figma-frame** | Subagent skill: analyze a single frame's image + structure XML |
| **scope-analysis** | Synthesize frame analyses into feature scope with evidence markers |

## How Skills Work

Skills are SKILL.md instruction files that guide the AI agent through multi-step workflows. The agent:

1. Reads the SKILL.md for step-by-step instructions
2. Calls MCP tools (e.g., `figma-batch-load`, `atlassian-get-issue`) for data and side-effects
3. Uses its own LLM for generation (no sampling dependency)
4. Saves intermediate results to `.temp/cascade/` for caching

### MCP Tools Used

| Tool | Purpose |
|------|---------|
| `figma-batch-load` | Batch-fetch Figma frames → zip with images, structure XML, prompts |
| `figma-post-comment` | Post a comment to a Figma file (optionally pinned to a node) |
| `figma-get-comments` | Read comment threads from a Figma file |
| `atlassian-add-comment` | Post a markdown comment to a Jira issue |
| `atlassian-get-issue` | Fetch Jira issue data |
| `atlassian-update-issue-description` | Update a Jira issue description |

### Cache-First Pattern

Skills check `.temp/cascade/figma/` before calling MCP tools. If cached data exists and is fresh, the agent skips the network call. This saves API budget and speeds up re-runs.

## Example Workflows

### Generate and Post Questions

```
You: "generate questions for PROJ-123"
Agent: [loads Figma + Jira data] → [analyzes frames] → [generates questions]

You: "post those to Figma"
Agent: [posts each question as a pinned comment on the relevant frame]
```

### Write a Story

```
You: "write story PROJ-456"
Agent: [fetches Jira context + Figma data] → [analyzes frames] → [generates story description] → [updates Jira]
```

## License

See the main [cascade-mcp repository](https://github.com/bitovi/cascade-mcp) for license details.
