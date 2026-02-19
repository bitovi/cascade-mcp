# Data Model: URL-Based Form State Restoration

**Feature**: 627-url-form-state  
**Date**: February 19, 2026  
**Status**: Complete

## Overview

This feature manages state through URL query parameters and React component state. There is no persistent database or API data model - all state is ephemeral and lives in the URL or component memory. This document defines the structure of URL parameters, internal state representations, and the mappings between them.

---

## URL Parameter Schema

### Query Parameter Structure

```typescript
interface UrlParams {
  // Optional: Pre-fills Anthropic API key input
  anthropicKey?: string;
  
  // Optional: Specifies tool to select after connection (kebab-case format)
  tool?: string;
}
```

### Examples

```
// No parameters (clean slate)
https://localhost:5173/

// Anthropic key only
https://localhost:5173/?anthropicKey=sk-ant-api03-xyz

// Tool selection only (after already connected)
https://localhost:5173/?tool=get-jira-issue

// Both parameters (shared link with pre-configured state)
https://localhost:5173/?anthropicKey=sk-ant-api03-xyz&tool=update-issue-description
```

### Validation Rules

| Parameter | Required | Format | Validation |
|-----------|----------|--------|------------|
| `anthropicKey` | No | String | Any non-empty string accepted; invalid keys handled by MCP connection |
| `tool` | No | kebab-case string | Validated against available tools list; invalid names silently ignored |

---

## Internal State Model

### 1. Anthropic Key State

```typescript
interface AnthropicKeyState {
  value: string;           // The actual API key
  source: 'manual' | 'url'; // Where the key came from
}
```

**Purpose**: Track key origin to enforce security rule - never write manually entered keys to URL

**State Transitions**:
```
URL load with anthropicKey param → { value: 'sk-ant-...', source: 'url' }
User types in input field → { value: 'sk-ant-...', source: 'manual' }
```

**Invariants**:
- If `source === 'url'`, key persists in URL after connection
- If `source === 'manual'`, key never written to URL
- Source never changes after initial set (key replacement creates new state)

---

### 2. Tool Selection State

```typescript
interface ToolSelectionState {
  // Currently selected tool (null if none selected)
  selectedTool: Tool | null;
  
  // Pending tool name from URL (processed after connection establishes)
  pendingToolSelection: string | null;
}
```

**Purpose**: Decouple URL parameter reading (happens on mount) from tool selection (happens after connection when tool list available)

**State Transitions**:
```
Page load with ?tool=xyz → pendingToolSelection = 'xyz', selectedTool = null
Connection establishes → Resolve 'xyz' to Tool object → selectedTool = Tool, pendingToolSelection = null
User clicks tool → selectedTool = Tool, pendingToolSelection = null
```

**Invariants**:
- `pendingToolSelection` only populated on initial mount from URL
- `pendingToolSelection` cleared once processed (success or invalid)
- `selectedTool` triggers URL update via useEffect

---

### 3. Connection Status State

```typescript
type ConnectionStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'authorizing' 
  | 'connected' 
  | 'reconnecting';
```

**Purpose**: Control tool selector visibility and tool selection timing

**URL Interaction**:
- Tool selector hidden until `status === 'connected'`
- Pending tool selection deferred until `status === 'connected'`
- URL updates only occur when `status === 'connected'`

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser URL Bar                         │
│  https://localhost:5173/?anthropicKey=xyz&tool=abc          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ URLSearchParams.get()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   URL Parameter Parser                       │
│  { anthropicKey: 'xyz', tool: 'abc' }                       │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├───────────────────► AnthropicKeyState
               │                     { value: 'xyz', source: 'url' }
               │                               │
               │                               ▼
               │                     ConnectionPanel Component
               │                     (pre-fills input, connects)
               │
               └───────────────────► pendingToolSelection = 'abc'
                                                 │
                                                 ▼
                          ┌──────────────────────────────────┐
                          │  Wait for Connection Established  │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │   Resolve 'abc' to Tool Object    │
                          │   (kebabCase → Tool lookup)       │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │    selectedTool = Tool            │
                          │    pendingToolSelection = null    │
                          └──────────────┬───────────────────┘
                                         │
                                         │ useEffect detects change
                                         ▼
                          ┌──────────────────────────────────┐
                          │   history.replaceState() with     │
                          │   ?tool=abc (kebab-case)          │
                          └──────────────────────────────────┘
```

---

## Tool Name Conversion

### Mapping: Display Name ↔ Kebab-Case

```typescript
interface ToolNameMapping {
  displayName: string;  // Human-readable tool name from MCP server
  kebabCase: string;    // URL-friendly format
}

// Examples
const mappings: ToolNameMapping[] = [
  { displayName: "Get Jira Issue", kebabCase: "get-jira-issue" },
  { displayName: "Update Issue Description", kebabCase: "update-issue-description" },
  { displayName: "Get Accessible Sites", kebabCase: "get-accessible-sites" },
];
```

**Conversion Algorithm**:
```typescript
// Display → Kebab (for writing to URL)
function toKebabCase(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Kebab → Display (for reading from URL)
function fromKebabCase(kebabName: string, tools: Tool[]): Tool | undefined {
  return tools.find(tool => toKebabCase(tool.name) === kebabName);
}
```

**Edge Cases**:
- Consecutive spaces/special chars  → Single hyphen: `"  Foo  ##  Bar  "` → `"foo-bar"`
- Leading/trailing special chars   → Trimmed: `"--foo--"` → `"foo"`
- Unicode characters               → Removed: `"Café Münster"` → `"caf-m-nster"` (acceptable - display name remains source of truth)
- Case preservation                → Lowercase: `"GetJiraIssue"` → `"getjiraissue"` (ambiguous without hyphens)

---

## Validation & Error Handling

### URL Parameter Validation

| Scenario | Validation | Result | URL State |
|----------|------------|--------|-----------|
| Valid `anthropicKey` | Any non-empty string | Pre-fills input, attempts connection | Preserved |
| Invalid `anthropicKey` | Any non-empty string | Pre-fills input, connection fails with error | Preserved (user can correct) |
| Missing `anthropicKey` | N/A | Input empty, user enters manually | Remains absent |
| Valid `tool` in URL | Matches kebab-case of available tool | Tool selected after connection | Preserved |
| Invalid `tool` in URL | No match in available tools | Tool selector shown, no pre-selection | Preserved (transparency) |
| Missing `tool` | N/A | Tool selector shown, no pre-selection | Updated when user selects |

### State Validation Rules

```typescript
// Rule 1: Tool selection only possible when connected
if (connectionStatus !== 'connected') {
  // Tool selector hidden
  // selectedTool locked to null
  // pendingToolSelection stored for later
}

// Rule 2: Manual API keys never written to URL
if (anthropicKey.source === 'manual') {
  // URL updates exclude anthropicKey parameter
  // Security enforcement
}

// Rule 3: Invalid tool names silently ignored
if (!isValidToolName(pendingToolSelection, availableTools)) {
  // Clear pendingToolSelection
  // Show tool selector without pre-selection
  // URL parameter remains unchanged (transparency)
}
```

---

## State Lifecycle

### Initial Page Load Flow

```typescript
// 1. Component Mount
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  
  const urlKey = params.get('anthropicKey');
  if (urlKey) {
    setAnthropicKey({ value: urlKey, source: 'url' });
  }
  
  const urlTool = params.get('tool');
  if (urlTool) {
    setPendingToolSelection(urlTool);
  }
}, []); // Empty deps - run once

// 2. User Connects (with or without key from URL)
// Connection status changes: disconnected → connecting → connected

// 3. Tool List Available + Connected
useEffect(() => {
  if (connectionStatus === 'connected' && pendingToolSelection) {
    const tool = fromKebabCase(pendingToolSelection, tools);
    if (tool) {
      setSelectedTool(tool);
    }
    setPendingToolSelection(null); // Clear pending state
  }
}, [connectionStatus, pendingToolSelection, tools]);

// 4. URL Updated (if tool found)
useEffect(() => {
  if (selectedTool) {
    const url = new URL(window.location.href);
    url.searchParams.set('tool', toKebabCase(selectedTool.name));
    
    // Preserve or remove anthropicKey based on source
    if (anthropicKey.source !== 'url') {
      url.searchParams.delete('anthropicKey');
    }
    
    window.history.replaceState({}, '', url);
  }
}, [selectedTool, anthropicKey]);
```

### User Selection Flow

```typescript
// 1. User clicks tool in ToolSelector
handleToolSelect(tool);

// 2. State updates
setSelectedTool(tool);

// 3. useEffect triggers URL update
useEffect(() => {
  if (selectedTool) {
    updateUrl(selectedTool);
  }
}, [selectedTool]);

// 4. Browser URL updates (<100ms per performance criteria)
// ?tool=new-tool-name
```

### Page Reload Flow

```typescript
// 1. Browser reloads page
// 2. URL preserved by browser: ?anthropicKey=xyz&tool=abc
// 3. Same as Initial Page Load Flow (steps 1-4)
// 4. State restored from URL
```

---

## Performance Considerations

### URL Operations Performance

| Operation | Timing | Frequency | Optimization |
|-----------|--------|-----------|---------------|
| Read URL params on mount | <10ms | Once per page load | URLSearchParams (native, optimized) |
| Write URL with replaceState | <5ms | Once per tool selection | Synchronous, no network |
| Tool name conversion | <1ms | Twice per selection (read + write) | Simple string operations |
| Tool lookup from kebab-case | O(n) where n = tool count | Once per page load | Linear search acceptable (~10 tools) |

**Bottleneck**: None identified. All operations well under 100ms target.

---

## Security Model

### Principle: Never Expose Manual Keys

```typescript
// CORRECT: URL-sourced key persisted
URL: ?anthropicKey=xyz&tool=abc
User clicks "Connect"
Result: ?anthropicKey=xyz&tool=abc (preserved)

// CORRECT: Manual key never written
URL: (no params)
User types key manually
User clicks "Connect"
Result: ?tool=abc (key excluded)

// CORRECT: Manual key replaces URL key
URL: ?anthropicKey=old-key
User manually changes key to new-key
User clicks "Connect"
Result: ?tool=abc (old-key removed, new-key not written)
```

### Rationale

- **URL-sourced keys**: Already shared by user action, safe to persist
- **Manual keys**: User expectation of privacy, prevent accidental sharing
- **Key replacement**: Original URL key invalidated, treat replacement as manual

---

## Summary

This feature's "data model" consists of:

1. **URL Parameters** (external state) - persisted in browser URL bar
2. **Component State** (internal state) - ephemeral, lives in React memory
3. **Mappings** (transformations) - bidirectional conversion between display names and kebab-case

No database, no API contracts, no persistent storage beyond URL. All state management handled by React hooks and Web APIs (URLSearchParams, History API).
