# Architecture Decision Log

Key technical decisions made during the development of CascadeMCP, with rationale.

---

## Dual Interface: MCP + REST API Sharing Core Logic

Both the MCP endpoint (`/mcp`) and REST API (`/api/*`) expose the same tools through shared core logic via a `ToolDependencies` injection pattern. The only difference is auth method (JWT vs PAT headers) and how progress notifications are delivered (MCP notifications vs Jira comments). This avoids code duplication while supporting two distinct integration styles.

---

## OAuth JWT Structure: Provider Tokens Embedded in JWT

Rather than storing provider tokens server-side, we embed Atlassian/Figma tokens directly in the JWT returned to MCP clients. This keeps the server stateless and allows any server instance to validate a token without shared session storage. The JWT expires 1 minute before the shortest-lived embedded provider token to prevent serving a valid JWT that leads to failed API calls.

---

## Refresh Token: Fail-All Strategy

When refreshing tokens, if any provider's refresh fails we fail the entire operation and require re-authentication. We always refresh all providers together in a single operation. This keeps token state simple and consistent — a partial success state (one provider working, one expired) would be harder to surface and recover from.

---

## Figma Caching: File-Based with Tier 3 Validation

Cache is organized by Figma `fileKey` rather than epic key, enabling cache reuse across multiple epics targeting the same file. Before making expensive Tier 1 node/image API calls (15 req/min quota), we make a lightweight Tier 3 `/meta` call (100 req/min) to check `last_touched_at`. On cache hit, Tier 1 calls are skipped entirely — a 6.7x improvement in Tier 1 quota efficiency.

---

## Figma Annotations: Use Note Components Instead

Figma's native Dev Mode "Annotations" feature would be ideal for attaching designer notes to frames, but the `annotations` property is intentionally absent from the REST API (confirmed `AnnotationsTrait` has `properties: {}`). Even Figma's own official MCP Server cannot reliably read them. We continue using `INSTANCE` nodes named `"Note"` as the convention for designer annotations, with spatial association by proximity.

---

## Figma Node Batching: Comma-Separated IDs Per File Key

Instead of making one `/files/{key}/nodes` request per Figma URL, we batch all node IDs for the same file key into a single request (`?ids=id1,id2,id3`). Similarly, image export requests batch multiple node IDs per call. This reduces Tier 1 API requests proportionally to the number of frames from the same file.

---

## LLM Abstraction: Vercel AI SDK

All LLM calls go through a `GenerateTextFn` abstraction backed by Vercel's AI SDK. For MCP connections, the LLM is provided by the client via MCP sampling (`sampling/createMessage`), which lets agents use their own model. For REST API connections, the server calls Anthropic directly via the AI SDK. This single abstraction layer means tool implementations never need to know which LLM is in use.

---

## Agent-Friendly Decomposition: Context Tools with Embedded Prompts

Monolithic tools (e.g., `figma-review-design`) were decomposed into separate data-fetching tools and exposed MCP prompts. To avoid requiring agents to separately fetch prompts, we use MCP's multi-part response pattern: context tools return both the raw data (JSON) and the instructions (embedded `EmbeddedResource` block with `prompt://` URI) in a single response. Simple agents can ignore the resource blocks; smart agents use them to self-orchestrate.

---

## PAT Authentication on the MCP Endpoint

The MCP endpoint (`/mcp`) accepts the same `X-Atlassian-Token`, `X-Figma-Token`, `X-Google-Token` headers as the REST API, in addition to JWT Bearer tokens from OAuth. This allows MCP clients (VS Code Copilot, Claude Desktop, Claude Agent SDK) to connect using pre-existing Personal Access Tokens without completing the OAuth PKCE flow — important for server-to-server, CI, and simpler onboarding scenarios.

---

## Browser MCP Client: Automatic LLM Sampling

The web UI (React/Vite) implements a full MCP client with OAuth PKCE in the browser. Unlike MCP Inspector which presents sampling requests to the user for manual approval, our browser client automatically forwards sampling requests to the Anthropic API using a user-provided API key. This enables end-to-end tool execution entirely in the browser for users who don't have a desktop MCP client.

---

## Session-Scoped MCP Server Instances

Rather than sharing a single MCP server instance, each authenticated MCP session gets its own server instance with only the tools relevant to the user's authenticated providers registered. This avoids tools being listed that would fail at runtime (e.g., Jira tools shown to a Figma-only user), and allows per-session auth context without global state.
