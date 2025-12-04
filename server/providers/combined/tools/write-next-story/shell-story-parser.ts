/**
 * Shell Story Parser
 * 
 * Parses shell stories from ADF or Markdown format in epic descriptions.
 * Prefer ADF parsing to preserve formatting (hardBreaks, etc.)
 */

import type { ADFNode } from '../../../atlassian/markdown-converter.js';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.js';

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
  for (const node of shellStoriesSection) {
    if (node.type === 'bulletList' && node.content) {
      // Each listItem is a shell story
      for (const listItem of node.content) {
        const story = parseShellStoryFromListItem(listItem);
        if (story) {
          stories.push(story);
        }
      }
    }
  }
  
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
  
  // Find the story's listItem
  for (const node of newSection) {
    if (node.type === 'bulletList' && node.content) {
      for (const listItem of node.content) {
        if (listItem.type === 'listItem' && listItem.content) {
          const id = extractStoryId(listItem.content);
          if (id === storyId) {
            // Find paragraph with title
            for (const para of listItem.content) {
              if (para.type === 'paragraph' && para.content) {
                let foundId = false;
                let foundSeparator = false;
                
                for (let i = 0; i < para.content.length; i++) {
                  const textNode = para.content[i];
                  
                  // Skip story ID
                  if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
                    foundId = true;
                    continue;
                  }
                  
                  // Add link mark to title text nodes (between ID and separator)
                  if (foundId && !foundSeparator && textNode.type === 'text') {
                    // Add link mark to existing marks
                    if (!textNode.marks) {
                      textNode.marks = [];
                    }
                    
                    // Check if already has link mark
                    const hasLink = textNode.marks.some(m => m.type === 'link');
                    if (!hasLink) {
                      textNode.marks.push({
                        type: 'link',
                        attrs: { href: issueUrl }
                      });
                    }
                  }
                  
                  // Mark separator found
                  if (textNode.type === 'text' && textNode.text?.includes('⟩')) {
                    foundSeparator = true;
                  }
                  
                  // Add timestamp after description (before any existing em mark)
                  if (foundSeparator && i === para.content.length - 1) {
                    // Check if timestamp already exists
                    const hasTimestamp = para.content.some(n => 
                      n.type === 'text' && hasMarkType(n, 'em')
                    );
                    
                    if (!hasTimestamp) {
                      // Add space + timestamp
                      para.content.push({
                        type: 'text',
                        text: ' '
                      });
                      para.content.push({
                        type: 'text',
                        text: `(${new Date().toISOString()})`,
                        marks: [{ type: 'em' }]
                      });
                    }
                  }
                }
              }
            }
            
            return newSection;
          }
        }
      }
    }
  }
  
  throw new Error(`Story ${storyId} not found in Shell Stories section`);
}

/**
 * Extract text content from ADF nodes (recursive)
 * @param nodes - ADF nodes to extract text from
 * @returns Plain text string
 */
function extractTextFromAdfNodes(nodes: ADFNode[] | undefined): string {
  if (!nodes) return '';
  
  let text = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      text += node.text || '';
    } else if (node.type === 'hardBreak') {
      text += '\n';
    } else if (node.content) {
      text += extractTextFromAdfNodes(node.content);
    }
  }
  return text;
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
function extractStoryId(itemContent: ADFNode[]): string | null {
  const para = itemContent.find(node => node.type === 'paragraph') ?? null;
  if (!para?.content) return null;
  
  for (const textNode of para.content) {
    if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
      const match = textNode.text?.match(/^st\d+$/);
      if (match) return match[0];
    }
  }
  return null;
}

/**
 * Extract title and check for completion marker
 * @param itemContent - List item content nodes
 * @returns Object with title and optional jiraUrl, or null if not found
 */
function extractTitleInfo(itemContent: ADFNode[]): { title: string, jiraUrl?: string } | null {
  const para = itemContent.find(node => node.type === 'paragraph') ?? null;
  if (!para?.content) return null;
  
  let foundId = false;
  let foundSeparator = false;
  let title = '';
  let jiraUrl: string | undefined;
  
  for (const textNode of para.content) {
    // Skip story ID (code mark)
    if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
      foundId = true;
      continue;
    }
    
    // Look for separator (⟩)
    if (textNode.type === 'text' && textNode.text?.includes('⟩')) {
      foundSeparator = true;
      const parts = textNode.text.split('⟩');
      if (parts[0]) title += parts[0].trim();
      break; // Title extraction ends at separator
    }
    
    // Collect title text (between ID and separator)
    if (foundId && !foundSeparator && textNode.type === 'text') {
      if (hasMarkType(textNode, 'link')) {
        jiraUrl = getMarkAttribute(textNode, 'link', 'href');
      }
      title += (textNode.text || '').trim() + ' ';
    }
  }
  
  return foundId && foundSeparator && title ? { title: title.trim(), jiraUrl } : null;
}

/**
 * Extract description from list item content
 * @param itemContent - List item content nodes
 * @returns Description text (text after ⟩ separator)
 */
function extractDescription(itemContent: ADFNode[]): string {
  const para = itemContent.find(node => node.type === 'paragraph') ?? null;
  if (!para?.content) return '';
  
  let foundSeparator = false;
  let description = '';
  
  for (const textNode of para.content) {
    if (textNode.type === 'text') {
      if (textNode.text?.includes('⟩')) {
        foundSeparator = true;
        const parts = textNode.text.split('⟩');
        if (parts[1]) description += parts[1].trim();
      } else if (foundSeparator && !hasMarkType(textNode, 'em')) {
        description += ' ' + (textNode.text || '').trim();
      }
    } else if (foundSeparator && textNode.type === 'hardBreak') {
      description += '\n';
    }
  }
  
  return description.trim();
}

/**
 * Extract items from nested bullet list matching a predicate
 * @param itemContent - List item content nodes
 * @param predicate - Function to test if paragraph content matches criteria
 * @param extractor - Function to extract items from matching paragraph content
 * @returns Array of extracted items
 */
function extractFromNestedList<T>(
  itemContent: ADFNode[],
  predicate: (paraContent: ADFNode[]) => boolean,
  extractor: (paraContent: ADFNode[]) => T[]
): T[] {
  const items: T[] = [];
  
  for (const node of itemContent) {
    if (node.type === 'bulletList' && node.content) {
      for (const listItem of node.content) {
        if (listItem.type === 'listItem' && listItem.content) {
          for (const para of listItem.content) {
            if (para.type === 'paragraph' && para.content && predicate(para.content)) {
              items.push(...extractor(para.content));
            }
          }
        }
      }
    }
  }
  
  return items;
}

/**
 * Extract screens from nested SCREENS list
 * @returns Array of Figma URLs
 */
function extractScreens(itemContent: ADFNode[]): string[] {
  return extractFromNestedList(
    itemContent,
    (content) => !!(content[0]?.type === 'text' && content[0].text?.includes('SCREENS:')),
    (content) => {
      const urls: string[] = [];
      for (const node of content) {
        if (node.type === 'text' && hasMarkType(node, 'link')) {
          const url = getMarkAttribute(node, 'link', 'href');
          if (url) urls.push(url);
        }
      }
      return urls;
    }
  );
}

/**
 * Extract dependencies from nested DEPENDENCIES list
 * @param itemContent - List item content nodes
 * @returns Array of dependency story IDs
 */
function extractDependencies(itemContent: ADFNode[]): string[] {
  return extractFromNestedList(
    itemContent,
    (content) => !!(content[0]?.type === 'text' && content[0].text?.includes('DEPENDENCIES:')),
    (content) => {
      const text = extractTextFromAdfNodes(content);
      const depsText = text.replace(/^DEPENDENCIES:\s*/, '').trim();
      return depsText.toLowerCase() === 'none' ? [] : depsText.split(',').map(d => d.trim()).filter(d => d);
    }
  );
}

/**
 * Parse a single shell story from listItem ADF node
 * @param listItem - ADF listItem node containing shell story
 * @returns Parsed shell story or null if invalid
 */
function parseShellStoryFromListItem(listItem: ADFNode): ParsedShellStoryADF | null {
  if (listItem.type !== 'listItem' || !listItem.content) return null;
  
  const storyId = extractStoryId(listItem.content);
  if (!storyId) {
    throw new Error('Shell story missing ID: Each story must start with a story ID like `st001`');
  }
  
  const titleInfo = extractTitleInfo(listItem.content);
  if (!titleInfo) {
    throw new Error(`Shell story ${storyId} missing title or separator (⟩): Format must be \`${storyId}\` **Title** ⟩ Description`);
  }
  
  const description = extractDescription(listItem.content);
  if (!description) {
    throw new Error(`Shell story ${storyId} missing description after separator (⟩)`);
  }
  
  // Convert entire listItem to markdown for AI prompts (preserves original formatting)
  const rawShellStoryMarkdown = convertAdfNodesToMarkdown([listItem]);
  
  return {
    id: storyId,
    title: titleInfo.title,
    description, // used to generate story prompt
    jiraUrl: titleInfo.jiraUrl, // used for completion checking
    screens: extractScreens(listItem.content), // Figma URLs, used in prompts
    dependencies: extractDependencies(listItem.content), // used for dependency blocker links when writing Jira stories
    rawShellStoryMarkdown, // used to generate story prompt
  };
}
