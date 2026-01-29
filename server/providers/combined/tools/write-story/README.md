# write-story Tool

Generates or refines a Jira story by gathering comprehensive context and writing the best possible story with inline questions for missing information.

## Overview

This tool takes a story issue key and:
1. Checks for a `Last Updated by write-story` timestamp in the description
2. Gathers **changed context** since that timestamp (new/edited comments, updated parents/blockers)
3. Extracts and loads linked resources (Confluence, Figma, Google Docs)
4. **Always writes the best possible story** with available context
5. Includes a **Scope Analysis** section with ❓ markers for unanswered questions
6. On re-run, detects inline answers and flips ❓ → 💬, refining the story

## Usage

### MCP Interface

```json
{
  "name": "write-story",
  "arguments": {
    "issueKey": "PROJ-123",
    "siteName": "bitovi"
  }
}
```

### REST API

```bash
curl -X POST http://localhost:3000/api/write-story \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: <base64(email:api_token)>" \
  -H "X-Anthropic-Token: <api_key>" \
  -d '{
    "issueKey": "PROJ-123",
    "siteName": "my-site"
  }'
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | Yes | Story issue key (e.g., "PROJ-123") |
| `cloudId` | string | No | Jira cloud ID (alternative to siteName) |
| `siteName` | string | No | Jira site subdomain (e.g., "bitovi") |
| `maxDepth` | number | No | Parent traversal depth (default: 5) |

## Response

### Success Response

```json
{
  "success": true,
  "action": "wrote",
  "issueKey": "PROJ-123",
  "questionCount": 2,
  "answeredCount": 1,
  "changesIncorporated": ["2 new comments", "1 updated parent"]
}
```

### No Changes Response

```json
{
  "success": true,
  "action": "no-changes",
  "message": "Story is up to date",
  "issueKey": "PROJ-123"
}
```

## Story Format

The tool uses the standard story format with a **Scope Analysis** section that replaces "Out of Scope":

| Section | Purpose |
|---------|---------|
| User Story Statement | Plain text describing the work |
| Supporting Artifacts | Figma links, doc references |
| **Scope Analysis** | Scope boundaries (in/out) + clarifying questions (❓/💬) |
| Non-Functional Requirements | Performance, security, etc. |
| Developer Notes | Implementation hints, dependencies |
| Acceptance Criteria | Nested Gherkin format with **GIVEN/WHEN/THEN** |

## Question Emoji Pattern

- **❓** = Unanswered question (needs clarification)
- **💬** = Answered question (answer found in context or added inline)

Users can add answers inline after ❓ markers, and the tool will flip them to 💬 on re-run.

## Incremental Context Strategy

The tool uses timestamp-based change detection to efficiently process only changed context:

1. **First run**: Fetches ALL comments and context, generates story from scratch
2. **Subsequent runs**: Only fetches changed context (comments, parent updates, linked docs)
3. **No changes**: Returns early without regenerating

The timestamp marker is appended to the story description:
```markdown
---
*Last updated by write-story: 2026-01-28T16:45:00Z*
```
