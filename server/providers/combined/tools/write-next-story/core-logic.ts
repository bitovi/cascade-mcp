/**
 * Core business logic for write-next-story tool
 * 
 * This module contains the pure business logic for writing the next Jira story
 * from shell stories. It is independent of MCP-specific concerns (authentication,
 * context, etc.) and can be used from both MCP handlers and REST API endpoints.
 * 
 * The logic orchestrates:
 * 1. Setting up Figma screens and fetching epic
 * 2. Extracting and parsing shell stories
 * 3. Finding the next unwritten story
 * 4. Validating dependencies
 * 5. Generating story content with AI
 * 6. Creating Jira issue as subtask with blocker links
 * 7. Updating epic with completion marker
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDependencies } from '../types.js';
import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import type { FigmaClient } from '../../../figma/figma-api-client.js';
import { getTempDir } from '../writing-shell-stories/temp-directory-manager.js';
import { setupFigmaScreens, type FigmaScreenSetupResult } from '../writing-shell-stories/figma-screen-setup.js';
import { regenerateScreenAnalyses } from '../writing-shell-stories/screen-analysis-regenerator.js';
import { parseShellStories, type ParsedShellStory } from './shell-story-parser.js';
import { 
  generateStoryPrompt, 
  STORY_GENERATION_SYSTEM_PROMPT, 
  STORY_GENERATION_MAX_TOKENS 
} from './prompt-story-generation.js';
import { 
  convertMarkdownToAdf, 
  validateAdf,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';

/**
 * Parameters for executing the write-next-story workflow
 */
export interface ExecuteWriteNextStoryParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

/**
 * Result from executing the write-next-story workflow
 */
export interface ExecuteWriteNextStoryResult {
  success: boolean;
  issueKey: string;
  issueSelf: string;
  storyTitle: string;
  epicKey: string;
}

/**
 * Execute the write-next-story workflow
 * 
 * This is the core business logic that can be called from both MCP handlers and REST API endpoints.
 * It uses dependency injection to abstract away authentication and LLM provider concerns.
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with created issue details
 */
export async function executeWriteNextStory(
  params: ExecuteWriteNextStoryParams,
  deps: ToolDependencies
): Promise<ExecuteWriteNextStoryResult> {
  const { epicKey, cloudId, siteName, sessionId = 'default' } = params;
  const { atlassianClient, figmaClient, generateText, notify } = deps;
  
  console.log('executeWriteNextStory called', { epicKey, cloudId, siteName });
  console.log('  Starting next story generation for epic:', epicKey);

  // Step 1: Setup Figma screens and fetch epic
  await notify(`Setting up epic and Figma screens...`);
  const { path: tempDirPath } = await getTempDir(sessionId, epicKey);
  
  const setupResult = await setupFigmaScreens({
    epicKey,
    atlassianClient,
    figmaClient,
    tempDirPath,
    cloudId,
    siteName,
    notify: async (msg) => await notify(msg)
  });
  
  console.log(`  ✅ Setup complete: ${setupResult.screens.length} screens, ${setupResult.figmaUrls.length} Figma URLs`);
  
  // Step 2-3: Extract shell stories from epic
  const shellStories = await extractShellStoriesFromSetup(setupResult, notify);
  console.log(`  Parsed ${shellStories.length} shell stories`);
  
  if (shellStories.length === 0) {
    throw new Error(`No shell stories found in epic ${epicKey}.`);
  }
  
  // Step 4: Find next unwritten story
  const nextStory = await findNextUnwrittenStory(shellStories, notify);
  
  if (!nextStory) {
    throw new Error(`All stories in epic ${epicKey} have been written! 🎉\n\nTotal stories: ${shellStories.length}`);
  }
  
  console.log(`  Next story to write: ${nextStory.id} - ${nextStory.title}`);
  
  // Step 5: Validate dependencies
  await validateDependencies(nextStory, shellStories, notify);
  console.log(`  All ${nextStory.dependencies.length} dependencies validated`);
  
  // Step 6: Generate story content
  const storyContent = await generateStoryContent(
    generateText,
    figmaClient,
    setupResult,
    tempDirPath,
    nextStory,
    shellStories,
    notify
  );
  console.log(`  Story content generated (${storyContent.length} characters)`);
  
  // Step 7: Create Jira issue
  const createdIssue = await createJiraIssue(
    atlassianClient,
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
    atlassianClient,
    setupResult.cloudId,
    setupResult.epicKey,
    setupResult.epicMarkdown,
    nextStory,
    createdIssue,
    notify
  );
  console.log(`  ✅ Epic updated with completion marker`);

  return {
    success: true,
    issueKey: createdIssue.key,
    issueSelf: createdIssue.self,
    storyTitle: nextStory.title,
    epicKey: setupResult.epicKey
  };
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
  notify: ToolDependencies['notify']
): Promise<ParsedShellStory[]> {
  await notify('Extracting shell stories...');
  
  // Extract Shell Stories section from the full epic markdown
  const shellStoriesMatch = setupResult.epicMarkdown.match(/## Shell Stories\n([\s\S]*?)(?=\n## |$)/);
  
  if (!shellStoriesMatch) {
    throw new Error(`Epic ${setupResult.epicKey} does not contain a "## Shell Stories" section.`);
  }

  const shellStoriesContent = shellStoriesMatch[1].trim();
  console.log('  Shell Stories section extracted');
  
  // Parse shell stories
  await notify('Parsing shell stories...');
  const shellStories = parseShellStories(shellStoriesContent);
  
  return shellStories;
}

/**
 * Step 4: Find next unwritten story
 */
export async function findNextUnwrittenStory(
  shellStories: ParsedShellStory[],
  notify: ToolDependencies['notify']
): Promise<ParsedShellStory | undefined> {
  await notify('Finding next unwritten story...');
  return shellStories.find(story => !story.jiraUrl);
}

/**
 * Step 5: Validate dependencies
 * Recursively checks all dependencies and their dependencies
 */
export async function validateDependencies(
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  notify: ToolDependencies['notify']
): Promise<void> {
  await notify('Validating dependencies...');
  
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
 * Loads analysis files and uses AI to generate complete Jira story
 * Regenerates missing analysis files automatically
 */
export async function generateStoryContent(
  generateText: ToolDependencies['generateText'],
  figmaClient: FigmaClient,
  setupResult: FigmaScreenSetupResult,
  tempDirPath: string,
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  notify: ToolDependencies['notify']
): Promise<string> {
  await notify('Generating story content...');
  
  console.log(`  Using temp directory: ${tempDirPath}`);
  
  // Check which analysis files exist and which are missing
  const screenInfo: Array<{ url: string; name: string; exists: boolean }> = [];
  
  for (const screenUrl of story.screens) {
    const matchingScreen = setupResult.screens.find(s => s.url === screenUrl);
    
    if (!matchingScreen) {
      console.warn(`  ⚠️  Screen URL not found in setup results: ${screenUrl}`);
      continue;
    }
    
    const screenName = matchingScreen.name;
    const analysisPath = path.join(tempDirPath, `${screenName}.analysis.md`);
    
    try {
      await fs.access(analysisPath);
      screenInfo.push({ url: screenUrl, name: screenName, exists: true });
      console.log(`  ✅ Found cached analysis: ${screenName}.analysis.md`);
    } catch {
      screenInfo.push({ url: screenUrl, name: screenName, exists: false });
      console.log(`  ⚠️  Missing analysis: ${screenName}.analysis.md`);
    }
  }
  
  // Regenerate missing analyses if needed
  const missingScreens = screenInfo.filter(s => !s.exists);
  
  if (missingScreens.length > 0) {
    console.log(`  Regenerating ${missingScreens.length} missing analysis files...`);
    
    await notify(`Regenerating ${missingScreens.length} missing screen analyses...`);
    
    const screensToAnalyze = setupResult.screens.filter(screen =>
      missingScreens.some(missing => screen.name === missing.name)
    );
    
    await regenerateScreenAnalyses({
      generateText,
      figmaClient,
      screens: screensToAnalyze,
      allFrames: setupResult.allFrames,
      allNotes: setupResult.allNotes,
      figmaFileKey: setupResult.figmaFileKey,
      tempDirPath,
      epicContext: setupResult.epicContext,
      notify: async (msg) => await notify(msg)
    });
    
    console.log(`  ✅ Regenerated ${missingScreens.length} analysis files`);
  }
  
  // Load all analysis files
  const analysisFiles: Array<{ screenName: string; content: string }> = [];
  
  for (const screen of screenInfo) {
    const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
    
    try {
      const analysisContent = await fs.readFile(analysisPath, 'utf-8');
      analysisFiles.push({ screenName: screen.name, content: analysisContent });
      console.log(`  ✅ Loaded analysis: ${screen.name}.analysis.md`);
    } catch (error: any) {
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
  atlassianClient: ToolDependencies['atlassianClient'],
  cloudId: string,
  epicKey: string,
  projectKey: string,
  story: ParsedShellStory,
  allStories: ParsedShellStory[],
  storyContent: string,
  notify: ToolDependencies['notify']
): Promise<{ key: string; self: string }> {
  await notify('Creating Jira issue...');
  
  console.log(`  Converting story to ADF...`);
  
  // Convert markdown to ADF
  const adfDocument = await convertMarkdownToAdf(storyContent);
  console.log(`  ✅ Converted to ADF (${JSON.stringify(adfDocument).length} characters)`);
  
  // Validate ADF
  const isValid = validateAdf(adfDocument);
  if (!isValid) {
    throw new Error(`Invalid ADF document generated`);
  }
  console.log(`  ✅ ADF validated successfully`);
  
  // Get the Story issue type ID from the project
  console.log(`  Fetching issue types for project ${projectKey}...`);
  const metadataUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`;
  const metadataResponse = await atlassianClient.fetch(metadataUrl, {
    headers: {
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
  
  // Create issue
  const createUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`;
  const createResponse = await atlassianClient.fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(issuePayload)
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`  ❌ Jira API error response:`, errorText);
    throw new Error(`Failed to create Jira issue: ${createResponse.status} ${createResponse.statusText}\n${errorText}`);
  }
  
  const createdIssue = await createResponse.json() as { key: string; self: string };
  console.log(`  ✅ Created issue: ${createdIssue.key}`);
  
  // Add blocker links for dependencies
  if (story.dependencies.length > 0) {
    console.log(`  Adding ${story.dependencies.length} dependency blocker links...`);
    
    for (const depId of story.dependencies) {
      const depStory = allStories.find(s => s.id === depId);
      
      if (!depStory || !depStory.jiraUrl) {
        console.warn(`  ⚠️  Dependency ${depId} has no Jira URL, skipping link`);
        continue;
      }
      
      // Extract issue key from Jira URL
      const keyMatch = depStory.jiraUrl.match(/browse\/([A-Z]+-\d+)/);
      if (!keyMatch) {
        console.warn(`  ⚠️  Could not extract issue key from URL: ${depStory.jiraUrl}`);
        continue;
      }
      
      const depKey = keyMatch[1];
      
      // Create blocker link
      const linkPayload = {
        type: { name: "Blocks" },
        inwardIssue: { key: createdIssue.key },
        outwardIssue: { key: depKey }
      };
      
      const linkUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issueLink`;
      const linkResponse = await atlassianClient.fetch(linkUrl, {
        method: 'POST',
        headers: {
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
 */
export async function updateEpicWithCompletion(
  atlassianClient: ToolDependencies['atlassianClient'],
  cloudId: string,
  epicKey: string,
  epicMarkdown: string,
  story: ParsedShellStory,
  createdIssue: { key: string; self: string },
  notify: ToolDependencies['notify']
): Promise<void> {
  await notify('Updating epic with completion marker...');
  
  console.log(`  Extracting Shell Stories section from epic...`);
  
  // Extract Shell Stories section
  const shellStoriesMatch = epicMarkdown.match(/## Shell Stories\n([\s\S]*?)(?=\n## |$)/);
  
  if (!shellStoriesMatch) {
    throw new Error(`Epic ${epicKey} does not contain a "## Shell Stories" section.`);
  }
  
  const shellStoriesMarkdown = shellStoriesMatch[0];
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
  const updatedAdf = await convertMarkdownToAdf(updatedEpicMarkdown);
  
  if (!validateAdf(updatedAdf)) {
    throw new Error('Invalid ADF generated from updated epic markdown');
  }
  
  console.log(`  Converted updated epic to ADF`);
  console.log(`  Updating epic ${epicKey} via Jira API...`);
  
  // Update epic via Jira API
  const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
  const updateResponse = await atlassianClient.fetch(updateUrl, {
    method: 'PUT',
    headers: {
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
 * Converts title from bold to link, adds timestamp
 */
function updateShellStoryInMarkdown(markdown: string, storyId: string, jiraUrl: string, timestamp: string): string {
  const lines = markdown.split('\n');
  
  // Find the line containing the story ID
  const storyLineIndex = lines.findIndex(line => {
    const match = line.match(/^-\s+`([^`]+)`/);
    return match && match[1] === storyId;
  });
  
  if (storyLineIndex === -1) {
    throw new Error(`Story ${storyId} not found in Shell Stories markdown`);
  }
  
  const originalLine = lines[storyLineIndex];
  
  // Check if already has a Jira URL
  if (originalLine.includes('[') && originalLine.includes('](')) {
    console.warn(`  ⚠️  Story ${storyId} already has completion marker, replacing...`);
    const linkMatch = originalLine.match(/^-\s+`([^`]+)`\s+\[([^\]]+)\]/);
    if (linkMatch) {
      const [, id, title] = linkMatch;
      lines[storyLineIndex] = `- \`${id}\` [${title}](${jiraUrl}) ⟩ _(${timestamp})_`;
    }
  } else {
    // Convert from bold format to link format
    const boldMatch = originalLine.match(/^-\s+`([^`]+)`\s+\*\*([^*]+)\*\*\s*⟩(.*)$/);
    
    if (boldMatch) {
      const [, id, title, rest] = boldMatch;
      const description = rest.trim();
      lines[storyLineIndex] = `- \`${id}\` [${title}](${jiraUrl}) ⟩ ${description} _(${timestamp})_`;
    } else {
      // Fallback: just append to the line
      lines[storyLineIndex] = `${originalLine.trim()} - ${jiraUrl} (Written: ${timestamp})`;
    }
  }
  
  return lines.join('\n');
}
