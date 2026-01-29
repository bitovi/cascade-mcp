/**
 * Context Loader for Review Work Item
 * 
 * Loads all linked resources (Confluence, Figma, additional Jira issues)
 * in parallel to gather comprehensive context for story review.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import type { FigmaClient } from '../../../figma/figma-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type { ADFDocument } from '../../../atlassian/markdown-converter.js';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.js';
import type { JiraIssueHierarchy, JiraIssue } from './jira-hierarchy-fetcher.js';
import { buildJiraIssueUrl } from './jira-hierarchy-fetcher.js';
import type { ExtractedLinks } from './link-extractor.js';
import { setupConfluenceContext, type ConfluenceDocument } from '../shared/confluence-setup.js';
import { setupGoogleDocsContext, type GoogleDocDocument } from '../shared/google-docs-setup.js';
import type { GoogleClient } from '../../../google/google-api-client.js';
import { getJiraIssue } from '../../../atlassian/atlassian-helpers.js';
import { 
  parseFigmaUrl,
  fetchFigmaNode,
  getFramesAndNotesForNode,
  downloadFigmaImagesBatch,
  FigmaUnrecoverableError,
  convertNodeIdToApiFormat,
  type FigmaNodeMetadata
} from '../../../figma/figma-helpers.js';
import { getFigmaFileCachePath, ensureValidCacheForFigmaFile } from '../../../figma/figma-cache.js';
import { 
  generateScreenAnalysisPrompt, 
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS 
} from '../writing-shell-stories/prompt-screen-analysis.js';
import { associateNotesWithFrames } from '../writing-shell-stories/screen-analyzer.js';
import { buildIssueContextFromHierarchy } from '../shared/issue-context-builder.js';
import {
  fetchCommentsForFile,
  groupCommentsIntoThreads,
  formatCommentsForContext,
  type FrameMetadata
} from '../../../figma/tools/figma-review-design/figma-comment-utils.js';
import type { ScreenAnnotation } from '../shared/screen-annotation.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Loaded context for generating review questions
 */
export interface LoadedContext {
  /** Confluence documents with content and metadata */
  confluenceDocs: ConfluenceDocument[];
  
  /** Google Docs with content and metadata */
  googleDocs: GoogleDocDocument[];
  
  /** Analyzed Figma screens with AI-generated descriptions */
  analyzedScreens: AnalyzedScreen[];
  
  /** Figma comments associated with screens */
  figmaComments: ScreenAnnotation[];
  
  /** Additional Jira issues referenced in the hierarchy */
  additionalJiraIssues: AdditionalJiraIssue[];
  
  /** Definition of Ready document (if identified) */
  definitionOfReady: ConfluenceDocument | null;
}

/**
 * Analyzed Figma screen with AI-generated analysis
 */
export interface AnalyzedScreen {
  /** Screen name from Figma frame */
  name: string;
  /** Original Figma URL */
  url: string;
  /** AI-generated analysis of the screen */
  analysis: string;
  /** Design notes associated with this screen */
  notes: string[];
}

/**
 * Summary of a Figma file link (kept for backward compatibility)
 */
export interface FigmaFileSummary {
  /** Original URL */
  url: string;
  /** Whether the URL is valid */
  valid: boolean;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Additional Jira issue referenced in comments/descriptions
 */
export interface AdditionalJiraIssue {
  /** Issue key */
  key: string;
  /** Issue summary */
  summary: string;
  /** Issue type */
  issueType: string;
  /** Issue status */
  status: string;
  /** Issue description as markdown */
  descriptionMarkdown: string;
  /** Original URL */
  url: string;
}

/**
 * Options for loading context
 */
export interface LoadContextOptions {
  /** Atlassian API client */
  atlassianClient: AtlassianClient;
  /** Figma API client (optional - for Figma context) */
  figmaClient?: FigmaClient;
  /** Google API client (optional - for Google Docs context) */
  googleClient?: GoogleClient;
  /** LLM client for Confluence relevance scoring */
  generateText: GenerateTextFn;
  /** Cloud ID for Jira site */
  cloudId: string;
  /** Site name (e.g., "bitovi" from bitovi.atlassian.net) */
  siteName: string;
  /** Progress notification callback */
  notify?: (message: string) => Promise<void>;
  /** Source ADF for extracting Google Docs URLs */
  sourceAdf?: ADFDocument;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Load all linked resources from the hierarchy
 * 
 * Fetches all resources in parallel:
 * - Confluence documents (with caching and relevance scoring)
 * - Figma screens (with full AI analysis when figmaClient is available)
 * - Additional Jira issues
 * 
 * Note: Currently throws on any failure per spec requirements.
 * 
 * @param hierarchy - Issue hierarchy from fetchJiraIssueHierarchy
 * @param links - Extracted links from extractLinksFromHierarchy
 * @param options - Loading options
 * @returns Loaded context with all resources
 */
export async function loadLinkedResources(
  hierarchy: JiraIssueHierarchy,
  links: ExtractedLinks,
  options: LoadContextOptions
): Promise<LoadedContext> {
  const { 
    atlassianClient, 
    figmaClient,
    googleClient,
    generateText, 
    cloudId, 
    siteName,
    sourceAdf,
    notify = async () => {} 
  } = options;
  
  console.log('📚 Loading linked resources...');
  console.log(`  Confluence: ${links.confluence.length}`);
  console.log(`  Figma: ${links.figma.length}`);
  console.log(`  Jira: ${links.jira.length}`);
  
  // Note: Caller (write-story) already reported link counts
  // Individual loaders (Confluence, Figma) will send their own progress notifications
  
  // Build issue context for Figma analysis (from target issue and parents)
  // Exclude "Shell Stories" section since it's tool-generated content
  const issueContext = buildIssueContextFromHierarchy(hierarchy, { 
    excludeSections: ['Shell Stories'] 
  });
  
  const [confluenceResult, googleDocsResult, figmaResult, jiraResults] = await Promise.all([
    // Load Confluence documents
    loadConfluenceDocuments(hierarchy, links.confluence, atlassianClient, generateText, siteName, notify),
    
    // Load Google Docs (if sourceAdf provided and googleClient available)
    loadGoogleDocs(sourceAdf, googleClient, generateText, notify),
    
    // Load and analyze Figma screens (full analysis when figmaClient available)
    loadFigmaScreens(links.figma, figmaClient, generateText, issueContext.markdown, notify),
    
    // Load additional Jira issues
    loadAdditionalJiraIssues(links.jira, atlassianClient, cloudId, siteName, notify)
  ]);
  
  // Identify Definition of Ready document (if any)
  const definitionOfReady = identifyDefinitionOfReady(confluenceResult);
  
  console.log(`  ✅ Loaded: ${confluenceResult.length} Confluence, ${googleDocsResult.length} Google Docs, ${figmaResult.screens.length} Figma screens, ${figmaResult.comments.length} comments, ${jiraResults.length} Jira`);
  if (definitionOfReady) {
    console.log(`  📋 Definition of Ready identified: "${definitionOfReady.title}"`);
  }
  
  return {
    confluenceDocs: confluenceResult,
    googleDocs: googleDocsResult,
    analyzedScreens: figmaResult.screens,
    figmaComments: figmaResult.comments,
    additionalJiraIssues: jiraResults,
    definitionOfReady
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load Confluence documents using the shared setup function
 */
async function loadConfluenceDocuments(
  hierarchy: JiraIssueHierarchy,
  confluenceUrls: string[],
  atlassianClient: AtlassianClient,
  generateText: GenerateTextFn,
  siteName: string,
  notify: (message: string) => Promise<void>
): Promise<ConfluenceDocument[]> {
  if (confluenceUrls.length === 0) {
    return [];
  }
  
  await notify(`Loading ${confluenceUrls.length} Confluence documents...`);
  
  // Create a synthetic ADF document with all the Confluence URLs
  // This allows us to reuse setupConfluenceContext
  const syntheticAdf = createAdfWithUrls(confluenceUrls);
  
  try {
    const confluenceContext = await setupConfluenceContext({
      epicAdf: syntheticAdf,
      atlassianClient,
      generateText,
      siteName,
      notify: async (msg) => await notify(msg)
    });
    
    // Return all documents (not filtered by tool-specific relevance)
    return confluenceContext.documents;
  } catch (error: any) {
    console.log(`  ❌ Failed to load Confluence documents: ${error.message}`);
    throw error; // Re-throw per spec: error immediately
  }
}

/**
 * Create a synthetic ADF document containing URL links
 * This allows us to reuse the existing Confluence setup flow
 */
function createAdfWithUrls(urls: string[]): ADFDocument {
  return {
    version: 1,
    type: 'doc',
    content: urls.map(url => ({
      type: 'paragraph',
      content: [{
        type: 'inlineCard',
        attrs: { url }
      }]
    }))
  };
}

/**
 * Load Google Docs using the shared setup function
 */
async function loadGoogleDocs(
  sourceAdf: ADFDocument | undefined,
  googleClient: GoogleClient | undefined,
  generateText: GenerateTextFn,
  notify: (message: string) => Promise<void>
): Promise<GoogleDocDocument[]> {
  if (!sourceAdf) {
    console.log('  Skipping Google Docs (no source ADF provided)');
    return [];
  }
  
  if (!googleClient) {
    console.log('  Skipping Google Docs (no Google authentication)');
    return [];
  }
  
  try {
    const googleDocsContext = await setupGoogleDocsContext({
      epicAdf: sourceAdf,
      googleClient,
      generateText,
      notify: async (msg) => await notify(msg)
    });
    
    // Return documents relevant for write-story (use writeNextStory relevance)
    const relevantDocs = googleDocsContext.byRelevance.writeNextStory;
    console.log(`  📄 Loaded ${relevantDocs.length} Google Doc(s)`);
    return relevantDocs;
  } catch (error: any) {
    console.log(`  ⚠️ Failed to load Google Docs: ${error.message}`);
    // Don't throw - Google Docs failure shouldn't block the story
    return [];
  }
}

/**
 * Load and analyze Figma screens with full AI analysis
 * 
 * When figmaClient is available:
 * 1. Parses each Figma URL to extract file key and node ID
 * 2. Fetches node metadata (frames, notes)
 * 3. Downloads screen images
 * 4. Runs AI analysis on each screen
 * 5. Fetches and formats Figma comments
 * 6. Returns analyzed screens with descriptions and comments
 * 
 * Falls back to empty result if no figmaClient or if URLs can't be processed.
 */
async function loadFigmaScreens(
  figmaUrls: string[],
  figmaClient: FigmaClient | undefined,
  generateText: GenerateTextFn,
  epicContext: string,
  notify: (message: string) => Promise<void>
): Promise<{ screens: AnalyzedScreen[]; comments: ScreenAnnotation[] }> {
  if (figmaUrls.length === 0) {
    return { screens: [], comments: [] };
  }
  
  if (!figmaClient) {
    console.log('  ⚠️  No Figma client available - skipping Figma analysis');
    return { screens: [], comments: [] };
  }
  
  const analyzedScreens: AnalyzedScreen[] = [];
  let allFigmaComments: ScreenAnnotation[] = [];
  
  // Track cache stats for summary message (similar to write-shell-stories pattern)
  let cachedCount = 0;
  let analyzedCount = 0;
  
  // Group URLs by file key for efficient batching
  const urlsByFileKey = new Map<string, Array<{ url: string; nodeId: string }>>();
  
  for (const url of figmaUrls) {
    const parsed = parseFigmaUrl(url);
    if (!parsed) {
      console.log(`  ⚠️  Invalid Figma URL: ${url}`);
      continue;
    }
    
    const existing = urlsByFileKey.get(parsed.fileKey) || [];
    existing.push({ url, nodeId: parsed.nodeId || '' });
    urlsByFileKey.set(parsed.fileKey, existing);
  }
  
  // Process each file key
  for (const [fileKey, urls] of urlsByFileKey) {
    try {
      // Ensure cache is valid
      await ensureValidCacheForFigmaFile(figmaClient, fileKey);
      const fileCachePath = getFigmaFileCachePath(fileKey);
      
      // Collect all frames and notes for this file
      const allFrames: FigmaNodeMetadata[] = [];
      const allNotes: FigmaNodeMetadata[] = [];
      const nodesDataMap = new Map<string, any>(); // Store node data for comment association
      
      for (const { url, nodeId } of urls) {
        if (!nodeId) {
          console.log(`  ⚠️  No node ID in URL: ${url}`);
          continue;
        }
        
        // Convert node ID from URL format (123-456) to API format (123:456)
        const apiNodeId = convertNodeIdToApiFormat(nodeId);
        
        try {
          const nodeData = await fetchFigmaNode(figmaClient, fileKey, apiNodeId);
          
          // Store node data for document tree (used for comment spatial matching)
          nodesDataMap.set(apiNodeId, nodeData);
          
          const nodesMetadata = getFramesAndNotesForNode(nodeData, apiNodeId);
          
          // Separate frames and notes by type
          for (const node of nodesMetadata) {
            if (node.type === 'FRAME') {
              if (!allFrames.some(existing => existing.id === node.id)) {
                allFrames.push(node);
              }
            } else if (node.type === 'INSTANCE' && node.name === 'Note') {
              if (!allNotes.some(existing => existing.id === node.id)) {
                allNotes.push(node);
              }
            }
          }
        } catch (error: any) {
          // Any Figma fetch error should fail the tool - don't silently continue without data
          console.log(`  ❌ Failed to fetch Figma node ${apiNodeId}: ${error.message}`);
          throw error;
        }
      }
      
      if (allFrames.length === 0) {
        console.log(`  ⚠️  No frames found for file ${fileKey}`);
        continue;
      }
      
      console.log(`  🎨 Found ${allFrames.length} frames in file ${fileKey}`);
      
      // Fetch Figma comments for this file (similar to write-shell-stories Phase 3.8)
      let fileComments: ScreenAnnotation[] = [];
      let matchedThreadCount = 0;
      try {
        const comments = await fetchCommentsForFile(figmaClient, fileKey);
        if (comments.length > 0) {
          const threads = groupCommentsIntoThreads(comments);
          
          // Build frame metadata with bounding boxes for proximity matching
          const frameMetadata: FrameMetadata[] = allFrames.map((frame) => ({
            fileKey,
            nodeId: frame.id,
            name: frame.name,
            url: `https://www.figma.com/file/${fileKey}?node-id=${frame.id.replace(/:/g, '-')}`,
            x: frame.absoluteBoundingBox?.x,
            y: frame.absoluteBoundingBox?.y,
            width: frame.absoluteBoundingBox?.width,
            height: frame.absoluteBoundingBox?.height,
          }));
          
          // Build document tree from nodesDataMap for spatial containment checks
          const documentTree = {
            id: 'root',
            children: Array.from(nodesDataMap.values())
          };
          
          const commentResult = formatCommentsForContext(threads, frameMetadata, documentTree);
          fileComments = commentResult.contexts;
          matchedThreadCount = commentResult.matchedThreadCount;
          console.log(`   💬 Fetched ${comments.length} comments → ${matchedThreadCount} threads across ${fileComments.length} screens`);
        } else {
          console.log('   💬 No Figma comments found');
        }
      } catch (error: any) {
        console.log(`   ⚠️ Figma comment fetching failed: ${error.message}`);
        // Continue without comments - they're optional context
      }
      
      // Accumulate comments from this file
      allFigmaComments = [...allFigmaComments, ...fileComments];
      
      // Notify about Figma analysis (similar to write-shell-stories pattern)
      await notify(`🤖 Analyzing Figma: ${allFrames.length} screen(s), ${allNotes.length} note(s), ${matchedThreadCount} comment(s)...`);
      
      // Associate notes with frames
      const baseUrl = `https://www.figma.com/file/${fileKey}`;
      const associationResult = associateNotesWithFrames(allFrames, allNotes, baseUrl);
      
      // Download images for all frames in batch
      // Note: No separate notification - part of the analysis phase
      const frameIds = allFrames.map(f => f.id);
      const imagesMap = await downloadFigmaImagesBatch(figmaClient, fileKey, frameIds);
      
      // Analyze each screen
      let screenIndex = 0;
      for (const frame of allFrames) {
        screenIndex++;
        const screenUrl = `https://www.figma.com/file/${fileKey}?node-id=${frame.id.replace(/:/g, '-')}`;
        
        // Get notes for this frame from association result
        const screenData = associationResult.screens.find(s => s.url.includes(frame.id.replace(/:/g, '-')));
        const notes = screenData?.notes || [];
        const notesContent = notes.length > 0 ? notes.join('\n\n') : '';
        
        // Check cache first
        const filename = sanitizeFilename(frame.name);
        const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
        
        let analysis: string;
        
        try {
          // Try to read from cache
          analysis = await fs.readFile(analysisPath, 'utf-8');
          console.log(`  ✓ Cache hit: ${frame.name}`);
          cachedCount++;
        } catch {
          // Not in cache - need to analyze
          const imageData = imagesMap.get(frame.id);
          
          if (!imageData) {
            console.log(`  ⚠️  No image for ${frame.name}`);
            continue;
          }
          
          // Save image to cache
          const imagePath = path.join(fileCachePath, `${filename}.png`);
          const imageBuffer = Buffer.from(imageData.base64Data, 'base64');
          await fs.writeFile(imagePath, imageBuffer);
          
          // Generate analysis (no per-screen notification - summary at end)
          console.log(`  🔍 Analyzing: ${frame.name}...`);
          
          const prompt = generateScreenAnalysisPrompt(
            frame.name,
            screenUrl,
            `${screenIndex} of ${allFrames.length}`,
            notesContent,
            epicContext
          );
          
          const response = await generateText({
            messages: [
              { role: 'system', content: SCREEN_ANALYSIS_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image', data: imageData.base64Data, mimeType: 'image/png' }
                ]
              }
            ],
            maxTokens: SCREEN_ANALYSIS_MAX_TOKENS
          });
          
          analysis = response.text;
          
          // Save to cache
          await fs.writeFile(analysisPath, analysis, 'utf-8');
          console.log(`  ✓ Analyzed: ${frame.name}`);
          analyzedCount++;
        }
        
        analyzedScreens.push({
          name: frame.name,
          url: screenUrl,
          analysis,
          notes
        });
      }
      
    } catch (error: any) {
      console.log(`  ❌ Failed to process Figma file ${fileKey}: ${error.message}`);
      throw error;
    }
  }
  
  // Summary notification (similar to write-shell-stories pattern)
  if (analyzedScreens.length > 0) {
    const cacheExplanation = cachedCount > 0 && analyzedCount === 0 ? ' (Figma file unchanged)' : '';
    await notify(`Screen analysis complete: ${cachedCount} cached, ${analyzedCount} new${cacheExplanation}`);
  }
  
  return { screens: analyzedScreens, comments: allFigmaComments };
}

/**
 * Sanitize filename for cache storage
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/**
 * Load additional Jira issues referenced in comments/descriptions
 */
async function loadAdditionalJiraIssues(
  jiraUrls: string[],
  atlassianClient: AtlassianClient,
  cloudId: string,
  siteName: string,
  notify: (message: string) => Promise<void>
): Promise<AdditionalJiraIssue[]> {
  if (jiraUrls.length === 0) {
    return [];
  }
  
  const results: AdditionalJiraIssue[] = [];
  
  for (const url of jiraUrls) {
    const key = extractIssueKeyFromUrl(url);
    if (!key) continue;
    
    try {
      const response = await getJiraIssue(
        atlassianClient, 
        cloudId, 
        key, 
        'summary,description,issuetype,status'
      );
      const data = await response.json() as any;
      
      let descriptionMarkdown = '';
      if (data.fields.description) {
        descriptionMarkdown = convertAdfNodesToMarkdown(data.fields.description.content || []);
      }
      
      results.push({
        key: data.key,
        summary: data.fields.summary,
        issueType: data.fields.issuetype?.name || 'Unknown',
        status: data.fields.status?.name || 'Unknown',
        descriptionMarkdown,
        url
      });
    } catch (error: any) {
      console.log(`  ⚠️ Failed to load Jira issue ${key}: ${error.message}`);
      throw error; // Re-throw per spec: error immediately
    }
  }
  
  return results;
}

/**
 * Extract issue key from Jira URL
 */
function extractIssueKeyFromUrl(url: string): string | null {
  const match = url.match(/browse\/([A-Z]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Identify if any Confluence document is a Definition of Ready/Done
 * 
 * Uses the LLM-classified documentType from Confluence relevance scoring
 */
function identifyDefinitionOfReady(docs: ConfluenceDocument[]): ConfluenceDocument | null {
  // Look for documents classified as 'dod' (Definition of Done/Ready)
  for (const doc of docs) {
    if (doc.metadata.relevance?.documentType === 'dod') {
      return doc;
    }
  }
  
  return null;
}
