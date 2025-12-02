/**
 * ADF (Atlassian Document Format) manipulation utilities
 * 
 * Pure functions for working with ADF nodes directly without lossy conversions.
 * All functions are immutable - they return new arrays/objects instead of modifying inputs.
 * 
 * Key principles:
 * - Preserve unknown node types during manipulation
 * - Handle edge cases gracefully (missing headings, empty sections, etc.)
 * - Return new objects (immutable operations)
 */

import type { ADFNode, ADFDocument } from './markdown-converter.js';

/**
 * Get the heading level from an ADF node, defaulting to 1 if not present.
 * @param node - ADF node
 * @returns Heading level (number)
 */
function getHeadingLevel(node: ADFNode): number {
  return node.attrs && typeof node.attrs.level === 'number' ? node.attrs.level : 1;
}

/**
 * Extract a section from ADF content between two headings
 * @param content - Array of ADF nodes
 * @param headingText - Heading text to match (case-insensitive)
 * @returns { section: nodes in section, remaining: all other nodes }
 * 
 * @example
 * const { section, remaining } = extractAdfSection(nodes, "Shell Stories");
 */
export function extractAdfSection(
  content: ADFNode[],
  headingText: string
): { section: ADFNode[], remaining: ADFNode[] } {
  const headingIndex = findAdfHeading(content, headingText);
  
  if (headingIndex === -1) {
    // Heading not found - return empty section, all content as remaining
    return { section: [], remaining: [...content] };
  }
  
  // Find next heading of same or higher level
  const startHeading = content[headingIndex];
  const startLevel = getHeadingLevel(startHeading);
  
  let endIndex = content.length;
  for (let i = headingIndex + 1; i < content.length; i++) {
    const node = content[i];
    if (node.type === 'heading') {
      const level = getHeadingLevel(node);
      if (level <= startLevel) {
        endIndex = i;
        break;
      }
    }
  }
  
  // Extract section (including heading)
  const section = content.slice(headingIndex, endIndex);
  
  // Build remaining (everything except section)
  const remaining = [
    ...content.slice(0, headingIndex),
    ...content.slice(endIndex)
  ];
  
  return { section, remaining };
}

/**
 * Remove a section from ADF content
 * @param content - Array of ADF nodes
 * @param headingText - Heading to remove
 * @returns New content array without the section
 * 
 * @example
 * const updated = removeAdfSection(nodes, "Shell Stories");
 */
export function removeAdfSection(
  content: ADFNode[],
  headingText: string
): ADFNode[] {
  const { remaining } = extractAdfSection(content, headingText);
  return remaining;
}

/**
 * Append nodes to end of a specific section
 * @param content - Array of ADF nodes
 * @param headingText - Section heading to append to
 * @param newNodes - Nodes to append
 * @returns New content with nodes appended
 * 
 * @example
 * const updated = appendToAdfSection(nodes, "Details", [paragraph]);
 */
export function appendToAdfSection(
  content: ADFNode[],
  headingText: string,
  newNodes: ADFNode[]
): ADFNode[] {
  const headingIndex = findAdfHeading(content, headingText);
  
  if (headingIndex === -1) {
    // Section not found - append at end
    return [...content, ...newNodes];
  }
  
  // Find end of section
  const startHeading = content[headingIndex];
  const startLevel = getHeadingLevel(startHeading);
  
  let endIndex = content.length;
  for (let i = headingIndex + 1; i < content.length; i++) {
    const node = content[i];
    if (node.type === 'heading') {
      const level = getHeadingLevel(node);
      if (level <= startLevel) {
        endIndex = i;
        break;
      }
    }
  }
  
  // Insert new nodes before end of section
  return [
    ...content.slice(0, endIndex),
    ...newNodes,
    ...content.slice(endIndex)
  ];
}

/**
 * Replace entire section content
 * @param content - Array of ADF nodes
 * @param headingText - Section heading to replace
 * @param newSectionNodes - New section content (including heading)
 * @returns New content with section replaced
 * 
 * @example
 * const updated = replaceAdfSection(nodes, "Shell Stories", newSection);
 */
export function replaceAdfSection(
  content: ADFNode[],
  headingText: string,
  newSectionNodes: ADFNode[]
): ADFNode[] {
  const headingIndex = findAdfHeading(content, headingText);
  
  if (headingIndex === -1) {
    // Section not found - append new section at end
    return [...content, ...newSectionNodes];
  }
  
  // Find the end of the section (next heading of same or higher level, or end of content)
  const startHeading = content[headingIndex];
  const headingLevel = getHeadingLevel(startHeading);
  let sectionEnd = headingIndex + 1;
  while (
    sectionEnd < content.length &&
    !(
      content[sectionEnd].type === 'heading' &&
      getHeadingLevel(content[sectionEnd]) <= headingLevel
    )
  ) {
    sectionEnd++;
  }
  
  // Replace the section
  return [
    ...content.slice(0, headingIndex),
    ...newSectionNodes,
    ...content.slice(sectionEnd)
  ];
}

/**
 * Find index of heading in ADF content
 * @param content - Array of ADF nodes
 * @param headingText - Heading text to find (case-insensitive)
 * @returns Index of heading node, or -1 if not found
 * 
 * @example
 * const index = findAdfHeading(nodes, "Shell Stories");
 */
export function findAdfHeading(
  content: ADFNode[],
  headingText: string
): number {
  const searchText = headingText.toLowerCase().trim();
  
  return content.findIndex(node => {
    if (node.type !== 'heading') return false;
    
    // Extract text from heading content
    const text = extractTextFromAdf([node]).toLowerCase().trim();
    return text === searchText;
  });
}

/**
 * Traverse ADF tree depth-first with visitor pattern
 * @param nodes - Root nodes to traverse
 * @param visitor - Callback for each node (receives node and path)
 * 
 * @example
 * traverseAdfNodes(nodes, (node, path) => {
 *   console.log(`${path.join('/')} - ${node.type}`);
 * });
 */
export function traverseAdfNodes(
  nodes: ADFNode[],
  visitor: (node: ADFNode, path: string[]) => void,
  currentPath: string[] = []
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodePath = [...currentPath, `${node.type}[${i}]`];
    
    // Visit this node
    visitor(node, nodePath);
    
    // Recursively visit children
    if (node.content && Array.isArray(node.content)) {
      traverseAdfNodes(node.content, visitor, nodePath);
    }
  }
}

/**
 * Create ADF heading node
 * @param level - Heading level (1-6)
 * @param text - Heading text
 * @returns ADF heading node
 * 
 * @example
 * const heading = createAdfHeading(2, "Shell Stories");
 */
export function createAdfHeading(level: number, text: string): ADFNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{
      type: 'text',
      text
    }]
  };
}

/**
 * Create ADF paragraph node with text
 * @param text - Paragraph text
 * @param marks - Optional text marks (bold, italic, etc.)
 * @returns ADF paragraph node
 * 
 * @example
 * const p = createAdfParagraph("Hello world");
 * const bold = createAdfParagraph("Bold text", [{ type: 'strong' }]);
 */
export function createAdfParagraph(text: string, marks?: any[]): ADFNode {
  return {
    type: 'paragraph',
    content: [{
      type: 'text',
      text,
      ...(marks && marks.length > 0 ? { marks } : {})
    }]
  };
}

/**
 * Create ADF bullet list from items
 * @param items - Array of content arrays (each item's nodes)
 * @returns ADF bullet list node
 * 
 * @example
 * const list = createAdfBulletList([
 *   [createAdfParagraph("Item 1")],
 *   [createAdfParagraph("Item 2")]
 * ]);
 */
export function createAdfBulletList(items: ADFNode[][]): ADFNode {
  return {
    type: 'bulletList',
    content: items.map(itemContent => ({
      type: 'listItem',
      content: itemContent
    }))
  };
}

/**
 * Create ADF hard break node (for Shift+Enter)
 * @returns ADF hard break node
 * 
 * @example
 * const br = createAdfHardBreak();
 */
export function createAdfHardBreak(): ADFNode {
  return {
    type: 'hardBreak'
  };
}

/**
 * Extract text content from ADF nodes (for display/debugging)
 * @param nodes - ADF nodes to extract text from
 * @returns Plain text string
 * 
 * @example
 * const text = extractTextFromAdf(nodes);
 */
export function extractTextFromAdf(nodes: ADFNode[]): string {
  let text = '';
  
  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      text += node.text;
    }
    
    if (node.content && Array.isArray(node.content)) {
      text += extractTextFromAdf(node.content);
    }
    
    // Add space after paragraphs, headings, list items
    if (['paragraph', 'heading', 'listItem'].includes(node.type)) {
      text += ' ';
    }
  }
  
  return text.trim();
}

/**
 * Recursively deep clones an object or array.
 * Handles primitives, arrays, and plain objects.
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  const clonedObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone((obj as any)[key]);
    }
  }
  return clonedObj;
}

/**
 * Deep clone an ADF node (preserving unknown properties)
 * @param node - ADF node to clone
 * @returns Cloned node
 * 
 * @example
 * const copy = cloneAdfNode(original);
 */

export function cloneAdfNode(node: ADFNode): ADFNode {
  const cloned: ADFNode = {
    ...node  // Preserve all properties including unknown ones
  };

  // Deep clone content array if present
  if (node.content && Array.isArray(node.content)) {
    cloned.content = node.content.map(child => cloneAdfNode(child));
  }

  // Deep clone attrs if present
  if (node.attrs) {
    cloned.attrs = deepClone(node.attrs);
  }

  // Deep clone marks if present
  if (node.marks && Array.isArray(node.marks)) {
    cloned.marks = node.marks.map(mark => ({
      ...mark,
      attrs: mark.attrs ? deepClone(mark.attrs) : undefined
    }));
  }
  return cloned;
}

/**
 * Deep clone an array of ADF nodes
 * @param nodes - ADF nodes to clone
 * @returns Cloned nodes array
 * 
 * @example
 * const copy = cloneAdfNodes(original);
 */
export function cloneAdfNodes(nodes: ADFNode[]): ADFNode[] {
  return nodes.map(node => cloneAdfNode(node));
}
