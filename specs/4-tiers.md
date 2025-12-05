# Figma API Endpoints - Rate Limit Tiers

Reference: https://developers.figma.com/docs/rest-api/rate-limits/

This document lists all Figma API endpoints used by this MCP server, their purpose, and rate limit tier.

## Endpoints Used

### 1. GET /v1/me
- **Purpose**: Get information about the authenticated Figma user (used for OAuth validation testing)
- **Rate Limit Tier**: Tier 1
- **Used By**: `figma-get-user` tool (`server/providers/figma/tools/figma-get-user.ts`)
- **Documentation**: https://developers.figma.com/docs/rest-api/user-endpoints/#get-me

### 2. GET /v1/files/{fileKey}
- **Purpose**: Fetch complete Figma file data including all pages, frames, and layers
- **Rate Limit Tier**: Tier 1
- **Used By**: 
  - `fetchFigmaFile()` helper in `figma-helpers.ts`
  - `figma-get-metadata-for-layer` tool
  - `figma-get-layers-for-page` tool
- **Documentation**: https://developers.figma.com/docs/rest-api/file-endpoints/#get-file

### 3. GET /v1/files/{fileKey}/nodes
- **Purpose**: Fetch specific node(s) from a Figma file with full subtree (used when you need a specific section/frame)
- **Rate Limit Tier**: Tier 1
- **Query Parameters**: `ids` (comma-separated node IDs in format "123:456")
- **Used By**: `fetchFigmaNode()` helper in `figma-helpers.ts`
- **Documentation**: https://developers.figma.com/docs/rest-api/file-endpoints/#get-file-nodes

### 4. GET /v1/images/{fileKey}
- **Purpose**: Get download URLs for rendered images of specific nodes
- **Rate Limit Tier**: Tier 1
- **Query Parameters**: 
  - `ids` (node IDs to render)
  - `format` (png, jpg, svg, pdf)
  - `scale` (0.01-4.0)
- **Used By**: 
  - `downloadFigmaImage()` helper in `figma-helpers.ts`
  - `figma-get-image-download` tool
- **Documentation**: https://developers.figma.com/docs/rest-api/file-endpoints/#get-images
- **Note**: Returns URLs to Figma CDN, not the actual images. A separate fetch to the CDN URL is required.

### 5. POST /v1/oauth/token
- **Purpose**: Exchange authorization code for access token, or refresh an access token
- **Rate Limit Tier**: Not rate-limited (OAuth endpoint)
- **Used By**: `server/providers/figma/index.ts` (OAuth flow implementation)
- **Documentation**: https://developers.figma.com/docs/rest-api/oauth-endpoints/#post-oauth-token

## Rate Limit Tier Summary

Rate limits are determined by **three factors**:
1. **Plan tier**: Starter, Pro, Org, Enterprise
2. **Seat type**: View/Collab (low) vs Dev/Full (high)
3. **Endpoint tier**: Tier 1, Tier 2, Tier 3

### Rate Limit Table (requests per minute)

| Endpoint Tier | Seat Type | Starter | Pro | Org | Enterprise |
|---------------|-----------|---------|-----|-----|------------|
| **Tier 1** | View, Collab | Up to 6/month | Up to 6/month | Up to 6/month | Up to 6/month |
| **Tier 1** | Dev, Full | 10/min | 15/min | 20/min | 20/min |
| **Tier 2** | View, Collab | Up to 5/min | Up to 5/min | Up to 5/min | Up to 5/min |
| **Tier 2** | Dev, Full | 25/min | 50/min | 100/min | 100/min |
| **Tier 3** | View, Collab | Up to 10/min | Up to 10/min | Up to 10/min | Up to 10/min |
| **Tier 3** | Dev, Full | 50/min | 100/min | 150/min | 150/min |

**Important Notes:**
- View/Collab seats have "up to" limits that may be lower depending on traffic and demand
- Dev/Full seats have guaranteed per-minute limits
- Rate limits updated as of November 17, 2025

## Current Usage Pattern

All our file read operations (GET /v1/files, GET /v1/files/nodes, GET /v1/images) are **Tier 1** endpoints.

**Actual rate limits users will experience:**
- **Dev/Full seats**: 10-20 requests/minute (depending on plan)
- **View/Collab seats**: Up to 6 requests/month (severely restricted)

This means users need **Dev or Full seats** for practical usage of this MCP server.

## Rate Limit Error Response

When a 429 error occurs, Figma returns these headers:

| Header | Type | Description |
|--------|------|-------------|
| `Retry-After` | Integer | Seconds to wait before retrying the request |
| `X-Figma-Plan-Tier` | String enum | Plan tier of the resource: `starter`, `pro`, `org`, `enterprise`, `student` |
| `X-Figma-Rate-Limit-Type` | String enum | User's seat type: `low` (View/Collab) or `high` (Dev/Full) |
| `X-Figma-Upgrade-Link` | String | URL to pricing or settings page for upgrading |

### Current Implementation in `figma-helpers.ts`:

The server includes rate limit handling:
- ✅ Parses `Retry-After` header for automatic retry timing
- ✅ Extracts `X-Figma-Rate-Limit-Type` header for user-friendly error messages
- ✅ Throws `FigmaUnrecoverableError` for 429 responses to signal sampling hooks to stop
- ❌ Does NOT currently extract `X-Figma-Plan-Tier` header
- ❌ Does NOT currently extract `X-Figma-Upgrade-Link` header

## Testing Endpoints

Test scripts in `scripts/` directory:
- `test-figma-access.sh` - Tests GET /v1/files/{fileKey}/nodes
- `test-figma-token.cjs` - Tests GET /v1/me, GET /v1/files, and GET /v1/files/nodes