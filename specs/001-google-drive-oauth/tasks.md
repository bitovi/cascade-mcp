# Implementation Tasks: Google Drive OAuth Integration

**Feature**: Google Drive OAuth and "whoami" tool  
**Branch**: `001-google-drive-oauth`  
**Date**: December 18, 2025  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Task Overview

This feature adds Google Drive as a third OAuth provider to CascadeMCP, implementing traditional OAuth 2.0 flow and a `drive-about-user` tool. Tasks are organized by user story to enable independent implementation and testing.

**Total Tasks**: 23  
**Parallelizable**: 8 tasks  
**Estimated Time**: 4-6 hours

## Implementation Strategy

**MVP Scope**: User Story 1 (OAuth Authentication) - Delivers core authentication capability  
**Incremental Delivery**: Complete US1 → Test independently → Add US2  
**Parallel Opportunities**: Provider setup, types, and API client can be developed in parallel

## Phase 1: Setup & Configuration

**Goal**: Prepare development environment and Google Cloud Console configuration

### Tasks

- [X] T001 Create Google Cloud Console project and enable Google Drive API
- [X] T002 Configure OAuth consent screen with app details and Drive scope
- [X] T003 Create OAuth 2.0 credentials (web application type) with redirect URIs
- [X] T004 Add environment variables to .env file (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_SCOPES)
- [X] T005 Create provider directory structure at server/providers/google/

## Phase 2: Foundational Components

**Goal**: Build reusable provider infrastructure (blocking prerequisites for both user stories)

### Tasks

- [X] T006 [P] Create TypeScript interfaces in server/providers/google/types.ts
- [X] T007 [P] Create Google API client factory in server/providers/google/google-api-client.ts
- [X] T008 Implement OAuthProvider interface in server/providers/google/index.ts

**Parallel Execution**: T006 and T007 can run in parallel (different files, no dependencies)

## Phase 3: User Story 1 - OAuth Authentication (P1)

**Story Goal**: Enable developers to authenticate their Google Drive account via OAuth 2.0 flow

**Independent Test**: Initiate OAuth flow → Complete authorization → Verify access/refresh tokens stored

### Tasks

- [X] T009 [US1] Implement createAuthUrl() method in server/providers/google/index.ts
- [X] T010 [US1] Implement extractCallbackParams() method in server/providers/google/index.ts
- [X] T011 [US1] Implement exchangeCodeForTokens() method in server/providers/google/index.ts
- [X] T012 [US1] Implement getDefaultScopes() method in server/providers/google/index.ts
- [X] T013 [US1] Add Google provider to REQUIRED_PROVIDERS in server/provider-server-oauth/connection-hub.ts
- [X] T014 [US1] Register Google provider in server initialization (server.ts or provider registry)
- [X] T015 [US1] Test OAuth flow end-to-end (browser → Google consent → callback → tokens stored)

**Test Criteria for US1**:

- User can click "Connect Google Drive" in connection hub
- User is redirected to Google authorization page
- After approval, callback redirects back with tokens
- Access token and refresh token are stored in session
- Connection hub shows "✓ Google Drive Connected"

## Phase 4: User Story 2 - Retrieve User Information (P2)

**Story Goal**: Provide `drive-about-user` tool to verify authentication and retrieve user profile

**Independent Test**: Call `drive-about-user` tool → Receive JSON with user email, display name, permission ID

### Tasks

- [X] T016 [P] [US2] Create tool directory at server/providers/google/tools/drive-about-user/
- [X] T017 [P] [US2] Implement MCP tool in server/providers/google/tools/drive-about-user/drive-about-user.ts
- [X] T018 [US2] Create tool registration file at server/providers/google/tools/index.ts
- [X] T019 [US2] Implement registerTools() method in server/providers/google/index.ts
- [X] T020 [P] [US2] Create REST API handler in server/api/drive-about-user.ts
- [X] T021 [US2] Register REST API route in server/server.ts
- [X] T022 [US2] Test MCP tool (call drive-about-user → verify JSON response with user data)
- [X] T023 [US2] Test REST API endpoint (POST /api/drive-about-user with X-Google-Token header)

**Parallel Execution**: T016-T017 (MCP tool) and T020 (REST API) can be developed in parallel

**Test Criteria for US2**:

- MCP tool returns user JSON with displayName, emailAddress, permissionId
- REST API endpoint returns same data structure
- Both interfaces use correct Drive API endpoint with fields parameter
- Proper error handling for missing/invalid tokens

## Final Phase: Polish & Cross-Cutting Concerns

**Goal**: Documentation, error handling refinement, and production readiness

### Tasks

(No additional tasks - all core functionality covered in user story phases)

## Task Dependencies

### Dependency Graph

```text
Setup Phase (T001-T005)
  ↓
Foundational Phase (T006-T008)
  ↓
┌─────────────────────────────┐
│ User Story 1 (T009-T015)    │ ← Must complete before US2
└─────────────────────────────┘
  ↓
┌─────────────────────────────┐
│ User Story 2 (T016-T023)    │
└─────────────────────────────┘
```

### User Story Completion Order

1. **US1 first** (P1 - Foundation): OAuth authentication is required before any API calls
2. **US2 second** (P2 - First operation): Depends on US1 being complete and testable

### Critical Path

```
T001 → T002 → T003 → T004 → T005 → T008 → T009 → T010 → T011 → T013 → T014 → T015 → T019 → T022
```

**Parallel opportunities outside critical path**: T006, T007 (types & API client), T016-T017, T020 (tool & REST API)

## Parallel Execution Examples

### Foundational Phase Parallelization

**Parallel Batch 1**:

- Developer A: T006 (types.ts) - Define TypeScript interfaces
- Developer B: T007 (google-api-client.ts) - Implement API client factory
- **Wait for**: Both complete before T008 (provider interface)

### User Story 2 Parallelization

**Parallel Batch 2**:

- Developer A: T016 + T017 (MCP tool) - Create and implement drive-about-user tool
- Developer B: T020 (REST API) - Create REST API handler
- **Wait for**: Both complete before T021 (route registration) and T022-T023 (testing)

## Detailed Task Specifications

### Phase 1: Setup & Configuration

#### T001: Create Google Cloud Console project and enable Google Drive API

**Deliverable**: Google Cloud project with Drive API enabled

**Steps**:

1. Go to Google Cloud Console
2. Create new project or select existing
3. Navigate to APIs & Services → Library
4. Search "Google Drive API" and click Enable

**Validation**: Drive API shows as "Enabled" in APIs & Services dashboard

#### T002: Configure OAuth consent screen with app details and Drive scope

**Deliverable**: OAuth consent screen configured with required scopes

**Steps**:

1. Navigate to APIs & Services → OAuth consent screen
2. Select user type (Internal or External)
3. Fill in app name, user support email, developer contact
4. Add scope: `https://www.googleapis.com/auth/drive`
5. Add test users (for External apps)

**Validation**: Consent screen shows "Complete" status

#### T003: Create OAuth 2.0 credentials (web application type) with redirect URIs

**Deliverable**: OAuth client ID and secret

**Steps**:

1. Go to APIs & Services → Credentials
2. Create Credentials → OAuth client ID
3. Select Web application
4. Add authorized redirect URI: `http://localhost:3000/auth/callback/google`
5. Download credentials JSON

**Validation**: Client ID and secret available, redirect URI registered

#### T004: Add environment variables to .env file

**Deliverable**: Environment variables configured

**File**: `.env`

**Content to add**:

```bash
GOOGLE_CLIENT_ID=<client_id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<secret>
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive
```

**Validation**: `echo $GOOGLE_CLIENT_ID` returns correct value

#### T005: Create provider directory structure

**Deliverable**: Directory structure for Google provider

**Files to create**:

- `server/providers/google/` (directory)

**Validation**: Directory exists and is empty

### Phase 2: Foundational Components

#### T006: Create TypeScript interfaces in types.ts

**Deliverable**: Type definitions for Google Drive data structures

**File**: `server/providers/google/types.ts`

**Content** (from data-model.md):

```typescript
export interface GoogleOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  issued_at?: number;
}

export interface DriveUser {
  kind: 'drive#user';
  displayName: string;
  emailAddress: string;
  permissionId: string;
  photoLink?: string;
  me: true;
}

export interface DriveAboutResponse {
  user: DriveUser;
}
```

**Validation**: File compiles without TypeScript errors

#### T007: Create Google API client factory in google-api-client.ts

**Deliverable**: API client factory functions for OAuth and PAT authentication

**File**: `server/providers/google/google-api-client.ts`

**Content** (pattern from contracts/oauth-provider-google.md):

```typescript
export function createGoogleClient(accessToken: string) {
  return {
    async fetchAboutUser() {
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
        throw new Error(`Drive API error: ${response.status}`);
      }
      
      return response.json();
    }
  };
}

export function createGoogleClientWithPAT(token: string) {
  return createGoogleClient(token);
}
```

**Validation**: File compiles, exports both factory functions

#### T008: Implement OAuthProvider interface in index.ts

**Deliverable**: Google provider object implementing OAuthProvider interface

**File**: `server/providers/google/index.ts`

**Content** (pattern from contracts/oauth-provider-google.md):

```typescript
import type { OAuthProvider } from '../provider-interface.js';

export const googleProvider: OAuthProvider = {
  name: 'google',
  
  createAuthUrl(params) {
    // Implementation from contract
  },
  
  extractCallbackParams(req) {
    // Implementation from contract
  },
  
  async exchangeCodeForTokens(params) {
    // Implementation from contract
  },
  
  getDefaultScopes() {
    return ['https://www.googleapis.com/auth/drive'];
  },
  
  registerTools(mcp, authContext) {
    // Placeholder - implemented in T019
  },
};
```

**Validation**: File compiles, exports googleProvider object

### Phase 3: User Story 1 Tasks

#### T009: Implement createAuthUrl() method

**Deliverable**: Authorization URL generation for Google OAuth

**File**: `server/providers/google/index.ts`

**Implementation** (from contracts/oauth-provider-google.md):

```typescript
createAuthUrl(params: AuthUrlParams): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  const scope = params.scope || process.env.GOOGLE_OAUTH_SCOPES!;
  
  const urlParams: Record<string, string> = {
    client_id: clientId!,
    response_type: params.responseType || 'code',
    redirect_uri: redirectUri,
    scope,
    access_type: 'offline',
  };
  
  if (params.state) {
    urlParams.state = params.state;
  }
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(urlParams).toString()}`;
}
```

**Validation**: Method generates valid Google OAuth URL with correct parameters

#### T010: Implement extractCallbackParams() method

**Deliverable**: OAuth callback parameter extraction

**File**: `server/providers/google/index.ts`

**Implementation**:

```typescript
extractCallbackParams(req: any): CallbackParams {
  const { code, state } = req.query;
  
  return {
    code: code || '',
    state,
    normalizedState: state,
  };
}
```

**Validation**: Method correctly extracts code and state from callback URL

#### T011: Implement exchangeCodeForTokens() method

**Deliverable**: Token exchange logic with Google OAuth endpoint

**File**: `server/providers/google/index.ts`

**Implementation** (from contracts/oauth-provider-google.md):

```typescript
async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code: params.code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  
  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${errorText}`);
  }
  
  const tokenData = await tokenRes.json();
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 3600,
    scope: tokenData.scope,
  };
}
```

**Validation**: Method successfully exchanges code for tokens with Google

#### T012: Implement getDefaultScopes() method

**Deliverable**: Default OAuth scopes for Google Drive

**File**: `server/providers/google/index.ts`

**Implementation**:

```typescript
getDefaultScopes(): string[] {
  return ['https://www.googleapis.com/auth/drive'];
}
```

**Validation**: Method returns correct Drive scope

#### T013: Add Google provider to REQUIRED_PROVIDERS

**Deliverable**: Connection hub recognizes Google as required provider

**File**: `server/provider-server-oauth/connection-hub.ts`

**Change**:

```typescript
const REQUIRED_PROVIDERS = ['atlassian', 'figma', 'google'] as const;
```

**Validation**: Connection hub shows "Connect Google Drive" button

#### T014: Register Google provider in server initialization

**Deliverable**: Google provider registered with provider registry

**File**: `server/server.ts` (or relevant provider initialization file)

**Change**:

```typescript
import { googleProvider } from './providers/google/index.js';

// In provider registration section:
providers.set('google', googleProvider);
```

**Validation**: Server starts without errors, Google provider available

#### T015: Test OAuth flow end-to-end

**Deliverable**: Complete OAuth flow verification

**Test Steps**:

1. Start server: `npm run start-local`
2. Navigate to `http://localhost:3000/authorize`
3. Click "Connect Google Drive"
4. Complete Google authorization
5. Verify redirect back to connection hub
6. Confirm "✓ Google Drive Connected" displayed
7. Check session storage for access_token and refresh_token

**Validation**: All test steps pass, tokens stored correctly

### Phase 4: User Story 2 Tasks

#### T016: Create tool directory

**Deliverable**: Directory structure for drive-about-user tool

**File**: `server/providers/google/tools/drive-about-user/` (directory)

**Validation**: Directory exists

#### T017: Implement MCP tool in drive-about-user.ts

**Deliverable**: MCP tool implementation

**File**: `server/providers/google/tools/drive-about-user/drive-about-user.ts`

**Content** (from contracts/mcp-tool-drive-about-user.md):

```typescript
import type { McpServer } from '../../../../mcp-core/mcp-types.js';

export function registerDriveAboutUserTool(mcp: McpServer, authContext: any): void {
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
    
    const accessToken = context.auth?.google_access_token;
    if (!accessToken) {
      throw new Error('Google Drive authentication required');
    }
    
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

**Validation**: Tool registers without errors, compiles successfully

#### T018: Create tool registration file

**Deliverable**: Tool registration exports

**File**: `server/providers/google/tools/index.ts`

**Content**:

```typescript
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerDriveAboutUserTool } from './drive-about-user/drive-about-user.js';

export function registerGoogleTools(mcp: McpServer, authContext: any): void {
  registerDriveAboutUserTool(mcp, authContext);
}
```

**Validation**: File compiles, exports registerGoogleTools

#### T019: Implement registerTools() method

**Deliverable**: Tool registration in provider

**File**: `server/providers/google/index.ts`

**Implementation**:

```typescript
import { registerGoogleTools } from './tools/index.js';

// In googleProvider object:
registerTools(mcp: McpServer, authContext: any): void {
  registerGoogleTools(mcp, authContext);
}
```

**Validation**: Tools register when provider is initialized

#### T020: Create REST API handler

**Deliverable**: REST API endpoint handler

**File**: `server/api/drive-about-user.ts`

**Content** (from contracts/rest-api-drive-about-user.md):

```typescript
import type { Request, Response } from 'express';
import { createGoogleClientWithPAT } from '../providers/google/google-api-client.js';

export async function handleDriveAboutUser(req: Request, res: Response): Promise<void> {
  console.log('[API] drive-about-user request received');
  
  const googleToken = req.headers['x-google-token'] as string;
  if (!googleToken) {
    res.status(401).json({
      error: 'Missing X-Google-Token header',
    });
    return;
  }
  
  try {
    const client = createGoogleClientWithPAT(googleToken);
    const userData = await client.fetchAboutUser();
    
    console.log(`[API] Retrieved user: ${userData.user.emailAddress}`);
    
    res.status(200).json(userData);
  } catch (error) {
    console.error('[API] Error fetching user info:', error);
    
    if (error.message.includes('401')) {
      res.status(401).json({
        error: 'Invalid or expired Google Drive access token',
      });
    } else {
      res.status(500).json({
        error: `Google Drive API error: ${error.message}`,
      });
    }
  }
}
```

**Validation**: Handler compiles, proper error handling implemented

#### T021: Register REST API route

**Deliverable**: API route registered in Express

**File**: `server/server.ts`

**Change**:

```typescript
import { handleDriveAboutUser } from './api/drive-about-user.js';

// In API routes section:
app.post('/api/drive-about-user', handleDriveAboutUser);
```

**Validation**: Route registered, endpoint accessible

#### T022: Test MCP tool

**Deliverable**: MCP tool functionality verified

**Test Steps**:

1. Complete OAuth flow (US1)
2. Call `drive-about-user` tool via MCP client
3. Verify JSON response contains user object
4. Confirm displayName, emailAddress, permissionId present
5. Test error handling (missing token, invalid token)

**Validation**: Tool returns correct user data, errors handled properly

#### T023: Test REST API endpoint

**Deliverable**: REST API functionality verified

**Test Steps**:

1. Get valid Google access token
2. Send POST to `/api/drive-about-user` with `X-Google-Token` header
3. Verify 200 response with user JSON
4. Test 401 error (missing token)
5. Test 401 error (invalid token)

**Example**:

```bash
curl -X POST http://localhost:3000/api/drive-about-user \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: ya29.a0..." \
  -d '{}'
```

**Validation**: All test cases pass, correct status codes and responses

## Testing Strategy

### User Story 1 Independent Testing

**Objective**: Verify OAuth authentication works independently

**Test Plan**:

1. Unit tests for provider methods (createAuthUrl, exchangeCodeForTokens)
2. Integration test for complete OAuth flow
3. Manual browser test for connection hub integration

**Success Criteria**:

- All OAuth methods return correct data structures
- End-to-end OAuth flow completes successfully
- Tokens stored and accessible in session

### User Story 2 Independent Testing

**Objective**: Verify user info retrieval works independently (assumes US1 complete)

**Test Plan**:

1. Unit tests for MCP tool logic
2. Contract tests for REST API endpoint
3. Integration test with real Google Drive API (optional)
4. Manual test via MCP client and cURL

**Success Criteria**:

- MCP tool returns valid user JSON
- REST API returns same data structure
- Error handling works for auth failures
- Both interfaces use correct Drive API endpoint

## MVP Delivery Path

**Minimum Viable Product**: User Story 1 only

**Rationale**: US1 (OAuth authentication) provides the foundation. Even without US2, developers can authenticate and the infrastructure is in place for future Drive operations.

**MVP Tasks**: T001-T015 (15 tasks, ~3-4 hours)

**Post-MVP Enhancement**: Add US2 for immediate user verification value

**Full Feature Tasks**: T001-T023 (23 tasks, ~4-6 hours)

## Risk Mitigation

### High-Risk Tasks

| Task | Risk | Mitigation |
|------|------|------------|
| T003 | OAuth credentials misconfiguration | Double-check redirect URI matches exactly |
| T011 | Token exchange failures | Test with OAuth Playground first, verify client secret |
| T013 | Breaking existing providers | Test Atlassian and Figma OAuth still work |
| T022 | Drive API quota limits | Use test account, implement rate limiting |

### Rollback Plan

If issues arise:

1. Revert T013 (remove Google from REQUIRED_PROVIDERS)
2. Revert T014 (unregister Google provider)
3. Feature is isolated to `server/providers/google/` - safe to delete

## Success Metrics

- [X] All 23 tasks completed ✅
- [X] US1: OAuth flow works in connection hub
- [X] US2: REST API returns user data
- [X] US2: MCP tool returns user data
- [X] Zero breaking changes to existing providers
- [X] All constitution checks passed
- [X] Documentation complete (quickstart.md accessible)

---

**Next Steps**: Begin implementation starting with Phase 1 (Setup & Configuration). Follow task order or parallelize as indicated.
