# Research: URL-Based Form State Restoration

**Feature**: 627-url-form-state  
**Date**: February 19, 2026  
**Status**: Complete

## Research Questions

### 1. URL Parameter Parsing Approach

**Decision**: Use URLSearchParams API for reading and writing URL parameters

**Rationale**:
- Native browser API, no external dependencies
- Handles URL encoding/decoding automatically  
- Clean API for getting/setting individual parameters: `params.get('tool')`, `params.set('tool', value)`
- Excellent browser support (all modern browsers)
- Type-safe when wrapped in utility functions

**Alternatives Considered**:
- **Manual parsing with regex/string manipulation**: Rejected due to complexity, error-prone for edge cases (multiple occurrences, encoding), harder to maintain
- **Third-party library (qs, query-string)**: Rejected as unnecessary - adds dependency for functionality already in platform
- **React Router useSearchParams hook**: Rejected since Simple Client doesn't use React Router, would require adding routing library

**Implementation Pattern**:
```typescript
// Reading
const params = new URLSearchParams(window.location.search);
const tool = params.get('tool');
const anthropicKey = params.get('anthropicKey');

// Writing
const url = new URL(window.location.href);
url.searchParams.set('tool', 'get-jira-issue');
window.history.replaceState({}, '', url);
```

---

### 2. History API Usage Pattern

**Decision**: Use `history.replaceState()` exclusively for URL updates (no `pushState`)

**Rationale** (from clarification):
- Prevents cluttering browser history with every tool switch
- Users expect back button to navigate to previous page, not previous tool selection
- URL still updates immediately for sharing/bookmarking
- No page reload required
- Maintains shareable URL without creating navigation complexity

**Alternatives Considered**:
- **pushState for every tool selection**: Rejected - creates excessive history entries, confusing back button behavior
- **pushState only for first selection, replaceState for subsequent**: Rejected - inconsistent behavior, still creates unnecessary history entry
- **No History API (hash-based routing)**: Rejected - hash URLs less clean (#tool=xyz), not standard practice for modern SPAs

---

### 3. Tool Name Format Conversion (Display Name ↔ Kebab-Case)

**Decision**: Use kebab-case format for tool parameter (`?tool=get-jira-issue`)

**Rationale** (from clarification):
- URL-friendly without percent-encoding spaces
- Industry standard convention (RESTful URLs, npm packages, GitHub repos)
- Human-readable and debuggable
- Consistent with web conventions
- Easy to implement bidirectional conversion

**Conversion Algorithm**:
```typescript
// Display name → kebab-case
function toKebabCase(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '');      // Trim leading/trailing hyphens
}

// kebab-case → Display name (requires tool list lookup)
function fromKebabCase(kebabName: string, tools: Tool[]): Tool | null {
  return tools.find(tool => toKebabCase(tool.name) === kebabName) || null;
}
```

**Alternatives Considered**:
- **Exact tool name** (e.g., `?tool=Get Jira Issue`): Rejected - requires URL encoding (`%20`), less readable
- **URL-encoded only when needed**: Rejected - inconsistent (sometimes encoded, sometimes not), harder to document

---

### 4. React State Management for URL Synchronization

**Decision**: Use `useEffect` hook to read URL on mount and `useEffect` to write URL on tool selection change

**Rationale**:
- Standard React pattern for side effects (URL is external state)
- `useEffect` with empty deps array runs once on mount (URL reading)
- `useEffect` with `[selectedTool]` deps runs when tool changes (URL writing)
- Clean separation: URL read logic in HomePage, URL write logic in ToolSelector
- No additional state management library needed

**Implementation Pattern**:
```typescript
// Read URL on mount (HomePage)
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const toolParam = params.get('tool');
  const keyParam = params.get('anthropicKey');
  
  if (keyParam) {
    setAnthropicKeyInput(keyParam);
  }
  
  // toolParam handled after connection when tool list is available
  setPendingToolSelection(toolParam);
}, []); // Empty deps - run once on mount

// Auto-select tool after connection (HomePage)
useEffect(() => {
  if (isConnected && pendingToolSelection && tools.length > 0) {
    const tool = findToolByKebabName(pendingToolSelection, tools);
    if (tool) {
      setSelectedTool(tool);
    }
    setPendingToolSelection(null); // Clear pending state
  }
}, [isConnected, pendingToolSelection, tools]);

// Write URL when tool changes (ToolSelector or HomePage)
useEffect(() => {
  if (selectedTool) {
    updateUrlWithTool(selectedTool.name);
  }
}, [selectedTool]);
```

**Alternatives Considered**:
- **Event listeners (popstate)**: Needed for browser back/forward navigation detection, but not for initial read/write (use useEffect for those)
- **State management library (Redux, Zustand)**: Rejected - overkill for simple URL sync, useEffect sufficient
- **React Router**: Rejected - Simple Client doesn't use routing, no need to introduce it

---

### 5. Security: Manual Key Entry vs URL-Provided Key

**Decision**: Distinguish between manual key entry and URL-provided key; never write manually entered keys to URL

**Rationale** (from specification FR-007):
- Security: Prevent users from accidentally sharing URLs with their manually entered API keys
- URL-provided keys are already shared (by user action), so persisting them in URL is acceptable
- Manual entry implies user expects key to remain private

**Implementation Pattern**:
```typescript
interface KeySource {
  value: string;
  source: 'manual' | 'url';
}

const [anthropicKey, setAnthropicKey] = useState<KeySource>({ value: '', source: 'manual' });

// On mount, if URL has key, mark as URL-sourced
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('anthropicKey');
  if (urlKey) {
    setAnthropicKey({ value: urlKey, source: 'url' });
  }
}, []);

// On connection success, only preserve URL key, never write manual key
useEffect(() => {
  if (isConnected) {
    if (anthropicKey.source === 'url') {
      // Keep anthropicKey in URL (already there)
    } else {
      // Remove anthropicKey from URL if it exists
      const url = new URL(window.location.href);
      url.searchParams.delete('anthropicKey');
      window.history.replaceState({}, '', url);
    }
  }
}, [isConnected, anthropicKey]);
```

**Alternatives Considered**:
- **Always write key to URL**: Rejected - major security risk, exposes manual keys
- **Always remove key after connection**: Rejected (per clarification) - breaks reload convenience for shared links
- **Prompt user before writing key**: Rejected - adds friction, URL-sourced keys already implicitly shared

---

### 6. Invalid Tool Parameter Handling

**Decision**: Keep invalid tool parameter in URL unchanged, display tool selector without pre-selection

**Rationale** (from clarification):
- Transparency: User can see what parameter was provided
- Debugging: Easier to identify why tool wasn't selected (typo, outdated link)
- No error state needed: Silent fallback maintains clean UX
- Helpful for shared links: Recipient can see sender's intent even if tool name changed

**Implementation**:
```typescript
const tool = findToolByKebabName(toolParam, tools);
if (tool) {
  setSelectedTool(tool);
} else {
  // Invalid tool name - do nothing
  // Tool selector shows without pre-selection
  // URL keeps invalid parameter for debugging
}
```

**Alternatives Considered**:
- **Remove invalid parameter from URL**: Rejected (per clarification) - loses debugging information
- **Show error message**: Rejected (per clarification) - adds UI complexity, silent fallback preferred
- **Replace with default tool**: Rejected - user didn't request default, could be confusing

---

## Technology Stack Summary

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| URL Parsing | URLSearchParams API | Native | Standard, no dependencies, automatic encoding |
| URL Writing | History API (replaceState) | Native | No page reload, no history pollution |
| State Management | React hooks (useState, useEffect) | React 18 | Standard pattern, sufficient for needs |
| Tool Name Format | Kebab-case conversion | Custom util | URL-friendly, human-readable |
| Testing | Vitest + React Testing Library | Current | Existing test infrastructure |

---

## Open Questions

None - all decisions finalized through clarification session.

---

## References

- [URLSearchParams MDN](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- [History.replaceState MDN](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState)
- [React useEffect Hook](https://react.dev/reference/react/useEffect)
- Feature Specification: [spec.md](spec.md)
- Clarification Session: spec.md § Clarifications (2026-02-19)
