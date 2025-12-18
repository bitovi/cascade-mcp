# REST API Contract: drive-about-user

**Endpoint**: `POST /api/drive-about-user`  
**Provider**: Google Drive  
**Purpose**: Retrieve authenticated user information from Google Drive via REST API  
**Date**: December 18, 2025

## API Specification

### HTTP Method

```
POST /api/drive-about-user
```

### Authentication

This endpoint supports **Personal Access Token (PAT)** authentication via headers:

```http
X-Google-Token: <google_access_token>
```

**Note**: OAuth-based authentication (via JWT) is handled through the MCP interface, not the REST API.

### Request

#### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Google-Token` | Yes | Google Drive OAuth access token |
| `Content-Type` | Yes | Must be `application/json` |
| `Accept` | No | Recommended: `application/json` |

#### Body

```json
{}
```

**Request Body**: Empty object (no parameters required)

### Response

#### Success Response (200 OK)

```json
{
  "user": {
    "kind": "drive#user",
    "displayName": "John Doe",
    "emailAddress": "johndoe@example.com",
    "permissionId": "00112233445566778899",
    "photoLink": "https://lh3.googleusercontent.com/a1b2c3d4e5f6",
    "me": true
  }
}
```

**Response Schema**:

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
          "const": "drive#user"
        },
        "displayName": {
          "type": "string"
        },
        "emailAddress": {
          "type": "string",
          "format": "email"
        },
        "permissionId": {
          "type": "string"
        },
        "photoLink": {
          "type": "string",
          "format": "uri"
        },
        "me": {
          "type": "boolean",
          "const": true
        }
      },
      "required": ["kind", "displayName", "emailAddress", "permissionId", "me"]
    }
  },
  "required": ["user"]
}
```

#### Error Responses

**401 Unauthorized** - Missing or invalid Google token

```json
{
  "error": "Missing X-Google-Token header"
}
```

```json
{
  "error": "Invalid or expired Google Drive access token"
}
```

**403 Forbidden** - Insufficient permissions

```json
{
  "error": "Insufficient permissions to access Google Drive"
}
```

**500 Internal Server Error** - Google API error

```json
{
  "error": "Google Drive API error (500): Internal Server Error"
}
```

## Implementation

### Express Route Handler

```typescript
// server/api/drive-about-user.ts

import type { Request, Response } from 'express';
import { createGoogleClientWithPAT } from '../providers/google/google-api-client.js';

export async function handleDriveAboutUser(req: Request, res: Response): Promise<void> {
  console.log('[API] drive-about-user request received');
  
  // Extract Google access token from header
  const googleToken = req.headers['x-google-token'] as string;
  if (!googleToken) {
    res.status(401).json({
      error: 'Missing X-Google-Token header',
    });
    return;
  }
  
  try {
    // Create Google API client with PAT
    const client = createGoogleClientWithPAT(googleToken);
    
    // Call Google Drive API
    const userData = await client.fetchAboutUser();
    
    console.log(`[API] Retrieved user: ${userData.user.emailAddress}`);
    
    res.status(200).json(userData);
  } catch (error) {
    console.error('[API] Error fetching user info:', error);
    
    if (error.message.includes('401')) {
      res.status(401).json({
        error: 'Invalid or expired Google Drive access token',
      });
    } else if (error.message.includes('403')) {
      res.status(403).json({
        error: 'Insufficient permissions to access Google Drive',
      });
    } else {
      res.status(500).json({
        error: `Google Drive API error: ${error.message}`,
      });
    }
  }
}
```

### Route Registration

```typescript
// server/server.ts (add to API routes section)

import { handleDriveAboutUser } from './api/drive-about-user.js';

// ... existing routes ...

app.post('/api/drive-about-user', handleDriveAboutUser);
```

## Usage Examples

### cURL Example

```bash
curl -X POST http://localhost:3000/api/drive-about-user \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: ya29.a0AfH6SMC..." \
  -d '{}'
```

### JavaScript/Fetch Example

```javascript
const response = await fetch('http://localhost:3000/api/drive-about-user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Google-Token': 'ya29.a0AfH6SMC...',
  },
  body: JSON.stringify({}),
});

if (!response.ok) {
  const error = await response.json();
  console.error('Error:', error.error);
} else {
  const data = await response.json();
  console.log('User:', data.user.displayName);
  console.log('Email:', data.user.emailAddress);
}
```

### Python/Requests Example

```python
import requests
import json

url = 'http://localhost:3000/api/drive-about-user'
headers = {
    'Content-Type': 'application/json',
    'X-Google-Token': 'ya29.a0AfH6SMC...'
}

response = requests.post(url, headers=headers, json={})

if response.ok:
    user_data = response.json()
    print(f"User: {user_data['user']['displayName']}")
    print(f"Email: {user_data['user']['emailAddress']}")
else:
    error = response.json()
    print(f"Error: {error['error']}")
```

## Testing

### Contract Test Example

```typescript
// test/contract/api-drive-about-user.test.ts

import request from 'supertest';
import { app } from '../../server/server.js';

describe('POST /api/drive-about-user', () => {
  it('should return user info with valid token', async () => {
    const mockToken = 'valid_google_token';
    
    // Mock Google API response
    jest.spyOn(global, 'fetch').mockResolvedValue({
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
    } as Response);
    
    const response = await request(app)
      .post('/api/drive-about-user')
      .set('X-Google-Token', mockToken)
      .set('Content-Type', 'application/json')
      .send({});
    
    expect(response.status).toBe(200);
    expect(response.body.user.emailAddress).toBe('test@example.com');
    expect(response.body.user.kind).toBe('drive#user');
  });
  
  it('should return 401 when token is missing', async () => {
    const response = await request(app)
      .post('/api/drive-about-user')
      .set('Content-Type', 'application/json')
      .send({});
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing X-Google-Token');
  });
  
  it('should return 401 when token is invalid', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);
    
    const response = await request(app)
      .post('/api/drive-about-user')
      .set('X-Google-Token', 'invalid_token')
      .set('Content-Type', 'application/json')
      .send({});
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid or expired');
  });
});
```

### E2E Test Example

```typescript
// test/e2e/google-drive-rest-api.test.ts

describe('Google Drive REST API E2E', () => {
  it('should retrieve user info end-to-end', async () => {
    // Assumes TEST_GOOGLE_ACCESS_TOKEN is set in environment
    const token = process.env.TEST_GOOGLE_ACCESS_TOKEN;
    if (!token) {
      console.warn('Skipping E2E test: TEST_GOOGLE_ACCESS_TOKEN not set');
      return;
    }
    
    const response = await request(app)
      .post('/api/drive-about-user')
      .set('X-Google-Token', token)
      .set('Content-Type', 'application/json')
      .send({});
    
    expect(response.status).toBe(200);
    expect(response.body.user.kind).toBe('drive#user');
    expect(response.body.user.me).toBe(true);
    expect(response.body.user.emailAddress).toMatch(/@.+\..+/);
  });
});
```

## Security Considerations

### Token Handling

- ✅ Access tokens passed via header (not query string or body)
- ✅ Tokens never logged in full (use `sanitizeTokenForLogging()`)
- ✅ Tokens validated before API call
- ✅ No token storage in database or cache

### CORS Configuration

For browser-based clients, configure CORS headers:

```typescript
// server/server.ts

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Adjust for production
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Google-Token');
  res.header('Access-Control-Allow-Methods', 'POST');
  next();
});
```

**Production**: Restrict `Access-Control-Allow-Origin` to specific domains

### Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
});

app.use('/api/', apiLimiter);
```

## Performance

### Expected Latency

- **p50**: < 500ms (Google Drive API response time)
- **p95**: < 2000ms (includes network latency)
- **p99**: < 5000ms (includes retries)

### Caching Strategy

**Phase 1**: No caching (return current user info)

**Future Enhancement**: Cache user info for 5 minutes

```typescript
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Before API call:
const cached = cache.get(googleToken);
if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
  return cached.data;
}

// After API call:
cache.set(googleToken, { data: userData, timestamp: Date.now() });
```

## Compliance

### REST API Standards

- ✅ Uses POST method (idempotent operation)
- ✅ Returns JSON response
- ✅ Proper HTTP status codes (200, 401, 403, 500)
- ✅ Standard error response format

### CascadeMCP Standards

- ✅ Dual interface pattern (MCP + REST)
- ✅ Shared core logic (reused from MCP tool)
- ✅ PAT authentication support
- ✅ Consistent error handling
- ✅ Proper logging with sanitization

## Related Contracts

- [MCP Tool Contract](./mcp-tool-drive-about-user.md) - MCP interface for the same functionality
- [OAuth Provider Contract](./oauth-provider-google.md) - Google OAuth provider interface
- [Google API Client Contract](./google-api-client.md) - API client interface
