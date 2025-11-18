/**
 * Figma Screen Setup Helper
 * 
 * Shared utility for setting up Figma screen data and notes.
 * This is FAST (no image downloads or AI analysis) and should be run every time.
 * 
 * Used by both write-shell-stories and write-next-story to:
 * - Fetch Jira epic and extract Figma URLs
 * - Extract epic context (excluding Shell Stories section)
 * - Fetch Figma file metadata (frames and notes)
 * - Associate notes with screens spatially
 * - Write notes files to temp directory
 * - Generate screens.yaml
 * 
 * The slow part (image download + AI analysis) is handled separately by screen-analysis-regenerator.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import type { FigmaClient } from '../../../figma/figma-api-client.js';
import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';
import { 
  parseFigmaUrl, 
  fetchFigmaNode,
  getFramesAndNotesForNode,
  convertNodeIdToApiFormat
} from '../../../figma/figma-helpers.js';
import { resolveCloudId, getJiraIssue, handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';
import { 
  removeADFSectionByHeading,
  convertAdfToMarkdown,
  countADFSectionsByHeading,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { associateNotesWithFrames } from './screen-analyzer.js';
import { generateScreensYaml } from './yaml-generator.js';
import { writeNotesForScreen } from './note-text-extractor.js';

/**
 * Extract all Figma URLs from an ADF (Atlassian Document Format) document
 * @param adf - The ADF document to parse
 * @returns Array of unique Figma URLs found
 */
function extractFigmaUrlsFromADF(adf: ADFDocument): string[] {
  const figmaUrls = new Set<string>();
  
  function traverse(node: ADFNode) {
    // Check inlineCard nodes for Figma URLs
    if (node.type === 'inlineCard' && node.attrs?.url) {
      const url = node.attrs.url;
      if (url.includes('figma.com')) {
        figmaUrls.add(url);
      }
    }
    
    // Check text nodes with link marks
    if (node.type === 'text' && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          const url = mark.attrs.href;
          if (url.includes('figma.com')) {
            figmaUrls.add(url);
          }
        }
      }
    }
    
    // Check plain text for Figma URLs (basic regex)
    if (node.type === 'text' && node.text) {
      const urlRegex = /https?:\/\/[^\s]+figma\.com[^\s]*/g;
      const matches = node.text.match(urlRegex);
      if (matches) {
        matches.forEach(url => figmaUrls.add(url));
      }
    }
    
    // Recursively traverse child nodes
    if (node.content) {
      node.content.forEach(traverse);
    }
  }
  
  traverse(adf);
  return Array.from(figmaUrls);
}


/**
 * Screen with associated notes
 */
export interface ScreenWithNotes {
  name: string;        // Node ID (e.g., "1234:5678")
  url: string;         // Full Figma URL
  notes: string[];     // Associated note texts
}

/**
 * Jira issue structure (simplified)
 */
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: ADFDocument;
    [key: string]: any;
  };
}

/**
 * Parameters for Figma screen setup
 */
export interface FigmaScreenSetupParams {
  epicKey: string;               // Jira epic key
  atlassianClient: AtlassianClient;  // Atlassian API client with auth in closure
  figmaClient: FigmaClient;          // Figma API client with auth in closure
  tempDirPath: string;           // Where to save notes files and YAML
  cloudId?: string;              // Optional explicit cloud ID
  siteName?: string;             // Optional site name
  notify?: (message: string) => Promise<void>;  // Optional progress callback
}

/**
 * Result of Figma screen setup
 */
export interface FigmaScreenSetupResult {
  screens: ScreenWithNotes[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;          // File key for image downloads
  downloadedNotes: number;       // Count of note files written
  yamlPath: string;              // Path to screens.yaml
  epicContext: string;           // Epic description content (excluding Shell Stories)
  epicMarkdown: string;          // Full epic description as markdown (including Shell Stories)
  contentWithoutShellStories: ADFNode[];  // ADF content for later updating
  figmaUrls: string[];           // Extracted Figma URLs
  cloudId: string;               // Resolved cloud ID
  siteName: string;              // Resolved site name
  projectKey: string;            // Project key from epic
  epicKey: string;               // Epic key
  epicUrl: string;               // Epic URL
}

/**
 * Setup Figma screens with notes
 * 
 * Fetches epic, extracts Figma URLs and context, fetches Figma metadata, 
 * associates notes with frames, and writes note files.
 * This is fast and should be done every time (even when using cached analysis files).
 * 
 * @param params - Configuration including epic key, tokens, and temp directory
 * @returns Screen data with notes, frames, notes metadata, epic context, and file key
 */
export async function setupFigmaScreens(
  params: FigmaScreenSetupParams
): Promise<FigmaScreenSetupResult> {
  const { epicKey, atlassianClient, figmaClient, tempDirPath, cloudId, siteName, notify } = params;
  
  console.log('Setting up Figma screens...');
  
  // ==========================================
  // Step 1: Fetch epic and extract Figma URLs
  // ==========================================
  if (notify) {
    await notify('Fetching epic from Jira...');
  }
  
  // Resolve cloud ID (use explicit cloudId/siteName or first accessible site)
  const siteInfo = await resolveCloudId(atlassianClient, cloudId, siteName);
  console.log('  Resolved Jira site:', { cloudId: siteInfo.cloudId, siteName: siteInfo.siteName });
  
  // Fetch the epic issue
  const issueResponse = await getJiraIssue(atlassianClient, siteInfo.cloudId, epicKey, undefined);
  handleJiraAuthError(issueResponse, 'Fetch epic');
  
  const issue = await issueResponse.json() as JiraIssue;
  console.log('  Epic fetched successfully:', { key: issue.key, summary: issue.fields?.summary });
  


  // ==========================================
  // Step 2: Extract epic context (excluding Shell Stories)
  // ==========================================
  if (notify) {
    await notify('Extracting epic content...');
  }

  const projectKey = issue.fields?.project?.key;
  if (!projectKey) {
    throw new Error(`Epic ${epicKey} has no project key.`);
  }
  
  // Extract Figma URLs from epic description
  const description = issue.fields?.description;
  if (!description) {
    throw new Error(`Epic ${epicKey} has no description. Please add Figma design URLs to the epic description.`);
  }
  
  // Convert full description to markdown (including Shell Stories)
  const epicMarkdown = convertAdfToMarkdown(description);
  
  const figmaUrls = extractFigmaUrlsFromADF(description);
  console.log('  Figma URLs found:', figmaUrls.length);
  figmaUrls.forEach((url, idx) => {
    console.log(`    ${idx + 1}. ${url}`);
  });
  
  if (figmaUrls.length === 0) {
    throw new Error(`No Figma URLs found in epic ${epicKey}. Please add Figma design links to the epic description.`);
  }
  

  
  let epicContext = '';
  let contentWithoutShellStories: ADFNode[] = [];
  
  try {
    // Check for multiple Shell Stories sections
    const shellStoriesCount = countADFSectionsByHeading(description.content || [], 'shell stories');
    if (shellStoriesCount > 1) {
      throw new Error(`Epic ${epicKey} contains ${shellStoriesCount} "## Shell Stories" sections. Please consolidate into one section.`);
    }
    
    // Remove Shell Stories section
    contentWithoutShellStories = removeADFSectionByHeading(
      description.content || [],
      'shell stories'
    );
    
    // Convert remaining ADF to markdown
    epicContext = convertAdfToMarkdown({
      version: 1,
      type: 'doc',
      content: contentWithoutShellStories
    });
    epicContext = epicContext.trim();
    
    console.log(`  Epic context extracted: ${epicContext.length} characters`);
    if (epicContext.length > 0) {
      console.log(`    Preview: ${epicContext.substring(0, 200)}${epicContext.length > 200 ? '...' : ''}`);
    }
  } catch (error: any) {
    console.log(`  ⚠️  Failed to extract epic context: ${error.message}`);
    console.log('  Continuing without epic context...');
    epicContext = '';
    contentWithoutShellStories = [];
  }
  
  // ==========================================
  // Step 3: Fetch Figma metadata for all URLs
  // ==========================================
  const allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }> = [];
  let figmaFileKey = ''; // Store file key for later use
  
  for (let i = 0; i < figmaUrls.length; i++) {
    const figmaUrl = figmaUrls[i];
    console.log(`  Processing Figma URL ${i + 1}/${figmaUrls.length}: ${figmaUrl}`);
    
    // Parse URL
    const urlInfo = parseFigmaUrl(figmaUrl);
    if (!urlInfo) {
      console.log('    ⚠️  Invalid Figma URL format, skipping');
      continue;
    }
    
    if (!urlInfo.nodeId) {
      console.log('    ⚠️  Figma URL missing nodeId, skipping');
      continue;
    }
    
    try {
      // Convert nodeId to API format (required for all URLs from Jira)
      const apiNodeId = convertNodeIdToApiFormat(urlInfo.nodeId);
      
      // Store file key (use first valid file key found)
      if (!figmaFileKey) {
        figmaFileKey = urlInfo.fileKey;
      }
      
      // Fetch specific node data using efficient /nodes endpoint
      const nodeData = await fetchFigmaNode(figmaClient, urlInfo.fileKey, apiNodeId);
      
      // Get frames and notes based on node type
      const framesAndNotes = getFramesAndNotesForNode({ document: nodeData }, apiNodeId);
      console.log(`    Found ${framesAndNotes.length} frames/notes`);
      
      allFramesAndNotes.push({
        url: figmaUrl,
        metadata: framesAndNotes
      });
      
    } catch (error: any) {
      console.log(`    ⚠️  Error fetching Figma file: ${error.message}`);
      
      // If this is a rate limit error, propagate it to the user
      if (error.message && error.message.includes('Figma API rate limit exceeded')) {
        throw error;
      }
      
      // For other errors, continue trying remaining URLs
    }
  }
  
  // ==========================================
  // Step 2: Combine and separate frames/notes
  // ==========================================
  const allFrames: FigmaNodeMetadata[] = [];
  const allNotes: FigmaNodeMetadata[] = [];
  
  for (const item of allFramesAndNotes) {
    // Frames are type === "FRAME"
    const frames = item.metadata.filter(n => n.type === 'FRAME');
    
    // Notes are type === "INSTANCE" with name === "Note"
    const notes = item.metadata.filter(n => 
      n.type === 'INSTANCE' && n.name === 'Note'
    );
    
    allFrames.push(...frames);
    allNotes.push(...notes);
  }
  
  console.log(`  Found ${allFrames.length} frames and ${allNotes.length} notes`);
  
  // ==========================================
  // Step 3: Associate notes with frames
  // ==========================================
  if (notify) {
    await notify('Associating notes with screens...');
  }
  
  // Use the first Figma URL as base for generating node URLs
  const baseUrl = figmaUrls[0]?.split('?')[0] || '';
  
  // Associate notes with frames based on spatial proximity
  const { screens, unassociatedNotes } = associateNotesWithFrames(
    allFrames,
    allNotes,
    baseUrl
  );
  
  console.log(`  Associated notes with ${screens.length} screens`);
  console.log(`  - ${screens.reduce((sum, s) => sum + s.notes.length, 0)} associated notes`);
  console.log(`  - ${unassociatedNotes.length} unassociated notes`);
  
  // ==========================================
  // Step 4: Generate screens.yaml
  // ==========================================
  if (notify) {
    await notify('Saving preparation data...');
  }
  
  const yamlContent = generateScreensYaml(screens, unassociatedNotes);
  const yamlPath = path.join(tempDirPath, 'screens.yaml');
  await fs.writeFile(yamlPath, yamlContent, 'utf-8');
  
  console.log(`  ✅ screens.yaml written: ${yamlPath}`);
  
  // ==========================================
  // Step 5: Write notes files for each screen
  // ==========================================
  
  let downloadedNotes = 0;
  for (const screen of screens) {
    const notesWritten = await writeNotesForScreen(screen, allNotes, tempDirPath);
    if (notesWritten > 0) {
      console.log(`  ✅ Prepared notes: ${screen.name}.notes.md (${notesWritten} notes)`);
      downloadedNotes++;
    }
  }
  
  console.log(`  ✅ Setup complete: ${screens.length} screens, ${downloadedNotes} note files`);
  
  // Construct epic URL
  const epicUrl = `https://${siteInfo.siteName}.atlassian.net/browse/${epicKey}`;
  
  return {
    screens,
    allFrames,
    allNotes,
    figmaFileKey,
    downloadedNotes,
    yamlPath,
    epicContext,
    epicMarkdown,
    contentWithoutShellStories,
    figmaUrls,
    cloudId: siteInfo.cloudId,
    siteName: siteInfo.siteName,
    projectKey,
    epicKey,
    epicUrl
  };
}
