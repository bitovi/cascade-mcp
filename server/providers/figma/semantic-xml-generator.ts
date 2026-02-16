/**
 * Semantic XML Generator for Figma Nodes
 * 
 * Converts Figma node tree to lightweight semantic XML representation
 * for AI analysis. Focuses on component hierarchy, states, and interactions.
 * 
 * Size reduction: ~99% (e.g., 1700 KB JSON → 14 KB XML)
 */

/**
 * Generate semantic XML representation of Figma node tree
 * 
 * Strategy:
 * - Use component/instance names as XML tags
 * - Extract component properties as attributes (State, Property1, etc.)
 * - Mark interactive elements with interactive="true"
 * - Output text content directly (no wrapper tags for text nodes)
 * - Skip noise: IDs, invisible elements, vectors, generic wrappers
 * 
 * @param nodeData - Figma node with children
 * @returns XML string representing semantic structure
 */
export function generateSemanticXml(nodeData: any): string {
  // Validate input
  if (!nodeData || typeof nodeData !== 'object') {
    throw new Error('Invalid node data: expected object with node information');
  }
  
  // Convert node tree to XML
  const childrenXml = nodeData.children
    ? nodeData.children
        .map((child: any) => nodeToSemanticXML(child, 1))
        .filter(Boolean)
        .join('\n')
    : '';
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Semantic structure for Figma screen: ${nodeData.name} -->\n` +
    `<Screen name="${escapeXml(nodeData.name)}" type="${nodeData.type}">\n` +
    childrenXml + '\n' +
    `</Screen>`;
  
  return xml;
}

/**
 * Convert Figma node tree to semantic XML-like structure
 * 
 * Strategy:
 * - Use component names as semantic tags
 * - Extract text content directly
 * - Show hierarchy and spatial relationships
 * - Identify interactive elements (buttons, instances)
 * - Remove noise: IDs, invisible elements, decorative vectors, layout wrappers
 */
export function nodeToSemanticXML(node: any, depth = 0): string | null {
  const indent = '  '.repeat(depth);
  
  // Skip invisible elements
  if (node.visible === false) {
    return null;
  }
  
  // Skip purely decorative implementation details
  if (shouldSkipNode(node)) {
    return null;
  }
  
  // Determine semantic tag name
  const tagName = getSemanticTagName(node);
  
  // Get attributes (without IDs)
  const attrs = getSemanticAttributes(node);
  const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  
  // Extract text content if this is a TEXT node
  if (node.type === 'TEXT' && node.characters) {
    const text = escapeXml(node.characters).trim();
    // If the tag name would be the same as the content (normalized), just output the text
    const normalizedTagName = tagName.replace(/-/g, ' ').toLowerCase();
    const normalizedText = text.toLowerCase();
    
    // Also skip wrapping for simple numeric/short generic tags like "_1", "Text", etc.
    const isGenericTag = tagName.match(/^(_\d+|Text\d*)$/);
    
    if (normalizedTagName === normalizedText || isGenericTag) {
      return `${indent}${text}`;
    }
    return `${indent}<${tagName}${attrString}>${text}</${tagName}>`;
  }
  
  // For icon components, don't include their vector children
  if (isIconComponent(node)) {
    return `${indent}<${tagName}${attrString} />`;
  }
  
  // Handle nodes with children
  if (node.children && node.children.length > 0) {
    // If this is a generic wrapper, hoist children up (don't create a tag for this node)
    if (isGenericWrapper(node)) {
      const childrenResults = node.children
        .map((child: any) => nodeToSemanticXML(child, depth)) // Same depth, not depth+1
        .filter(Boolean);
      return childrenResults.length > 0 ? childrenResults.join('\n') : null;
    }
    
    // Normal processing for named nodes
    const childrenResults = node.children
      .map((child: any) => nodeToSemanticXML(child, depth + 1))
      .filter(Boolean);
    
    if (childrenResults.length > 0) {
      // Check if we have a single text child (no wrapping tags)
      if (childrenResults.length === 1 && !childrenResults[0].includes('<')) {
        // Single text content - inline it
        return `${indent}<${tagName}${attrString}>${childrenResults[0].trim()}</${tagName}>`;
      }
      // Multiple children or nested elements
      const childrenXml = childrenResults.join('\n');
      return `${indent}<${tagName}${attrString}>\n${childrenXml}\n${indent}</${tagName}>`;
    } else {
      // No visible children, make it self-closing
      return `${indent}<${tagName}${attrString} />`;
    }
  }
  
  // Leaf node without children
  return `${indent}<${tagName}${attrString} />`;
}

/**
 * Check if node should be skipped entirely
 */
export function shouldSkipNode(node: any): boolean {
  // Skip Vector nodes (icon implementation details)
  if (node.type === 'VECTOR') {
    return true;
  }
  
  // Skip nodes that look decorative based on characteristics
  if (isLikelyDecorativeNode(node)) {
    return true;
  }
  
  return false;
}

/**
 * Check if node appears to be decorative/non-semantic based on characteristics
 */
export function isLikelyDecorativeNode(node: any): boolean {
  if (!node.name) return false;
  
  // Very low opacity - likely hidden/decorative
  if (node.opacity !== undefined && node.opacity < 0.1) {
    return true;
  }
  
  // Single-pixel or very small nodes (1x1 or 2x2) - likely spacers
  if (node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if ((width <= 2 && height <= 2) || width === 0 || height === 0) {
      return true;
    }
  }
  
  // Nodes with common decorative suffixes/patterns
  if (/-wrapper$/i.test(node.name)) {
    return true;
  }
  
  // Common decorative node names
  if (/^(background|pixel|divider)$/i.test(node.name)) {
    return true;
  }
  
  return false;
}

/**
 * Check if this is a generic wrapper that should have its children hoisted up
 */
export function isGenericWrapper(node: any): boolean {
  // Generic Frame/Group nodes with auto-generated names
  if ((node.type === 'FRAME' || node.type === 'GROUP') && 
      (!node.name || node.name.match(/^(Frame|Group)\s+\d+$/))) {
    return true;
  }
  
  // Generic "Text" wrapper frames (just layout containers)
  if (node.type === 'FRAME' && node.name === 'Text') {
    return true;
  }
  
  return false;
}

/**
 * Check if this is an icon component (should not show children)
 */
export function isIconComponent(node: any): boolean {
  if (!node.name) return false;
  
  // Check if name suggests it's an icon (common naming patterns)
  const hasIconName = node.name.startsWith('Icon-') || 
                      node.name.startsWith('icon-') ||
                      node.name.toLowerCase().includes('icon');
  
  // Also check structural characteristics of icons:
  // - Small bounding box (typically icons are < 48x48)
  // - Mostly/entirely composed of vector children
  if (node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    const isSmall = width <= 48 && height <= 48;
    
    if (isSmall && node.children) {
      const vectorCount = node.children.filter((c: any) => c.type === 'VECTOR').length;
      const childCount = node.children.length;
      const mostlyVectors = vectorCount > 0 && vectorCount / childCount > 0.5;
      
      if (mostlyVectors) {
        return true;
      }
    }
  }
  
  return hasIconName;
}

/**
 * Determine semantic tag name from node
 */
export function getSemanticTagName(node: any): string {
  // Use component name if it's an INSTANCE or COMPONENT
  if ((node.type === 'INSTANCE' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') && node.name) {
    // Convert to valid XML tag (replace spaces, special chars)
    return toXmlTagName(node.name);
  }
  
  // Use node type as fallback, but make it semantic
  const typeMap: Record<string, string> = {
    'FRAME': 'Frame',
    'GROUP': 'Group',
    'TEXT': 'Text',
    'RECTANGLE': 'Rectangle',
    'ELLIPSE': 'Ellipse',
    'VECTOR': 'Icon',
    'INSTANCE': 'Component',
    'COMPONENT': 'Component',
  };
  
  const semanticType = typeMap[node.type] || node.type;
  
  // If we have a meaningful name, use it
  if (node.name && !node.name.match(/^(Rectangle|Ellipse|Vector|Frame|Group)\s+\d+$/)) {
    return toXmlTagName(node.name);
  }
  
  return semanticType;
}

/**
 * Get semantic attributes for a node
 */
export function getSemanticAttributes(node: any): string[] {
  const attrs: string[] = [];
  
  // Add type if it provides useful context (but not for every node)
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
    attrs.push(`type="${node.type.toLowerCase()}"`);
  }
  
  // Skip IDs - they're internal Figma references with no semantic meaning
  
  // Add interaction hints
  if (isInteractive(node)) {
    attrs.push('interactive="true"');
  }
  
  // Add component properties if available (these are semantic state info)
  if (node.componentProperties) {
    const props = Object.entries(node.componentProperties)
      .map(([key, value]) => {
        if (typeof value === 'object' && (value as any).value !== undefined) {
          return `${toXmlAttrName(key)}="${escapeXml(String((value as any).value))}"`;
        }
        return null;
      })
      .filter(Boolean) as string[];
    attrs.push(...props);
  }
  
  return attrs;
}

/**
 * Check if node appears to be interactive
 */
export function isInteractive(node: any): boolean {
  // Buttons usually have interactions or specific naming
  if (node.name && /button|btn|click|action/i.test(node.name)) {
    return true;
  }
  
  // Check for reactions/interactions
  if (node.reactions && node.reactions.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Convert string to valid XML tag name
 */
export function toXmlTagName(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9-_ ]/g, '') // Remove invalid chars
    .replace(/\s+/g, '-')             // Replace spaces with hyphens
    .replace(/^(\d)/, '_$1')          // Prefix with underscore if starts with number
    || 'Element';
}

/**
 * Convert string to valid XML attribute name
 */
export function toXmlAttrName(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .replace(/^(\d)/, '_$1')
    || 'attr';
}

/**
 * Escape XML special characters
 */
export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
