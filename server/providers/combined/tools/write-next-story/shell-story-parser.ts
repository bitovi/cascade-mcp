/**
 * Shell Story Parser
 * 
 * Parses shell stories from ADF or Markdown format in epic descriptions.
 * Prefer ADF parsing to preserve formatting (hardBreaks, etc.)
 */

import type { ADFNode } from '../../../atlassian/markdown-converter.js';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.js';

/** ADFNode that is guaranteed to have a content property */
type ADFNodeWithContent = ADFNode & { content: ADFNode[] };

/**
 * Parsed shell story structure
 */
export interface ParsedShellStoryADF {
  id: string;              // "st001"
  title: string;           // Story title
  description: string;     // One-sentence description
  jiraUrl?: string;        // URL if already written
  screens: string[];       // Figma URLs
  dependencies: string[];  // Array of story IDs
  rawShellStoryMarkdown: string;     // Original markdown for AI prompts
}

// ============================================================================
// ADF-Based Parsing (Preferred - Preserves Formatting)
// ============================================================================

/**
 * Parse shell stories from ADF bullet list structure
 * @param shellStoriesSection - ADF nodes containing Shell Stories section (including heading)
 * @returns Array of parsed shell stories
 * 
 * @example
 * const { section } = extractAdfSection(epicDescription.content, "Shell Stories");
 * const stories = parseShellStoriesFromAdf(section);
 */
export function parseShellStoriesFromAdf(
  shellStoriesSection: ADFNode[]
): ParsedShellStoryADF[] {
  const stories: ParsedShellStoryADF[] = [];
  
  // Find bulletList nodes in section
  forEachWithContent(shellStoriesSection, { type: 'bulletList' }, (bulletList) => {
    forEachWithContent(bulletList.content, { type: 'listItem' }, (listItem) => {
      const story = parseShellStoryFromListItem(listItem);
      if (story) stories.push(story);
    });
  });
  
  return stories;
}

/**
 * Add completion marker to shell story in ADF
 * 
 * Adds a link mark to the title text node and appends a timestamp.
 * Format: `st001` **[Title](https://url)** ⟩ Description _(2025-01-15T10:30:00Z)_
 * 
 * @param shellStoriesSection - Shell Stories ADF nodes (including heading)
 * @param storyId - Story ID to mark (e.g., "st001")
 * @param issueKey - Jira issue key (e.g., "PROJ-123")
 * @param issueUrl - Jira issue URL
 * @returns New section with marker added
 * 
 * @example
 * const updated = addCompletionMarkerToShellStory(
 *   shellStoriesSection,
 *   "st001",
 *   "PROJ-123",
 *   "https://bitovi.atlassian.net/browse/PROJ-123"
 * );
 */
export function addCompletionMarkerToShellStory(
  shellStoriesSection: ADFNode[],
  storyId: string,
  issueKey: string,
  issueUrl: string
): ADFNode[] {
  // Deep clone to avoid mutations
  const newSection = structuredClone(shellStoriesSection);
  
  let storyFound = false;
  forEachWithContent(newSection, { type: 'bulletList' }, (bulletList) => {
    forEachWithContent(bulletList.content, { type: 'listItem' }, (listItem) => {
      const id = extractNestedStoryId(listItem.content);
      if (id !== storyId) return;
      storyFound = true;
      forEachWithContent(listItem.content, { type: 'paragraph' }, (paragraph) => {
        const { titleNode, timestamp } = extractTitleParts(paragraph.content);
        if (!titleNode) throw new Error(`Title not found for story ${storyId}`);

        addLinkToNode(titleNode, issueUrl);
        if (timestamp) {
          timestamp.text = `(${new Date().toISOString()})`;
        } else  {
          paragraph.content.push({ type: 'text', text: ' ' });
          paragraph.content.push({ type: 'text', text: `(${new Date().toISOString()})`, marks: [{ type: 'em' }] });
        }
      });
    });
  });
  if (!storyFound) {
    throw new Error(`Story ${storyId} not found in Shell Stories section`);
  }
  return newSection;
}

// Type predicate: checks if a node has content property
function isNodeWithContent(node: ADFNode): node is ADFNodeWithContent {
  return !!node.content;
}

// Generic helper: iterate nodes with matching type that have content.
// Accepts an optional `predicate` on the `match` object to further filter
// matching nodes (for example: only paragraphs that contain a `text` node).
function forEachWithContent(
  source: ADFNode[] | ADFNode,
  match: { type: string; predicate?: (node: ADFNodeWithContent) => boolean },
  callback: (node: ADFNodeWithContent) => void
): void {
  const nodes = Array.isArray(source) ? source : [source];
  for (const node of nodes) {
    if (node.type === match.type && isNodeWithContent(node)) {
      if (!match.predicate || match.predicate(node)) callback(node);
    }
  }
}

/**
 * Extract all title parts from paragraph content: ID, title nodes, timestamp
 * Also extracts title string and jiraUrl for convenience
 * @param content - Paragraph content nodes
 * @returns Object with nodes and extracted string values
 */
function extractTitleParts(content: ADFNode[]): {
  titleNode?: ADFNode;
  titleString: string;
  storyId?: ADFNode;
  descriptionString?: string;
  timestamp?: ADFNode;
  jiraUrl?: string;
} {
  let titleNode: ADFNode | undefined = undefined;
  let storyId: ADFNode | undefined = undefined;
  let timestamp: ADFNode | undefined = undefined;
  let titleString = '';
  let descriptionString = '';
  let jiraUrl: string | undefined;

  let afterId = false;
  let afterSeparator = false;
  for (const node of content) {
    // Find story ID
    if (node.type === 'text' && hasMarkType(node, 'code') && node.text?.match(/^st\d+$/)) {
      storyId = node;
      afterId = true;
      continue; // Move to next node
    }
    
    // Find separator (marks end of title and start of description)
    if (node.type === 'text' && node.text?.includes('⟩')) {
      afterSeparator = true;
    }
    
    // Collect title nodes (between ID and separator)
    if (afterId && !afterSeparator && node.type === 'text' && !hasMarkType(node, 'em')) {
      titleNode = node;
      titleString = (node.text || '');
      if (hasMarkType(node, 'link')) {
        jiraUrl = getMarkAttribute(node, 'link', 'href');
      }
      continue; // to next node
    }

    // Collect description node (after separator & before timestamp)
    if (afterSeparator && node.type === 'text' && !hasMarkType(node, 'em')) {
      // remove separator from start of description
      let descText = node.text || '';
      if (descText.startsWith('⟩')) {
        descText = descText.replace('⟩', '').trimStart();
      }
      descriptionString = descText;
      continue; // to next node
    }

    // Find timestamp (can appear anywhere, but typically after separator)
    if (node.type === 'text' && hasMarkType(node, 'em')) {
      timestamp = node;
    }
  }
  titleString = titleString.trim();
  return { titleNode, storyId, timestamp, titleString, jiraUrl, descriptionString };
}

// Add link mark to a text node
function addLinkToNode(textNode: ADFNode, url: string): void {
  if (textNode.type !== 'text') return;
  if (!textNode.marks) textNode.marks = [];
  const hasLink = textNode.marks.some(m => m.type === 'link');
  if (!hasLink) textNode.marks.push({ type: 'link', attrs: { href: url } });
}

/**
 * Check if a text node has a specific mark type
 * @param node - ADF text node
 * @param markType - Mark type to check ('strong', 'code', 'link', 'em', etc.)
 * @returns True if node has the mark
 */
function hasMarkType(node: ADFNode, markType: string): boolean {
  return node.marks?.some(mark => mark.type === markType) ?? false;
}

/**
 * Get mark attribute value
 * @param node - ADF text node
 * @param markType - Mark type to find
 * @param attrName - Attribute name
 * @returns Attribute value or undefined
 */
function getMarkAttribute(node: ADFNode, markType: string, attrName: string): string | undefined {
  const mark = node.marks?.find(m => m.type === markType);
  return mark?.attrs?.[attrName];
}

/**
 * Extract story ID (e.g., "st001") from list item content
 * @param itemContent - List item content nodes
 * @returns Story ID or null if not found
 */
function extractNestedStoryId(itemContent: ADFNode[]): string | null {
  let foundId: string | null = null;
  forEachWithContent(itemContent, { type: 'paragraph' }, (paragraph) => {
    if (foundId) return; // Already found, skip remaining paragraphs
    for (const textNode of paragraph.content) {
      if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
        const match = textNode.text?.match(/^st\d+$/);
        if (match) {
          foundId = match[0];
          return;
        }
      }
    }
  });
  return foundId;
}

/**
 * Extract screens from nested SCREENS list
 * @returns Array of Figma URLs
 */
function extractScreens(itemContent: ADFNode[]): string[] {
  const urls: string[] = [];
  forEachWithContent(itemContent, { type: 'bulletList' }, (bulletList) => {
    forEachWithContent(bulletList.content, { type: 'listItem' }, (listItem) => {
      forEachWithContent(listItem.content, { type: 'paragraph' }, (paragraph) => {
        const content = paragraph.content ?? [];
        const first = content[0];
        const isScreens = first?.type === 'text' && !!first.text && first.text.includes('SCREENS:');
        if (!isScreens) return;
        for (const node of content) {
          if (node.type === 'text' && hasMarkType(node, 'link')) {
            const url = getMarkAttribute(node, 'link', 'href');
            if (url) urls.push(url);
          }
        }
      });
    });
  });
  return urls;
}

/**
 * Extract dependencies from nested DEPENDENCIES list
 * Handles hardBreak nodes correctly (unlike markdown conversion)
 * @param itemContent - List item content nodes
 * @returns Array of dependency story IDs
 */
function extractDependencies(itemContent: ADFNode[]): string[] {
  const dependencyIds: string[] = [];
  forEachWithContent(itemContent, { type: 'bulletList' }, (bulletList) => {
    forEachWithContent(bulletList.content, { type: 'listItem' }, (listItem) => {
      forEachWithContent(listItem.content, { type: 'paragraph' }, (paragraph) => {
        const content = paragraph.content ?? [];
        const firstNode = content[0];

        const isDependenciesLine = firstNode?.type === 'text' && !!firstNode.text && firstNode.text.includes('DEPENDENCIES:');
        if (!isDependenciesLine) return;

        // Extract dependencies directly from nodes (preserves hardBreak semantics)
        // Collect all text nodes, treating hardBreak as separator
        for (const node of content) {
          if (node.type === 'text') {
            const text = (node.text || '').replace(/^DEPENDENCIES:\s*/, '').trim();
            if (text && text.toLowerCase() !== 'none') {
              // Split on comma and hardBreak (next node will be after hardBreak)
              for (const dep of text.split(',')) {
                const value = dep.trim();
                if (value) dependencyIds.push(value);
              }
            }
          }
        }
      });
    });
  });
  return dependencyIds;
}

/**
 * Parse a single shell story from listItem ADF node
 * @param listItem - ADF listItem node containing shell story
 * @returns Parsed shell story or null if invalid
 */
function parseShellStoryFromListItem(listItem: ADFNode): ParsedShellStoryADF | null {
  if (listItem.type !== 'listItem' || !listItem.content) {
    throw new Error('Shell story missing ID: Each story must start with a story ID like `st001`');
  }
  
  const firstParagraph = listItem.content.find(node => node.type === 'paragraph');
  if (!firstParagraph?.content) {
    throw new Error('Shell story missing ID: Each story must start with a story ID like `st001`');
  }
  
  const {titleString, storyId, jiraUrl, descriptionString} = extractTitleParts(firstParagraph.content);
  if (!storyId) {
    throw new Error('Shell story missing ID: Each story must start with a story ID like `st001`');
  }
  
  if (!titleString) {
    throw new Error(`Shell story ${storyId} missing title or separator (⟩): Format must be \`${storyId}\` **Title** ⟩ Description`);
  }
  
  if (!descriptionString) {
    throw new Error(`Shell story ${storyId} missing description after separator (⟩)`);
  }
  
  // Convert entire listItem to markdown for AI prompts (preserves original formatting)
  const rawShellStoryMarkdown = convertAdfNodesToMarkdown([listItem]);
  
  return {
    id: storyId.text || '',
    title: titleString,
    description: descriptionString, // used to generate story prompt
    jiraUrl: jiraUrl, // used for completion checking
    screens: extractScreens(listItem.content), // Figma URLs, used in prompts
    dependencies: extractDependencies(listItem.content), // used for dependency blocker links when writing Jira stories
    rawShellStoryMarkdown, // used to generate story prompt
  };
}
