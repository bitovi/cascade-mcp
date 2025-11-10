/**
 * Core business logic for write-shell-stories tool
 * 
 * This module contains the pure business logic for generating shell stories from Figma designs.
 * It is independent of MCP-specific concerns (authentication, context, etc.) and can be used
 * from both MCP handlers and REST API endpoints.
 * 
 * The logic orchestrates:
 * 1. Creating temp directory for artifacts
 * 2. Setting up Figma screens and extracting epic context
 * 3. Downloading images and analyzing screens with AI
 * 4. Generating prioritized shell stories
 * 5. Updating the Jira epic with generated stories
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDependencies } from '../types.js';
import { getTempDir } from './temp-directory-manager.js';
import { setupFigmaScreens } from './figma-screen-setup.js';
import { regenerateScreenAnalyses } from './screen-analysis-regenerator.js';
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS
} from './prompt-shell-stories.js';
import { 
  convertMarkdownToAdf, 
  validateAdf,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';

/**
 * Parameters for executing the write-shell-stories workflow
 */
export interface ExecuteWriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

/**
 * Result from executing the write-shell-stories workflow
 */
export interface ExecuteWriteShellStoriesResult {
  success: boolean;
  shellStoriesContent: string;
  storyCount: number;
  screensAnalyzed: number;
  tempDirPath: string;
}

/**
 * Execute the write-shell-stories workflow
 * 
 * This is the core business logic that can be called from both MCP handlers and REST API endpoints.
 * It uses dependency injection to abstract away authentication and LLM provider concerns.
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with shell stories content and metadata
 */
export async function executeWriteShellStories(
  params: ExecuteWriteShellStoriesParams,
  deps: ToolDependencies
): Promise<ExecuteWriteShellStoriesResult> {
  const { epicKey, cloudId, siteName, sessionId = 'default' } = params;
  const { atlassianClient, figmaClient, generateText, notify } = deps;
  
  console.log('executeWriteShellStories called', { epicKey, cloudId, siteName });
  console.log('  Starting shell story generation for epic:', epicKey);

  // Send initial progress notification
  await notify(`Starting shell story generation for epic ${epicKey}...`);

  // ==========================================
  // PHASE 1.5: Create temp directory for data
  // ==========================================
  console.log('  Creating temporary directory for shell story data...');
  
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
    atlassianClient,
    figmaClient,
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
    generateText,
    figmaClient,
    screens,
    allFrames,
    allNotes,
    figmaFileKey,
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
    generateText, // Use injected LLM client
    screens,
    tempDirPath,
    yamlPath,
    notify,
    epicContext
  });

  // ==========================================
  // PHASE 6: Write shell stories back to Jira epic
  // ==========================================
  await notify('📝 Phase 6: Updating Jira epic...');
  
  let shellStoriesContent = '';
  if (shellStoriesResult.shellStoriesPath) {
    try {
      shellStoriesContent = await fs.readFile(shellStoriesResult.shellStoriesPath, 'utf-8');
      
      // Update the epic description with shell stories
      await updateEpicWithShellStories({
        epicKey,
        cloudId: resolvedCloudId,
        atlassianClient,
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

  return {
    success: true,
    shellStoriesContent,
    storyCount: shellStoriesResult.storyCount,
    screensAnalyzed: shellStoriesResult.analysisCount,
    tempDirPath
  };
}

/**
 * Phase 5: Generate shell stories from analyses
 * 
 * Reads all screen analysis files and uses AI to generate
 * prioritized shell stories following evidence-based incremental value principles.
 * 
 * @returns Object with storyCount, analysisCount, and shellStoriesPath
 */
async function generateShellStoriesFromAnalyses(params: {
  generateText: ToolDependencies['generateText'];
  screens: Array<{ name: string; url: string; notes: string[] }>;
  tempDirPath: string;
  yamlPath: string;
  notify: ToolDependencies['notify'];
  epicContext?: string;
}): Promise<{ storyCount: number; analysisCount: number; shellStoriesPath: string | null }> {
  const { generateText, screens, tempDirPath, yamlPath, notify, epicContext } = params;
  
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
    await notify('⚠️ No analysis files found - skipping shell story generation');
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
  console.log(`       Prompt length: ${shellStoryPrompt.length} characters`);
  console.log(`       System prompt length: ${SHELL_STORY_SYSTEM_PROMPT.length} characters`);
  console.log(`       Max tokens: ${SHELL_STORY_MAX_TOKENS}`);
  if (epicContext && epicContext.length > 0) {
    console.log(`       Epic context: ${epicContext.length} characters`);
  }
  
  // Request shell story generation via injected LLM client
  console.log('    ⏳ Waiting for Anthropic API response...');
  const response = await generateText({
    systemPrompt: SHELL_STORY_SYSTEM_PROMPT,
    prompt: shellStoryPrompt,
    maxTokens: SHELL_STORY_MAX_TOKENS
  });
  
  const shellStoriesText = response.text;
  
  if (!shellStoriesText) {
    throw new Error('No shell stories content received from AI');
  }
  
  console.log(`    ✅ Shell stories generated (${shellStoriesText.length} characters)`);
  if (response.metadata) {
    console.log(`       Tokens used: ${response.metadata.tokensUsed}, Stop reason: ${response.metadata.stopReason}`);
  }
  
  // Save shell stories to file
  const shellStoriesPath = path.join(tempDirPath, 'shell-stories.md');
  await fs.writeFile(shellStoriesPath, shellStoriesText, 'utf-8');
  
  console.log(`    ✅ Saved shell stories: shell-stories.md`);
  
  // Count stories (rough estimate by counting "st" prefixes with or without backticks)
  const storyMatches = shellStoriesText.match(/^- `?st\d+/gm);
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
  atlassianClient,
  shellStoriesMarkdown,
  contentWithoutShellStories,
  notify
}: {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  shellStoriesMarkdown: string;
  contentWithoutShellStories: ADFNode[];
  notify: ToolDependencies['notify'];
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
      await notify('⚠️ Failed to convert shell stories to ADF');
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
    
    const updateResponse = await atlassianClient.fetch(updateUrl, {
      method: 'PUT',
      headers: {
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
      await notify(`⚠️ Epic ${epicKey} not found`);
      return;
    }
    
    if (updateResponse.status === 403) {
      console.log(`    ⚠️ Insufficient permissions to update epic ${epicKey}`);
      await notify(`⚠️ Insufficient permissions to update epic`);
      return;
    }
    
    handleJiraAuthError(updateResponse, `Update epic ${epicKey} description`);
    
    console.log('    ✅ Epic description updated successfully');
    await notify(`✅ Phase 6 Complete: Epic updated with shell stories`);
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`);
  }
}
