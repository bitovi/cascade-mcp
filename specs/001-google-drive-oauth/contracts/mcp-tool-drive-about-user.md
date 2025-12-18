# MCP Tool Contract: drive-about-user

**Tool Name**: `drive-about-user`  
**Provider**: Google Drive  
**Purpose**: Retrieve authenticated user information from Google Drive  
**Date**: December 18, 2025

## Tool Schema

### Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**Parameters**: None

This tool requires no input parameters. It uses the authenticated user's Google Drive access token from the MCP session context.

### Output Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "const": "drive#user",
          "description": "Resource type identifier"
        },
        "displayName": {
          "type": "string",
          "description": "User's display name"
        },
        "emailAddress": {
          "type": "string",
          "format": "email",
          "description": "User's email address"
        },
        "permissionId": {
          "type": "string",
          "description": "Unique permission identifier for the user"
        },
        "photoLink": {
          "type": "string",
          "format": "uri",
          "description": "URL to user's profile photo (optional)"
        },
        "me": {
          "type": "boolean",
          "const": true,
          "description": "Always true for the authenticated user"
        }
      },
      "required": ["kind", "displayName", "emailAddress", "permissionId", "me"],
      "additionalProperties": false
    }
  },
  "required": ["user"],
  "additionalProperties": false
}
```

## Tool Registration

### MCP Server Registration

```typescript
// server/providers/google/tools/drive-about-user/drive-about-user.ts

import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import type { AuthContext } from '../../../../mcp-core/auth-types.js';

export function registerDriveAboutUserTool(mcp: McpServer, authContext: AuthContext): void {
  mcp.addTool({
    name: 'drive-about-user',
    description: 'Retrieve information about the authenticated Google Drive user',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, async (params: Record<string, never>, context: any) => {
    console.log('[drive-about-user] Fetching user information');
    
    // Get access token from auth context
    const accessToken = context.auth?.google_access_token;
    if (!accessToken) {
      throw new Error('Google Drive authentication required');
    }
    
    // Call Google Drive API
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid or expired Google Drive access token');
      }
      const errorText = await response.text();
      throw new Error(`Google Drive API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[drive-about-user] Retrieved user: ${data.user.emailAddress}`);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2),
      }],
    };
  });
}
```

## Usage Examples

### MCP Client Usage

```typescript
// Example: Using from an MCP client (VS Code Copilot, Claude Desktop)

const result = await mcpClient.callTool('drive-about-user', {});

console.log(result.content[0].text);
// Output:
// {
//   "user": {
//     "kind": "drive#user",
//     "displayName": "John Doe",
//     "emailAddress": "johndoe@example.com",
//     "permissionId": "00112233445566778899",
//     "photoLink": "https://lh3.googleusercontent.com/...",
//     "me": true
//   }
// }
```

### Expected Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"user\": {\n    \"kind\": \"drive#user\",\n    \"displayName\": \"John Doe\",\n    \"emailAddress\": \"johndoe@example.com\",\n    \"permissionId\": \"00112233445566778899\",\n    \"photoLink\": \"https://lh3.googleusercontent.com/a1b2c3d4e5f6\",\n    \"me\": true\n  }\n}"
    }
  ]
}
```

## Error Handling

### Authentication Errors

**Error**: Missing Google Drive authentication

```json
{
  "error": "Google Drive authentication required"
}
```

**Resolution**: User must complete Google Drive OAuth flow

### Invalid Token Errors

**Error**: Expired or invalid access token (HTTP 401)

```json
{
  "error": "Invalid or expired Google Drive access token"
}
```

**Resolution**: MCP client should refresh token or re-authenticate

### API Errors

**Error**: Google Drive API error (HTTP 403, 404, 500, etc.)

```json
{
  "error": "Google Drive API error (403): Forbidden"
}
```

**Resolution**: Check OAuth scopes, API enablement, and Google Cloud Console configuration

## Testing

### Unit Test Example

```typescript
// server/providers/google/tools/drive-about-user/drive-about-user.test.ts

describe('drive-about-user tool', () => {
  it('should return user information with valid token', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          kind: 'drive#user',
          displayName: 'Test User',
          emailAddress: 'test@example.com',
          permissionId: '123456789',
          me: true,
        },
      }),
    });
    global.fetch = mockFetch;
    
    const context = {
      auth: {
        google_access_token: 'valid_token',
      },
    };
    
    const result = await callDriveAboutUserTool({}, context);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer valid_token',
        }),
      })
    );
    
    const data = JSON.parse(result.content[0].text);
    expect(data.user.emailAddress).toBe('test@example.com');
  });
  
  it('should throw error when authentication is missing', async () => {
    const context = { auth: {} };
    
    await expect(callDriveAboutUserTool({}, context))
      .rejects.toThrow('Google Drive authentication required');
  });
  
  it('should handle 401 unauthorized errors', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    global.fetch = mockFetch;
    
    const context = {
      auth: {
        google_access_token: 'expired_token',
      },
    };
    
    await expect(callDriveAboutUserTool({}, context))
      .rejects.toThrow('Invalid or expired Google Drive access token');
  });
});
```

### Integration Test Example

```typescript
// test/integration/google-drive-about-user.test.ts

describe('Google Drive about user integration', () => {
  it('should retrieve real user info with valid OAuth token', async () => {
    const accessToken = process.env.TEST_GOOGLE_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('Skipping test: TEST_GOOGLE_ACCESS_TOKEN not set');
      return;
    }
    
    const context = {
      auth: {
        google_access_token: accessToken,
      },
    };
    
    const result = await callDriveAboutUserTool({}, context);
    const data = JSON.parse(result.content[0].text);
    
    expect(data.user.kind).toBe('drive#user');
    expect(data.user.me).toBe(true);
    expect(data.user.emailAddress).toMatch(/@.+\..+/);
  });
});
```

## Compliance

### MCP Protocol Compliance

- ✅ Tool name follows kebab-case convention
- ✅ Input schema is valid JSON Schema draft-07
- ✅ Output returns content array with text type
- ✅ Errors thrown as exceptions (not returned in content)
- ✅ Description is clear and concise

### Google Drive API Compliance

- ✅ Uses Drive API v3 endpoint
- ✅ Requires `fields` parameter for response filtering
- ✅ Includes proper Authorization header format
- ✅ Handles standard HTTP error codes

### CascadeMCP Standards Compliance

- ✅ Follows modular tool structure (own folder)
- ✅ Uses auth context from MCP session
- ✅ Implements proper error handling
- ✅ Includes logging with sanitization
- ✅ Returns raw JSON as specified in requirements

## Related Contracts

- [REST API Contract](./rest-api-drive-about-user.md) - REST endpoint for the same functionality
- [OAuth Provider Contract](./oauth-provider-google.md) - Google OAuth provider interface
