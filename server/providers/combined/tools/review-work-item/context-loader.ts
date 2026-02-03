/**
 * Context Loader for Review Work Item
 * 
 * Loads all linked resources (Confluence, Figma, additional Jira issues)
 * in parallel to gather comprehensive context for story review.
 */

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
import { buildIssueContextFromHierarchy } from '../shared/issue-context-builder.js';
import type { ScreenAnnotation } from '../shared/screen-annotation.js';
import {
  analyzeScreens,
  type AnalyzedFrame,
} from '../../../figma/screen-analyses-workflow/index.js';

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
    
    // Load and analyze Figma screens using consolidated workflow
    loadFigmaScreensViaWorkflow(links.figma, figmaClient, generateText, issueContext.markdown, notify),
    
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
 * Load and analyze Figma screens using the consolidated workflow
 * 
 * This is the new implementation that uses the screen-analyses-workflow module.
 * It provides:
 * - Semantic XML generation for better context
 * - Meta-first caching (tier 3 API optimization)
 * - Node-level caching
 * - Unified annotation handling (comments + sticky notes)
 * 
 * @param figmaUrls - Array of Figma URLs to analyze
 * @param figmaClient - Authenticated Figma API client
 * @param generateText - LLM text generation function
 * @param issueContext - Markdown context from the issue (for AI analysis)
 * @param notify - Progress notification callback
 * @returns Analyzed screens with AI descriptions and associated comments
 */
async function loadFigmaScreensViaWorkflow(
  figmaUrls: string[],
  figmaClient: FigmaClient | undefined,
  generateText: GenerateTextFn,
  issueContext: string,
  notify: (message: string) => Promise<void>
): Promise<{ screens: AnalyzedScreen[]; comments: ScreenAnnotation[] }> {
  if (figmaUrls.length === 0) {
    return { screens: [], comments: [] };
  }

  if (!figmaClient) {
    console.log('  ⚠️  No Figma client available - skipping Figma analysis');
    return { screens: [], comments: [] };
  }

  // Call the consolidated workflow
  const result = await analyzeScreens(
    figmaUrls,
    figmaClient,
    generateText,
    {
      analysisOptions: {
        contextMarkdown: issueContext, // Map caller's issueContext to workflow's contextMarkdown
      },
      notify,
    }
  );

  // Convert AnalyzedFrame[] to AnalyzedScreen[]
  const screens: AnalyzedScreen[] = result.frames.map(frame => ({
    name: frame.frameName || frame.name,
    url: frame.url,
    analysis: frame.analysis || '',
    notes: frame.annotations
      .filter(a => a.type === 'note')
      .map(a => a.content)
  }));

  // Extract comments from annotations
  const comments: ScreenAnnotation[] = result.frames.flatMap(frame =>
    frame.annotations
      .filter(a => a.type === 'comment')
      .map(a => ({
        screenId: frame.nodeId,
        screenName: frame.frameName || frame.name,
        source: 'comments' as const,
        markdown: a.author ? `**${a.author}:** ${a.content}` : a.content,
      }))
  );

  return { screens, comments };
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
