/**
 * ADF-Based Shell Story Parser
 * 
 * Parses shell stories directly from ADF nodes without lossy Markdown conversion.
 * Preserves hardBreak nodes (Shift+Enter) and all other ADF formatting.
 */

import type { ADFNode, ADFDocument } from '../../../atlassian/markdown-converter.js';
import { extractADFSection } from '../../../atlassian/markdown-converter.js';

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
  rawAdf?: ADFNode[];      // Original ADF nodes for this story
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
 * Extract story ID from list item content
 * @param itemContent - ADF nodes within listItem
 * @returns Story ID (e.g., "st001") or null
 */
function extractStoryId(itemContent: ADFNode[]): string | null {
  for (const node of itemContent) {
    if (node.type === 'paragraph' && node.content) {
      for (const textNode of node.content) {
        if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
          const match = textNode.text?.match(/^st\d+$/);
          if (match) return match[0];
        }
      }
    }
  }
  return null;
}

/**
 * Extract title and check for completion marker
 * @param itemContent - ADF nodes within listItem
 * @returns { title, jiraUrl, timestamp } or null
 */
function extractTitleInfo(itemContent: ADFNode[]): { title: string, jiraUrl?: string, timestamp?: string } | null {
  for (const node of itemContent) {
    if (node.type === 'paragraph' && node.content) {
      let foundId = false;
      let foundSeparator = false;
      let title = '';
      let jiraUrl: string | undefined;
      let timestamp: string | undefined;
      
      for (let i = 0; i < node.content.length; i++) {
        const textNode = node.content[i];
        
        // Skip story ID (code mark)
        if (textNode.type === 'text' && hasMarkType(textNode, 'code')) {
          foundId = true;
          continue;
        }
        
        // Look for separator (⟩)
        if (textNode.type === 'text' && textNode.text?.includes('⟩')) {
          foundSeparator = true;
          // Split on separator - part before is title, part after is description
          const parts = textNode.text.split('⟩');
          if (parts[0]) {
            title += parts[0].trim();
          }
          break; // Title extraction ends at separator
        }
        
        // Collect title text (between ID and separator)
        if (foundId && !foundSeparator && textNode.type === 'text') {
          // Check for link mark (completion marker)
          if (hasMarkType(textNode, 'link')) {
            jiraUrl = getMarkAttribute(textNode, 'link', 'href');
          }
          
          // Check for strong mark (bold title)
          const text = textNode.text || '';
          title += text.trim() + ' ';
        }
      }
      
      // Extract timestamp (em mark after separator)
      for (let i = 0; i < node.content.length; i++) {
        const textNode = node.content[i];
        if (textNode.type === 'text' && hasMarkType(textNode, 'em')) {
          // Timestamp format: (2025-01-15T10:30:00Z)
          const match = textNode.text?.match(/\(([^)]+)\)/);
          if (match) {
            timestamp = match[1];
          }
        }
      }
      
      if (foundId && foundSeparator && title) {
        return { title: title.trim(), jiraUrl, timestamp };
      }
    }
  }
  return null;
}

/**
 * Extract description from list item content
 * @param itemContent - ADF nodes within listItem
 * @returns Description text
 */
function extractDescription(itemContent: ADFNode[]): string {
  for (const node of itemContent) {
    if (node.type === 'paragraph' && node.content) {
      let foundSeparator = false;
      let description = '';
      
      for (const textNode of node.content) {
        if (textNode.type === 'text') {
          if (textNode.text?.includes('⟩')) {
            foundSeparator = true;
            // Get part after separator
            const parts = textNode.text.split('⟩');
            if (parts[1]) {
              description += parts[1].trim();
            }
          } else if (foundSeparator) {
            // Skip timestamp (em mark)
            if (!hasMarkType(textNode, 'em')) {
              description += ' ' + (textNode.text || '').trim();
            }
          }
        } else if (foundSeparator && textNode.type === 'hardBreak') {
          description += '\n';
        }
      }
      
      return description.trim();
    }
  }
  return '';
}

/**
 * Extract screens from nested SCREENS list
 * @param itemContent - ADF nodes within listItem
 * @returns Array of Figma URLs
 */
function extractScreens(itemContent: ADFNode[]): string[] {
  const screens: string[] = [];
  
  for (const node of itemContent) {
    if (node.type === 'bulletList' && node.content) {
      for (const listItem of node.content) {
        if (listItem.type === 'listItem' && listItem.content) {
          for (const para of listItem.content) {
            if (para.type === 'paragraph' && para.content) {
              // Check if this is SCREENS: line
              const firstText = para.content[0];
              if (firstText?.type === 'text' && firstText.text?.includes('SCREENS:')) {
                // Extract URLs from link marks
                for (const textNode of para.content) {
                  if (textNode.type === 'text' && hasMarkType(textNode, 'link')) {
                    const url = getMarkAttribute(textNode, 'link', 'href');
                    if (url) screens.push(url);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  return screens;
}

/**
 * Extract dependencies from nested DEPENDENCIES list
 * @param itemContent - ADF nodes within listItem
 * @returns Array of story IDs
 */
function extractDependencies(itemContent: ADFNode[]): string[] {
  const dependencies: string[] = [];
  
  for (const node of itemContent) {
    if (node.type === 'bulletList' && node.content) {
      for (const listItem of node.content) {
        if (listItem.type === 'listItem' && listItem.content) {
          for (const para of listItem.content) {
            if (para.type === 'paragraph' && para.content) {
              const firstText = para.content[0];
              if (firstText?.type === 'text' && firstText.text?.includes('DEPENDENCIES:')) {
                // Extract text after DEPENDENCIES:
                const text = extractTextFromAdfNodes(para.content);
                const depsText = text.replace(/^DEPENDENCIES:\s*/, '').trim();
                if (depsText.toLowerCase() !== 'none') {
                  dependencies.push(...depsText.split(',').map(d => d.trim()).filter(d => d));
                }
              }
            }
          }
        }
      }
    }
  }
  
  return dependencies;
}

/**
 * Extract emoji-prefixed items from nested list
 * @param itemContent - ADF nodes within listItem
 * @param emoji - Emoji to match (☐, ⏬, ❌, ❓)
 * @returns Array of item texts
 */
function extractEmojiItems(itemContent: ADFNode[], emoji: string): string[] {
  const items: string[] = [];
  
  for (const node of itemContent) {
    if (node.type === 'bulletList' && node.content) {
      for (const listItem of node.content) {
        if (listItem.type === 'listItem' && listItem.content) {
          for (const para of listItem.content) {
            if (para.type === 'paragraph' && para.content) {
              const text = extractTextFromAdfNodes(para.content);
              if (text.startsWith(emoji)) {
                items.push(text.replace(new RegExp(`^${emoji}\\s*`), ''));
              }
            }
          }
        }
      }
    }
  }
  
  return items;
}

/**
 * Parse a single shell story from listItem ADF node
 * @param listItem - ADF listItem node
 * @returns Parsed shell story or null if invalid
 */
function parseShellStoryFromListItem(listItem: ADFNode): ParsedShellStory | null {
  if (listItem.type !== 'listItem' || !listItem.content) {
    return null;
  }
  
  // Extract story ID
  const storyId = extractStoryId(listItem.content);
  if (!storyId) {
    throw new Error('Shell story missing ID: Each story must start with a story ID like `st001`');
  }
  
  // Extract title and completion info
  const titleInfo = extractTitleInfo(listItem.content);
  if (!titleInfo) {
    throw new Error(`Shell story ${storyId} missing title or separator (⟩): Format must be \`${storyId}\` **Title** ⟩ Description`);
  }
  
  // Extract description
  const description = extractDescription(listItem.content);
  if (!description) {
    throw new Error(`Shell story ${storyId} missing description after separator (⟩)`);
  }
  
  // Extract nested lists
  const screens = extractScreens(listItem.content);
  const dependencies = extractDependencies(listItem.content);
  const included = extractEmojiItems(listItem.content, '☐');
  const lowPriority = extractEmojiItems(listItem.content, '⏬');
  const excluded = extractEmojiItems(listItem.content, '❌');
  const questions = extractEmojiItems(listItem.content, '❓');
  
  return {
    id: storyId,
    title: titleInfo.title,
    description,
    jiraUrl: titleInfo.jiraUrl,
    timestamp: titleInfo.timestamp,
    screens,
    dependencies,
    included,
    lowPriority,
    excluded,
    questions,
    rawAdf: listItem.content,
  };
}

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
 * Extract Shell Stories section and parse it
 * @param epicDescription - Full epic description ADF
 * @returns Parsed shell stories
 * 
 * @example
 * const stories = extractAndParseShellStories(epicDescription);
 */
export function extractAndParseShellStories(
  epicDescription: ADFDocument
): ParsedShellStory[] {
  const { section } = extractADFSection(epicDescription.content, 'Shell Stories');
  
  if (section.length === 0) {
    return []; // No Shell Stories section
  }
  
  return parseShellStoriesFromAdf(section);
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
