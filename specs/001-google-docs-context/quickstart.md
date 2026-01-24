# Quickstart: Google Drive Document Context Integration

**Feature**: 001-google-docs-context  
**Date**: 2026-01-23

## Overview

This guide provides step-by-step implementation instructions for adding Google Docs context support to the combined tools. Follow the phases in order as each builds on the previous.

---

## Prerequisites

Before starting implementation:

1. **Understand existing patterns**: Read through these files:
   - `server/providers/combined/tools/shared/confluence-setup.ts` - Pattern to mirror
   - `server/providers/atlassian/confluence-cache.ts` - Cache structure
   - `server/providers/atlassian/confluence-relevance.ts` - LLM scoring

2. **Verify Google integration works**: 
   - Run existing `drive-doc-to-markdown` tool to confirm Google OAuth flow works
   - Check `google-helpers.ts` functions work with a test document

3. **Set up test data**:
   - Create a test Jira epic with Google Docs links in the description
   - Ensure you have Google OAuth credentials configured

---

## Phase 1: Core Infrastructure

### Step 1.1: Create URL Extraction Utility

**File**: `server/providers/google/google-docs-helpers.ts`

```typescript
// Add to existing file or create new

import { extractUrlsFromADF } from '../atlassian/adf-utils.js';
import type { ADFDocument } from '../atlassian/markdown-converter.js';
import { parseGoogleDriveUrl } from './tools/drive-doc-to-markdown/url-parser.js';

/**
 * Extract Google Docs URLs from ADF document
 */
export function extractGoogleDocsUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: 'docs.google.com/document',
    plainTextRegex: /https?:\/\/docs\.google\.com\/document\/[^\s]*/g,
  });
}

/**
 * Parse and validate a Google Docs URL
 * Returns null if URL is invalid or not a Google Doc
 */
export function parseGoogleDocUrl(url: string): { documentId: string } | null {
  try {
    return parseGoogleDriveUrl(url);
  } catch {
    return null;
  }
}

/**
 * Check if MIME type is a Google Doc
 */
export function isGoogleDoc(mimeType: string): boolean {
  return mimeType === 'application/vnd.google-apps.document';
}
```

**Test**: Write unit tests in `test/unit/google-docs-helpers.test.ts`:
- Test URL extraction from sample ADF
- Test document ID parsing from various URL formats
- Test MIME type checking

### Step 1.2: Create Cache Module

**File**: `server/providers/google/google-docs-cache.ts`

Mirror the structure of `confluence-cache.ts`:

```typescript
import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { DocumentRelevance, DocumentSummaryMetadata } from '../atlassian/confluence-cache.js';

// Re-export shared types
export type { DocumentRelevance, ToolRelevanceScore, DecisionPointScore } from '../atlassian/confluence-cache.js';

export interface GoogleDocCacheMetadata {
  documentId: string;
  title: string;
  url: string;
  mimeType: string;
  modifiedTime: string;
  cachedAt: string;
  markdownLength: number;
  relevance?: DocumentRelevance;
  summary?: DocumentSummaryMetadata;
}

// Path helpers
export function getGoogleDocsCacheBaseDir(): string {
  return path.join(getBaseCacheDir(), 'google-docs');
}

export function getGoogleDocCachePath(documentId: string): string {
  return path.join(getGoogleDocsCacheBaseDir(), documentId);
}

export function getGoogleDocMetadataPath(documentId: string): string {
  return path.join(getGoogleDocCachePath(documentId), 'metadata.json');
}

export function getGoogleDocMarkdownPath(documentId: string): string {
  return path.join(getGoogleDocCachePath(documentId), 'content.md');
}

// Cache operations - implement following confluence-cache.ts patterns
export async function isCacheValid(documentId: string, currentModifiedTime: string): Promise<boolean> {
  // Load existing metadata, compare modifiedTime
}

export async function loadGoogleDocMetadata(documentId: string): Promise<GoogleDocCacheMetadata | null> {
  // Read and parse metadata.json
}

export async function loadGoogleDocMarkdown(documentId: string): Promise<string | null> {
  // Read content.md
}

export async function saveGoogleDocMetadata(documentId: string, metadata: GoogleDocCacheMetadata): Promise<void> {
  // Write metadata.json
}

export async function saveGoogleDocMarkdown(documentId: string, markdown: string): Promise<void> {
  // Write content.md
}

export async function ensureValidCacheForGoogleDoc(
  documentId: string,
  currentModifiedTime: string
): Promise<{ isValid: boolean; existingMetadata: GoogleDocCacheMetadata | null }> {
  // Check cache validity, clear if stale
}
```

**Test**: Unit tests for cache operations (mock fs module).

---

## Phase 2: Relevance Scoring

### Step 2.1: Create Relevance Scoring Module

**File**: `server/providers/google/google-docs-relevance.ts`

```typescript
import type { GenerateTextFn } from '../../llm-client/types.js';
import type { DocumentRelevance } from '../atlassian/confluence-cache.js';
import { loadToolSummaries, buildRelevanceScoringPrompt } from '../atlassian/confluence-relevance.js';

// Shared threshold (rename from Confluence-specific)
const DEFAULT_THRESHOLD = 3.0;

export function getDocsRelevanceThreshold(): number {
  const envValue = process.env.DOCS_RELEVANCE_THRESHOLD;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_THRESHOLD;
}

export async function scoreGoogleDocRelevance(
  title: string,
  documentContent: string,
  generateText: GenerateTextFn
): Promise<DocumentRelevance> {
  // Reuse the same scoring logic as Confluence
  const toolSummaries = await loadToolSummaries();
  const prompt = buildRelevanceScoringPrompt(title, documentContent, toolSummaries);
  
  const response = await generateText({
    prompt,
    maxTokens: 1000,
    temperature: 0.1,
  });
  
  // Parse JSON response into DocumentRelevance
  return parseRelevanceResponse(response.text);
}
```

**Note**: You may need to export `buildRelevanceScoringPrompt` from `confluence-relevance.ts` or extract to shared module.

---

## Phase 3: Context Setup

### Step 3.1: Create Google Docs Setup Module

**File**: `server/providers/combined/tools/shared/google-docs-setup.ts`

Mirror `confluence-setup.ts` structure:

```typescript
import type { GoogleClient } from '../../../google/google-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type { ADFDocument } from '../../../atlassian/markdown-converter.js';
import type { GoogleDocCacheMetadata } from '../../../google/google-docs-cache.js';

import { extractGoogleDocsUrlsFromADF, parseGoogleDocUrl, isGoogleDoc } from '../../../google/google-docs-helpers.js';
import { getDocumentMetadata, exportDocumentAsHTML } from '../../../google/google-helpers.js';
import { ensureValidCacheForGoogleDoc, saveGoogleDocMetadata, saveGoogleDocMarkdown, loadGoogleDocMarkdown } from '../../../google/google-docs-cache.js';
import { scoreGoogleDocRelevance, getDocsRelevanceThreshold } from '../../../google/google-docs-relevance.js';
// Import HTML to markdown conversion from drive-doc-to-markdown

export interface GoogleDocDocument {
  documentId: string;
  title: string;
  url: string;
  markdown: string;
  metadata: GoogleDocCacheMetadata;
}

export interface GoogleDocsContextResult {
  documents: GoogleDocDocument[];
  byRelevance: {
    analyzeScope: GoogleDocDocument[];
    writeStories: GoogleDocDocument[];
    writeNextStory: GoogleDocDocument[];
  };
  getRelevanceForTool(doc: GoogleDocDocument, toolId: string): ToolRelevanceScore | undefined;
}

export interface GoogleDocsContextParams {
  epicAdf: ADFDocument;
  googleClient?: GoogleClient;
  generateText: GenerateTextFn;
  notify?: (message: string) => Promise<void>;
}

export async function setupGoogleDocsContext(params: GoogleDocsContextParams): Promise<GoogleDocsContextResult> {
  const { epicAdf, googleClient, generateText, notify } = params;
  
  // 1. Extract URLs
  const rawUrls = extractGoogleDocsUrlsFromADF(epicAdf);
  
  // 2. Handle missing auth
  if (!googleClient) {
    if (rawUrls.length > 0) {
      await notify?.(`⚠️ Found ${rawUrls.length} Google Docs link(s) but Google auth not available`);
    }
    return emptyResult();
  }
  
  // 3. Parse and deduplicate
  const uniqueDocs = new Map<string, string>(); // documentId -> url
  for (const url of rawUrls) {
    const parsed = parseGoogleDocUrl(url);
    if (parsed && !uniqueDocs.has(parsed.documentId)) {
      uniqueDocs.set(parsed.documentId, url);
    }
  }
  
  // 4. Process each document
  const documents: GoogleDocDocument[] = [];
  for (const [documentId, url] of uniqueDocs) {
    try {
      const doc = await processGoogleDoc(documentId, url, googleClient, generateText, notify);
      if (doc) documents.push(doc);
    } catch (error) {
      // Handle 403/404 gracefully
      await handleDocError(error, url, notify);
    }
  }
  
  // 5. Build result with relevance filtering
  return buildContextResult(documents);
}

async function processGoogleDoc(
  documentId: string,
  url: string,
  client: GoogleClient,
  generateText: GenerateTextFn,
  notify?: (message: string) => Promise<void>
): Promise<GoogleDocDocument | null> {
  // Fetch metadata
  const apiMetadata = await getDocumentMetadata(client, documentId);
  
  // Check MIME type
  if (!isGoogleDoc(apiMetadata.mimeType)) {
    await notify?.(`⚠️ Skipping non-Doc file: ${apiMetadata.name} (${apiMetadata.mimeType})`);
    return null;
  }
  
  // Check cache
  const cacheCheck = await ensureValidCacheForGoogleDoc(documentId, apiMetadata.modifiedTime);
  
  let markdown: string;
  let metadata: GoogleDocCacheMetadata;
  
  if (cacheCheck.isValid && cacheCheck.existingMetadata) {
    // Cache hit
    markdown = await loadGoogleDocMarkdown(documentId) || '';
    metadata = cacheCheck.existingMetadata;
    await notify?.(`📄 Using cached: ${metadata.title}`);
  } else {
    // Cache miss - fetch and convert
    await notify?.(`📥 Fetching: ${apiMetadata.name}`);
    const html = await exportDocumentAsHTML(client, documentId);
    markdown = convertHtmlToMarkdown(html); // Use existing conversion
    
    // Score relevance
    const relevance = await scoreGoogleDocRelevance(apiMetadata.name, markdown, generateText);
    
    // Build and save metadata
    metadata = {
      documentId,
      title: apiMetadata.name,
      url,
      mimeType: apiMetadata.mimeType,
      modifiedTime: apiMetadata.modifiedTime,
      cachedAt: new Date().toISOString(),
      markdownLength: markdown.length,
      relevance,
    };
    
    await saveGoogleDocMetadata(documentId, metadata);
    await saveGoogleDocMarkdown(documentId, markdown);
  }
  
  return { documentId, title: metadata.title, url, markdown, metadata };
}
```

---

## Phase 4: Context Merger

### Step 4.1: Create Unified Context Merger

**File**: `server/providers/combined/tools/shared/docs-context-merger.ts`

```typescript
import type { ConfluenceContextResult, ConfluenceDocument } from './confluence-setup.js';
import type { GoogleDocsContextResult, GoogleDocDocument } from './google-docs-setup.js';
import type { ToolId } from '../../../atlassian/confluence-relevance.js';

export interface UnifiedDocContext {
  title: string;
  sourceType: 'Confluence' | 'Google Docs';
  url: string;
  markdown: string;
  relevanceScore: number;
  relevanceSummary: string;
  documentType: string;
}

export interface MergedDocsContext {
  documents: UnifiedDocContext[];
  counts: { confluence: number; googleDocs: number; total: number };
  hasSkippedDocs: boolean;
  warnings: string[];
}

export function mergeDocsContext(
  confluenceResult: ConfluenceContextResult | undefined,
  googleDocsResult: GoogleDocsContextResult | undefined,
  toolId: ToolId
): MergedDocsContext {
  const documents: UnifiedDocContext[] = [];
  
  // Add Confluence docs
  if (confluenceResult) {
    const filtered = getFilteredDocs(confluenceResult, toolId);
    for (const doc of filtered) {
      const score = confluenceResult.getRelevanceForTool(doc, toolId);
      documents.push({
        title: doc.title,
        sourceType: 'Confluence',
        url: doc.url,
        markdown: doc.markdown,
        relevanceScore: score?.overallScore ?? 0,
        relevanceSummary: score?.summary ?? '',
        documentType: doc.metadata.relevance?.documentType ?? 'unknown',
      });
    }
  }
  
  // Add Google Docs
  if (googleDocsResult) {
    const filtered = getFilteredGoogleDocs(googleDocsResult, toolId);
    for (const doc of filtered) {
      const score = googleDocsResult.getRelevanceForTool(doc, toolId);
      documents.push({
        title: doc.title,
        sourceType: 'Google Docs',
        url: doc.url,
        markdown: doc.markdown,
        relevanceScore: score?.overallScore ?? 0,
        relevanceSummary: score?.summary ?? '',
        documentType: doc.metadata.relevance?.documentType ?? 'unknown',
      });
    }
  }
  
  // Sort by relevance score descending
  documents.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return {
    documents,
    counts: {
      confluence: confluenceResult?.documents.length ?? 0,
      googleDocs: googleDocsResult?.documents.length ?? 0,
      total: documents.length,
    },
    hasSkippedDocs: false, // Track from warnings
    warnings: [],
  };
}

export function formatDocsForPrompt(merged: MergedDocsContext): string {
  if (merged.documents.length === 0) return '';
  
  const sections = merged.documents.map(doc => `
### [${doc.sourceType}] ${doc.title}
*Relevance: ${doc.relevanceScore.toFixed(1)}/10 - ${doc.relevanceSummary}*

${doc.markdown}
`);
  
  return `## Referenced Documentation\n${sections.join('\n---\n')}`;
}
```

---

## Phase 5: Tool Integration

### Step 5.1: Modify analyze-feature-scope

**File**: `server/providers/combined/tools/analyze-feature-scope/core-logic.ts`

Add Phase 4.6 after Confluence setup (Phase 4.5):

```typescript
// After Phase 4.5 - Confluence context
// Phase 4.6 - Google Docs context
let googleDocsContext: GoogleDocsContextResult | undefined;
if (googleClient) {
  await notify('📚 Setting up Google Docs context...');
  googleDocsContext = await setupGoogleDocsContext({
    epicAdf: epicData.description,
    googleClient,
    generateText,
    notify,
  });
}

// Merge contexts for prompt
const mergedDocs = mergeDocsContext(confluenceContext, googleDocsContext, 'analyze-feature-scope');
const docsSection = formatDocsForPrompt(mergedDocs);

// Include docsSection in the AI prompt
```

### Step 5.2: Repeat for other tools

Apply similar changes to:
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- `server/providers/combined/tools/write-next-story/core-logic.ts`

---

## Testing Checklist

### Unit Tests
- [ ] `google-docs-helpers.test.ts` - URL extraction, parsing, MIME check
- [ ] `google-docs-cache.test.ts` - Cache operations (mock fs)
- [ ] `google-docs-relevance.test.ts` - Threshold retrieval

### Integration Tests
- [ ] `google-docs-setup.test.ts` - Full setup flow (mock Google API)
- [ ] `docs-context-merger.test.ts` - Merging and sorting

### E2E Tests
- [ ] Test epic with only Google Docs
- [ ] Test epic with only Confluence
- [ ] Test epic with both sources
- [ ] Test epic with inaccessible Google Doc
- [ ] Test without Google auth (warning path)

---

## Documentation Updates

After implementation, update:

1. **server/readme.md** - Add Google Docs context to tool descriptions
2. **docs/multi-provider-usage.md** - Document Google Docs support
3. **Tool summaries** - Update if decision points change
