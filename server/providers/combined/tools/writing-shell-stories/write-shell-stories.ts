/**
 * Write Shell Stories Tool
 * 
 * Generates shell stories from Figma designs linked in a Jira epic.
 * This tool orchestrates fetching Jira content, analyzing Figma designs,
 * and generating user stories through AI-powered sampling.
 * 
 * The tool uses epic description content (excluding the ## Shell Stories section)
 * to guide prioritization and scope decisions during story generation.
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';
import { 
  convertMarkdownToAdf, 
  validateAdf,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { createProgressNotifier } from './progress-notifier.js';
import { getTempDir } from './temp-directory-manager.js';
import { setupFigmaScreens } from './figma-screen-setup.js';
import { regenerateScreenAnalyses } from './screen-analysis-regenerator.js';
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './prompt-shell-stories.js';

/**
 * Tool parameters interface
 */
interface WriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
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
      description: 'Generate shell stories from Figma designs linked in a Jira epic. Analyzes screens, downloads assets, and creates prioritized user stories. Uses epic description content to guide prioritization and scope decisions.',
      inputSchema: {
        epicKey: z.string()
          .describe('The Jira epic key (e.g., "PROJ-123", "USER-10"). The epic description should contain Figma design URLs and optional context about priorities, scope, and constraints.'),
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
        // Initial total: Phase 1-3 (3) + Phase 4 screens (unknown) + Phase 5 (1) + Phase 6 (1) = 5 + screens
        // We'll update the total after we know how many screens there are
        const notify = createProgressNotifier(context, 7);

        // Send initial progress notification
        await notify(`Starting shell story generation for epic ${epicKey}...`);

        // ==========================================
        // PHASE 1.5: Create temp directory for data
        // ==========================================
        console.log('  Creating temporary directory for shell story data...');
        
        // Get sessionId from auth context (used for deterministic directory naming)
        const sessionId = authInfo.sessionId || 'default';
        
        // Get or create temp directory (with lookup and 24hr cleanup)
        const { path: tempDirPath } = await getTempDir(sessionId, epicKey);
        
        console.log('  Temp directory ready:', tempDirPath);
        await notify(`Using temp directory: ${path.basename(tempDirPath)}`);

        // ==========================================
        // PHASE 1-3: Fetch epic, extract context, setup Figma screens
        // ==========================================
        console.log('  Phase 1-3: Setting up epic and Figma screens...');
        await notify('Phase 1-3: Fetching epic and Figma metadata...');
        
        const setupResult = await setupFigmaScreens({
          epicKey,
          atlassianToken,
          figmaToken,
          tempDirPath,
          cloudId,
          siteName,
          notify: async (msg) => await notify(msg)
        });
        
        const {
          screens,
          allFrames,
          allNotes,
          figmaFileKey,
          yamlPath,
          epicContext,
          contentWithoutShellStories,
          figmaUrls,
          cloudId: resolvedCloudId,
          siteName: resolvedSiteName
        } = setupResult;
        
        console.log(`  Phase 1-3 complete: ${figmaUrls.length} Figma URLs, ${screens.length} screens, ${allNotes.length} notes`);
        await notify(`✅ Phase 1-3 Complete: ${screens.length} screens ready`);

        // ==========================================
        // PHASE 4: Download images and analyze screens
        // ==========================================
        console.log('  Phase 4: Downloading images and analyzing screens...');
        
        // Add steps for all screens to be analyzed
        await notify(`Phase 4: Starting analysis of ${screens.length} screens...`, screens.length);
        
        const { analyzedScreens } = await regenerateScreenAnalyses({
          mcp,
          screens,
          allFrames,
          allNotes,
          figmaFileKey,
          figmaToken,
          tempDirPath,
          epicContext,
          notify: async (message: string) => {
            // Show progress for each screen (auto-increments)
            await notify(message);
          }
        });
        
        console.log(`  Phase 4 complete: ${analyzedScreens}/${screens.length} screens analyzed`);
        await notify(`✅ Phase 4 Complete: Analyzed ${analyzedScreens} screens`);

        // ==========================================
        // PHASE 5: Generate shell stories from analyses
        // ==========================================
        const shellStoriesResult = await generateShellStoriesFromAnalyses({
          mcp,
          screens,
          tempDirPath,
          yamlPath,
          notify,
          epicContext
        });

        // Phase 6: Write shell stories back to Jira epic
        await notify('📝 Phase 6: Updating Jira epic...');
        
        let shellStoriesContent = '';
        if (shellStoriesResult.shellStoriesPath) {
          try {
            shellStoriesContent = await fs.readFile(shellStoriesResult.shellStoriesPath, 'utf-8');
            
            // Update the epic description with shell stories
            await updateEpicWithShellStories({
              epicKey,
              cloudId: resolvedCloudId,
              token: atlassianToken,
              shellStoriesMarkdown: shellStoriesContent,
              contentWithoutShellStories,
              notify
            });
            
          } catch (error: any) {
            console.log(`    ⚠️ Could not read shell stories file: ${error.message}`);
            shellStoriesContent = `Error: Could not read shell stories file: ${error.message}`;
          }
        } else {
          shellStoriesContent = 'No shell stories were generated.';
        }

        // Return shell stories to user
        return {
          content: [
            {
              type: 'text',
              text: shellStoriesContent,
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
 * Phase 5: Generate shell stories from analyses
 * 
 * Reads all screen analysis files and uses AI sampling to generate
 * prioritized shell stories following evidence-based incremental value principles.
 * 
 * @returns Object with storyCount, analysisCount, and shellStoriesPath
 */
async function generateShellStoriesFromAnalyses(params: {
  mcp: McpServer;
  screens: Array<{ name: string; url: string; notes: string[] }>;
  tempDirPath: string;
  yamlPath: string;
  notify: ReturnType<typeof createProgressNotifier>;
  epicContext?: string;
}): Promise<{ storyCount: number; analysisCount: number; shellStoriesPath: string | null }> {
  const { mcp, screens, tempDirPath, yamlPath, notify, epicContext } = params;
  
  console.log('  Phase 5: Generating shell stories from analyses...');
  
  await notify('Phase 5: Generating shell stories from screen analyses...');
  
  // Read screens.yaml for screen ordering
  const screensYamlContent = await fs.readFile(yamlPath, 'utf-8');
  
  // Read all analysis files
  const analysisFiles: Array<{ screenName: string; content: string }> = [];
  for (const screen of screens) {
    const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      analysisFiles.push({ screenName: screen.name, content });
      console.log(`    ✅ Read analysis: ${screen.name}.analysis.md`);
    } catch (error: any) {
      console.log(`    ⚠️ Could not read analysis for ${screen.name}: ${error.message}`);
    }
  }
  
  console.log(`  Loaded ${analysisFiles.length}/${screens.length} analysis files`);
  
  if (analysisFiles.length === 0) {
    await notify('⚠️ No analysis files found - skipping shell story generation', 0, 'warning');
    return { storyCount: 0, analysisCount: 0, shellStoriesPath: null };
  }
  
  // Generate shell story prompt
  const shellStoryPrompt = generateShellStoryPrompt(
    screensYamlContent,
    analysisFiles,
    epicContext
  );
  
  // Save prompt to temp directory for debugging
  const promptPath = path.join(tempDirPath, 'shell-stories-prompt.md');
  await fs.writeFile(promptPath, shellStoryPrompt, 'utf-8');
  console.log(`    ✅ Saved prompt: shell-stories-prompt.md`);
  
  console.log(`    🤖 Requesting shell story generation from AI...`);
  if (epicContext && epicContext.length > 0) {
    console.log(`    Using epic context (${epicContext.length} characters) to guide prioritization`);
  }
  
  // Request shell story generation via sampling
  const samplingResponse = await mcp.server.request({
    "method": "sampling/createMessage",
    "params": {
      "messages": [
        {
          "role": "user",
          "content": {
            "type": "text",
            "text": shellStoryPrompt
          }
        }
      ],
      "speedPriority": 0.5,
      "systemPrompt": SHELL_STORY_SYSTEM_PROMPT,
      "maxTokens": SHELL_STORY_MAX_TOKENS
    }
  }, CreateMessageResultSchema);
  
  const shellStoriesText = samplingResponse.content?.text as string;
  if (!shellStoriesText) {
    throw new Error('No shell stories content received from AI');
  }
  
  console.log(`    ✅ Shell stories generated (${shellStoriesText.length} characters)`);
  
  // Save shell stories to file
  const shellStoriesPath = path.join(tempDirPath, 'shell-stories.md');
  await fs.writeFile(shellStoriesPath, shellStoriesText, 'utf-8');
  
  console.log(`    ✅ Saved shell stories: shell-stories.md`);
  
  // Count stories (rough estimate by counting "st" prefixes)
  const storyMatches = shellStoriesText.match(/^- st\d+/gm);
  const storyCount = storyMatches ? storyMatches.length : 0;
  
  await notify(`✅ Phase 5 Complete: Generated ${storyCount} shell stories`);
  
  return { storyCount, analysisCount: analysisFiles.length, shellStoriesPath };
}

/**
 * Helper function for Phase 6: Update epic with shell stories
 * @param params - Parameters for updating the epic
 * @param params.epicKey - The Jira epic key
 * @param params.cloudId - The Atlassian cloud ID
 * @param params.token - The Atlassian access token
 * @param params.shellStoriesMarkdown - The shell stories markdown content
 * @param params.contentWithoutShellStories - The epic description ADF content without Shell Stories section (from Phase 1.6)
 * @param params.notify - Progress notification function
 */
async function updateEpicWithShellStories({
  epicKey,
  cloudId,
  token,
  shellStoriesMarkdown,
  contentWithoutShellStories,
  notify
}: {
  epicKey: string;
  cloudId: string;
  token: string;
  shellStoriesMarkdown: string;
  contentWithoutShellStories: ADFNode[];
  notify: ReturnType<typeof createProgressNotifier>;
}): Promise<void> {
console.log('  Phase 6: Updating epic with shell stories...');

  try {
    // Prepare new description content with shell stories section
    const shellStoriesSection = `## Shell Stories\n\n${shellStoriesMarkdown}`;
    
    // Convert the new section to ADF
    console.log('    Converting shell stories section to ADF...');
    const shellStoriesAdf = await convertMarkdownToAdf(shellStoriesSection);
    
    if (!validateAdf(shellStoriesAdf)) {
      console.log('    ⚠️ Failed to convert shell stories to valid ADF');
      await notify('⚠️ Failed to convert shell stories to ADF', 0, 'warning');
      return;
    }
    
    console.log('    ✅ Shell stories converted to ADF');
    
    // Combine description (without old shell stories from Phase 1.6) with new shell stories section
    const updatedDescription: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        ...contentWithoutShellStories,
        ...shellStoriesAdf.content
      ]
    };
    
    // Update the epic
    console.log('    Updating epic description...');
    const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          description: updatedDescription
        }
      }),
    });
    
    if (updateResponse.status === 404) {
      console.log(`    ⚠️ Epic ${epicKey} not found`);
      await notify(`⚠️ Epic ${epicKey} not found`, 0, 'warning');
      return;
    }
    
    if (updateResponse.status === 403) {
      console.log(`    ⚠️ Insufficient permissions to update epic ${epicKey}`);
      await notify(`⚠️ Insufficient permissions to update epic`, 0, 'warning');
      return;
    }
    
    handleJiraAuthError(updateResponse, `Update epic ${epicKey} description`);
    
    console.log('    ✅ Epic description updated successfully');
    await notify(`✅ Phase 6 Complete: Epic updated with shell stories`);
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`, 0, 'warning');
  }
}
