# Quickstart: URL-Based Form State Restoration

**Feature**: 627-url-form-state  
**Date**: February 19, 2026  
**For**: Developers implementing URL state restoration in Simple Client

⚠️ **Important Discovery**: MCP tools are registered with **kebab-case names** (like `atlassian-get-issue`), not display names. This means:
- Tool names in the dropdown show kebab-case: `atlassian-get-issue`, `figma-get-user`, etc.
- URL parameters use these exact names: `?tool=atlassian-get-issue`
- No name conversion is needed - we match and write tool names directly

## What You're Building

Add URL-based state sharing to the Simple Client: when users select a tool, the URL automatically updates allowing them to bookmark or share that exact configuration. When someone opens a URL with parameters, the tool and API key are restored automatically.

**✨ New**: URL parameters are now preserved through OAuth authentication flows! When you start with `?tool=atlassian-get-issue` and go through Jira OAuth, you'll return to the same tool selection.

**Demo URLs**:
```
# Tool pre-selected
http://localhost:3000/?tool=atlassian-get-issue

# Tool + API key pre-configured
http://localhost:3000/?anthropicKey=sk-ant-api03-xyz&tool=atlassian-update-issue-description
```

---

## 5-Minute Overview

### Before (Current Behavior)

1. User opens Simple Client → connects → selects "Atlassian Get Issue"
2. URL stays: `http://localhost:3000/`
3. User bookmarks page → loses tool selection
4. Sharing URL requires explaining "select Atlassian Get Issue from dropdown"

### After (This Feature)

1. User opens Simple Client → connects → selects "Atlassian Get Issue"
2. URL updates automatically: `http://localhost:3000/?tool=atlassian-get-issue`
3. User bookmarks page → tool selection preserved
4. Sharing URL requires no explanation - tool auto-selected on open

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  URL: ?anthropicKey=xyz&tool=atlassian-get-issue            │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├─► ConnectionPanel:
                │   - Read anthropicKey param
                │   - Pre-fill API key input
                │
                └─► HomePage:
                    - Read tool param
                    - Wait for connection
                    - Auto-select tool from param
                    - Update URL when tool manually selected
```

**Key Files**:
- `client/src/lib/url-params/` - NEW utility module
- `client/src/pages/HomePage.tsx` - MODIFIED (orchestration)
- `client/src/components/ConnectionPanel/ConnectionPanel.tsx` - MODIFIED (key restoration)
- `client/src/components/ToolSelector/ToolSelector.tsx` - MODIFIED (URL updates)

---

## Implementation Steps

### Step 1: Create URL Parameter Utilities

**File**: `client/src/lib/url-params/index.ts`

```typescript
export { readUrlParams } from './reader';
export { updateUrlWithTool, removeToolFromUrl } from './writer';
export { toKebabCase, findToolByKebabName } from './tool-name';
export type { UrlParamsState } from './types';
```

**File**: `client/src/lib/url-params/types.ts`

```typescript
export interface UrlParamsState {
  anthropicKey?: string;
  tool?: string;
}
```

**File**: `client/src/lib/url-params/reader.ts`

```typescript
import type { UrlParamsState } from './types';

export function readUrlParams(): UrlParamsState {
  const params = new URLSearchParams(window.location.search);
  return {
    anthropicKey: params.get('anthropicKey') || undefined,
    tool: params.get('tool') || undefined,
  };
}
```

**File**: `client/src/lib/url-params/writer.ts`

```typescript
export function updateUrlWithTool(toolName: string) {
  const url = new URL(window.location.href);
  // Tool names are already kebab-case from server, use directly
  url.searchParams.set('tool', toolName);
  window.history.replaceState({}, '', url);
}

export function removeToolFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('tool');
  window.history.replaceState({}, '', url);
}
```

**Important Note**: We don't need to convert tool names because they're already in kebab-case format from the MCP server (e.g., `'atlassian-get-issue'`).

**File**: `client/src/lib/url-params/tool-name.ts`

```typescript
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function toKebabCase(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function findToolByKebabName(kebabName: string, tools: Tool[]): Tool | undefined {
  // Note: Tools from MCP server are already in kebab-case format, so match directly
  return tools.find(tool => tool.name === kebabName);
}
```

**Important Note**: Tools from the MCP server are registered with kebab-case names like `'atlassian-get-issue'`, not display names. The `tool.name` property is already in the correct URL format, so we match directly without conversion.

---

### Step 2: Modify ConnectionPanel for Key Restoration

**File**: `client/src/components/ConnectionPanel/ConnectionPanel.tsx`

**Change**: Read `anthropicKey` from URL on mount

```typescript
import { readUrlParams } from '../../lib/url-params';

export function ConnectionPanel({ status, onConnect, onDisconnect }: ConnectionPanelProps) {
  const [anthropicKey, setAnthropicKey] = useState(() => {
    // Try URL first, then localStorage fallback
    const urlParams = readUrlParams();
    return urlParams.anthropicKey || localStorage.getItem('mcp_anthropic_key') || '';
  });

  // ... rest of component
}
```

**Security Note**: URL-sourced keys CAN be written back to URL (user already shared them). Manual keys CANNOT be written to URL (security).

---

### Step 3: Modify HomePage for Tool Restoration

**File**: `client/src/pages/HomePage.tsx`

**Change 1**: Add state for pending tool selection and last seen URL tool

```typescript
import { readUrlParams, findToolByKebabName, updateUrlWithTool } from '../lib/url-params';

export function HomePage() {
  const { state, tools, logs, connect, disconnect, callTool, setAnthropicKey, refreshTokens } = useMcpClient();
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [pendingToolSelection, setPendingToolSelection] = useState<string | null>(null);
  const [lastUrlTool, setLastUrlTool] = useState<string | null>(null);
  
  // ... rest of component
}
```

**Change 2**: Read URL and auto-select tool (unified logic)

```typescript
// Read URL and set pending if it's a new tool (handles mount + OAuth callback timing)
useEffect(() => {
  if (state.status === 'connected' && !pendingToolSelection) {
    const urlParams = readUrlParams();
    // Only set pending if URL tool is different from what we last attempted
    if (urlParams.tool && urlParams.tool !== lastUrlTool) {
      console.log('[HomePage] New tool in URL:', urlParams.tool);
      setPendingToolSelection(urlParams.tool);
      setLastUrlTool(urlParams.tool);
    }
  }
}, [state.status, pendingToolSelection, lastUrlTool]);

// Auto-select pending tool once connected and tools available
useEffect(() => {
  if (state.status === 'connected' && pendingToolSelection && tools.length > 0) {
    const tool = findToolByKebabName(pendingToolSelection, tools);
    if (tool) {
      console.log('[HomePage] Tool found, selecting:', tool.name);
      setSelectedTool(tool);
    } else {
      console.log('[HomePage] Tool not found - may require OAuth authentication');
    }
    // Clear pending state regardless of success (invalid tool → no selection)
    setPendingToolSelection(null);
  }
}, [state.status, pendingToolSelection, tools]);
```

**Note**: By tracking `lastUrlTool` instead of a boolean "attempted" flag, we naturally prevent infinite loops while handling all edge cases (mount, OAuth timing, unauthenticated tools, reconnection).

**Change 3**: Update URL when tool manually selected

```typescript
// Update URL when tool selection changes (US3: Manual Tool Selection Updates URL)
useEffect(() => {
  // Only update URL after connection is established and a tool is selected
  if (state.status === 'connected' && selectedTool) {
    console.log('[HomePage] Updating URL with tool:', selectedTool.name);
    updateUrlWithTool(selectedTool.name);
  }
  // Note: We NEVER remove the tool parameter from the URL
}, [selectedTool, state.status]);
```

**Key Logic**: Never remove tool from URL (per requirements). Invalid tool parameters stay in URL for transparency and debugging.

**Change 4**: Handle connect and disconnect

```typescript
const handleConnect = async (anthropicKey: string) => {
  setResult(null);
  setError(undefined);
  // Reset last URL tool to allow auto-selection on connect/reconnect
  setLastUrlTool(null);
  if (anthropicKey) {
    setAnthropicKey(anthropicKey);
  }
  await connect(window.location.origin);
};

const handleDisconnect = async () => {
  // Don't clear selectedTool - preserve for reconnection
  // URL parameter stays intact
  setResult(null);
  setError(undefined);
  await disconnect();
};
};
```

**Key Points**:
- On connect: Always re-read URL to support reconnection (US4)
- On disconnect: Preserve selectedTool and URL parameter

---

### Step 4: No Changes to ToolSelector

**Why**: ToolSelector just calls `onSelect(tool)` which updates `selectedTool` in HomePage. The `useEffect` in HomePage automatically handles URL updates.

**Result**: Zero changes needed in ToolSelector component! 🎉

---

## Finding the Correct Tool Names

**IMPORTANT**: Tools are registered with specific kebab-case names. Use the wrong name and auto-selection won't work!

### How to Find Tool Names

**Option 1: Check the dropdown after connecting**
1. Connect to the server
2. Open the tool selector dropdown
3. The exact names shown in the dropdown are what you use in URLs

**Option 2: Check the README**
See the "Supported Tools" section in [README.md](../../../README.md) for the complete list.

### Common Tool Names

| Tool Display | URL Parameter |
|-------------|---------------|
| atlassian-get-issue | `?tool=atlassian-get-issue` |
| atlassian-get-sites | `?tool=atlassian-get-sites` |
| atlassian-update-issue-description | `?tool=atlassian-update-issue-description` |
| figma-get-user | `?tool=figma-get-user` |
| figma-get-layers-for-page | `?tool=figma-get-layers-for-page` |
| write-shell-stories | `?tool=write-shell-stories` |
| write-next-story | `?tool=write-next-story` |
| analyze-feature-scope | `?tool=analyze-feature-scope` |
| review-work-item | `?tool=review-work-item` |

**Note**: Tools are registered with kebab-case names (e.g., `atlassian-get-issue`), which is what you see in the dropdown. Use these exact names in your URLs.

---

## Testing Checklist

### Manual Testing Scenarios

#### Scenario 1: URL with Tool Parameter
1. Open `http://localhost:3000/?tool=atlassian-get-issue`
2. Enter API key, click Connect
3. ✅ "atlassian-get-issue" tool should be auto-selected in the dropdown
4. ✅ URL should still show `?tool=atlassian-get-issue`

#### Scenario 2: Manual Tool Selection Updates URL
1. Open `http://localhost:3000/`
2. Connect, select "atlassian-update-issue-description" from dropdown
3. ✅ URL should update to `?tool=atlassian-update-issue-description`
4. ✅ No page reload
5. ✅ Browser back button goes to previous page (not previous tool)

#### Scenario 3: Invalid Tool Parameter
1. Open `http://localhost:3000/?tool=nonexistent-tool`
2. Connect
3. ✅ Tool selector shows without pre-selection
4. ✅ No error message displayed
5. ✅ URL still shows `?tool=nonexistent-tool` (preserved for transparency and debugging)

#### Scenario 4: URL with Anthropic Key
1. Open `http://localhost:3000/?anthropicKey=sk-ant-test-123&tool=atlassian-get-issue`
2. ✅ Key input pre-filled with `sk-ant-test-123`
3. Click Connect
4. ✅ Tool auto-selected
5. ✅ URL unchanged (key preserved)

#### Scenario 5: Manual Key Entry Never Exposed
1. Open `http://localhost:3000/`
2. Manually type API key, connect
3. Select tool
4. ✅ URL shows `?tool=abc` ONLY (no anthropicKey param)

#### Scenario 6: Page Reload
1. Complete Scenario 2 (tool selected, URL updated)
2. Press F5 (reload page)
3. Enter API key, reconnect
4. ✅ Tool should be auto-selected again

---

### Automated Test Suite

**File**: `client/tests/unit/url-params.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { toKebabCase, findToolByKebabName } from '../../src/lib/url-params';

describe('toKebabCase', () => {
  it('converts display name to kebab-case', () => {
    expect(toKebabCase('Atlassian Get Issue')).toBe('atlassian-get-issue');
    expect(toKebabCase('Atlassian Update Issue Description')).toBe('atlassian-update-issue-description');
  });

  it('handles special characters', () => {
    expect(toKebabCase('Foo & Bar')).toBe('foo-bar');
    expect(toKebabCase('Test!!!Tool')).toBe('test-tool');
  });

  it('trims leading/trailing hyphens', () => {
    expect(toKebabCase('  Foo Bar  ')).toBe('foo-bar');
  });
});

describe('findToolByKebabName', () => {
  // Note: Tools from MCP server already have kebab-case names
  const tools = [
    { name: 'atlassian-get-issue', description: '...' },
    { name: 'atlassian-update-issue-description', description: '...' },
  ];

  it('finds tool by name (already kebab-case)', () => {
    const tool = findToolByKebabName('atlassian-get-issue', tools);
    expect(tool?.name).toBe('atlassian-get-issue');
  });

  it('returns undefined for invalid name', () => {
    const tool = findToolByKebabName('nonexistent', tools);
    expect(tool).toBeUndefined();
  });
});
```

**File**: `client/tests/integration/url-state-restoration.test.tsx`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage } from '../../src/pages/HomePage';

describe('URL State Restoration', () => {
  beforeEach(() => {
    // Reset URL before each test
    window.history.replaceState({}, '', '/');
  });

  it('restores tool from URL parameter', async () => {
    // Set URL with tool parameter
    window.history.replaceState({}, '', '/?tool=atlassian-get-issue');
    
    render(<HomePage />);
    
    // Connect (mocked)
    await userEvent.type(screen.getByLabelText(/anthropic api key/i), 'sk-ant-test');
    await userEvent.click(screen.getByText(/connect/i));
    
    // Wait for tool to be selected
    await waitFor(() => {
      // Note: Tool names in dropdown are kebab-case from server
      expect(screen.getByText('atlassian-get-issue')).toHaveClass('selected');
    });
  });

  it('updates URL when tool is manually selected', async () => {
    render(<HomePage />);
    
    // Connect
    await userEvent.type(screen.getByLabelText(/anthropic api key/i), 'sk-ant-test');
    await userEvent.click(screen.getByText(/connect/i));
    
    // Select tool (tool names are kebab-case)
    await userEvent.click(screen.getByText('atlassian-get-issue'));
    
    // Check URL updated
    expect(window.location.search).toContain('tool=atlassian-get-issue');
  });

  it('handles invalid tool parameter gracefully', async () => {
    window.history.replaceState({}, '', '/?tool=invalid-tool');
    
    render(<HomePage />);
    
    // Connect
    await userEvent.type(screen.getByLabelText(/anthropic api key/i), 'sk-ant-test');
    await userEvent.click(screen.getByText(/connect/i));
    
    // Tool selector shown withoutpre-selection
    await waitFor(() => {
      expect(screen.getByText(/select a tool/i)).toBeInTheDocument();
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
    
    // URL parameter preserved
    expect(window.location.search).toContain('tool=invalid-tool');
  });
});
```

---

## Common Pitfalls

### ✅ Do: Preserve Invalid Tool Parameters

```typescript
// CORRECT - invalid tools stay in URL for debugging
if (toolNotFound) {
  // Leave URL unchanged: ?tool=invalid-tool
  // This helps users see what went wrong
}
```

**Why**: Transparency for debugging. Users can see the invalid parameter and fix it.

### ✅ Do: Only Remove When User Explicitly Deselects

```typescript
// CORRECT - track previous state to detect explicit deselection
const [previousSelectedTool, setPreviousSelectedTool] = useState<Tool | null>(null);

if (selectedTool === null && previousSelectedTool !== null) {
  // User went from having a tool selected to no tool
  // This is an explicit deselection - remove from URL
  removeToolFromUrl();
}
```

**Why**: Distinguishes between "user clicked '-- Select a tool --'" (remove URL) vs. "tool was never valid" (keep URL).

---

## Common Pitfalls

### ❌ Don't: Use pushState

```typescript
// WRONG - creates history entries
window.history.pushState({}, '', url);
```

**Why**: Users expect back button to go to previous page, not previous tool.

### ✅ Do: Use replaceState

```typescript
// CORRECT - updates URL without history entry
window.history.replaceState({}, '', url);
```

---

### ❌ Don't: Write Manual Keys to URL

```typescript
// WRONG - security violation
if (manuallyEnteredKey) {
  url.searchParams.set('anthropicKey', manuallyEnteredKey);
}
```

**Why**: Users expect manually entered keys to stay private.

### ✅ Do: Only Preserve URL-Sourced Keys

```typescript
// CORRECT - only URL-sourced keys persist
const urlParams = readUrlParams();
if (urlParams.anthropicKey) {
  // Key came from URL, safe to keep it there
} else {
  // Manual entry - remove from URL
  url.searchParams.delete('anthropicKey');
}
```

---

### ❌ Don't: Select Tool Before Connection

```typescript
// WRONG - tool selector hidden, will fail
const urlParams = readUrlParams();
if (urlParams.tool) {
  setSelectedTool(findTool(urlParams.tool)); // Error: tools undefined
}
```

**Why**: Tool list not available until connection establishes.

### ✅ Do: Defer Tool Selection Until Connected

```typescript
// CORRECT - store pending, apply after connection
const urlParams = readUrlParams();
if (urlParams.tool) {
  setPendingToolSelection(urlParams.tool); // Store for later
}

useEffect(() => {
  if (connected && pendingToolSelection) {
    setSelectedTool(findTool(pendingToolSelection)); // Apply when ready
    setPendingToolSelection(null);
  }
}, [connected, pendingToolSelection]);
```

---

## Performance Notes

- **URL Update**: <5ms (synchronous History API call)
- **URL Read**: <10ms (URLSearchParams parsing on mount)
- **Tool Lookup**: O(n) where n = tool count (~10 tools) = <1ms
- **Total Overhead**: <20ms per page load, <5ms per tool selection

**Target**: 100ms URL update, 2s tool restoration ✅ Well under budget!

---

## OAuth Flow Preservation

**Problem**: When you open `http://localhost:3000/?tool=atlassian-get-issue` and click "Connect", the OAuth flow redirects you to Atlassian, then back to your app. The `?tool=...` parameter was lost during this redirect.

**Solution**: URL parameters are automatically preserved through OAuth flows:

1. **Before OAuth redirect**: Parameters like `?tool=...` and `?anthropicKey=...` are saved to sessionStorage
2. **During OAuth**: You're redirected to the provider (Atlassian, Figma, Google)
3. **After OAuth callback**: Preserved parameters are restored to the URL
4. **Auto-selection**: The tool is automatically selected as expected

**Implementation Details**:
- Parameters stored in sessionStorage (not localStorage for security)
- OAuth-specific params (`code`, `state`, `error`) are NOT preserved (they're one-time use)
- Preserved params cleared after restoration (single-use)
- Works across all OAuth providers (Atlassian, Figma, Google)
- **Auto-connect timing**: After OAuth callback, connection may complete before URL params are read. An additional useEffect watches for connection completion and re-reads URL params to ensure tool auto-selection works correctly.

**Example Flow**:
```
1. User opens: http://localhost:3000/?tool=atlassian-get-issue&anthropicKey=sk-ant-123
2. Click "Connect" → redirect to Atlassian OAuth
3. OAuth callback returns: http://localhost:3000/?code=abc123&state=xyz
4. Params restored: http://localhost:3000/?tool=atlassian-get-issue&anthropicKey=sk-ant-123
5. Tool auto-selected ✓
```

**Testing OAuth Preservation**:
1. Open `http://localhost:3000/?tool=atlassian-get-issue`
2. Click Connect → complete Atlassian OAuth
3. ✅ URL should show `?tool=atlassian-get-issue` after OAuth completes
4. ✅ Tool should be auto-selected automatically

### Unauthenticated Tool Edge Case

**Problem**: If the URL contains a tool that requires OAuth (e.g., `?tool=atlassian-get-issue`) but you're NOT authenticated with that provider, the tool won't appear in the tools list. Without proper handling, this could cause an infinite loop (URL reads → tool not found → URL reads again → repeat).

**Solution**: Track the last URL tool we've seen and only attempt auto-selection once per unique tool name:

1. **First attempt**: Read URL, try to find tool in available tools, remember the tool name
2. **Tool not found**: Log message, clear pending selection (but remember we tried this tool name)
3. **Subsequent renders**: URL still has same tool → skip (already attempted)
4. **On reconnect**: Reset last-seen tool to allow fresh attempt

**Implementation**:
```typescript
const [lastUrlTool, setLastUrlTool] = useState<string | null>(null);

// Read URL and set pending if it's a new tool (unified logic)
useEffect(() => {
  if (state.status === 'connected' && !pendingToolSelection) {
    const urlParams = readUrlParams();
    // Only set pending if URL tool is different from what we last attempted
    if (urlParams.tool && urlParams.tool !== lastUrlTool) {
      setPendingToolSelection(urlParams.tool);
      setLastUrlTool(urlParams.tool);
    }
  }
}, [state.status, pendingToolSelection, lastUrlTool]);

// Auto-select when pending (success or failure, we attempted it)
useEffect(() => {
  if (state.status === 'connected' && pendingToolSelection && tools.length > 0) {
    const tool = findToolByKebabName(pendingToolSelection, tools);
    if (tool) {
      setSelectedTool(tool);
    } else {
      console.log('Tool not found - may require OAuth authentication');
    }
    setPendingToolSelection(null); // Clear pending after attempt
  }
}, [state.status, pendingToolSelection, tools]);

// On connect/reconnect: reset to allow fresh attempt
const handleConnect = async (anthropicKey: string) => {
  setLastUrlTool(null); // Reset to allow auto-selection
  await connect(window.location.origin);
};
```

**Key Insight**: This is simpler than tracking a boolean "attempted" flag because we track *what* we attempted. This naturally handles URL changes and reconnection scenarios.

**Example Scenario**:
```
1. Open: http://localhost:3000/?tool=atlassian-get-issue
2. Click Connect (without Atlassian OAuth logged in)
3. Connection succeeds, but no Atlassian tools in the list
4. Auto-selection fails silently (tool not found)
5. URL parameter preserved: ?tool=atlassian-get-issue
6. User can still authenticate with Atlassian OAuth
7. After OAuth, user can manually reconnect to get the tool
```

**Testing Unauthenticated Tool**:
1. Make sure you're NOT logged into Atlassian OAuth
2. Open `http://localhost:3000/?tool=atlassian-get-issue`
3. Click Connect
4. ✅ No infinite loop (check console logs)
5. ✅ Tool selector shows available tools (no Atlassian tools until OAuth)
6. ✅ URL still shows `?tool=atlassian-get-issue`

---

## Security Checklist

- [ ] Manual API keys never written to URL (tested in Scenario 5)
- [ ] URL-sourced keys preserved after connection (tested in Scenario 4)
- [ ] Invalid tool parameters don't expose internal errors (tested in Scenario 3)
- [ ] No XSS vulnerabilities (URLSearchParams auto-escapes, no `dangerouslySetInnerHTML`)

---

## Next Steps

1. ✅ Read this quickstart
2. ✅ Implement Step 1 (URL utilities) + write unit tests
3. ✅ Implement Steps 2-3 (component modifications) + write integration tests
4. ✅ Run manual testing scenarios 1-6
5. ✅ Submit PR with tests passing

**Estimated Time**: 4-6 hours for experienced React developer

---

## Support

- **Spec**: [spec.md](spec.md)
- **Research**: [research.md](research.md)
- **Data Model**: [data-model.md](data-model.md)
- **Tasks**: [tasks.md](tasks.md) ← Detailed task breakdown with acceptance criteria
