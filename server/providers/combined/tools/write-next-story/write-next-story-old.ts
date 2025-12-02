/**
 * Write Next Story Tool (DEPRECATED - FOR REFERENCE ONLY)
 * 
 * This file is no longer actively used. See write-next-story.ts and core-logic.ts instead.
 * 
 * Writes the next Jira story from a list of shell stories in an epic.
 * Validates dependencies, generates full story content, creates Jira issue,
 * and updates epic with completion marker.
 */

// @ts-nocheck - Deprecated file, not actively maintained

import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createProgressNotifier } from '../writing-shell-stories/progress-notifier.js';
import { getTempDir } from '../writing-shell-stories/temp-directory-manager.js';
import { setupFigmaScreens } from '../writing-shell-stories/figma-screen-setup.js';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { parseShellStories, type ParsedShellStory } from './shell-story-parser.js';
import { 
  generateStoryPrompt, 
  STORY_GENERATION_SYSTEM_PROMPT, 
  STORY_GENERATION_MAX_TOKENS 
} from './prompt-story-generation.js';
import { 
  regenerateScreenAnalyses
} from '../writing-shell-stories/screen-analysis-regenerator.js';
import type { FigmaScreenSetupResult } from '../writing-shell-stories/figma-screen-setup.js';
import { 
  convertMarkdownToAdf_NewContentOnly, 
  validateAdf, 
  convertAdfToMarkdown_AIPromptOnly,
  type ADFDocument,
  type ADFNode
} from '../../../atlassian/markdown-converter.js';

/**
 * Tool parameters interface
 */
interface WriteNextStoryParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the write-next-story tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerWriteNextStoryTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-epics-next-story',
    {
      title: 'Write Next Epic Story',
      description: 'Write the next Jira story from shell stories in an epic. Validates dependencies, generates full story content, creates Jira issue, and updates epic with completion marker.',
      inputSchema: {
        epicKey: z.string()
          .describe('The Jira epic key (e.g., "PROJ-123", "USER-10"). The epic description should contain a Shell Stories section with prioritized stories.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ epicKey, cloudId, siteName }: WriteNextStoryParams, context) => {
      console.log('write-epics-next-story called', { epicKey, cloudId, siteName });

      // Get auth info
      const authInfo = getAuthInfoSafe(context, 'write-epics-next-story');
      const atlassianToken = authInfo?.atlassian?.access_token;

      if (!atlassianToken) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found in session context.',
          }],
        };
      }

      // Create progress notifier (8 total steps for MVP)
      const notify = createProgressNotifier(context, 8);

      try {
        // Get Figma token
        const figmaToken = authInfo?.figma?.access_token;
        if (!figmaToken) {
          return {
            content: [{
              type: 'text',
              text: 'Error: No valid Figma access token found. Please authenticate with Figma.',
            }],
          };
        }
        
        // Create API clients
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = createFigmaClient(figmaToken);
        const generateText = createMcpLLMClient(context);
        
        // Step 1: Setup Figma screens and fetch epic (FAST - always run this)
        const sessionId = context.sessionId || 'default-session';
        const { path: tempDirPath } = await getTempDir(sessionId, epicKey);
        
        await notify('Setting up epic and Figma screens...', 1);
        const setupResult = await setupFigmaScreens({
          epicKey,
          atlassianClient,
          figmaClient,
          tempDirPath,
          cloudId,
          siteName,
          notify: async (msg) => await notify(msg, 1)
        });
        
        console.log(`  ✅ Setup complete: ${setupResult.screens.length} screens, ${setupResult.figmaUrls.length} Figma URLs`);
        
        // Step 2-3: Extract shell stories from epic context
        const shellStories = await extractShellStoriesFromSetup(setupResult, notify);
        
        console.log(`  Parsed ${shellStories.length} shell stories`);
        
        if (shellStories.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `Error: No shell stories found in epic ${epicKey}.`,
            }],
          };
        }
        
        // Step 4: Find next unwritten story
        const nextStory = findNextUnwrittenStory(shellStories, notify);
        
        if (!nextStory) {
          return {
            content: [{
              type: 'text',
              text: `All stories in epic ${epicKey} have been written! 🎉\n\nTotal stories: ${shellStories.length}`,
            }],
          };
        }
        
        console.log(`  Next story to write: ${nextStory.id} - ${nextStory.title}`);
        
        // Step 5: Validate dependencies
        validateDependencies(nextStory, shellStories, notify);
        console.log(`  All ${nextStory.dependencies.length} dependencies validated`);
        
        // Step 6: Generate story content (may regenerate missing analyses)
        const storyContent = await generateStoryContent(
          generateText,
          figmaClient,
          setupResult,
          tempDirPath,
          nextStory,
          shellStories,
          notify  // Pass the full notify function (supports addSteps parameter)
        );
        console.log(`  Story content generated (${storyContent.length} characters)`);
        
        // Step 7: Create Jira issue
        const createdIssue = await createJiraIssue(
          atlassianToken,
          setupResult.cloudId,
          setupResult.epicKey,
          setupResult.projectKey,
          nextStory,
          shellStories,
          storyContent,
          notify
        );
        console.log(`  ✅ Jira issue created: ${createdIssue.key}`);
        
        // Step 8: Update epic with completion marker
        await updateEpicWithCompletion(
          atlassianToken,
          setupResult.cloudId,
          setupResult.epicKey,
          setupResult.epicMarkdown,
          nextStory,
          createdIssue,
          notify
        );
        console.log(`  ✅ Epic updated with completion marker`);

        return {
          content: [{
            type: 'text',
            text: `✅ Created and linked Jira story: ${createdIssue.key}\n\n**${nextStory.title}**\n\n${createdIssue.self}\n\nEpic ${setupResult.epicKey} has been updated with the Jira link and completion timestamp.`,
          }],
        };

      } catch (error: any) {
        console.error('Error in write-epics-next-story:', error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`,
          }],
        };
      }
    }
  );
}

// ============================================================================
// Step Helper Functions (in order of execution)
// ============================================================================

/**
 * Step 2-3: Extract shell stories from epic description
 * Uses the epic markdown already fetched by setupFigmaScreens
 */
export async function extractShellStoriesFromSetup(
  setupResult: FigmaScreenSetupResult,
  notify: (message: string, step: number) => Promise<void>
): Promise<ParsedShellStory[]> {
  await notify('Extracting shell stories...', 2);
  
  // Extract Shell Stories section from the full epic markdown
  const shellStoriesMatch = setupResult.epicMarkdown.match(/## Shell Stories\n([\s\S]*?)(?=\n## |$)/);
  
  if (!shellStoriesMatch) {
    throw new Error(`Epic ${setupResult.epicKey} does not contain a "## Shell Stories" section.`);
  }

  const shellStoriesContent = shellStoriesMatch[1].trim();
  console.log('  Shell Stories section extracted');
  
  // Parse shell stories
  await notify('Parsing shell stories...', 3);
  const shellStories = parseShellStories(shellStoriesContent);
  
  return shellStories;
}

/**
 * Step 4: Find next unwritten story
 */
export function findNextUnwrittenStory(
  shellStories: ParsedShellStory[],
  notify: (message: string, step: number) => Promise<void>
): ParsedShellStory | undefined {
  notify('Finding next unwritten story...', 4);
  return shellStories.find(story => !story.jiraUrl);
}

/**
 * Step 5: Validate dependencies (MVP - basic validation only)
 * Recursively checks all dependencies and their dependencies
 */
export function validateDependencies(
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  notify: (message: string, step: number) => Promise<void>
): void {
  notify('Validating dependencies...', 5);
  
  const visited = new Set<string>();
  const toCheck = [...story.dependencies];
  
  while (toCheck.length > 0) {
    const depId = toCheck.shift()!;
    
    // Skip if already checked
    if (visited.has(depId)) {
      continue;
    }
    visited.add(depId);
    
    const depStory = allStories.find(s => s.id === depId);
    
    if (!depStory) {
      throw new Error(`Dependency ${depId} not found in shell stories for ${story.id}.`);
    }
    
    if (!depStory.jiraUrl) {
      throw new Error(`Dependency ${depId} must be written before ${story.id}.\n\nPlease write story ${depId} first.`);
    }
    
    // Add dependencies of this dependency to check
    toCheck.push(...depStory.dependencies);
  }
}

/**
 * Step 6: Generate full story content
 * Loads analysis files and uses AI sampling to generate complete Jira story
 * Regenerates missing analysis files automatically
 */
export async function generateStoryContent(
  generateText: ReturnType<typeof createMcpLLMClient>,
  figmaClient: ReturnType<typeof createFigmaClient>,
  setupResult: FigmaScreenSetupResult,
  tempDirPath: string,
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  notify: (message: string, progress: number, level?: 'info' | 'debug' | 'warning' | 'error', addSteps?: number) => Promise<void>
): Promise<string> {
  await notify('Generating story content...', 6);
  
  console.log(`  Using temp directory: ${tempDirPath}`);
  
  // Check which analysis files exist and which are missing
  // Match story screens with setupResult screens to get the correct names
  const screenInfo: Array<{ url: string; name: string; exists: boolean }> = [];
  
  for (const screenUrl of story.screens) {
    // Find the matching screen from setupResult (which has the correct name)
    const matchingScreen = setupResult.screens.find(s => s.url === screenUrl);
    
    if (!matchingScreen) {
      console.warn(`  ⚠️  Screen URL not found in setup results: ${screenUrl}`);
      continue;
    }
    
    const screenName = matchingScreen.name;
    const analysisPath = path.join(tempDirPath, `${screenName}.analysis.md`);
    
    // Check if analysis file exists
    try {
      await fs.access(analysisPath);
      screenInfo.push({ url: screenUrl, name: screenName, exists: true });
      console.log(`  ✅ Found cached analysis: ${screenName}.analysis.md`);
    } catch {
      screenInfo.push({ url: screenUrl, name: screenName, exists: false });
      console.log(`  ⚠️  Missing analysis: ${screenName}.analysis.md`);
    }
  }
  
  // Collect screens that need regeneration
  const missingScreens = screenInfo.filter(s => !s.exists);
  
  if (missingScreens.length > 0) {
    console.log(`  Regenerating ${missingScreens.length} missing analysis files...`);
    
    // Add steps for regeneration (each screen adds 1 step)
    // This updates the total from 8 to 8 + missingScreens.length
    await notify(
      `Regenerating ${missingScreens.length} missing screen analyses...`, 
      6, 
      'info', 
      missingScreens.length
    );
    
    // We already have setupResult from earlier, so we can use it directly
    // Filter to only the screens we need to regenerate
    const screensToAnalyze = setupResult.screens.filter(screen =>
      missingScreens.some(missing => screen.name === missing.name)
    );
    
    console.log(`  Regenerating ${screensToAnalyze.length} missing analyses...`);
    
    // Regenerate missing analyses with pipelining (SLOW operation)
    const result = await regenerateScreenAnalyses({
      generateText,
      figmaClient,
      screens: screensToAnalyze,
      allFrames: setupResult.allFrames,
      allNotes: setupResult.allNotes,
      figmaFileKey: setupResult.figmaFileKey,
      tempDirPath,
      epicContext: setupResult.epicContext,
      notify: async (msg) => await notify(msg, 6)
    });
    
    console.log(`  ✅ Regenerated ${result.analyzedScreens} analysis files`);
  }
  
  // Now load all analysis files (both cached and newly generated)
  const analysisFiles: Array<{ screenName: string; content: string }> = [];
  
  for (const screen of screenInfo) {
    const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
    
    try {
      const analysisContent = await fs.readFile(analysisPath, 'utf-8');
      analysisFiles.push({ screenName: screen.name, content: analysisContent });
      console.log(`  ✅ Loaded analysis: ${screen.name}.analysis.md`);
    } catch (error: any) {
      // This shouldn't happen after regeneration, but handle it
      console.warn(`  ⚠️  Still missing after regeneration: ${screen.name}.analysis.md`);
    }
  }
  
  if (analysisFiles.length === 0) {
    throw new Error(
      `No screen analysis files available for story ${story.id}.\n\n` +
      `Attempted to regenerate ${missingScreens.length} missing files but failed.`
    );
  }
  
  console.log(`  Loaded ${analysisFiles.length} total analysis files`);
  
  // Get dependency stories for context
  const dependencyStories = story.dependencies
    .map(depId => allStories.find(s => s.id === depId))
    .filter((s): s is ParsedShellStory => s !== undefined);
  
  console.log(`  Using ${dependencyStories.length} dependency stories for context`);
  
  // Generate prompt
  const storyPrompt = await generateStoryPrompt(story, dependencyStories, analysisFiles);
  console.log(`  Generated prompt (${storyPrompt.length} characters)`);
  
  // Request story generation via LLM
  console.log('  🤖 Requesting story generation from AI...');
  const response = await generateText({
    prompt: storyPrompt,
    systemPrompt: STORY_GENERATION_SYSTEM_PROMPT,
    maxTokens: STORY_GENERATION_MAX_TOKENS
  });
  
  if (!response.text) {
    throw new Error('No story content received from AI');
  }
  
  console.log(`  ✅ Story generated (${response.text.length} characters)`);
  
  return response.text;
}

/**
 * Step 7: Create Jira issue
 * Converts markdown to ADF, creates issue as subtask of epic, adds blocker links
 */
export async function createJiraIssue(
  atlassianToken: string,
  cloudId: string,
  epicKey: string,
  projectKey: string,
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  storyContent: string,
  notify: (message: string, progress: number, level?: 'info' | 'debug' | 'warning' | 'error', addSteps?: number) => Promise<void>
): Promise<{ key: string; self: string }> {
  await notify('Creating Jira issue...', 7);
  
  console.log(`  Converting story to ADF...`);
  
  // Convert markdown to ADF
  const adfDocument = await convertMarkdownToAdf_NewContentOnly(storyContent);
  console.log(`  ✅ Converted to ADF (${JSON.stringify(adfDocument).length} characters)`);
  
  // Validate ADF
  const isValid = validateAdf(adfDocument);
  if (!isValid) {
    throw new Error(`Invalid ADF document generated`);
  }
  console.log(`  ✅ ADF validated successfully`);
  
  // Get the Story issue type ID from the project
  // We need the ID, not the name, for issue creation
  console.log(`  Fetching issue types for project ${projectKey}...`);
  const metadataUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      'Authorization': `Bearer ${atlassianToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text();
    throw new Error(`Failed to get issue metadata: ${metadataResponse.status} ${errorText}`);
  }
  
  const metadata = await metadataResponse.json() as any;
  const project = metadata.projects?.[0];
  
  // Try to find Story issue type, fallback to Task if not available
  let issueType = project?.issuetypes?.find((it: any) => it.name === "Story");
  
  if (!issueType) {
    console.log(`  Story issue type not found, falling back to Task...`);
    issueType = project?.issuetypes?.find((it: any) => it.name === "Task");
  }
  
  if (!issueType) {
    throw new Error(`Neither Story nor Task issue type found in project ${projectKey}. Available types: ${project?.issuetypes?.map((it: any) => it.name).join(', ')}`);
  }
  
  console.log(`  Found ${issueType.name} issue type with ID: ${issueType.id}`);
  
  // Create issue payload
  const issuePayload = {
    fields: {
      project: { key: projectKey },
      parent: { key: epicKey },
      summary: story.title,
      description: adfDocument,
      issuetype: { id: issueType.id }
    }
  };
  
  console.log(`  Creating Jira issue in project ${projectKey}...`);
  console.log(`  Summary: "${story.title}"`);
  console.log(`  Story object:`, JSON.stringify(story, null, 2));
  console.log(`  Issue payload:`, JSON.stringify(issuePayload, null, 2));
  
  // Create issue
  const createUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${atlassianToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(issuePayload)
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`  ❌ Jira API error response:`, errorText);
    console.error(`  Full request payload:`, JSON.stringify(issuePayload, null, 2));
    throw new Error(`Failed to create Jira issue: ${createResponse.status} ${createResponse.statusText}\n${errorText}`);
  }
  
  const createdIssue = await createResponse.json() as { key: string; self: string };
  console.log(`  ✅ Created issue: ${createdIssue.key}`);
  
  // Add blocker links for dependencies
  if (story.dependencies.length > 0) {
    console.log(`  Adding ${story.dependencies.length} dependency blocker links...`);
    
    for (const depId of story.dependencies) {
      // Find the dependency story to get its Jira key
      const depStory = allStories.find(s => s.id === depId);
      
      if (!depStory || !depStory.jiraUrl) {
        console.warn(`  ⚠️  Dependency ${depId} has no Jira URL, skipping link`);
        continue;
      }
      
      // Extract issue key from Jira URL
      // Format: https://bitovi.atlassian.net/browse/PROJ-123
      const keyMatch = depStory.jiraUrl.match(/browse\/([A-Z]+-\d+)/);
      if (!keyMatch) {
        console.warn(`  ⚠️  Could not extract issue key from URL: ${depStory.jiraUrl}`);
        continue;
      }
      
      const depKey = keyMatch[1];
      
      // Create blocker link
      const linkPayload = {
        type: {
          name: "Blocks"  // dependency blocks new story
        },
        inwardIssue: {
          key: createdIssue.key  // The story we just created
        },
        outwardIssue: {
          key: depKey  // The dependency story
        }
      };
      
      const linkUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issueLink`;
      const linkResponse = await fetch(linkUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${atlassianToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(linkPayload)
      });
      
      if (!linkResponse.ok) {
        const errorText = await linkResponse.text();
        console.warn(`  ⚠️  Failed to create blocker link to ${depKey}: ${linkResponse.status} ${errorText}`);
      } else {
        console.log(`  ✅ Added blocker link: ${depKey} blocks ${createdIssue.key}`);
      }
    }
  }
  
  return createdIssue;
}

/**
 * Step 8: Update epic with completion marker
 * Updates the shell story in the epic description to add Jira link and timestamp
 * Uses hybrid approach: Extract Shell Stories section to markdown, update, convert back to ADF
 */
export async function updateEpicWithCompletion(
  atlassianToken: string,
  cloudId: string,
  epicKey: string,
  epicMarkdown: string,
  story: ParsedShellStory,
  createdIssue: { key: string; self: string },
  notify: (message: string, progress: number, level?: 'info' | 'debug' | 'warning' | 'error', addSteps?: number) => Promise<void>
): Promise<void> {
  await notify('Updating epic with completion marker...', 8);
  
  console.log(`  Extracting Shell Stories section from epic...`);
  
  // Extract Shell Stories section from the epic markdown we already have
  const shellStoriesMatch = epicMarkdown.match(/## Shell Stories\n([\s\S]*?)(?=\n## |$)/);
  
  if (!shellStoriesMatch) {
    throw new Error(`Epic ${epicKey} does not contain a "## Shell Stories" section.`);
  }
  
  const shellStoriesMarkdown = shellStoriesMatch[0]; // Include the heading
  console.log(`  Shell Stories section extracted (${shellStoriesMarkdown.length} characters)`);
  
  // Update the specific story in markdown
  const jiraUrl = `https://bitovi.atlassian.net/browse/${createdIssue.key}`;
  const timestamp = new Date().toISOString();
  const updatedShellStoriesMarkdown = updateShellStoryInMarkdown(shellStoriesMarkdown, story.id, jiraUrl, timestamp);
  
  console.log(`  Updated story ${story.id} in markdown`);
  
  // Replace the Shell Stories section in the full epic markdown
  const updatedEpicMarkdown = epicMarkdown.replace(
    /## Shell Stories\n[\s\S]*?(?=\n## |$)/,
    updatedShellStoriesMarkdown
  );
  
  console.log(`  Rebuilt full epic markdown`);
  
  // Convert the entire updated markdown back to ADF
  const updatedAdf = await convertMarkdownToAdf_NewContentOnly(updatedEpicMarkdown);
  
  if (!validateAdf(updatedAdf)) {
    throw new Error('Invalid ADF generated from updated epic markdown');
  }
  
  console.log(`  Converted updated epic to ADF`);
  console.log(`  Updating epic ${epicKey} via Jira API...`);
  
  // Update epic via Jira API
  const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${atlassianToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        description: updatedAdf
      }
    })
  });
  
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Failed to update epic: ${updateResponse.status} ${updateResponse.statusText}\n${errorText}`);
  }
  
  console.log(`  ✅ Epic ${epicKey} updated successfully`);
}

/**
 * Helper: Update a story in markdown to add Jira URL and timestamp
 * Finds the story by ID and converts title from bold to link, adds timestamp
 * Format: - `ID` **Title** ⟩ Description → - `ID` [Title](URL) ⟩ Description _(timestamp)_
 */
function updateShellStoryInMarkdown(markdown: string, storyId: string, jiraUrl: string, timestamp: string): string {
  const lines = markdown.split('\n');
  
  // Find the line containing the story ID
  const storyLineIndex = lines.findIndex(line => {
    // Match pattern: "- `st001` **Title**" or similar
    const match = line.match(/^-\s+`([^`]+)`/);
    return match && match[1] === storyId;
  });
  
  if (storyLineIndex === -1) {
    throw new Error(`Story ${storyId} not found in Shell Stories markdown`);
  }
  
  // Update the line to convert bold title to link and add timestamp
  const originalLine = lines[storyLineIndex];
  
  // Check if already has a Jira URL (already processed)
  if (originalLine.includes('[') && originalLine.includes('](')) {
    console.warn(`  ⚠️  Story ${storyId} already has completion marker, replacing...`);
    // Already in link format, just update the URL and timestamp
    const linkMatch = originalLine.match(/^-\s+`([^`]+)`\s+\[([^\]]+)\]/);
    if (linkMatch) {
      const [, id, title] = linkMatch;
      lines[storyLineIndex] = `- \`${id}\` [${title}](${jiraUrl}) ⟩ _(${timestamp})_`;
    }
  } else {
    // Convert from bold format to link format
    // Pattern: - `st001` **Title** ⟩ Description
    const boldMatch = originalLine.match(/^-\s+`([^`]+)`\s+\*\*([^*]+)\*\*\s*⟩(.*)$/);
    
    if (boldMatch) {
      const [, id, title, rest] = boldMatch;
      // Preserve the description part (everything after ⟩)
      const description = rest.trim();
      // Add link and timestamp, keeping the description
      lines[storyLineIndex] = `- \`${id}\` [${title}](${jiraUrl}) ⟩ ${description} _(${timestamp})_`;
    } else {
      // Fallback: just append to the line
      lines[storyLineIndex] = `${originalLine.trim()} - ${jiraUrl} (Written: ${timestamp})`;
    }
  }
  
  return lines.join('\n');
}
