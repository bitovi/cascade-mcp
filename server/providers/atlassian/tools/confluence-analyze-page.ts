/**
 * Confluence Analyze Page Tool
 * 
 * Debug tool for inspecting Confluence pages - performs the full workflow:
 * fetch, cache, analyze with LLM, and return all data for debugging.
 * 
 * This tool does what the combined tools do for a single Confluence page,
 * making it useful for testing the entire Confluence integration flow.
 * 
 * Gated behind ENABLE_CONFLUENCE_DEBUG_TOOLS environment variable.
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.ts';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.ts';
import type { McpServer } from '../../../mcp-core/mcp-types.ts';
import { createAtlassianClient } from '../atlassian-api-client.ts';
import { convertAdfNodesToMarkdown } from '../markdown-converter.ts';
import { createMcpLLMClient, type McpToolContext } from '../../../llm-client/mcp-sampling-client.ts';
import { createQueuedGenerateText } from '../../../llm-client/queued-generate-text.ts';
import type { GenerateTextFn } from '../../../llm-client/types.ts';
import {
  parseConfluenceUrl,
  getConfluencePage,
  getConfluencePageVersion,
  resolveConfluenceShortLink,
  type ConfluenceUrlInfo,
  type ConfluencePageData,
} from '../confluence-helpers.ts';
import {
  getConfluencePageCachePath,
  getConfluenceMetadataPath,
  loadConfluenceMetadata,
  saveConfluenceMetadata,
  saveConfluenceMarkdown,
  isCacheValid,
  type ConfluenceMetadata,
  type DocumentRelevance,
} from '../confluence-cache.ts';
import { scoreDocumentRelevance } from '../confluence-relevance.ts';
import * as fs from 'fs/promises';

// ============================================================================
// Types
// ============================================================================

interface AnalyzePageParams {
  pageUrl?: string;
  pageId?: string;
  siteName?: string;
}

interface AnalyzePageResult {
  // URL Info
  urlInfo?: ConfluenceUrlInfo;
  parseError?: string;

  // Page Metadata
  page?: {
    id: string;
    title: string;
    spaceId: string;
    spaceKey?: string;
    version: number;
    lastModified: string;
    lastModifiedRelative: string;
  };
  fetchError?: string;

  // Full markdown content
  markdown?: string;

  // Cache Status
  cache: {
    status: 'fresh' | 'cached' | 'stale' | 'not-cached';
    cachePath?: string;
    cachedAt?: string;
    cachedVersion?: number;
    wasCached?: boolean;  // true if we saved to cache this request
  };

  // Relevance analysis
  relevance?: {
    documentType: string;
    fromCache: boolean;  // true if loaded from cache, false if freshly scored
    toolScores: Array<{
      tool: string;
      overallScore: number;
      summary: string;
    }>;
  };

  // Document summary (if large doc was summarized)
  summary?: {
    text: string;
    originalLength: number;
    summaryLength: number;
    keyTopics: string[];
    generatedAt: string;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Analyze a Confluence page - performs the full workflow:
 * 1. Parse URL / resolve short links
 * 2. Fetch page from Confluence API
 * 3. Convert to markdown
 * 4. Score relevance with LLM
 * 5. Cache everything
 * 6. Return all data for debugging
 */
async function analyzeConfluencePage(
  params: AnalyzePageParams,
  atlassianToken: string,
  generateText: GenerateTextFn
): Promise<AnalyzePageResult> {
  const result: AnalyzePageResult = {
    cache: { status: 'not-cached' },
  };

  // Step 1: Parse URL or use direct page ID
  let pageId: string;
  let siteName: string;
  let pageUrl: string;

  if (params.pageUrl) {
    pageUrl = params.pageUrl;
    const parsed = parseConfluenceUrl(params.pageUrl);
    if (!parsed) {
      result.parseError = `Could not parse Confluence URL: ${params.pageUrl}`;
      return result;
    }
    result.urlInfo = parsed;

    // Handle short links
    if (parsed.wasShortLink) {
      const client = createAtlassianClient(atlassianToken);
      const resolved = await resolveConfluenceShortLink(client, parsed);
      if (!resolved) {
        result.parseError = `Could not resolve short link: ${params.pageUrl}`;
        return result;
      }
      result.urlInfo = resolved;
      pageId = resolved.pageId;
      siteName = resolved.siteName;
    } else {
      pageId = parsed.pageId;
      siteName = parsed.siteName;
    }
  } else if (params.pageId && params.siteName) {
    pageId = params.pageId;
    siteName = params.siteName;
    pageUrl = `https://${siteName}.atlassian.net/wiki/pages/${pageId}`;
  } else {
    result.parseError = 'Must provide either pageUrl OR both pageId and siteName';
    return result;
  }

  const cachePath = getConfluencePageCachePath(pageId);
  result.cache.cachePath = cachePath;

  // Step 2: Fetch page from Confluence API
  console.log(`  📄 Fetching Confluence page: ${pageId} from ${siteName}`);
  const client = createAtlassianClient(atlassianToken);

  let pageData: ConfluencePageData;
  try {
    pageData = await getConfluencePage(client, siteName, pageId);
  } catch (error: any) {
    result.fetchError = `Failed to fetch page: ${error.message}`;
    return result;
  }

  // Populate page info
  result.page = {
    id: pageData.id,
    title: pageData.title,
    spaceId: pageData.space.id,
    spaceKey: pageData.space.key,
    version: pageData.version.number,
    lastModified: pageData.version.createdAt,
    lastModifiedRelative: formatRelativeTime(new Date(pageData.version.createdAt)),
  };

  // Step 3: Check if we have valid cached data with relevance
  const metadataPath = getConfluenceMetadataPath(pageId);
  let existingMetadata: ConfluenceMetadata | null = null;
  let cacheIsValid = false;

  try {
    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
    if (metadataExists) {
      existingMetadata = await loadConfluenceMetadata(pageId);
      if (existingMetadata) {
        cacheIsValid = await isCacheValid(pageId, pageData.version.createdAt);
        result.cache.cachedAt = existingMetadata.cachedAt;
        result.cache.cachedVersion = existingMetadata.versionNumber;
      }
    }
  } catch (error: any) {
    logger.warn('Error checking cache status', { error: error.message, pageId });
  }

  // Step 4: Convert to markdown
  let markdown: string;
  try {
    markdown = convertAdfNodesToMarkdown(pageData.body.content || []);
    result.markdown = markdown;
  } catch (error: any) {
    logger.warn('Error converting to markdown', { error: error.message, pageId });
    result.markdown = '(Error converting content to markdown)';
    markdown = result.markdown;
  }

  // Step 5: Determine if we need to score relevance
  let relevance: DocumentRelevance | undefined;
  let fromCache = false;

  if (cacheIsValid && existingMetadata?.relevance) {
    // Cache is valid and has relevance - use cached data
    console.log(`  ✅ Using cached relevance scores (cache valid)`);
    result.cache.status = 'cached';
    relevance = existingMetadata.relevance;
    fromCache = true;

    // Also load summary if available
    if (existingMetadata.summary) {
      result.summary = {
        text: existingMetadata.summary.text,
        originalLength: existingMetadata.summary.originalLength,
        summaryLength: existingMetadata.summary.summaryLength,
        keyTopics: existingMetadata.summary.keyTopics,
        generatedAt: existingMetadata.summary.generatedAt,
      };
    }
  } else {
    // Need to score relevance (cache stale, missing, or no relevance)
    console.log(`  🤖 Scoring relevance with LLM...`);
    result.cache.status = cacheIsValid ? 'stale' : 'fresh';
    fromCache = false;
    
    try {
      relevance = await scoreDocumentRelevance(
        generateText,
        pageData.title,
        markdown
      );
      console.log(`  ✅ Relevance scored: ${relevance.documentType}`);
    } catch (error: any) {
      logger.error('Error scoring relevance', { error: error.message, pageId });
      throw new Error(`Failed to score relevance: ${error.message}`);
    }

    // Step 6: Save to cache
    const metadata: ConfluenceMetadata = {
      pageId,
      title: pageData.title,
      url: pageUrl,
      lastModified: pageData.version.createdAt,
      spaceKey: pageData.space.key,
      cachedAt: new Date().toISOString(),
      versionNumber: pageData.version.number,
      markdownLength: markdown.length,
      relevance,
    };

    try {
      await saveConfluenceMetadata(metadata);
      await saveConfluenceMarkdown(pageId, markdown);
      result.cache.wasCached = true;
      result.cache.cachedAt = metadata.cachedAt;
      result.cache.cachedVersion = metadata.versionNumber;
      console.log(`  💾 Cached page and metadata`);
    } catch (error: any) {
      logger.error('Error saving to cache', { error: error.message, pageId });
    }
  }

  // Populate relevance in result
  if (relevance) {
    result.relevance = {
      documentType: relevance.documentType,
      fromCache,
      toolScores: relevance.toolScores.map(ts => ({
        tool: ts.toolId,
        overallScore: ts.overallScore,
        summary: ts.summary,
      })),
    };
  }

  return result;
}

/**
 * Format a date as relative time (e.g., "2 days ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

/**
 * Format the analysis result as metadata block + markdown content
 */
function formatAnalysisResult(result: AnalyzePageResult): string {
  const lines: string[] = [];

  // Errors
  if (result.parseError) {
    return `Error: ${result.parseError}`;
  }
  if (result.fetchError) {
    return `Error: ${result.fetchError}`;
  }

  // Metadata block
  lines.push('```yaml');
  lines.push('# Confluence Page Metadata');
  
  if (result.urlInfo) {
    lines.push(`site: ${result.urlInfo.siteName}.atlassian.net`);
    lines.push(`pageId: ${result.urlInfo.pageId}`);
    if (result.urlInfo.spaceKey) {
      lines.push(`spaceKey: ${result.urlInfo.spaceKey}`);
    }
    if (result.urlInfo.wasShortLink) {
      lines.push(`shortLink: resolved`);
    }
  }

  if (result.page) {
    lines.push(`title: "${result.page.title}"`);
    lines.push(`version: ${result.page.version}`);
    lines.push(`lastModified: ${result.page.lastModified} (${result.page.lastModifiedRelative})`);
  }

  // Cache info
  lines.push(`cache:`);
  lines.push(`  status: ${result.cache.status}`);
  if (result.cache.cachedAt) {
    lines.push(`  cachedAt: ${result.cache.cachedAt}`);
  }
  if (result.cache.cachedVersion) {
    lines.push(`  cachedVersion: ${result.cache.cachedVersion}`);
  }
  if (result.cache.wasCached) {
    lines.push(`  wasCached: true`);
  }

  // Relevance scores
  if (result.relevance) {
    lines.push(`relevance:`);
    lines.push(`  documentType: ${result.relevance.documentType}`);
    lines.push(`  fromCache: ${result.relevance.fromCache}`);
    lines.push(`  scores:`);
    for (const score of result.relevance.toolScores) {
      lines.push(`    - tool: ${score.tool}`);
      lines.push(`      score: ${score.overallScore}/10`);
      lines.push(`      summary: "${score.summary}"`);
    }
  }

  // Document summary (for large docs)
  if (result.summary) {
    lines.push(`summary:`);
    lines.push(`  originalLength: ${result.summary.originalLength}`);
    lines.push(`  summaryLength: ${result.summary.summaryLength}`);
    lines.push(`  generatedAt: ${result.summary.generatedAt}`);
    if (result.summary.keyTopics.length > 0) {
      lines.push(`  keyTopics:`);
      for (const topic of result.summary.keyTopics) {
        lines.push(`    - "${topic}"`);
      }
    }
    lines.push(`  text: |`);
    // Indent summary text for YAML block scalar
    const summaryLines = result.summary.text.split('\n');
    for (const line of summaryLines) {
      lines.push(`    ${line}`);
    }
  }

  if (result.markdown) {
    lines.push(`contentLength: ${result.markdown.length}`);
  }

  lines.push('```');
  lines.push('');

  // Full markdown content
  if (result.markdown) {
    lines.push(result.markdown);
  }

  return lines.join('\n');
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Check if Confluence debug tools are enabled
 */
export function isConfluenceDebugToolsEnabled(): boolean {
  return process.env.ENABLE_CONFLUENCE_DEBUG_TOOLS === 'true';
}

/**
 * Register the confluence-analyze-page tool with the MCP server
 * 
 * Only registers if ENABLE_CONFLUENCE_DEBUG_TOOLS=true
 * 
 * @param mcp - MCP server instance
 */
export function registerConfluenceAnalyzePageTool(mcp: McpServer): void {
  if (!isConfluenceDebugToolsEnabled()) {
    logger.info('Confluence debug tools disabled (set ENABLE_CONFLUENCE_DEBUG_TOOLS=true to enable)');
    return;
  }

  logger.info('Registering Confluence debug tools...');

  mcp.registerTool(
    'confluence-analyze-page',
    {
      title: 'Analyze Confluence Page',
      description: 'Debug tool that performs the full Confluence integration workflow: fetches page, converts to markdown, scores relevance with LLM, and caches everything. Returns all data for debugging.',
      inputSchema: {
        pageUrl: z.string().url().optional().describe('Full Confluence page URL (e.g., https://site.atlassian.net/wiki/spaces/SPACE/pages/123456/Title)'),
        pageId: z.string().optional().describe('Confluence page ID (use with siteName)'),
        siteName: z.string().optional().describe('Atlassian site name (e.g., "mycompany" for mycompany.atlassian.net)'),
      },
    },
    async (params: AnalyzePageParams, context) => {
      logger.info('confluence-analyze-page called', { 
        hasPageUrl: !!params.pageUrl,
        hasPageId: !!params.pageId,
        siteName: params.siteName,
      });

      // Get auth info
      const authInfo = getAuthInfoSafe(context, 'confluence-analyze-page');
      const token = authInfo?.atlassian?.access_token;

      if (!token) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found. Please authenticate first.',
          }],
        };
      }

      // Create LLM client for relevance scoring (wrapped for automatic sequential queuing)
      const generateText = createQueuedGenerateText(createMcpLLMClient(context as McpToolContext));

      try {
        const result = await analyzeConfluencePage(params, token, generateText);
        const formattedOutput = formatAnalysisResult(result);

        return {
          content: [{
            type: 'text',
            text: formattedOutput,
          }],
        };
      } catch (error: any) {
        logger.error('Error in confluence-analyze-page', { error: error.message });
        return {
          content: [{
            type: 'text',
            text: `Error analyzing Confluence page: ${error.message}`,
          }],
        };
      }
    }
  );

  logger.info('  ✅ confluence-analyze-page registered');
}
