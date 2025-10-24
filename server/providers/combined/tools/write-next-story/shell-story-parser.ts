/**
 * Shell Story Parser
 * 
 * Parses shell stories from markdown format in epic descriptions
 */

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
  included: string[];      // ✅ bullets
  excluded: string[];      // ❌ bullets
  questions: string[];     // ❓ bullets
  rawContent: string;      // Full markdown for this story
}

/**
 * Parse shell stories from markdown content
 * 
 * Expected format:
 * - `st001` **Title** ⟩ Description
 * - `st001` Title ⟩ Description (bold optional)
 * - `st001` **[Title](url)** ⟩ Description _(timestamp)_
 *   * SCREENS: [screen1](url1), [screen2](url2)
 *   * DEPENDENCIES: st002, st003
 *   * ✅ Included item
 *   * ❌ Excluded item
 *   * ❓ Question
 * 
 * @param shellStoriesContent - Markdown content of Shell Stories section
 * @returns Array of parsed shell stories
 */
export function parseShellStories(shellStoriesContent: string): ParsedShellStory[] {
  const stories: ParsedShellStory[] = [];
  
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
    // First, get everything after the story ID
    const afterId = firstLine.substring(firstLine.indexOf('`', 1) + 1).trim();
    
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
      } else if (line.startsWith('* ✅') || line.startsWith('- ✅')) {
        included.push(line.replace(/^[*-]\s*✅\s*/, ''));
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
      excluded,
      questions,
      rawContent: block.trim(),
    });
  }
  
  return stories;
}
