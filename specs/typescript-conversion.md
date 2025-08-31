I'd like to change the files in `server/` from JavaScript to typescript.

How should we go about doing this?  


For typescript, I'd like to use the "ts-node/esm" loader:

```
// TypeScript ESM loader for ts-node
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("ts-node/esm", pathToFileURL("./"));
```

This will help avoid a TS build and be easier to develop.

I think we should start with the easist files to typescript, those that have as few dependencies as possible and verify things work.

Please create a plan below to upgrade files to typescript.  We will use this later as instructions to follow.

## Implementation Plan

### Phase 1: TypeScript Infrastructure Setup
**Goal**: Set up TypeScript tooling and configuration

1. **Install TypeScript dependencies**
   ```bash
   npm install --save-dev typescript @types/node ts-node
   npm install --save-dev @types/express @types/jsonwebtoken @types/uuid
   ```

2. **Create `tsconfig.json`**
   - Configure for ESM modules (`"module": "ESNext"`)
   - Set `"moduleResolution": "bundler"` for modern resolution
   - Enable strict mode and modern target (`ES2022`)
   - Include `server/**/*` in compilation

3. **Create TypeScript ESM loader** (`loader.mjs`)
   ```javascript
   import { register } from "node:module";
   import { pathToFileURL } from "node:url";
   register("ts-node/esm", pathToFileURL("./"));
   ```

4. **Update `package.json` scripts**
   - Modify start scripts to use `--loader ./loader.mjs`
   - Add TypeScript type checking scripts

### Phase 2: Utility Files (Fewest Dependencies)
**Goal**: Convert standalone utility modules first

**Order**: `logger.js` → `instruments.js`

1. **Convert `server/logger.js` → `logger.ts`**
   - Simple Winston logger configuration
   - No internal dependencies
   - Add types for log levels and Winston config

2. **Convert `server/instruments.js` → `instruments.ts`**
   - Metrics/monitoring utilities
   - Add types for instrumentation data

### Phase 3: Core Authentication Modules
**Goal**: Convert token and auth management with module refactoring

**Order**: `tokens.js` → `auth-context-store.ts` (new) → `atlassian-helpers.ts` (new) → `auth-helpers.ts` (refactored)

4. **Convert `server/tokens.js` → `tokens.ts`**
   - JWT creation and validation
   - Add interfaces for JWT payload structure
   - Type the Atlassian token structure from api-flow.md
   ```typescript
   interface AtlassianTokenPayload {
     sub: string;
     iss: string;
     aud: string;
     scope: string;
     atlassian_access_token: string;
     refresh_token: string;
     iat: number;
     exp: number;
   }
   ```

5. **Create `server/jira-mcp/auth-context-store.ts` (new module)**
   - Extract auth context store management from `auth-helpers.js`
   - Functions: `setAuthContext()`, `clearAuthContext()`, `getAuthContext()`, `getAuthInfo()`
   - Include the `authContextStore` Map and cleanup functions
   - Add proper TypeScript interfaces for auth context structure

6. **Create `server/jira-mcp/atlassian-helpers.ts` (new module)**
   - Extract Atlassian API interaction functions from `auth-helpers.js`
   - Functions: `resolveCloudId()` and any future Atlassian API helpers
   - Add interfaces for Atlassian API response structures
   - Type the accessible resources response format

7. **Refactor `server/jira-mcp/auth-helpers.js` → `auth-helpers.ts`**
   - Keep core auth utilities: `getTokenLogInfo()`, `isTokenExpired()`, `handleJiraAuthError()`, `getAuthInfoSafe()`
   - Import `InvalidTokenError` from MCP SDK with proper typing
   - Import auth context functions from `auth-context-store.ts`
   - Import Atlassian helpers from `atlassian-helpers.ts`

### Phase 4: Atlassian Integration
**Goal**: Convert OAuth and API integration

6. **Convert `server/atlassian-auth-code-flow.js` → `atlassian-auth-code-flow.ts`**
   - OAuth token exchange with Atlassian
   - Add interfaces for Atlassian API responses
   - Type the accessible resources response structure

### Phase 5: MCP Tools (Parallel Conversion)
**Goal**: Convert individual tool handlers

**Order**: `markdown-converter.js` → tool files in parallel

7. **Convert `server/jira-mcp/markdown-converter.js` → `markdown-converter.ts`**
   - Utility for markdown conversion
   - No MCP dependencies

8. **Convert MCP tools (can be done in parallel)**:
   - `server/jira-mcp/tool-get-accessible-sites.js` → `tool-get-accessible-sites.ts`
   - `server/jira-mcp/tool-get-jira-issue.js` → `tool-get-jira-issue.ts`
   - `server/jira-mcp/tool-get-jira-attachments.js` → `tool-get-jira-attachments.ts`
   - `server/jira-mcp/tool-update-issue-description.js` → `tool-update-issue-description.ts`
   
   **For each tool**:
   - Add types for tool parameters and responses
   - Type the Jira API response structures
   - Use MCP SDK types for tool definitions
   - Update imports to use new `auth-context-store.ts` and `atlassian-helpers.ts` modules

### Phase 6: MCP Core Services
**Goal**: Convert main service modules

**Order**: `jira-mcp/index.js` → `pkce.js` → `mcp-service.js`

9. **Convert `server/jira-mcp/index.js` → `index.ts`**
   - MCP server setup and tool registration
   - Add types for auth context storage (import from `auth-context-store.ts`)
   - Use MCP SDK types for server configuration
   - Update imports to use new module structure

10. **Convert `server/pkce.js` → `pkce.ts`**
    - OAuth 2.0 PKCE implementation
    - Add interfaces for PKCE session state
    - Type Express request/response with session data

11. **Convert `server/mcp-service.js` → `mcp-service.ts`**
    - MCP transport layer
    - Add types for transport sessions
    - Type the HTTP request handlers

### Phase 7: Application Entry Point
**Goal**: Convert main application file

12. **Convert `server/server.js` → `server.ts`**
    - Express app configuration
    - Update all imports to `.ts` extensions
    - Add types for Express middleware and routes

### Phase 8: Optional/Manual Files
**Goal**: Handle special case files

13. **Convert `server/manual-token-flow.js` → `manual-token-flow.ts`** (if used)
    - Manual testing utilities
    - Lower priority

### Validation Steps (After Each Phase)
1. **Type checking**: Run `npx tsc --noEmit` to verify no type errors
2. **Runtime testing**: Start server with ts-node loader
3. **Integration testing**: Test OAuth flow and MCP tools
4. **Update imports**: Ensure all `.js` imports are updated to `.ts`

### Key TypeScript Patterns to Follow

1. **Interface Definition Strategy**:
   ```typescript
   // For API responses (in atlassian-helpers.ts)
   interface AtlassianSite {
     id: string;
     name: string;
     url: string;
     // ... other fields
   }
   
   // For internal data structures (in auth-context-store.ts)
   interface AuthContext {
     sessionId: string;
     atlassian_access_token: string;
     refresh_token: string;
     exp: number;
     scope: string;
     iss: string;
     aud: string;
     // ... other auth fields
   }
   
   // For auth context store (in auth-context-store.ts)
   type AuthContextStore = Map<string, AuthContext>;
   ```

2. **Express Types**:
   ```typescript
   import { Request, Response, NextFunction } from 'express';
   
   interface AuthenticatedRequest extends Request {
     authInfo?: AuthContext;
   }
   ```

3. **Error Handling**:
   ```typescript
   class InvalidTokenError extends Error {
     constructor(message: string) {
       super(message);
       this.name = 'InvalidTokenError';
     }
   }
   ```

### Dependencies Between Files
- **Phase order respects dependencies**: Utility files → Core auth → Integration → Tools → Services → Entry
- **Import path updates**: Change `.js` to `.ts` in import statements during conversion
- **Type sharing**: Create shared type definitions file if needed (`server/types.ts`)

### Testing Strategy
- Convert one file at a time within each phase
- Verify server starts successfully after each conversion
- Test OAuth flow end-to-end after Phase 6
- Run integration tests after complete conversion