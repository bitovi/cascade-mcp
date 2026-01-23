/**
 * Google Docs Context Setup
 * 
 * Orchestrates the process of extracting, caching, and scoring Google Docs
 * referenced in a Jira epic. Provides structured context data for the combined
 * tools (analyze-feature-scope, write-shell-stories, write-next-story).
 * 
 * Pattern: Mirrors confluence-setup.ts for consistency.
 */

import type { GoogleClient } from '../../../google/google-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type { ADFDocument } from '../../../atlassian/markdown-converter.js';
import type { DocumentRelevance, ToolRelevanceScore, DocumentSummaryMetadata } from '../../../atlassian/confluence-cache.js';
import type { GoogleDocMetadata } from '../../../google/types.js';

import {
  extractGoogleDocsUrlsFromADF,
  parseGoogleDocUrl,
  isGoogleDoc,
  deduplicateByDocumentId,
} from '../../../google/google-docs-helpers.js';
import { getDocumentMetadata, exportDocumentAsHTML } from '../../../google/google-helpers.js';
import { htmlToMarkdown } from '../../../google/tools/drive-doc-to-markdown/conversion-helpers.js';
import { getDocsRelevanceThreshold, scoreDocumentRelevance } from '../../../atlassian/confluence-relevance.js';
import {
  ensureValidCacheForGoogleDoc,
  saveGoogleDocMetadata,
  saveGoogleDocMarkdown,
} from '../../../google/google-docs-cache.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Cached metadata for a Google Doc
 */
export interface GoogleDocCacheMetadata {
  /** Google Drive document ID */
  documentId: string;
  /** Document title */
  title: string;
  /** Original URL from the epic */
  url: string;
  /** MIME type from Drive API */
  mimeType: string;
  /** Last modified timestamp (ISO 8601) from Drive API */
  modifiedTime: string;
  /** When we cached this content (ISO 8601) */
  cachedAt: string;
  /** Length of markdown content in characters */
  markdownLength: number;
  /** Relevance scoring data (populated after LLM analysis) */
  relevance?: DocumentRelevance;
  /** Summary (only present if document was summarized) */
  summary?: DocumentSummaryMetadata;
}

/**
 * A processed Google Doc with content and metadata
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
  /** Metadata including relevance scores */
  metadata: GoogleDocCacheMetadata;
}

/**
 * Result of setting up Google Docs context
 */
export interface GoogleDocsContextResult {
  /** All successfully processed documents */
  documents: GoogleDocDocument[];
  
  /**
   * Documents filtered and sorted by relevance score (descending).
   * Only includes documents with overallScore >= DOCS_RELEVANCE_THRESHOLD.
   */
  byRelevance: {
    /** Sorted by analyze-feature-scope relevance */
    analyzeScope: GoogleDocDocument[];
    /** Sorted by write-shell-stories relevance */
    writeStories: GoogleDocDocument[];
    /** Sorted by write-next-story relevance */
    writeNextStory: GoogleDocDocument[];
  };
  
  /**
   * Get relevance details for a specific document and tool
   */
  getRelevanceForTool(doc: GoogleDocDocument, toolId: string): ToolRelevanceScore | undefined;
  
  /**
   * Warnings encountered during processing (e.g., missing auth, skipped docs)
   */
  warnings?: string[];
}

/**
 * Parameters for setting up Google Docs context
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

// ============================================================================
// Shared Types (for use in prompt builders)
// ============================================================================

/**
 * Unified document context for AI prompts.
 * Supports both Confluence pages and Google Docs.
 * Used by analyze-feature-scope, write-shell-stories, and write-next-story prompts.
 */
export interface DocumentContext {
  /** Document title */
  title: string;
  /** URL to the document */
  url: string;
  /** Document content in markdown format */
  markdown: string;
  /** Document type classification */
  documentType?: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
  /** Relevance score for the target tool (0-10) */
  relevanceScore?: number;
  /** Brief summary of document content */
  summary?: string;
  /** Document source */
  source: 'confluence' | 'google-docs';
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum document size in bytes (10MB) */
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Process a single Google Docs URL
 * 
 * Uses caching to avoid refetching unchanged documents:
 * 1. Fetch metadata to get current modifiedTime
 * 2. Check cache - if valid, return cached content
 * 3. If cache miss, fetch content and save to cache
 * 
 * @returns Processed document or null if failed
 */
async function processGoogleDocUrl(
  url: string,
  documentId: string,
  googleClient: GoogleClient,
  generateText: GenerateTextFn
): Promise<{ doc: GoogleDocDocument | null; warning?: string }> {
  console.log(`    📄 Processing: ${url}`);
  
  try {
    // Step 1: Fetch document metadata (always needed to check modifiedTime)
    console.log(`      🔍 Fetching metadata for ${documentId}`);
    const metadata = await getDocumentMetadata(googleClient, documentId);
    
    // Step 2: Validate MIME type
    if (!isGoogleDoc(metadata.mimeType)) {
      const warning = `Skipped non-Google-Doc file: ${metadata.name} (${metadata.mimeType})`;
      console.log(`      ⚠️  ${warning}`);
      return { doc: null, warning };
    }
    
    // Step 3: Validate file size
    if (metadata.size && metadata.size > MAX_DOCUMENT_SIZE) {
      const sizeMB = (metadata.size / (1024 * 1024)).toFixed(2);
      const warning = `Skipped large document: ${metadata.name} (${sizeMB}MB > 10MB limit)`;
      console.log(`      ⚠️  ${warning}`);
      return { doc: null, warning };
    }
    
    // Step 4: Check cache
    const cacheCheck = await ensureValidCacheForGoogleDoc(documentId, metadata.modifiedTime);
    
    if (cacheCheck.cacheHit && cacheCheck.metadata && cacheCheck.markdown) {
      console.log(`      📦 Using cached content for: ${metadata.name}`);
      return {
        doc: {
          documentId,
          title: cacheCheck.metadata.title,
          url,
          markdown: cacheCheck.markdown,
          metadata: cacheCheck.metadata,
        },
      };
    }
    
    // Step 5: Cache miss - export as HTML and convert to markdown
    console.log(`      📥 Exporting document as HTML`);
    const html = await exportDocumentAsHTML(googleClient, documentId);
    
    console.log(`      📝 Converting to Markdown`);
    const { markdown } = htmlToMarkdown(html);
    
    // Step 6: Score relevance with LLM
    console.log(`      🎯 Scoring document relevance`);
    const relevance = await scoreDocumentRelevance(
      generateText,
      metadata.name,
      markdown
    );
    
    // Step 7: Build metadata and save to cache
    const cacheMetadata: GoogleDocCacheMetadata = {
      documentId,
      title: metadata.name,
      url,
      mimeType: metadata.mimeType,
      modifiedTime: metadata.modifiedTime,
      cachedAt: new Date().toISOString(),
      markdownLength: markdown.length,
      relevance,
    };
    
    // Save to cache for future use
    await saveGoogleDocMetadata(documentId, cacheMetadata);
    await saveGoogleDocMarkdown(documentId, markdown);
    console.log(`      💾 Saved to cache: ${metadata.name}`);
    
    console.log(`      ✅ Processed: ${metadata.name}`);
    return {
      doc: {
        documentId,
        title: metadata.name,
        url,
        markdown,
        metadata: cacheMetadata,
      },
    };
  } catch (error: any) {
    const warning = `Failed to process ${url}: ${error.message}`;
    console.log(`      ❌ ${warning}`);
    return { doc: null, warning };
  }
}

/**
 * Sort documents by relevance score for a specific tool
 */
function sortByToolRelevance(
  documents: GoogleDocDocument[],
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story'
): GoogleDocDocument[] {
  const threshold = getDocsRelevanceThreshold();
  
  return documents
    .filter(doc => {
      const toolScore = doc.metadata.relevance?.toolScores.find(t => t.toolId === toolId);
      return toolScore && toolScore.overallScore >= threshold;
    })
    .sort((a, b) => {
      const scoreA = a.metadata.relevance?.toolScores.find(t => t.toolId === toolId)?.overallScore ?? 0;
      const scoreB = b.metadata.relevance?.toolScores.find(t => t.toolId === toolId)?.overallScore ?? 0;
      return scoreB - scoreA; // Descending order
    });
}

/**
 * Create an empty result (no Google Docs)
 */
function createEmptyResult(warnings?: string[]): GoogleDocsContextResult {
  return {
    documents: [],
    byRelevance: {
      analyzeScope: [],
      writeStories: [],
      writeNextStory: [],
    },
    getRelevanceForTool() {
      return undefined;
    },
    warnings,
  };
}

// ============================================================================
// Main Setup Function
// ============================================================================

/**
 * Setup Google Docs context for an epic
 * 
 * Extracts Google Docs URLs from the epic ADF, fetches documents, converts
 * to markdown, scores their relevance, and returns structured context for tools.
 * 
 * Error handling:
 * - Returns empty documents array with warning if no googleClient provided
 * - Returns empty documents array if no Google Docs URLs found (not an error)
 * - Partial success: Returns successfully loaded documents, logs warnings for failures
 * - Individual document errors (404, 403) are logged but don't stop processing
 * 
 * @param params - Configuration for Google Docs context setup
 * @returns Structured context data with relevance-sorted documents
 */
export async function setupGoogleDocsContext(
  params: GoogleDocsContextParams
): Promise<GoogleDocsContextResult> {
  const { epicAdf, googleClient, generateText, notify } = params;
  
  console.log('📄 Setting up Google Docs context...');
  
  // ==========================================
  // Step 1: Extract Google Docs URLs from epic
  // ==========================================
  if (notify) {
    await notify('Extracting Google Docs links from epic...');
  }
  
  const rawUrls = extractGoogleDocsUrlsFromADF(epicAdf);
  console.log(`  Found ${rawUrls.length} Google Docs URLs`);
  
  if (rawUrls.length === 0) {
    console.log('  No Google Docs links found in epic - returning empty context');
    return createEmptyResult();
  }
  
  // ==========================================
  // Step 2: Check for Google authentication
  // ==========================================
  if (!googleClient) {
    const warning = `Found ${rawUrls.length} Google Docs link(s) but Google authentication is not available. ` +
      `To include Google Docs context, authenticate with Google OAuth.`;
    console.log(`  ⚠️  ${warning}`);
    return createEmptyResult([warning]);
  }
  
  // ==========================================
  // Step 3: Deduplicate URLs by document ID
  // ==========================================
  const uniqueUrls = deduplicateByDocumentId(rawUrls);
  console.log(`  Deduplicated to ${uniqueUrls.length} unique documents`);
  
  // ==========================================
  // Step 4: Parse URLs to extract document IDs
  // ==========================================
  const urlsWithIds: Array<{ url: string; documentId: string }> = [];
  const warnings: string[] = [];
  
  for (const url of uniqueUrls) {
    const parsed = parseGoogleDocUrl(url);
    if (parsed) {
      urlsWithIds.push({ url, documentId: parsed.documentId });
    } else {
      const warning = `Skipped malformed Google Docs URL: ${url}`;
      console.log(`    ⚠️  ${warning}`);
      warnings.push(warning);
    }
  }
  
  if (urlsWithIds.length === 0) {
    console.log('  No valid Google Docs URLs found - returning empty context');
    return createEmptyResult(warnings.length > 0 ? warnings : undefined);
  }
  
  // ==========================================
  // Step 5: Process each document
  // ==========================================
  if (notify) {
    await notify(`Processing ${urlsWithIds.length} Google Docs...`);
  }
  
  const documents: GoogleDocDocument[] = [];
  
  for (const { url, documentId } of urlsWithIds) {
    const result = await processGoogleDocUrl(url, documentId, googleClient, generateText);
    if (result.doc) {
      documents.push(result.doc);
    }
    if (result.warning) {
      warnings.push(result.warning);
    }
  }
  
  console.log(`  Successfully processed ${documents.length} of ${urlsWithIds.length} documents`);
  
  // ==========================================
  // Step 6: Sort by relevance for each tool
  // ==========================================
  const byRelevance = {
    analyzeScope: sortByToolRelevance(documents, 'analyze-feature-scope'),
    writeStories: sortByToolRelevance(documents, 'write-shell-stories'),
    writeNextStory: sortByToolRelevance(documents, 'write-next-story'),
  };
  
  console.log(`  Relevance filtering: analyze-scope=${byRelevance.analyzeScope.length}, write-stories=${byRelevance.writeStories.length}, write-next=${byRelevance.writeNextStory.length}`);
  
  // ==========================================
  // Return result
  // ==========================================
  return {
    documents,
    byRelevance,
    // Note: Relevance scoring uses shared threshold (DOCS_RELEVANCE_THRESHOLD) with Confluence.
    // Sorting is done per-tool here for convenience; can be moved to docs-context-merger.ts in Phase 6.
    getRelevanceForTool(doc: GoogleDocDocument, toolId: string): ToolRelevanceScore | undefined {
      return doc.metadata.relevance?.toolScores.find(t => t.toolId === toolId);
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
