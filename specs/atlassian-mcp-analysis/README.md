# Atlassian MCP Server Analysis Test

This test suite analyzes the behavior of Atlassian's official MCP server (`https://mcp.atlassian.com/v1/sse`) to understand how it handles authentication, especially with unauthenticated/invalid tokens, and logs all interactions for analysis.

## Purpose

The goal is to understand Atlassian's MCP server behavior to ensure our own MCP service works just as well. This test will help us:

1. **Understand authentication flows** - How Atlassian handles OAuth2 PKCE authentication
2. **Analyze error responses** - How invalid/expired tokens are handled
3. **Study MCP protocol usage** - Proper request/response patterns
4. **Compare behaviors** - Valid vs invalid token responses
5. **Document patterns** - Save all interactions for building our service

## Files

- `atlassian-mcp-test.js` - Main test script
- `pkce-auth.js` - OAuth2 PKCE authentication module
- `run-test.js` - Test runner with command-line options

## Usage

### Quick Test (10 minutes)
```bash
npm run atlassian-mcp-test-quick
```

### Full Test (1 hour)
```bash
npm run atlassian-mcp-test
```

### Custom Duration
```bash
node specs/atlassian-mcp-analysis/run-test.js --duration 30 --interval 60
```

### Options
- `--duration <minutes>` - Test duration in minutes (default: 60)
- `--interval <seconds>` - Interval between test cycles (default: 30)
- `--help` - Show help message

## What the Test Does

### Phase 1: Authentication
1. **OAuth Discovery** - Finds OAuth endpoints from MCP server
2. **PKCE Flow** - Performs OAuth2 PKCE authentication
3. **Token Storage** - Stores valid access token for testing

### Phase 2: Test Scenarios
The test runs these scenarios repeatedly for the specified duration:

**Authentication Tests:**
- No authentication
- Invalid token
- Expired token
- Malformed token
- Empty bearer token
- Query parameter authentication
- Valid token (if authentication succeeded)

**MCP Protocol Tests:**
- Initialize requests
- Tools list requests
- SSE connections
- Large payloads
- Invalid HTTP methods
- Concurrent connections

**Comparison Tests:**
- Same request with valid vs invalid vs no tokens
- Response analysis

## Output

The test creates a timestamped JSON file with all interactions:
```
atlassian-mcp-analysis-2024-08-28T10-30-00-000Z.json
```

Each log entry includes:
- Timestamp and elapsed time
- Request/response details
- Headers and body content
- Error information
- Authentication status
- Response times

## Authentication Flow

1. **Browser Opens** - Automatic OAuth flow initiation
2. **User Login** - Authenticate with Atlassian account
3. **Token Exchange** - PKCE code exchange for access token
4. **Testing Begins** - Both valid and invalid token scenarios

## Requirements

- Atlassian account access
- Browser for OAuth flow
- Network access to `mcp.atlassian.com`
- Jira workspace access (for scope `read:jira-work`)

## Notes

- Press `Ctrl+C` to stop the test early
- All requests/responses are logged for analysis
- The test is designed to run for extended periods
- Both success and failure scenarios are captured
- No actual Jira data is modified (read-only scope)

## Example Log Structure

```json
{
  "test_info": {
    "start_time": "2024-08-28T10:30:00.000Z",
    "target_url": "https://mcp.atlassian.com/v1/sse",
    "duration_planned_ms": 3600000,
    "has_valid_token": true,
    "token_expiry": "2024-08-28T11:30:00.000Z"
  },
  "logs": [
    {
      "timestamp": "2024-08-28T10:30:01.000Z",
      "elapsed_ms": 1000,
      "scenario": "valid_token_initialize",
      "type": "request",
      "method": "POST",
      "headers": { "Authorization": "Bearer ..." },
      "body": { "jsonrpc": "2.0", "method": "initialize" }
    },
    {
      "timestamp": "2024-08-28T10:30:01.200Z",
      "elapsed_ms": 1200,
      "scenario": "valid_token_initialize",
      "type": "response",
      "status": 200,
      "response_time_ms": 200,
      "body": { "jsonrpc": "2.0", "result": {...} }
    }
  ]
}
```
