# Data Model: Google Drive Document Context Integration

**Feature**: 001-google-docs-context  
**Date**: 2026-01-23

## Overview

This document defines the TypeScript interfaces and data structures for the Google Docs context integration feature. The design mirrors the existing Confluence pattern while adapting to Google Drive API specifics.

---

## Core Entities

### 1. GoogleDocCacheMetadata

Cached metadata for a Google Doc, stored in `cache/google-docs/{documentId}/metadata.json`.

```typescript
/**
 * Metadata stored with cached Google Docs
 * 
 * Location: server/providers/google/google-docs-cache.ts
 */
export interface GoogleDocCacheMetadata {
  /** Google Drive document ID (also used as cache directory name) */
  documentId: string;
  
  /** Document title from Drive API */
  title: string;
  
  /** Original URL from the epic */
  url: string;
  
  /** MIME type (should be 'application/vnd.google-apps.document') */
  mimeType: string;
  
  /** ISO 8601 timestamp from Drive API - used for cache invalidation */
  modifiedTime: string;
  
  /** ISO 8601 timestamp when we cached this content */
  cachedAt: string;
  
  /** Length of markdown content in characters */
  markdownLength: number;
  
  /** Relevance scoring (populated after LLM analysis) */
  relevance?: DocumentRelevance;
  
  /** Summary (only present if document was summarized for large docs) */
  summary?: DocumentSummaryMetadata;
}
```

### 2. DocumentRelevance (Shared)

Reused from Confluence implementation - same structure applies to both document sources.

```typescript
/**
 * Document relevance information
 * 
 * Location: server/providers/atlassian/confluence-cache.ts (existing)
 * Also used by: server/providers/google/google-docs-cache.ts
 */
export interface DocumentRelevance {
  /** Categorized document type */
  documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
  
  /** Relevance scores for each tool */
  toolScores: ToolRelevanceScore[];
}

export interface ToolRelevanceScore {
  /** Tool ID */
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';
  
  /** Scores for each decision point (optional, for detailed analysis) */
  decisionPointScores?: DecisionPointScore[];
  
  /** Overall score (0-10 scale) */
  overallScore: number;
  
  /** Brief summary of relevance to this tool */
  summary: string;
}

export interface DecisionPointScore {
  /** ID of the decision point */
  decisionPointId: string;
  
  /** Score from 0-10 */
  score: number;
  
  /** Brief explanation of the score */
  reasoning: string;
}
```

### 3. GoogleDocDocument

A processed Google Doc with content and metadata (in-memory representation).

```typescript
/**
 * A processed Google Doc with content and metadata
 * 
 * Location: server/providers/combined/tools/shared/google-docs-setup.ts
 */
export interface GoogleDocDocument {
  /** Google Drive document ID */
  documentId: string;
  
  /** Document title */
  title: string;
  
  /** Original URL from the epic */
  url: string;
  
  /** Full document content in markdown */
  markdown: string;
  
  /** Cached metadata including relevance scores */
  metadata: GoogleDocCacheMetadata;
}
```

### 4. GoogleDocsContextResult

Result of setting up Google Docs context - similar to ConfluenceContextResult.

```typescript
/**
 * Result of setting up Google Docs context
 * 
 * Location: server/providers/combined/tools/shared/google-docs-setup.ts
 */
export interface GoogleDocsContextResult {
  /** All successfully processed documents */
  documents: GoogleDocDocument[];
  
  /** Documents filtered and sorted by relevance score (descending) */
  byRelevance: {
    /** Sorted by analyze-feature-scope relevance */
    analyzeScope: GoogleDocDocument[];
    
    /** Sorted by write-shell-stories relevance */
    writeStories: GoogleDocDocument[];
    
    /** Sorted by write-next-story relevance */
    writeNextStory: GoogleDocDocument[];
  };
  
  /** Get relevance details for a specific document and tool */
  getRelevanceForTool(doc: GoogleDocDocument, toolId: string): ToolRelevanceScore | undefined;
}
```

### 5. GoogleDocsContextParams

Parameters for setting up Google Docs context.

```typescript
/**
 * Parameters for setting up Google Docs context
 * 
 * Location: server/providers/combined/tools/shared/google-docs-setup.ts
 */
export interface GoogleDocsContextParams {
  /** Epic ADF document to extract Google Docs URLs from */
  epicAdf: ADFDocument;
  
  /** Google API client with auth (optional - if missing, returns empty result with warning) */
  googleClient?: GoogleClient;
  
  /** LLM client for relevance scoring (required) */
  generateText: GenerateTextFn;
  
  /** Optional progress callback */
  notify?: (message: string) => Promise<void>;
}
```

---

## Unified Context Types

### 6. UnifiedDocContext

A single document from any source (Confluence or Google Docs) prepared for prompt inclusion.

```typescript
/**
 * Unified document context for prompt inclusion
 * 
 * Location: server/providers/combined/tools/shared/docs-context-merger.ts
 */
export interface UnifiedDocContext {
  /** Document title */
  title: string;
  
  /** Source type for display in prompts */
  sourceType: 'Confluence' | 'Google Docs';
  
  /** Original URL */
  url: string;
  
  /** Document content in markdown */
  markdown: string;
  
  /** Relevance score for the current tool (used for sorting) */
  relevanceScore: number;
  
  /** Brief relevance summary from LLM scoring */
  relevanceSummary: string;
  
  /** Document type category */
  documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
}

/**
 * Result of merging Confluence and Google Docs contexts
 */
export interface MergedDocsContext {
  /** All documents sorted by relevance score (descending) */
  documents: UnifiedDocContext[];
  
  /** Count of documents by source */
  counts: {
    confluence: number;
    googleDocs: number;
    total: number;
  };
  
  /** Whether any documents were skipped due to auth issues */
  hasSkippedDocs: boolean;
  
  /** Warning messages for skipped documents */
  warnings: string[];
}
```

---

## Cache Path Structure

```
cache/
└── google-docs/
    └── {documentId}/
        ├── metadata.json    # GoogleDocCacheMetadata
        └── content.md       # Converted markdown content
```

### Path Helper Functions

```typescript
/**
 * Cache path utilities
 * 
 * Location: server/providers/google/google-docs-cache.ts
 */

/** Get the cache base directory for Google Docs */
export function getGoogleDocsCacheBaseDir(): string;

/** Get the cache directory for a specific document */
export function getGoogleDocCachePath(documentId: string): string;

/** Get the metadata file path */
export function getGoogleDocMetadataPath(documentId: string): string;

/** Get the markdown content file path */
export function getGoogleDocMarkdownPath(documentId: string): string;
```

---

## Validation Rules

### Document ID Validation
- Must be 25-44 characters
- Alphanumeric plus underscore and hyphen: `[a-zA-Z0-9_-]`
- Extracted from URL via `parseGoogleDriveUrl()`

### MIME Type Filtering
- Only process: `application/vnd.google-apps.document`
- Skip with warning: `application/vnd.google-apps.spreadsheet`, `application/vnd.google-apps.presentation`

### Size Limits
- Skip documents > 10MB with warning (matching existing drive-doc-to-markdown behavior)

### Relevance Threshold
- Default: 3.0
- Configurable via `DOCS_RELEVANCE_THRESHOLD` environment variable
- Documents scoring below threshold are excluded from tool context

---

## State Transitions

### Document Processing States

```
┌─────────────┐    URL found    ┌─────────────┐
│  Not Found  │ ──────────────► │   Pending   │
└─────────────┘                 └─────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
              Cache Hit         Cache Miss         Auth Error
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │   Cached    │   │   Fetched   │   │   Skipped   │
            │ (load md)   │   │ (export+md) │   │ (warning)   │
            └─────────────┘   └─────────────┘   └─────────────┘
                    │                 │
                    └────────┬────────┘
                             │
                    Check Relevance
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         Score >= 3.0   Score < 3.0    No LLM Client
              │              │              │
              ▼              ▼              ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │  Included   │ │  Excluded   │ │  Included*  │
      │ (in prompt) │ │ (filtered)  │ │ (unscored)  │
      └─────────────┘ └─────────────┘ └─────────────┘

* Without relevance scoring, all documents are included
```

---

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        Combined Tools                           │
│  (analyze-feature-scope, write-shell-stories, write-next-story) │
└─────────────────────────────────────────────────────────────────┘
                              │
                    calls setupDocsContext()
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ setupConfluenceCtx  │                 │ setupGoogleDocsCtx  │
│ (confluence-setup)  │                 │ (google-docs-setup) │
└─────────────────────┘                 └─────────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ ConfluenceDocument  │                 │ GoogleDocDocument   │
│ ConfluenceMetadata  │                 │ GoogleDocMetadata   │
└─────────────────────┘                 └─────────────────────┘
          │                                       │
          └───────────────────┬───────────────────┘
                              │
                    mergeDocsContext()
                              │
                              ▼
                    ┌─────────────────────┐
                    │  MergedDocsContext  │
                    │  (UnifiedDocCtx[])  │
                    └─────────────────────┘
                              │
                    included in AI prompt
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Tool AI Response   │
                    └─────────────────────┘
```
