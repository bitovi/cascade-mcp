# Auto-Connect When All Providers Are Connected

## Goal

In the "Connect Services" page, automatically redirect to `/auth/done` when **ALL providers are connected**, eliminating the need for the user to click the "Done - Create Session" button.

**Key Point**: Auto-redirect ONLY happens when the user has connected every available provider (both Atlassian and Figma). If only one provider is connected, the hub remains visible so the user can connect the other provider or manually click "Done".

## Current Behavior

1. User visits Connection Hub (`/auth/hub`) 
2. User clicks "Connect Atlassian" → OAuth flow → returns to hub with "✓ Connected"
3. User clicks "Connect Figma" → OAuth flow → returns to hub with "✓ Connected"
4. User **manually clicks "Done - Create Session"** → redirects to `/auth/done`
5. `/auth/done` creates JWT with provider tokens and redirects back to MCP client

## Desired Behavior

1. User visits Connection Hub (`/auth/hub`)
2. User clicks "Connect Atlassian" → OAuth flow → returns to hub with "✓ Connected" (hub still shows, Figma not connected yet)
3. User clicks "Connect Figma" → OAuth flow → **server auto-redirects to `/auth/done`** (because ALL providers are now connected)
4. `/auth/done` creates JWT with provider tokens and redirects back to MCP client

**Important**: If user only connects Atlassian and not Figma, they stay at the hub and can manually click "Done" to proceed with just Atlassian.

## Key Files

- `server/provider-server-oauth/connection-hub.ts` - `renderConnectionHub()` function
  - **"Done" button logic** (line ~178): `${connectedProviders.length === 0 ? 'disabled' : ''}`
  - Currently enables the button when **at least one provider** is connected
  - This is intentional - users may not have access to all providers

## Implementation Plan

### Design Decision: Auto-Redirect vs Manual "Done" Button

**Auto-Redirect Trigger**: ONLY when **ALL available providers** are connected (both Atlassian AND Figma).

**Rationale**: 
- If user has connected everything, there's no reason to show them the hub again - auto-redirect saves them a click
- If user has only connected some providers, they might want to connect more OR they might want to proceed with partial providers
- The "Done" button remains available for users who want to proceed with only some providers connected (e.g., only have Jira credentials, not Figma)

**Behavior Summary**:
- ✅ **Atlassian + Figma connected** → Auto-redirect to `/auth/done`
- ❌ **Only Atlassian connected** → Stay at hub, show "Done" button (user can click it or connect Figma)
- ❌ **Only Figma connected** → Stay at hub, show "Done" button (user can click it or connect Atlassian)
- ❌ **Nothing connected** → Stay at hub, "Done" button disabled

### Step 1: Add server-side auto-redirect check

**What:** At the start of `renderConnectionHub()`, check if **ALL providers** are connected. If yes, redirect to `/auth/done` instead of rendering HTML.

**Changes to `connection-hub.ts`:**

```typescript
// At the top of the file, define all required providers
const REQUIRED_PROVIDERS = ['atlassian', 'figma'] as const;

export function renderConnectionHub(req: Request, res: Response): void {
  console.log('Rendering connection hub');
  
  const connectedProviders = req.session.connectedProviders || [];
  console.log(`  Currently connected providers: ${connectedProviders.join(', ') || 'none'}`);
  
  // Auto-redirect ONLY when ALL providers are connected
  // This saves the user from clicking "Done" when they've connected everything
  const allProvidersConnected = REQUIRED_PROVIDERS.every(
    provider => connectedProviders.includes(provider)
  );
  if (allProvidersConnected) {
    console.log('  ALL providers connected - auto-redirecting to /auth/done');
    res.redirect('/auth/done');
    return;
  }
  
  // ... rest of existing code (store PKCE params, render HTML)
```

**Why use `REQUIRED_PROVIDERS.every()`:** 
- Uses a dynamic check against all required providers, making it easy to add new providers in the future
- Auto-redirect is a convenience feature for users who've connected everything
- If only some providers are connected, we show the hub so they can:
  - Connect remaining providers, OR
  - Manually click "Done" to proceed with partial providers (current "Done" button allows this)

**How to test:**

**Test Case 1: Connect All Providers (should auto-redirect)**
1. Start the server: `npm run dev`
2. Open browser MCP client at `http://localhost:5173`
3. Click "Connect" to start OAuth flow
4. Connect Atlassian first → verify you return to the hub with "✓ Connected" (hub still visible)
5. Connect Figma second → verify you're **automatically redirected to /auth/done** (don't see the hub again)
6. Verify the full flow completes and tools are available in the client

**Test Case 2: Connect Only One Provider (should NOT auto-redirect)**
1. Start fresh session
2. Click "Connect" to start OAuth flow
3. Connect only Atlassian → verify you return to the hub with "✓ Connected"
4. Verify the hub **stays visible** (no auto-redirect)
5. Verify "Done" button is enabled
6. Click "Done" manually → verify redirect to `/auth/done` works
7. Verify the flow completes with only Atlassian tools available  
