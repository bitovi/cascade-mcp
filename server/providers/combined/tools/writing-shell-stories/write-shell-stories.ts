/**
 * Write Shell Stories Tool
 * 
 * Generates shell stories from Figma designs linked in a Jira epic.
 * This tool orchestrates fetching Jira content, analyzing Figma designs,
 * and generating user stories through AI-powered sampling.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { resolveCloudId, getJiraIssue, handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';
import { createProgressNotifier } from './progress-notifier.js';
import { getTempDir } from './temp-directory-manager.js';
import { associateNotesWithFrames } from './screen-analyzer.js';
import { generateScreensYaml } from './yaml-generator.js';
import { writeNotesForScreen } from './note-text-extractor.js';
import { 
  generateScreenAnalysisPrompt,
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS
} from './prompt-screen-analysis.js';
import { 
  parseFigmaUrl, 
  fetchFigmaFile,
  fetchFigmaNode,
  getFramesAndNotesForNode,
  convertNodeIdToApiFormat,
  downloadFigmaImage
} from '../../../figma/figma-helpers.js';
import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';

/**
 * Tool parameters interface
 */
interface WriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Atlassian Document Format (ADF) types
 */
interface ADFNode {
  type: string;
  attrs?: any;
  marks?: Array<{ type: string; attrs?: any }>;
  text?: string;
  content?: ADFNode[];
}

interface ADFDocument {
  version: number;
  type: 'doc';
  content: ADFNode[];
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
 * Register the write-shell-stories tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerWriteShellStoriesTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-shell-stories',
    {
      title: 'Write Shell Stories from Figma',
      description: 'Generate shell stories from Figma designs linked in a Jira epic. Analyzes screens, downloads assets, and creates prioritized user stories.',
      inputSchema: {
        epicKey: z.string()
          .describe('The Jira epic key (e.g., "PROJ-123", "USER-10"). The epic description should contain Figma design URLs.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ epicKey, cloudId, siteName }: WriteShellStoriesParams, context) => {
      console.log('write-shell-stories called', { epicKey, cloudId, siteName });

      // Get auth info for both Atlassian and Figma
      const authInfo = getAuthInfoSafe(context, 'write-shell-stories');
      
      // Extract tokens
      const atlassianToken = authInfo?.atlassian?.access_token;
      const figmaToken = authInfo?.figma?.access_token;
      
      if (!atlassianToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found. Please authenticate with Atlassian first.',
            },
          ],
        };
      }
      
      if (!figmaToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Figma access token found. Please authenticate with Figma first.',
            },
          ],
        };
      }

      try {
        console.log('  Starting shell story generation for epic:', epicKey);

        // Create progress notifier for this execution
        // Initial total: 3 phases + unknown screens + 3 final phases = unknown
        // We'll update the total after we know how many screens there are
        const notify = createProgressNotifier(context, 6);

        // Send initial progress notification
        await notify(`Starting shell story generation for epic ${epicKey}...`, 0);

        // ==========================================
        // PHASE 1: Fetch epic and extract Figma URLs
        // ==========================================
        console.log('  Phase 1: Fetching epic and extracting Figma URLs...');
        await notify('Phase 1: Fetching epic from Jira...', 1);
        
        // Resolve cloud ID (use explicit cloudId/siteName or first accessible site)
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(atlassianToken, cloudId, siteName);
        } catch (error: any) {
          await notify(`Failed to resolve Jira site: ${error.message}`, 1, 'error');
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}`,
              },
            ],
          };
        }
        
        console.log('  Resolved Jira site:', { cloudId: siteInfo.cloudId, siteName: siteInfo.siteName });
        
        // Fetch the epic issue
        const issueResponse = await getJiraIssue(siteInfo.cloudId, epicKey, undefined, atlassianToken);
        handleJiraAuthError(issueResponse, 'Fetch epic');
        
        if (!issueResponse.ok) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Failed to fetch epic ${epicKey}. Status: ${issueResponse.status} ${issueResponse.statusText}`,
              },
            ],
          };
        }
        
        const issue = await issueResponse.json() as JiraIssue;
        console.log('  Epic fetched successfully:', { key: issue.key, summary: issue.fields?.summary });
        
        // Extract Figma URLs from epic description
        const description = issue.fields?.description;
        if (!description) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Epic ${epicKey} has no description. Please add Figma design URLs to the epic description.`,
              },
            ],
          };
        }
        
        const figmaUrls = extractFigmaUrlsFromADF(description);
        console.log('  Figma URLs found:', figmaUrls.length);
        figmaUrls.forEach((url, idx) => {
          console.log(`    ${idx + 1}. ${url}`);
        });
        
        if (figmaUrls.length === 0) {
          await notify(`No Figma URLs found in epic ${epicKey}`, 1, 'error');
          
          return {
            content: [
              {
                type: 'text',
                text: `Error: No Figma URLs found in epic ${epicKey}. Please add Figma design links to the epic description.`,
              },
            ],
          };
        }

        // Send completion notification for Phase 1
        await notify(`✅ Phase 1 Complete: Found ${figmaUrls.length} Figma URL(s)`, 1);

        // ==========================================
        // PHASE 1.5: Create temp directory for data
        // ==========================================
        console.log('  Creating temporary directory for shell story data...');
        
        // Get sessionId from auth context (used for deterministic directory naming)
        const sessionId = authInfo.sessionId || 'default';
        
        // Get or create temp directory (with lookup and 24hr cleanup)
        const { path: tempDirPath } = await getTempDir(sessionId, epicKey);
        
        console.log('  Temp directory ready:', tempDirPath);
        await notify(`Using temp directory: ${path.basename(tempDirPath)}`, 1);

        // ==========================================
        // PHASE 2: Fetch Figma metadata
        // ==========================================
        console.log('  Fetching Figma metadata for all URLs...');
        
        // Get Figma access token
        const figmaToken = authInfo.figma?.access_token;
        if (!figmaToken) {
          throw new Error('No Figma access token found. Please authenticate with Figma.');
        }
        
        // Parse and fetch metadata for each Figma URL
        const allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }> = [];
        let figmaFileKey = ''; // Store file key for later use
        
        for (let i = 0; i < figmaUrls.length; i++) {
          const figmaUrl = figmaUrls[i];
          console.log(`  Processing Figma URL ${i + 1}/${figmaUrls.length}: ${figmaUrl}`);
          
          // Parse URL
          const urlInfo = parseFigmaUrl(figmaUrl);
          if (!urlInfo) {
            console.log('    ⚠️ Invalid Figma URL format, skipping');
            await notify(`Warning: Invalid Figma URL format (${i + 1}/${figmaUrls.length})`, 2, 'warning');
            continue;
          }
          
          if (!urlInfo.nodeId) {
            console.log('    ⚠️ Figma URL missing nodeId, skipping');
            await notify(`Warning: Figma URL missing nodeId (${i + 1}/${figmaUrls.length})`, 2, 'warning');
            continue;
          }
          
          try {
            // Convert nodeId to API format (required for all URLs from Jira)
            const apiNodeId = convertNodeIdToApiFormat(urlInfo.nodeId);
            
            // Store file key for Phase 4
            if (i === 0) {
              figmaFileKey = urlInfo.fileKey;
            }
            
            // Fetch specific node data using efficient /nodes endpoint
            const nodeData = await fetchFigmaNode(urlInfo.fileKey, apiNodeId, figmaToken);
            
            // Get frames and notes based on node type
            const framesAndNotes = getFramesAndNotesForNode({ document: nodeData }, apiNodeId);
            console.log(`    Found ${framesAndNotes.length} frames/notes`);
            
            allFramesAndNotes.push({
              url: figmaUrl,
              metadata: framesAndNotes
            });
            
          } catch (error: any) {
            console.log(`    ⚠️ Error fetching Figma file: ${error.message}`);
            await notify(`Warning: Failed to fetch Figma file (${i + 1}/${figmaUrls.length})`, 2, 'warning');
          }
        }
        
        // Calculate total frames and notes
        const totalFrames = allFramesAndNotes.reduce(
          (sum, item) => sum + item.metadata.filter(n => n.type === 'FRAME').length,
          0
        );
        const totalNotes = allFramesAndNotes.reduce(
          (sum, item) => sum + item.metadata.filter(n => n.type === 'INSTANCE' && n.name === 'Note').length,
          0
        );
        
        console.log(`  Phase 2 complete: ${totalFrames} frames, ${totalNotes} notes`);
        await notify(`✅ Phase 2 Complete: Found ${totalFrames} frames and ${totalNotes} notes`, 2);

        // ==========================================
        // PHASE 3: Generate screens.yaml
        // ==========================================
        console.log('  Generating screens.yaml with spatial analysis...');
        
        // Combine all frames and notes from all Figma files
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
        
        // Use the first Figma URL as base for generating node URLs
        // (Assuming all frames/notes are from same file for now)
        const baseUrl = figmaUrls[0]?.split('?')[0] || '';
        
        // Associate notes with frames based on spatial proximity
        const { screens, unassociatedNotes } = associateNotesWithFrames(
          allFrames,
          allNotes,
          baseUrl
        );
        
        // Generate YAML content
        const yamlContent = generateScreensYaml(screens, unassociatedNotes);
        
        // Write YAML file
        const yamlPath = path.join(tempDirPath, 'screens.yaml');
        await fs.writeFile(yamlPath, yamlContent, 'utf-8');
        
        console.log(`  screens.yaml written to: ${yamlPath}`);
        console.log(`  - ${screens.length} screens`);
        console.log(`  - ${screens.reduce((sum, s) => sum + s.notes.length, 0)} associated notes`);
        console.log(`  - ${unassociatedNotes.length} unassociated notes`);
        
        await notify(`✅ Phase 3 Complete: Generated screens.yaml (${screens.length} screens)`, 3);

        // ==========================================
        // PHASE 4: Download images, analyze screens, and save notes
        // ==========================================
        const { downloadedImages, analyzedScreens, downloadedNotes } = await downloadAndAnalyzeScreens({
          mcp,
          screens,
          allFrames,
          allNotes,
          figmaFileKey,
          figmaToken,
          tempDirPath,
          notify
        });

        // TODO: Phase 5: Generate shell stories from analyses
        // TODO: Phase 6: Write back to Jira

        // Return progress summary
        return {
          content: [
            {
              type: 'text',
              text: `✅ Phase 1-4 Complete:\n\n` +
                    `Epic: ${issue.fields?.summary} (${epicKey})\n` +
                    `Site: ${siteInfo.siteName}\n` +
                    `Temp Directory: ${tempDirPath}\n\n` +
                    `Phase 1: Found ${figmaUrls.length} Figma URL(s)\n` +
                    `Phase 2: Extracted ${totalFrames} frames and ${totalNotes} notes\n` +
                    `Phase 3: Generated screens.yaml with ${screens.length} screens\n` +
                    `Phase 4: Downloaded ${downloadedImages} images, analyzed ${analyzedScreens} screens, ${downloadedNotes} note files\n\n` +
                    `Screens YAML: ${yamlPath}\n\n` +
                    `Next: Implement Phase 5 (Generate shell stories from analyses)`,
            },
          ],
        };

      } catch (error: any) {
        console.error('  Error in write-shell-stories:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error generating shell stories: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}

/**
 * Phase 4: Download images, analyze screens, and save notes
 * 
 * For each screen:
 * 1. Prepare notes file
 * 2. Download frame image from Figma (or await previous prefetch)
 * 3. Start downloading NEXT image in background (pipeline optimization)
 * 4. Run AI analysis on CURRENT screen (while next downloads in parallel)
 * 5. Save analysis result
 * 
 * Performance optimization: Images are downloaded in a pipelined fashion where
 * the next image downloads while the current screen is being analyzed by AI.
 * This parallelization significantly reduces total execution time while still
 * maintaining sequential Figma API calls (natural rate limiting).
 * 
 */
async function downloadAndAnalyzeScreens(params: {
  mcp: McpServer;
  screens: Array<{ name: string; url: string; notes: string[] }>;
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  figmaToken: string;
  tempDirPath: string;
  notify: ReturnType<typeof createProgressNotifier>;
}): Promise<{ downloadedImages: number; analyzedScreens: number; downloadedNotes: number }> {
  const { mcp, screens, allFrames, allNotes, figmaFileKey, figmaToken, tempDirPath, notify } = params;
  
  console.log('  Phase 4: Downloading images and analyzing screens...');
  
  // Add screens.length steps to the total (one step per screen analysis)
  await notify(`Phase 4: Starting analysis of ${screens.length} screens...`, 4, 'info', screens.length);
  
  let downloadedImages = 0;
  let analyzedScreens = 0;
  let downloadedNotes = 0;
  
  // Helper to download image for a screen
  async function downloadScreenImage(screen: typeof screens[number], frameId: string): Promise<{
    base64Data: string;
    byteSize: number;
  } | null> {
    try {
      const imageResult = await downloadFigmaImage(
        figmaFileKey,
        frameId,
        figmaToken,
        { format: 'png', scale: 1 }
      );
      
      const imageSizeKB = Math.round(imageResult.byteSize / 1024);
      
      // Save image to temp directory
      const imagePath = path.join(tempDirPath, `${screen.name}.png`);
      const imageBuffer = Buffer.from(imageResult.base64Data, 'base64');
      await fs.writeFile(imagePath, imageBuffer);
      
      console.log(`    ✅ Downloaded image: ${screen.name}.png (${imageSizeKB}KB)`);
      
      return imageResult;
    } catch (error: any) {
      console.log(`    ⚠️ Failed to download image for ${screen.name}: ${error.message}`);
      return null;
    }
  }
  
  // Pipeline: Start downloading the first image
  let nextImagePromise: Promise<{ base64Data: string; byteSize: number } | null> | null = null;
  
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    console.log(`  Processing screen ${i + 1}/${screens.length}: ${screen.name}`);
    
    // Send progress notification for this specific screen
    const currentProgress = 4 + i;
    await notify(`Analyzing screen: ${screen.name} (${i + 1}/${screens.length})`, currentProgress);
    
    // Find the frame for this screen
    const frame = allFrames.find(f => 
      screen.url.includes(f.id.replace(/:/g, '-'))
    );
    
    if (!frame) {
      console.log(`    ⚠️ Frame not found for screen: ${screen.name}`);
      continue;
    }
    
    // Step 1: Prepare notes file for this screen
    const notesWritten = await writeNotesForScreen(screen, allNotes, tempDirPath);
    if (notesWritten > 0) {
      console.log(`    ✅ Prepared notes: ${screen.name}.notes.md (${notesWritten} notes)`);
      downloadedNotes++;
    }
    
    // Step 2: Download current image (or await previous download if pipelined)
    let imageResult: { base64Data: string; byteSize: number } | null = null;
    
    if (i === 0) {
      // First screen: download directly
      imageResult = await downloadScreenImage(screen, frame.id);
    } else {
      // Subsequent screens: await the previous iteration's prefetch
      imageResult = await nextImagePromise!;
    }
    
    if (imageResult) {
      downloadedImages++;
    }
    
    // Step 3: Start downloading NEXT image while we analyze CURRENT (pipeline optimization)
    const nextScreen = screens[i + 1];
    if (nextScreen) {
      const nextFrame = allFrames.find(f => 
        nextScreen.url.includes(f.id.replace(/:/g, '-'))
      );
      
      if (nextFrame) {
        // Start next download in background (don't await)
        nextImagePromise = downloadScreenImage(nextScreen, nextFrame.id);
      }
    }
    
    // Step 4: Run AI analysis on CURRENT screen (while next image downloads in parallel)
    if (imageResult) {
      try {
        console.log(`    🤖 Analyzing screen with AI...`);
        
        // Read notes content if available
        let notesContent = '';
        const notesPath = path.join(tempDirPath, `${screen.name}.notes.md`);
        try {
          notesContent = await fs.readFile(notesPath, 'utf-8');
        } catch {
          // No notes file, that's okay
        }
        
        // Generate analysis prompt using helper
        const screenPosition = `${i + 1} of ${screens.length}`;
        const analysisPrompt = generateScreenAnalysisPrompt(
          screen.name,
          screen.url,
          screenPosition,
          notesContent || undefined
        );

        // Send sampling request with image (while next image downloads)
        const samplingResponse = await mcp.server.request({
          "method": "sampling/createMessage",
          "params": {
            "messages": [
              {
                "role": "user",
                "content": {
                  "type": "text",
                  "text": analysisPrompt
                }
              },
              {
                "role": "user",
                "content": {
                  "type": "image",
                  "data": imageResult.base64Data,
                  "mimeType": "image/png"
                }
              }
            ],
            "speedPriority": 0.5,
            "systemPrompt": SCREEN_ANALYSIS_SYSTEM_PROMPT,
            "maxTokens": SCREEN_ANALYSIS_MAX_TOKENS
          }
        }, CreateMessageResultSchema);
        
        const analysisText = samplingResponse.content?.text as string;
        if (!analysisText) {
          throw new Error('No analysis content received from AI');
        }
        
        console.log(`    ✅ AI analysis complete (${analysisText.length} characters)`);
        
        // Step 5: Save analysis result
        const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
        await fs.writeFile(analysisPath, analysisText, 'utf-8');
        
        console.log(`    ✅ Saved analysis: ${screen.name}.analysis.md`);
        analyzedScreens++;
        
      } catch (error: any) {
        console.log(`    ⚠️ Failed to analyze ${screen.name}: ${error.message}`);
      }
    }
  }
  
  console.log(`  Phase 4 complete: ${downloadedImages}/${screens.length} images, ${analyzedScreens} analyses, ${downloadedNotes} note files`);
  
  // Progress for end of Phase 4 (after all screens analyzed)
  const phase4EndProgress = 4 + screens.length;
  await notify(`✅ Phase 4 Complete: Downloaded ${downloadedImages} images, analyzed ${analyzedScreens} screens, ${downloadedNotes} note files`, phase4EndProgress);
  
  return { downloadedImages, analyzedScreens, downloadedNotes };
}
