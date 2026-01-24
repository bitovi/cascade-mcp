# Contracts: Google Drive Document Context Integration

**Feature**: 001-google-docs-context  
**Date**: 2026-01-23

## Overview

This feature does not expose new external APIs. It enhances the internal behavior of existing tools (`analyze-feature-scope`, `write-shell-stories`, `write-next-story`).

The contracts below define the internal interfaces between modules.

---

## Internal Interfaces

### 1. Google Docs Setup Interface

**Module**: `server/providers/combined/tools/shared/google-docs-setup.ts`

```typescript
/**
 * Set up Google Docs context for combined tools
 * 
 * Orchestrates: URL extraction → fetch → convert → score → cache
 * 
 * @param params - Context setup parameters
 * @returns Processed documents with relevance filtering
 */
export async function setupGoogleDocsContext(
  params: GoogleDocsContextParams
): Promise<GoogleDocsContextResult>;
```

**Behavior Contract**:
- If `googleClient` is undefined, returns empty result with warning in logs
- Extracts Google Docs URLs from `epicAdf` using `extractGoogleDocsUrlsFromADF()`
- Deduplicates URLs by document ID
- For each unique document:
  - Check cache validity (compare `modifiedTime`)
  - Fetch metadata + export HTML if cache miss
  - Convert HTML to markdown
  - Score relevance via LLM
  - Save to cache
- Returns documents filtered by tool relevance

---

### 2. Google Docs Cache Interface

**Module**: `server/providers/google/google-docs-cache.ts`

```typescript
/**
 * Check if cached Google Doc is still valid
 */
export async function isCacheValid(
  documentId: string,
  currentModifiedTime: string
): Promise<boolean>;

/**
 * Load cached metadata for a Google Doc
 */
export async function loadGoogleDocMetadata(
  documentId: string
): Promise<GoogleDocCacheMetadata | null>;

/**
 * Load cached markdown content for a Google Doc
 */
export async function loadGoogleDocMarkdown(
  documentId: string
): Promise<string | null>;

/**
 * Save metadata to cache
 */
export async function saveGoogleDocMetadata(
  documentId: string,
  metadata: GoogleDocCacheMetadata
): Promise<void>;

/**
 * Save markdown content to cache
 */
export async function saveGoogleDocMarkdown(
  documentId: string,
  markdown: string
): Promise<void>;

/**
 * Clear cache for a document (used when cache is corrupted)
 */
export async function clearGoogleDocCache(
  documentId: string
): Promise<void>;

/**
 * Ensure cache is valid for document, clearing if stale
 */
export async function ensureValidCacheForGoogleDoc(
  documentId: string,
  currentModifiedTime: string
): Promise<{ isValid: boolean; existingMetadata: GoogleDocCacheMetadata | null }>;
```

---

### 3. Google Docs Relevance Interface

**Module**: `server/providers/google/google-docs-relevance.ts`

```typescript
/**
 * Score how relevant a Google Doc is to the combined tools
 * 
 * Uses same scoring methodology as Confluence relevance
 */
export async function scoreGoogleDocRelevance(
  title: string,
  documentContent: string,
  generateText: GenerateTextFn
): Promise<DocumentRelevance>;

/**
 * Get the shared relevance threshold
 * 
 * @returns Threshold from DOCS_RELEVANCE_THRESHOLD env var or default (3.0)
 */
export function getDocsRelevanceThreshold(): number;
```

---

### 4. Google Docs Helpers Interface

**Module**: `server/providers/google/google-docs-helpers.ts`

```typescript
/**
 * Extract Google Docs URLs from ADF document
 * 
 * Matches: https://docs.google.com/document/d/{id}/...
 */
export function extractGoogleDocsUrlsFromADF(adf: ADFDocument): string[];

/**
 * Parse a Google Docs URL and extract document ID
 * 
 * Wrapper around existing parseGoogleDriveUrl with validation
 */
export function parseGoogleDocUrl(url: string): { documentId: string } | null;

/**
 * Check if a MIME type is a Google Doc (vs Sheets, Slides)
 */
export function isGoogleDoc(mimeType: string): boolean;
```

---

### 5. Docs Context Merger Interface

**Module**: `server/providers/combined/tools/shared/docs-context-merger.ts`

```typescript
/**
 * Merge Confluence and Google Docs contexts into unified structure
 * 
 * @param confluenceResult - Result from setupConfluenceContext (optional)
 * @param googleDocsResult - Result from setupGoogleDocsContext (optional)
 * @param toolId - Tool to filter relevance by
 * @returns Merged and sorted documents with warnings
 */
export function mergeDocsContext(
  confluenceResult: ConfluenceContextResult | undefined,
  googleDocsResult: GoogleDocsContextResult | undefined,
  toolId: ToolId
): MergedDocsContext;

/**
 * Format merged docs for AI prompt inclusion
 * 
 * @param merged - Merged docs context
 * @returns Markdown-formatted string for prompt
 */
export function formatDocsForPrompt(merged: MergedDocsContext): string;
```

**Format Contract**:
The `formatDocsForPrompt` function produces:
```markdown
## Referenced Documentation

### [Google Docs] Requirements Document
*Relevance: 8.5/10 - Contains detailed feature requirements*

[Document markdown content here...]

---

### [Confluence] Technical Architecture
*Relevance: 7.2/10 - Describes system constraints*

[Document markdown content here...]
```

Documents are:
1. Sorted by relevance score (descending)
2. Labeled with source type tag
3. Include relevance score and summary

---

## Error Handling Contract

### Authentication Errors

When Google authentication is missing but Google Docs URLs are found:

```typescript
// In setupGoogleDocsContext
if (!googleClient) {
  const urls = extractGoogleDocsUrlsFromADF(epicAdf);
  if (urls.length > 0) {
    await notify?.(`⚠️ Found ${urls.length} Google Docs link(s) but Google authentication is not available. To include Google Docs context, authenticate with Google OAuth.`);
  }
  return emptyResult();
}
```

### Document Access Errors

When a specific document cannot be accessed (403/404):

```typescript
// In document processing loop
try {
  const metadata = await getDocumentMetadata(client, documentId);
  // ... process document
} catch (error) {
  if (error.message.includes('403') || error.message.includes('Access denied')) {
    console.log(`⚠️ Skipping ${documentId}: Permission denied`);
    await notify?.(`⚠️ Skipped Google Doc (no access): ${url}`);
    continue; // Skip to next document
  }
  if (error.message.includes('404') || error.message.includes('not found')) {
    console.log(`⚠️ Skipping ${documentId}: Document not found`);
    await notify?.(`⚠️ Skipped Google Doc (not found): ${url}`);
    continue;
  }
  throw error; // Re-throw unexpected errors
}
```

---

## No External API Changes

The following existing tools are enhanced but their external interfaces remain unchanged:

- `analyze-feature-scope` - MCP tool and REST API
- `write-shell-stories` - MCP tool and REST API  
- `write-next-story` - MCP tool and REST API

These tools will automatically include Google Docs context when:
1. Google OAuth is available (token in auth context)
2. Google Docs URLs are present in the epic description
3. Documents are accessible and pass relevance threshold
