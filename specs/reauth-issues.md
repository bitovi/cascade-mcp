# OAuth Re-authentication Issues: Analysis and Implementation

## Summary of Changes Since Last Commit

This document summarizes the comprehensive OAuth re-authentication implementation and security fixes made to address VS Code MCP client token expiration issues.

## 🔒 Security Fix: Cross-User Authentication Vulnerability

**Critical Issue Fixed**: The `getAuthInfo()` function had a dangerous global fallback that could return any user's authentication token.

### Before (Security Vulnerability):
```javascript
export function getAuthInfo(context) {
  // First try to get from context if it's directly available
  if (context?.authInfo?.atlassian_access_token) {
    return context.authInfo;
  }

  // DANGEROUS: Try to get from ANY stored auth context
  for (const [sessionId, authInfo] of authContextStore.entries()) {
    if (authInfo?.atlassian_access_token) {
      return authInfo; // Returns ANY user's token!
    }
  }

  return null;
}
```

### After (Secure Implementation):
```javascript
export function getAuthInfo(context) {
  // Only get auth from the MCP context - no global fallback for security
  if (context?.authInfo?.atlassian_access_token) {
    if (isTokenExpired(context.authInfo)) {
      logger.info('Auth token from context is expired - triggering re-authentication');
      throw new InvalidTokenError('The access token expired and re-authentication is needed.');
    }
    return context.authInfo;
  }

  // No auth found in context
  return null;
}
```

**Impact**: Eliminated cross-user data access vulnerability where User A could get User B's Jira access tokens.

## 🛠️ New Authentication Infrastructure

### 1. Token Expiration Detection System

Added comprehensive JWT token expiration checking:

```javascript
function isTokenExpired(authInfo) {
  // Test mechanism to force token expiration
  if (testForcingTokenExpired) {
    logger.info('Test mechanism: forcing token expired');
    return true;
  }
  
  if (!authInfo?.exp) {
    // If no expiration field, assume it's expired for safety
    return true;
  }
  
  // JWT exp field is in seconds, Date.now() is in milliseconds
  const now = Math.floor(Date.now() / 1000);
  return now >= authInfo.exp;
}
```

### 2. Proper OAuth Error Handling

Implemented RFC 6750-compliant OAuth error responses:

```javascript
// In mcp-service.js - Enhanced 401 responses
function send401(res, jsonResponse, includeInvalidToken = false) {
  const wwwAuthHeader = includeInvalidToken 
    ? `Bearer realm="mcp", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token expired - please re-authenticate"`
    : `Bearer realm="mcp", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`;
    
  return res
      .status(401)
      .header('WWW-Authenticate', wwwAuthHeader)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .json({ error: 'Invalid or missing token' });
}
```

### 3. Session-Level Authentication Validation

Added session-level auth validation in `handleMcpPost()`:

```javascript
if (sessionId && transports[sessionId]) {
  // For existing sessions, validate that the stored auth is still valid
  try {
    const storedAuthInfo = getAuthContext(sessionId);
    if (storedAuthInfo && isJwtTokenExpired(storedAuthInfo)) {
      console.log(`Stored auth token for session ${sessionId} is expired - cleaning up and requiring re-auth`);
      // Clean up expired session
      delete transports[sessionId];
      clearAuthContext(sessionId);
      
      // Send 401 to trigger re-authentication
      const wwwAuthValue = `Bearer realm="mcp", error="invalid_token", error_description="The access token expired and re-authentication is needed."`;
      res.set('WWW-Authenticate', wwwAuthValue);
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication required: The access token expired and re-authentication is needed.',
        },
        id: req.body.id || null,
      });
      return;
    }
  } catch (error) {
    console.log('Error checking stored auth context:', error);
  }
}
```

## 📊 Code Quality Improvements

### 1. DRY Authentication Pattern

Introduced `getAuthInfoSafe()` wrapper to eliminate repetitive error handling across all MCP tools:

```javascript
export function getAuthInfoSafe(context, toolName = 'unknown-tool') {
  try {
    return getAuthInfo(context);
  } catch (error) {
    // If it's an InvalidTokenError, re-throw it to trigger OAuth re-authentication
    if (error.constructor.name === 'InvalidTokenError') {
      logger.info(`Token expired in ${toolName}, re-throwing for OAuth re-auth`);
      throw error;
    }
    // For other errors, log and throw a tool error response
    logger.error(`Unexpected error getting auth info in ${toolName}:`, error);
    throw {
      content: [
        {
          type: 'text',
          text: `Error: Failed to get authentication info - ${error.message}`,
        },
      ],
    };
  }
}
```

### 2. Updated All MCP Tools

All four MCP tools now use the consistent authentication pattern:

**Before:**
```javascript
const authInfo = getAuthInfo(context);
```

**After:**
```javascript
// Get auth info with proper error handling
const authInfo = getAuthInfoSafe(context, 'get-jira-issue');
```

Tools updated:
- `tool-get-accessible-sites.js`
- `tool-get-jira-issue.js` 
- `tool-get-jira-attachments.js`
- `tool-update-issue-description.js`

### 3. Enhanced Logging and Debugging

Added comprehensive token expiration logging:

```javascript
function logTokenExpiration(payload) {
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = payload.exp - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60);
    const secondsUntilExpiry = timeUntilExpiry % 60;
    
    if (timeUntilExpiry > 0) {
      console.log(`Token expires in ${minutesUntilExpiry}m ${secondsUntilExpiry}s`);
    } else {
      console.log(`Token expired ${Math.abs(minutesUntilExpiry)}m ${Math.abs(secondsUntilExpiry)}s ago`);
    }
  }
}
```

## 🔧 Supporting Infrastructure

### 1. Added VS Code MCP Client Support

Added `/api/connections` endpoint for VS Code MCP client compatibility:

```javascript
// API endpoint for connection status (VS Code MCP client seems to expect this)
app.get('/api/connections', (req, res) => {
  res.json({
    status: 'active',
    authenticated: false, // Always return false to force re-auth
    message: 'Please re-authenticate via MCP OAuth flow'
  });
});
```

### 2. Enhanced InvalidTokenError Handling

Improved error handling in `mcp-service.js` to properly catch and respond to `InvalidTokenError`:

```javascript
} catch (error) {
  // Check if this is an MCP OAuth authentication error
  if (error instanceof InvalidTokenError) {
    console.log('MCP OAuth authentication expired - sending proper OAuth 401 response');
    
    // Send proper OAuth 401 response with WWW-Authenticate header according to RFC 6750
    const wwwAuthValue = `Bearer realm="mcp", error="invalid_token", error_description="${error.message}", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`;
    
    res.set('WWW-Authenticate', wwwAuthValue);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Authentication required: ' + error.message,
      },
      id: req.body.id || null,
    });
    return;
  }
  
  // Re-throw other errors
  throw error;
}
```

## 🧪 Testing Infrastructure

### 1. Token Expiration Testing Mechanism

Added controllable test mechanism for forcing token expiration (currently disabled):

```javascript
let testForcingTokenExpired = false;
/*
setTimeout(() => {
  testForcingTokenExpired = true;
  logger.info('Test forcing token expired enabled');
}, 15000); // Enable after 15 seconds for testing purposes
*/
```

### 2. Authentication Context Management

Enhanced the auth context management with proper cleanup:

```javascript
/**
 * Function to get auth context for a transport
 * @param {string} transportId - Transport identifier
 * @returns {Object|undefined} Auth info object or undefined if not found
 */
export function getAuthContext(transportId) {
  return authContextStore.get(transportId);
}
```

## 🚨 Known Issue: VS Code MCP Client Limitation

### Problem Identified
Despite implementing proper OAuth 2.0 RFC 6750-compliant 401 responses, VS Code MCP client does not automatically re-authenticate when tokens expire. The client:

1. ✅ Correctly receives 401 responses
2. ✅ Fetches OAuth metadata from `/.well-known/oauth-authorization-server`
3. ❌ **Does not initiate OAuth re-authentication flow**
4. ❌ Continues using the expired token indefinitely

### Testing Results
Manual HTTP testing confirms our server implementation is correct:

```bash
$ curl -i -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <expired-token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", resource_metadata_url="http://localhost:3000/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token expired - please re-authenticate"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

### Current Workaround
JWT tokens are set to expire in 15 minutes (`setExpirationTime('15m')` in `tokens.js`). For development, this can be extended, but the root issue is in the VS Code MCP client implementation.

## 📈 Files Modified

1. **`server/jira-mcp/auth-helpers.js`** - Core authentication logic with security fixes
2. **`server/jira-mcp/index.js`** - Added `getAuthContext` export  
3. **`server/jira-mcp/tool-*.js`** (4 files) - Updated to use `getAuthInfoSafe`
4. **`server/mcp-service.js`** - Enhanced 401 responses and session validation
5. **`server/server.js`** - Added `/api/connections` endpoint

## 🎯 Achievements

- ✅ **Security**: Fixed critical cross-user authentication vulnerability
- ✅ **OAuth Compliance**: Implemented proper RFC 6750 OAuth error responses  
- ✅ **Code Quality**: DRY authentication pattern across all tools
- ✅ **Debugging**: Comprehensive logging for token expiration tracking
- ✅ **Session Management**: Proper session-level authentication validation
- ✅ **Error Handling**: Consistent `InvalidTokenError` handling throughout

The implementation is OAuth 2.0 compliant and secure. The remaining issue is a limitation in the VS Code MCP client's OAuth re-authentication handling.
