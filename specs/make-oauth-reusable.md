# Suggested Enhancements for jira-mcp-auth-bridge

This document outlines strategic enhancements to the jira-mcp-auth-bridge project that would make it easier to adapt the OAuth implementation for other providers while maintaining backward compatibility with existing Atlassian/Jira functionality.

## 🎯 **Core Problem**

The current jira-mcp-auth-bridge is tightly coupled to Atlassian-specific OAuth endpoints, token structures, and configuration patterns. While the PKCE implementation is excellent and reusable, adapting it for other OAuth providers requires significant code duplication and provider-specific modifications.

##  **Proposed Enhancements**

### **Enhancement 1: Generic OAuth Provider Interface**

**Current Issue**: All OAuth logic hardcoded for Atlassian endpoints

**Proposed Solution**: Generic function interface that providers can implement

```typescript
// New: server/oauth-providers/provider-interface.ts

export interface AuthUrlParams {
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
}

export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface StandardTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id?: string;
}

export interface CallbackParams {
  code: string;
  state?: string;
  normalizedState?: string;
}

// Generic provider interface - each provider implements these functions
export interface OAuthProvider {
  name: string;
  
  // Each provider implements these with their specific logic
  createAuthUrl(params: AuthUrlParams): string;
  extractCallbackParams(req: any): CallbackParams;
  exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse>;
  
  // Optional provider-specific customizations
  validateTokenResponse?(response: any): boolean;
  mapTokenResponse?(response: any): StandardTokenResponse;
  getDefaultScopes?(): string[];
}
```

### **Enhancement 2: Refactored Atlassian Provider**

**Current Issue**: `atlassian-auth-code-flow.ts` is Atlassian-specific and hardcoded

**Proposed Solution**: Refactor existing Atlassian code to use the generic interface

```typescript
// Enhanced: server/oauth-providers/atlassian-provider.ts

import type { OAuthProvider, AuthUrlParams, TokenExchangeParams, StandardTokenResponse, CallbackParams } from './provider-interface.ts';

export const atlassianProvider: OAuthProvider = {
  name: 'atlassian',
  
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = params.clientId || process.env.VITE_JIRA_CLIENT_ID;
    const redirectUri = params.redirectUri || `${process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000'}/callback`;
    const scope = params.scope || 'read:jira-work write:jira-work offline_access';
    
    const urlParams = new URLSearchParams({
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    });
    
    if (params.state) {
      urlParams.set('state', params.state);
    }
    
    return `https://auth.atlassian.com/authorize?${urlParams.toString()}`;
  },
  
  extractCallbackParams(req: any): CallbackParams {
    const { code, state } = req.query;
    
    // Handle Atlassian-specific URL encoding: + gets decoded as space
    const normalizedState = state ? state.replace(/ /g, '+') : state;
    
    return {
      code: code || '',
      state,
      normalizedState,
    };
  },
  
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = params.clientId || process.env.VITE_JIRA_CLIENT_ID;
    const clientSecret = params.clientSecret || process.env.JIRA_CLIENT_SECRET;
    const redirectUri = params.redirectUri || `${process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000'}/callback`;
    
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    
    const tokenData = await tokenRes.json();
    
    if (!tokenData.access_token) {
      throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      scope: tokenData.scope,
      user_id: tokenData.user_id,
    };
  }
};
```



### **Enhancement 3: Factory Function Approach for All OAuth Endpoints**

**Current Issue**: All OAuth functions are hardcoded for Atlassian and cannot be reused

**Proposed Solution**: Convert all OAuth functions to factory functions that accept a provider

#### **Factory Functions Needed (Based on Codebase Analysis)**

**PKCE Endpoints (`server/pkce/`):**
- `makeAuthorize(provider)` - replaces `authorize`
- `makeCallback(provider)` - replaces `callback` 
- `makeAccessToken(provider)` - replaces `accessToken`
- `makeRefreshToken(provider)` - replaces `refreshToken`
- `makeOAuthMetadata(provider)` - replaces `oauthMetadata`
- `makeOAuthProtectedResourceMetadata(provider)` - replaces `oauthProtectedResourceMetadata`
- `makeDynamicClientRegistration(provider)` - replaces `dynamicClientRegistration`

**Token Helpers (`server/pkce/token-helpers.ts`):**
- `makeMCPAuthToken(provider)` - replaces `createJiraMCPAuthToken`
- `makeMCPRefreshToken(provider)` - replaces `createJiraMCPRefreshToken`

**Auth Context (`server/jira-mcp/auth-context-store.ts`):**
- Update `AuthContext` interface to use standard `access_token` field
- All MCP tools automatically work with any provider

```typescript
// Enhanced: server/pkce/token-helpers.ts

import { randomUUID } from 'crypto';
import { jwtSign } from '../tokens.ts';
import type { OAuthProvider, StandardTokenResponse } from '../oauth-providers/provider-interface.ts';

export interface TokenCreationOptions {
  jwtExpiresIn?: number;
  sessionId?: string;
  additionalClaims?: Record<string, any>;
}

/**
 * Create factory function for MCP auth token creation
 */
export function makeMCPAuthToken(provider: OAuthProvider) {
  return async function createMCPAuthToken(
    providerTokens: StandardTokenResponse,
    options: TokenCreationOptions = {}
  ): Promise<{ jwt: string; expiresIn: number }> {
    // Calculate JWT expiration: 1 minute before provider token expires
    const providerExpiresIn = providerTokens.expires_in || 3600;
    const jwtExpiresIn = options.jwtExpiresIn || 
      (process.env.TEST_SHORT_AUTH_TOKEN_EXP ? 
        parseInt(process.env.TEST_SHORT_AUTH_TOKEN_EXP) : 
        Math.max(60, providerExpiresIn - 60));
        
    const jwtExpirationTime = Math.floor(Date.now() / 1000) + jwtExpiresIn;
    
    if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
      console.log(`🧪 TEST MODE: Creating JWT token with ${jwtExpiresIn}s expiration (expires at ${new Date(jwtExpirationTime * 1000).toISOString()})`);
    }

  const payload = {
    // Standard OAuth token data (always same field names for MCP tools)
    access_token: providerTokens.access_token,
    refresh_token: providerTokens.refresh_token,
    token_type: providerTokens.token_type,
    expires_in: providerTokens.expires_in,
    scope: providerTokens.scope,
    
    // Standard JWT claims
    iss: process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000',
    sub: providerTokens.user_id || 'user',
    aud: 'mcp-client',
    exp: jwtExpirationTime,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
    
    // Provider metadata
    provider: provider.name,
    
    // Session information
    session_id: options.sessionId || randomUUID(),
    
    // Provider-specific data (if needed)
    provider_data: options.additionalClaims?.provider_data || {},
    
    // Additional custom claims
    ...options.additionalClaims,
  };

  return await jwtSign(payload);
}

/**
 * Create MCP refresh token (JWT) with embedded OAuth provider refresh token
 */
export async function createMCPRefreshToken(
  providerTokens: StandardTokenResponse,
  provider: OAuthProvider,
  options: TokenCreationOptions = {}
): Promise<string> {
  if (!providerTokens.refresh_token) {
    throw new Error(`${provider.name} refresh token not available`);
  }

  // Refresh tokens typically have longer expiration (30 days)
  const refreshExpiresIn = options.jwtExpiresIn || (30 * 24 * 60 * 60); // 30 days
  const jwtExpirationTime = Math.floor(Date.now() / 1000) + refreshExpiresIn;

  const payload = {
    // Standard refresh token data
    refresh_token: providerTokens.refresh_token,
    
    // Standard claims
    iss: process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000',
    sub: providerTokens.user_id || 'user',
    aud: 'mcp-client',
    exp: jwtExpirationTime,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
    
    // Token metadata
    token_type: 'refresh',
    provider: provider.name,
    session_id: options.sessionId || randomUUID(),
    
    ...options.additionalClaims,
  };

  return await jwtSign(payload);
}

// Backward compatibility for existing Atlassian code
export const createJiraMCPAuthToken = async (
  atlassianTokens: StandardTokenResponse, 
  options: TokenCreationOptions = {}
) => {
  const { atlassianProvider } = await import('../oauth-providers/atlassian-provider.ts');
  return createMCPAuthToken(atlassianTokens, atlassianProvider, options);
};

export const createJiraMCPRefreshToken = async (
  atlassianTokens: StandardTokenResponse,
  options: TokenCreationOptions = {}
) => {
  const { atlassianProvider } = await import('../oauth-providers/atlassian-provider.ts');
  return createMCPRefreshToken(atlassianTokens, atlassianProvider, options);
};
```

### **Enhancement 4: Complete Factory Function Implementation**

**Current Issue**: All PKCE endpoints hardcoded for Atlassian

**Proposed Solution**: Factory functions for all OAuth endpoints

```typescript
// Enhanced: server/pkce/authorize.ts

import { Request, Response } from 'express';
import { generateCodeVerifier, generateCodeChallenge } from '../tokens.ts';
import type { OAuthProvider, OAuthHandler } from './types.ts';

/**
 * Type guard to ensure query parameter is a string
 */
function getStringParam(param: unknown): string | undefined {
  return typeof param === 'string' ? param : undefined;
}

/**
 * Create authorization endpoint factory for any provider
 */
export function makeAuthorize(provider: OAuthProvider): OAuthHandler {
  return (req: Request, res: Response): void => {
    // Get parameters from query (sent by MCP client) with type guards
    const mcpClientId = getStringParam(req.query.client_id);
    const mcpRedirectUri = getStringParam(req.query.redirect_uri);
    const mcpScope = getStringParam(req.query.scope);
    const responseType = getStringParam(req.query.response_type) || 'code';
    const mcpResource = getStringParam(req.query.resource);
    
    // Handle PKCE parameters
    let codeVerifier = getStringParam(req.query.code_verifier);
    let codeChallenge = getStringParam(req.query.code_challenge);
    const codeChallengeMethod = getStringParam(req.query.code_challenge_method) || 'S256';

    // Generate PKCE parameters if not provided by client (MCP flow)
    if (!codeVerifier || !codeChallenge) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = generateCodeChallenge(codeVerifier);
      console.log('  Generated PKCE parameters for MCP client');
    }

    // Generate state for CSRF protection
    const mcpState = Buffer.from(JSON.stringify({
      clientId: mcpClientId,
      redirectUri: mcpRedirectUri,
      resource: mcpResource,
      timestamp: Date.now(),
    })).toString('base64');

    // Store OAuth session data for callback (no provider needed in session since factory knows)
    req.session.state = mcpState;
    req.session.codeVerifier = codeVerifier;
    req.session.mcpClientId = mcpClientId;
    req.session.mcpRedirectUri = mcpRedirectUri;
    req.session.mcpResource = mcpResource;
    // Note: No req.session.provider needed - factory closure has provider

    console.log('↔️ Authorization request received:', {
      provider: provider.name,
      responseType,
      scope: mcpScope,
      codeVerifier: codeVerifier ? 'present' : 'null (using MCP PKCE)',
      mcpClientId,
      mcpRedirectUri,
      mcpResource: mcpResource || 'undefined',
      usingMcpPkce: !codeVerifier,
    });

    // Create provider authorization URL with PKCE parameters
    const authUrl = provider.createAuthUrl({
      codeChallenge,
      codeChallengeMethod,
      state: mcpState,
      responseType,
      scope: mcpScope,
    });

    console.log(`  Redirecting to ${provider.name}:`, authUrl);
    res.redirect(authUrl);
  };
}

// Backward compatibility - import Atlassian provider and create endpoint
import { atlassianProvider } from '../oauth-providers/atlassian-provider.ts';
export const authorize = makeAuthorize(atlassianProvider);
```

```typescript
// Enhanced: server/pkce/callback.ts

import { Request, Response } from 'express';
import { isManualFlow, handleManualFlowCallback } from '../manual-token-flow.ts';
import type { OAuthProvider, OAuthHandler } from './types.ts';

/**
 * Create callback endpoint factory for any provider
 */
export function makeCallback(provider: OAuthProvider): OAuthHandler {
  return async (req: Request, res: Response): Promise<void> => {
    // Extract callback parameters using provider-specific logic
    const { code, state, normalizedState } = provider.extractCallbackParams(req);

    console.log('↔️ OAuth callback received:', {
      provider: provider.name,
      code: code ? 'present' : 'missing',
      state,
      sessionState: req.session.state,
      sessionData: {
        codeVerifier: req.session.codeVerifier ? 'present' : 'missing',
        mcpClientId: req.session.mcpClientId,
        mcpRedirectUri: req.session.mcpRedirectUri,
        manualFlow: req.session.manualFlow ? 'present' : 'missing',
      },
    });

    // Check if this is a manual flow callback
    if (isManualFlow(req)) {
      await handleManualFlowCallback(req, res, { code, state: normalizedState });
      return;
    }

    // Validate state parameter
    if (!state || !req.session.state) {
      console.error('❌ Missing or invalid state parameter');
      res.status(400).send('Invalid state parameter');
      return;
    }

    if (normalizedState !== req.session.state) {
      console.error('❌ State parameter mismatch:', { received: normalizedState, expected: req.session.state });
      res.status(400).send('State parameter mismatch');
      return;
    }

    if (!code) {
      console.error('❌ Missing authorization code');
      res.status(400).send('Missing authorization code');
      return;
    }

    // Extract MCP client information from session
    const mcpClientId = req.session.mcpClientId;
    const mcpRedirectUri = req.session.mcpRedirectUri;

    if (!mcpClientId || !mcpRedirectUri) {
      console.error('❌ Missing MCP client information in session');
      res.status(400).send('Invalid session state');
      return;
    }

    // Construct redirect URL back to MCP client with authorization code
    const redirectUrl = new URL(mcpRedirectUri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', state);

    console.log(`✅ ${provider.name} authorization successful, redirecting to MCP client:`, redirectUrl.toString());

    // Clean up session (no provider field needed)
    delete req.session.state;
    delete req.session.codeVerifier;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpResource;
    // Note: No provider cleanup needed - factory closure handles provider

    res.redirect(redirectUrl.toString());
  };
}

// Backward compatibility - import Atlassian provider and create endpoint
import { atlassianProvider } from '../oauth-providers/atlassian-provider.ts';
export const callback = makeCallback(atlassianProvider);
```

```typescript
// Enhanced: server/pkce/access-token.ts - Access token factory

export function makeAccessToken(provider: OAuthProvider): OAuthHandler {
  return async (req: Request, res: Response): Promise<void> => {
    console.log('↔️ OAuth token exchange request:', {
      provider: provider.name,
      body: sanitizeObjectWithJWTs(req.body),
    });

    try {
      const { grant_type, code, client_id, code_verifier, resource, refresh_token } = req.body;

      if (grant_type === 'authorization_code') {
        await handleAuthorizationCodeGrant(req, res, provider, { code, client_id, code_verifier, resource });
      } else if (grant_type === 'refresh_token') {
        await handleRefreshTokenGrant(req, res, provider, { refresh_token, client_id, resource });
      } else {
        sendErrorResponse(res, 'unsupported_grant_type', 'Only authorization_code and refresh_token grant types are supported');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`OAuth token error (${provider.name}):`, errorMessage);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error during token exchange',
      });
    }
  };
}

// Helper function using provider for token exchange
async function handleAuthorizationCodeGrant(
  req: Request,
  res: Response,
  provider: OAuthProvider,
  params: Partial<AuthorizationCodeGrantParams>
): Promise<void> {
  const { code, client_id, code_verifier, resource } = params;

  if (!code || !code_verifier) {
    sendErrorResponse(res, 'invalid_request', 'Missing required parameters: code and code_verifier');
    return;
  }

  console.log(`  Exchanging code with ${provider.name}...`);
  
  // Use provider-specific token exchange
  const tokenData = await provider.exchangeCodeForTokens({
    code,
    codeVerifier: code_verifier,
  });

  console.log(`🔑 ${provider.name} token exchange successful`);

  // Create MCP JWT tokens using the generic helpers
  const createAuthToken = makeMCPAuthToken(provider);
  const createRefreshToken = makeMCPRefreshToken(provider);
  
  const { jwt } = await createAuthToken(tokenData, {
    resource: resource || process.env.VITE_AUTH_SERVER_URL
  });

  const { refreshToken } = await createRefreshToken(tokenData, {
    resource: resource || process.env.VITE_AUTH_SERVER_URL
  });

  // Return OAuth-compliant response
  const jwtExpiresIn = Math.max(60, (tokenData.expires_in || 3600) - 60);
  res.json({
    access_token: jwt,
    token_type: 'Bearer',
    expires_in: jwtExpiresIn,
    refresh_token: refreshToken,
    scope: tokenData.scope,
  });
}

// Backward compatibility
export const accessToken = makeAccessToken(atlassianProvider);
```

```typescript
// Enhanced: server/pkce/discovery.ts - Discovery endpoints factory

export function makeOAuthMetadata(provider: OAuthProvider): OAuthHandler {
  return (req: Request, res: Response): void => {
    console.log(`↔️ Received request for OAuth metadata (${provider.name})`);
    res.json({
      issuer: process.env.VITE_AUTH_SERVER_URL,
      authorization_endpoint: process.env.VITE_AUTH_SERVER_URL + '/authorize',
      token_endpoint: process.env.VITE_AUTH_SERVER_URL + '/access-token',
      registration_endpoint: process.env.VITE_AUTH_SERVER_URL + '/register',
      // Provider-specific scopes and capabilities
      scopes_supported: provider.getDefaultScopes?.() || ['read', 'write'],
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      // Add provider-specific metadata
      provider: provider.name,
    });
  };
}

export function makeOAuthProtectedResourceMetadata(provider: OAuthProvider): OAuthHandler {
  return (req: Request, res: Response): void => {
    console.log(`↔️ Received request for protected resource metadata (${provider.name})`);
    res.json({
      resource: process.env.VITE_AUTH_SERVER_URL,
      authorization_servers: [process.env.VITE_AUTH_SERVER_URL],
      scopes_provided: provider.getDefaultScopes?.() || ['read', 'write'],
      bearer_methods_supported: ['header'],
      provider: provider.name,
    });
  };
}

export function makeDynamicClientRegistration(provider: OAuthProvider): OAuthHandler {
  return (req: Request, res: Response): void => {
    console.log(`↔️ Dynamic client registration request (${provider.name}):`, req.body);
    // Provider-aware client registration logic
    // ...
  };
}

// Backward compatibility
export const oauthMetadata = makeOAuthMetadata(atlassianProvider);
export const oauthProtectedResourceMetadata = makeOAuthProtectedResourceMetadata(atlassianProvider);
export const dynamicClientRegistration = makeDynamicClientRegistration(atlassianProvider);
```



## 🔄 **Migration Strategy**

### **Backward Compatibility**
1. **Add new generic modules** alongside existing Atlassian-specific ones
2. **Export backward-compatible functions** that wrap generic implementations
3. **All existing code continues to work** without changes

### **Provider Implementation**
1. **Generic interface** for implementing provider-specific OAuth logic
2. **Factory functions** for creating provider-specific endpoints
3. **Direct provider usage** - each project imports and uses their provider directly

### **Enhanced Features**
1. **Provider-specific UI themes** and branding
2. **Provider-specific error handling** and user experience
3. **Provider-specific token refresh strategies**

## 📖 **Usage Examples**

### **Server Setup with Factory Functions**:
```typescript
// server/server.ts - Explicit provider injection
import { atlassianProvider } from './oauth-providers/atlassian-provider.ts';
import { 
  makeAuthorize, 
  makeCallback, 
  makeAccessToken, 
  makeOAuthMetadata,
  makeOAuthProtectedResourceMetadata,
  makeDynamicClientRegistration
} from './pkce/index.ts';

// Validate provider configuration at startup
const validation = atlassianProvider.validateConfig();
if (!validation.valid) {
  console.error('❌ Provider configuration invalid:', validation.errors);
  process.exit(1);
}

console.log(`✅ OAuth provider configured: ${atlassianProvider.name}`);

// Create provider-specific endpoints with explicit dependency injection
app.get('/.well-known/oauth-authorization-server', makeOAuthMetadata(atlassianProvider));
app.get('/.well-known/oauth-protected-resource', makeOAuthProtectedResourceMetadata(atlassianProvider));
app.post('/register', express.json(), makeDynamicClientRegistration(atlassianProvider));
app.get('/authorize', makeAuthorize(atlassianProvider));
app.get('/callback', makeCallback(atlassianProvider));
app.post('/access-token', makeAccessToken(atlassianProvider));
```

### **Custom Provider Implementation**:
```typescript
// Define custom provider implementation
import type { OAuthProvider } from 'jira-mcp-auth-bridge/server/oauth-providers/provider-interface';
import { createMCPAuthToken } from 'jira-mcp-auth-bridge/server/pkce/token-helpers';

const customProvider: OAuthProvider = {
  name: 'custom',
  
  createAuthUrl(params) {
    // Custom auth URL logic with any provider-specific quirks
    const urlParams = new URLSearchParams({
      client_id: process.env.CUSTOM_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: params.redirectUri || 'http://localhost:3000/callback',
      scope: params.scope || 'read write',
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    });
    
    if (params.state) {
      urlParams.set('state', params.state);
    }
    
    return `https://custom.com/oauth/authorize?${urlParams.toString()}`;
  },
  
  extractCallbackParams(req) {
    // Handle any custom URL encoding or parameter quirks
    const { code, state } = req.query;
    return {
      code: code || '',
      state,
      normalizedState: state, // No special handling needed
    };
  },
  
  async exchangeCodeForTokens(params) {
    // Custom token exchange with provider-specific logic
    const response = await fetch('https://custom.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.CUSTOM_CLIENT_ID,
        client_secret: process.env.CUSTOM_CLIENT_SECRET,
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    
    const data = await response.json();
    
    // Handle custom response format
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in || 3600,
      scope: data.scope,
      user_id: data.user?.id, // Custom user ID extraction
    };
  }
};

// Direct provider usage for testing or manual flows
const authUrl = customProvider.createAuthUrl(params);
const tokens = await customProvider.exchangeCodeForTokens({ code, codeVerifier });

// Create JWT tokens using factory
const createAuthToken = makeMCPAuthToken(customProvider);
const { jwt } = await createAuthToken(tokens);

// Create all OAuth endpoints for custom provider
import { 
  makeAuthorize, 
  makeCallback, 
  makeAccessToken,
  makeOAuthMetadata 
} from 'jira-mcp-auth-bridge/server/pkce';

// Server setup with custom provider
app.get('/.well-known/oauth-authorization-server', makeOAuthMetadata(customProvider));
app.get('/authorize', makeAuthorize(customProvider));
app.get('/callback', makeCallback(customProvider));
app.post('/access-token', makeAccessToken(customProvider));
```

## ✅ **Benefits**

### **For jira-mcp-auth-bridge Project**:
- **Broader adoption**: Becomes useful for any OAuth provider
- **Backward compatibility**: Existing Atlassian/Jira code unaffected through compatibility exports
- **Community growth**: Attracts contributors working with different APIs
- **Project value**: Becomes a general-purpose OAuth MCP bridge

### **For New Provider Implementations**:
- **Factory-based patterns**: New providers work by passing to factory functions vs. full implementation
- **Automatic improvements**: Benefit from upstream PKCE/JWT enhancements  
- **Battle-tested code**: Inherit production-proven OAuth security
- **Consistent patterns**: Same architecture patterns for any OAuth provider
- **No registry complexity**: Direct provider injection, no hidden state

### **For Maintainers**:
- **Clean architecture**: Provider injection with factory functions
- **Easier testing**: Factory functions easily accept mock providers
- **Better documentation**: Clear separation of concerns with explicit dependencies
- **Easier debugging**: Provider-specific logging and error handling
- **Type safety**: Factory functions maintain full TypeScript support

## 🔄 **Migration Strategy**

### **Phase 1: Interface and Factory Creation (Low Risk)**
1. **Add provider interface** without changing existing implementation
2. **Create factory functions** alongside existing exports
3. **Maintain backward compatibility** with existing function exports

### **Phase 2: Provider Implementation** 
1. **Implement atlassianProvider** object using existing logic
2. **Update server.ts** to use factory functions with atlassianProvider
3. **Keep existing exports** working via compatibility layer

### **Phase 3: Validation with Second Provider**
1. **Implement a second provider** (GitHub, Google, etc.) to validate interface
2. **Test provider switching** in development environment
3. **Validate interface completeness** and error handling

### **Phase 4: Documentation & Examples**
1. **Document provider implementation** guide with examples
2. **Create example custom provider** templates
3. **Update README** with factory function usage patterns

## 🏗️ **Complete Factory Function List**

Based on codebase analysis, here are **ALL** functions that need factory versions:

### **Core PKCE Endpoints** (`server/pkce/`):
- `makeAuthorize(provider)` → replaces `authorize` 
- `makeCallback(provider)` → replaces `callback`
- `makeAccessToken(provider)` → replaces `accessToken`
- `makeRefreshToken(provider)` → replaces `refreshToken`

### **Discovery Endpoints** (`server/pkce/discovery.ts`):
- `makeOAuthMetadata(provider)` → replaces `oauthMetadata`
- `makeOAuthProtectedResourceMetadata(provider)` → replaces `oauthProtectedResourceMetadata`
- `makeDynamicClientRegistration(provider)` → replaces `dynamicClientRegistration`

### **Token Helpers** (`server/pkce/token-helpers.ts`):
- `makeMCPAuthToken(provider)` → replaces `createJiraMCPAuthToken`
- `makeMCPRefreshToken(provider)` → replaces `createJiraMCPRefreshToken`

### **Auth Context** (`server/jira-mcp/auth-context-store.ts`):
- **Update `AuthContext` interface** to use standard `access_token` field
- **All MCP tools automatically work** with any provider (no changes needed)

### **Backward Compatibility Exports**:
```typescript
// All existing exports continue to work
export const authorize = makeAuthorize(atlassianProvider);
export const callback = makeCallback(atlassianProvider);
export const accessToken = makeAccessToken(atlassianProvider);
export const createJiraMCPAuthToken = makeMCPAuthToken(atlassianProvider);
// ... etc for all functions
```