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
export interface ParsedShellStory {
  id: string;              // "st001"
  title: string;           // Story title
  description: string;     // One-sentence description
  jiraUrl?: string;        // URL if already written
  timestamp?: string;      // ISO 8601 timestamp if written
  screens: string[];       // Figma URLs
  dependencies: string[];  // Array of story IDs
  included: string[];      // ☐ bullets
  lowPriority: string[];   // ⏬ bullets
  excluded: string[];      // ❌ bullets
  questions: string[];     // ❓ bullets
  rawContent: string;     // Original markdown for AI prompts
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
): ParsedShellStory[] {
  const stories: ParsedShellStory[] = [];
  
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
 * const updated = addCompletionMarkerToStory(
 *   shellStoriesSection,
 *   "st001",
 *   "PROJ-123",
 *   "https://bitovi.atlassian.net/browse/PROJ-123"
 * );
 */
export function addCompletionMarkerToStory(
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
 * Find first paragraph in list item content
 * @param itemContent - List item content nodes
 * @returns First paragraph node or null
 */
function findFirstParagraph(itemContent: ADFNode[]): ADFNode | null {
  return itemContent.find(node => node.type === 'paragraph') ?? null;
}

/**
 * Extract story ID (e.g., "st001") from list item content
 * @param itemContent - List item content nodes
 * @returns Story ID or null if not found
 */
function extractStoryId(itemContent: ADFNode[]): string | null {
  const para = findFirstParagraph(itemContent);
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
 * @returns Object with title, optional jiraUrl and timestamp, or null if not found
 */
function extractTitleInfo(itemContent: ADFNode[]): { title: string, jiraUrl?: string, timestamp?: string } | null {
  const para = findFirstParagraph(itemContent);
  if (!para?.content) return null;
  
  let foundId = false;
  let foundSeparator = false;
  let title = '';
  let jiraUrl: string | undefined;
  let timestamp: string | undefined;
  
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
  
  // Extract timestamp (em mark after separator)
  for (const textNode of para.content) {
    if (textNode.type === 'text' && hasMarkType(textNode, 'em')) {
      const match = textNode.text?.match(/\(([^)]+)\)/);
      if (match) timestamp = match[1];
    }
  }
  
  return foundId && foundSeparator && title ? { title: title.trim(), jiraUrl, timestamp } : null;
}

/**
 * Extract description from list item content
 * @param itemContent - List item content nodes
 * @returns Description text (text after ⟩ separator)
 */
function extractDescription(itemContent: ADFNode[]): string {
  const para = findFirstParagraph(itemContent);
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
 * Extract items from nested list by keyword prefix
 * @param itemContent - List item content nodes
 * @param keyword - Keyword to search for in paragraph text
 * @param parser - Function to parse text content into array of items
 * @returns Array of parsed items
 */
function extractByKeyword(itemContent: ADFNode[], keyword: string, parser: (text: string) => string[]): string[] {
  return extractFromNestedList(
    itemContent,
    (content) => !!(content[0]?.type === 'text' && content[0].text?.includes(keyword)),
    (content) => parser(extractTextFromAdfNodes(content))
  );
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
  return extractByKeyword(itemContent, 'DEPENDENCIES:', (text) => {
    const depsText = text.replace(/^DEPENDENCIES:\s*/, '').trim();
    return depsText.toLowerCase() === 'none' ? [] : depsText.split(',').map(d => d.trim()).filter(d => d);
  });
}

/**
 * Extract emoji-prefixed items from nested list
 * @param itemContent - List item content nodes
 * @param emoji - Emoji prefix to search for (e.g., '☐', '⏬', '❌', '❓')
 * @returns Array of items with emoji prefix removed
 */
function extractEmojiItems(itemContent: ADFNode[], emoji: string): string[] {
  return extractFromNestedList(
    itemContent,
    (content) => extractTextFromAdfNodes(content).startsWith(emoji),
    (content) => [extractTextFromAdfNodes(content).replace(new RegExp(`^${emoji}\\s*`), '')]
  );
}

/**
 * Parse a single shell story from listItem ADF node
 * @param listItem - ADF listItem node containing shell story
 * @returns Parsed shell story or null if invalid
 */
function parseShellStoryFromListItem(listItem: ADFNode): ParsedShellStory | null {
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
  const rawContent = convertAdfNodesToMarkdown([listItem]);
  
  return {
    id: storyId,
    title: titleInfo.title,
    description,
    jiraUrl: titleInfo.jiraUrl,
    timestamp: titleInfo.timestamp,
    screens: extractScreens(listItem.content),
    dependencies: extractDependencies(listItem.content),
    included: extractEmojiItems(listItem.content, '☐'),
    lowPriority: extractEmojiItems(listItem.content, '⏬'),
    excluded: extractEmojiItems(listItem.content, '❌'),
    questions: extractEmojiItems(listItem.content, '❓'),
    rawContent,
  };
}

// ============================================================================
// Deprecated Markdown Parser
// ============================================================================
/**
 * Parsed shell story structure
 */
export interface ParsedShellStoryDeprecated {
  id: string;              // "st001"
  title: string;           // Story title
  description: string;     // One-sentence description
  jiraUrl?: string;        // URL if already written
  timestamp?: string;      // ISO 8601 timestamp if written
  screens: string[];       // Figma URLs
  dependencies: string[];  // Array of story IDs
  included: string[];      // ☐ bullets
  lowPriority: string[];   // ⏬ bullets
  excluded: string[];      // ❌ bullets
  questions: string[];     // ❓ bullets
  rawContent: string;     // Full markdown for this story 
}

/**
 * Parse shell stories from markdown content
 * 
 * @deprecated Recommend using ADF-based parser `parseShellStoriesFromAdf` instead to preserve formatting.
 * 
 * Expected format:
 * - `st001` **Title** ⟩ Description
 * - `st001` Title ⟩ Description (bold optional)
 * - `st001` **[Title](url)** ⟩ Description _(timestamp)_
 *   * SCREENS: [screen1](url1), [screen2](url2)
 *   * DEPENDENCIES: st002, st003
 *   * ☐ Included item
 *   * ⏬ Low priority item
 *   * ❌ Excluded item
 *   * ❓ Question
 * 
 * @param shellStoriesContent - Markdown content of Shell Stories section
 * @returns Array of parsed shell stories
 */
export function parseShellStories(shellStoriesContent: string): ParsedShellStoryDeprecated[] {
  const stories: ParsedShellStoryDeprecated[] = [];
  
  // Split by top-level bullets (stories start with -)
  const storyBlocks = shellStoriesContent.split(/\n- /);
  
  for (const block of storyBlocks) {
    if (!block.trim()) continue;
    
    const lines = block.split('\n');
    const firstLine = lines[0];
    
    // Parse first line: `st001` **[Title](url)** ⟩ Description _(timestamp)_
    // or: `st001` **Title** ⟩ Description
    // or: `st001` Title ⟩ Description (bold is optional)
    const storyIdMatch = firstLine.match(/`(st\d+)`/);
    if (!storyIdMatch) continue;
    
    const storyId = storyIdMatch[1];
    
    // Extract title and description using ⟩ separator
    // First, get everything after the story ID (after the closing backtick)
    // Find the position of the closing backtick by getting the end of the match
    const storyIdEndPos = storyIdMatch.index! + storyIdMatch[0].length;
    const afterId = firstLine.substring(storyIdEndPos).trim();
    
    // Split by ⟩ separator
    const separatorMatch = afterId.match(/^(.+?)\s*⟩\s*(.+)$/);
    if (!separatorMatch) continue; // Skip if no separator found
    
    let titlePart = separatorMatch[1].trim();
    const descriptionPart = separatorMatch[2].trim();
    
    // Extract title and optional Jira URL from title part
    let title = '';
    let jiraUrl: string | undefined;
    
    // Check for link format: **[Title](url)** or [Title](url)
    const titleWithLinkMatch = titlePart.match(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*|\[([^\]]+)\]\(([^)]+)\)/);
    if (titleWithLinkMatch) {
      // Groups 1,2 for bold link, groups 3,4 for plain link
      title = titleWithLinkMatch[1] || titleWithLinkMatch[3];
      jiraUrl = titleWithLinkMatch[2] || titleWithLinkMatch[4];
    } else {
      // No link, just text - strip optional bold formatting
      title = titlePart.replace(/^\*\*(.+)\*\*$/, '$1').trim();
    }
    
    // Extract description and optional timestamp
    // Description might end with _(timestamp)_
    const timestampMatch = descriptionPart.match(/^(.+?)\s*_\(([^)]+)\)_\s*$/);
    const description = timestampMatch ? timestampMatch[1].trim() : descriptionPart;
    const timestamp = timestampMatch ? timestampMatch[2] : undefined;
    
    // Parse sub-bullets
    const screens: string[] = [];
    const dependencies: string[] = [];
    const included: string[] = [];
    const lowPriority: string[] = [];
    const excluded: string[] = [];
    const questions: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('* SCREENS:') || line.startsWith('- SCREENS:')) {
        // Extract Figma URLs from markdown links
        const urlMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
        for (const match of urlMatches) {
          screens.push(match[2]); // URL
        }
      } else if (line.startsWith('* DEPENDENCIES:') || line.startsWith('- DEPENDENCIES:')) {
        const depsText = line.replace(/^[*-]\s*DEPENDENCIES:\s*/, '');
        if (depsText.toLowerCase() !== 'none') {
          dependencies.push(...depsText.split(',').map(d => d.trim()).filter(d => d));
        }
      } else if (line.startsWith('* ☐') || line.startsWith('- ☐')) {
        included.push(line.replace(/^[*-]\s*☐\s*/, ''));
      } else if (line.startsWith('* ⏬') || line.startsWith('- ⏬')) {
        lowPriority.push(line.replace(/^[*-]\s*⏬\s*/, ''));
      } else if (line.startsWith('* ❌') || line.startsWith('- ❌')) {
        excluded.push(line.replace(/^[*-]\s*❌\s*/, ''));
      } else if (line.startsWith('* ❓') || line.startsWith('- ❓')) {
        questions.push(line.replace(/^[*-]\s*❓\s*/, ''));
      }
    }
    
    stories.push({
      id: storyId,
      title,
      description,
      jiraUrl,
      timestamp,
      screens,
      dependencies,
      included,
      lowPriority,
      excluded,
      questions,
      rawContent: block.trim(),
    });
  }
  
  return stories;
}
