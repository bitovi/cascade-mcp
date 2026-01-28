/**
 * Confluence Context Setup
 * 
 * Orchestrates the process of extracting, caching, and scoring Confluence
 * documents referenced in a Jira epic. Provides structured context data
 * for the combined tools (analyze-feature-scope, write-shell-stories, write-next-story).
 * 
 * Similar in purpose to figma-screen-setup.ts for Figma screens.
 */

import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type { ADFDocument } from '../../../atlassian/markdown-converter.js';
import type { ConfluencePageData, ConfluenceUrlInfo } from '../../../atlassian/confluence-helpers.js';
import type { ConfluenceMetadata, DocumentRelevance, ToolRelevanceScore } from '../../../atlassian/confluence-cache.js';

import { 
  extractConfluenceUrlsFromADF, 
  getConfluencePage,
  resolveConfluenceShortLink,
  parseConfluenceUrl
} from '../../../atlassian/confluence-helpers.js';
import { 
  ensureValidCacheForConfluencePage, 
  saveConfluenceMetadata, 
  saveConfluenceMarkdown,
  loadConfluenceMarkdown,
  loadConfluenceMetadata 
} from '../../../atlassian/confluence-cache.js';
import { 
  scoreDocumentRelevance, 
  getRelevanceThreshold 
} from '../../../atlassian/confluence-relevance.js';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A processed Confluence document with content and metadata
 */
export interface ConfluenceDocument {
  /** Confluence page ID */
  pageId: string;
  /** Page title */
  title: string;
  /** Original URL from the epic */
  url: string;
  /** Full document content in markdown */
  markdown: string;
  /** Cached metadata including relevance scores */
  metadata: ConfluenceMetadata;
}

/**
 * Result of setting up Confluence context
 */
export interface ConfluenceContextResult {
  /** All successfully processed documents */
  documents: ConfluenceDocument[];
  
  /**
   * Documents filtered and sorted by relevance score (descending).
   * Only includes documents with overallScore >= RELEVANCE_THRESHOLD.
   */
  byRelevance: {
    /** Sorted by analyze-feature-scope relevance */
    analyzeScope: ConfluenceDocument[];
    /** Sorted by write-shell-stories relevance */
    writeStories: ConfluenceDocument[];
    /** Sorted by write-next-story relevance */
    writeNextStory: ConfluenceDocument[];
  };
  
  /**
   * Get relevance details for a specific document and tool
   */
  getRelevanceForTool(doc: ConfluenceDocument, toolId: string): ToolRelevanceScore | undefined;
}

/**
 * Parameters for setting up Confluence context
 */
export interface ConfluenceContextParams {
  /** Epic ADF document to extract Confluence URLs from */
  epicAdf: ADFDocument;
  /** Atlassian API client with auth */
  atlassianClient: AtlassianClient;
  /** LLM client for relevance scoring (required) */
  generateText: GenerateTextFn;
  /** Atlassian site name (e.g., "mycompany" from mycompany.atlassian.net) */
  siteName: string;
  /** Optional progress callback */
  notify?: (message: string) => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Process a single Confluence URL
 * 
 * @returns Processed document or null if failed
 */
async function processConfluenceUrl(
  urlInfo: ConfluenceUrlInfo,
  atlassianClient: AtlassianClient,
  siteName: string,
  generateText: GenerateTextFn
): Promise<ConfluenceDocument | null> {
  const { url, pageId, siteName: urlSiteName } = urlInfo;
  
  // Use site name from URL if present, otherwise use the provided one
  const effectiveSiteName = urlSiteName || siteName;
  
  console.log(`    📄 Processing: ${url}`);
  
  try {
    // Step 1: Check cache validity
    const cacheStatus = await ensureValidCacheForConfluencePage(
      atlassianClient,
      effectiveSiteName,
      pageId
    );
    
    let pageData: ConfluencePageData | null = null;
    let markdown: string;
    let metadata: ConfluenceMetadata | null = null;
    let relevance: DocumentRelevance | undefined;
    
    if (cacheStatus.cacheValid) {
      // Cache is valid - load from cache
      console.log(`      ✅ Cache valid for page ${pageId}`);
      
      metadata = await loadConfluenceMetadata(pageId);
      const cachedMarkdown = await loadConfluenceMarkdown(pageId);
      
      if (metadata && cachedMarkdown) {
        markdown = cachedMarkdown;
        relevance = metadata.relevance;
      } else {
        // Cache files missing - need to refetch
        console.log(`      ⚠️  Cache files missing, refetching...`);
        cacheStatus.cacheValid = false;
      }
    }
    
    if (!cacheStatus.cacheValid) {
      // Cache is stale or missing - fetch fresh data
      console.log(`      🔄 Fetching page from Confluence API...`);
      
      pageData = await getConfluencePage(atlassianClient, effectiveSiteName, pageId);
      
      // Convert ADF body to markdown
      if (pageData.body && pageData.body.content) {
        markdown = convertAdfNodesToMarkdown(pageData.body.content);
      } else {
        markdown = '(No content)';
      }
      
      // Score relevance with LLM
      relevance = await scoreDocumentRelevance(
        generateText,
        pageData.title,
        markdown
      );
      
      // Save to cache
      metadata = {
        pageId,
        title: pageData.title,
        url,
        lastModified: pageData.version.createdAt,
        spaceKey: pageData.space.key,
        cachedAt: new Date().toISOString(),
        versionNumber: pageData.version.number,
        markdownLength: markdown.length,
        relevance,
      };
      
      await saveConfluenceMetadata(metadata);
      await saveConfluenceMarkdown(pageId, markdown);
    }
    
    // metadata! is safe here because we either loaded it or created it
    return {
      pageId,
      title: metadata!.title,
      url,
      markdown: markdown!,
      metadata: metadata!,
    };
    
  } catch (error: any) {
    console.log(`      ❌ Failed to process ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Sort documents by relevance score for a specific tool
 */
function sortByToolRelevance(
  documents: ConfluenceDocument[],
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story'
): ConfluenceDocument[] {
  const threshold = getRelevanceThreshold();
  
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

// ============================================================================
// Main Setup Function
// ============================================================================

/**
 * Setup Confluence context for an epic
 * 
 * Extracts Confluence URLs from the epic ADF, fetches pages (with caching),
 * scores their relevance, and returns structured context for tools.
 * 
 * Error handling:
 * - Returns empty documents array if no Confluence URLs found (not an error)
 * - Returns empty documents array if ALL pages fail to load
 * - Partial success: Returns successfully loaded documents, logs warnings for failures
 * - Individual page errors (404, 403) are logged but don't stop processing
 * - Only throws on fatal errors (invalid atlassianClient, network completely down)
 * 
 * @param params - Configuration for Confluence context setup
 * @returns Structured context data with relevance-sorted documents
 */
export async function setupConfluenceContext(
  params: ConfluenceContextParams
): Promise<ConfluenceContextResult> {
  const { epicAdf, atlassianClient, generateText, siteName, notify } = params;
  
  console.log('🔗 Setting up Confluence context...');
  
  // ==========================================
  // Step 1: Extract Confluence URLs from epic
  // ==========================================
  // Note: No progress notification here - extraction is instant (per spec 040)
  
  const rawUrls = extractConfluenceUrlsFromADF(epicAdf);
  console.log(`  Found ${rawUrls.length} Confluence URLs`);
  
  if (rawUrls.length === 0) {
    console.log('  No Confluence links found in epic - returning empty context');
    return createEmptyResult();
  }
  
  // ==========================================
  // Step 2: Parse and resolve URLs
  // ==========================================
  const urlInfos: ConfluenceUrlInfo[] = [];
  
  for (const url of rawUrls) {
    // Parse the URL to get initial info
    let info = parseConfluenceUrl(url);
    
    if (!info) {
      console.log(`    ⚠️  Could not parse Confluence URL: ${url}`);
      continue;
    }
    
    // If it's a short link, try to resolve it
    if (info.wasShortLink) {
      console.log(`    📎 Resolving short link: ${url}`);
      const resolved = await resolveConfluenceShortLink(atlassianClient, info);
      if (resolved) {
        info = resolved;
      } else {
        console.log(`    ⚠️  Could not resolve short link: ${url}`);
        continue;
      }
    }
    
    // Check for duplicates (by pageId)
    if (!urlInfos.some(existing => existing.pageId === info!.pageId)) {
      urlInfos.push(info);
    }
  }
  
  console.log(`  Resolved to ${urlInfos.length} unique pages`);
  
  if (urlInfos.length === 0) {
    console.log('  No valid Confluence pages found - returning empty context');
    return createEmptyResult();
  }
  
  // ==========================================
  // Step 3: Process each page
  // ==========================================
  if (notify) {
    await notify(`Processing ${urlInfos.length} Confluence pages...`);
  }
  
  const documents: ConfluenceDocument[] = [];
  
  for (const urlInfo of urlInfos) {
    const doc = await processConfluenceUrl(urlInfo, atlassianClient, siteName, generateText);
    if (doc) {
      documents.push(doc);
    }
  }
  
  console.log(`  Successfully processed ${documents.length} of ${urlInfos.length} pages`);
  
  // ==========================================
  // Step 4: Sort by relevance for each tool
  // ==========================================
  const byRelevance = {
    analyzeScope: sortByToolRelevance(documents, 'analyze-feature-scope'),
    writeStories: sortByToolRelevance(documents, 'write-shell-stories'),
    writeNextStory: sortByToolRelevance(documents, 'write-next-story'),
  };
  
  console.log(`  Relevance filtering:`);
  console.log(`    analyze-feature-scope: ${byRelevance.analyzeScope.length} relevant docs`);
  console.log(`    write-shell-stories: ${byRelevance.writeStories.length} relevant docs`);
  console.log(`    write-next-story: ${byRelevance.writeNextStory.length} relevant docs`);
  
  // ==========================================
  // Return result
  // ==========================================
  return {
    documents,
    byRelevance,
    getRelevanceForTool(doc: ConfluenceDocument, toolId: string): ToolRelevanceScore | undefined {
      return doc.metadata.relevance?.toolScores.find(t => t.toolId === toolId);
    },
  };
}

/**
 * Create an empty result (no Confluence documents)
 */
function createEmptyResult(): ConfluenceContextResult {
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
  };
}
