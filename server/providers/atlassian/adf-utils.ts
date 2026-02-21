/**
 * ADF (Atlassian Document Format) Utilities
 * 
 * Generic traversal and manipulation utilities for ADF documents.
 * These are used across Jira and Confluence processing.
 */

import type { ADFDocument, ADFNode } from './markdown-converter.js';

// ============================================================================
// URL Pattern Constants (Single Source of Truth)
// ============================================================================

/**
 * URL pattern for matching Figma design URLs
 * Used for URL extraction and inlineCard conversion
 */
export const FIGMA_URL_PATTERN = 'figma.com';

/**
 * URL pattern for matching Confluence page URLs
 * Used for URL extraction and inlineCard conversion
 */
export const CONFLUENCE_URL_PATTERN = 'atlassian.net/wiki';

/**
 * URL pattern for matching Google Docs URLs
 * Used for URL extraction and inlineCard conversion
 * Note: Does NOT match Google Sheets or Google Slides
 */
export const GOOGLE_DOCS_URL_PATTERN = 'docs.google.com/document';

/**
 * Array of resource URL patterns for inlineCard conversion
 * Used by markdown-converter.ts to determine which links should be rich previews
 * Note: Figma is intentionally excluded - it uses emoji decoration instead
 */
export const INLINE_CARD_URL_PATTERNS = [
  CONFLUENCE_URL_PATTERN,
  GOOGLE_DOCS_URL_PATTERN,
] as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Visitor function called for each node during traversal
 * 
 * @param node - The current ADF node being visited
 * @param parent - The parent node (undefined for root)
 * @param depth - Current depth in the tree (0 for root content)
 * @returns false to stop traversal of this branch, undefined/true to continue
 */
export type ADFVisitor = (
  node: ADFNode,
  parent: ADFNode | undefined,
  depth: number
) => boolean | void;

/**
 * Transformer function that returns a modified node or nodes
 * 
 * @param node - The current ADF node to transform
 * @returns Transformed node, array of nodes, or null to remove the node
 */
export type ADFTransformer = (
  node: ADFNode
) => ADFNode | ADFNode[] | null;

/**
 * Options for URL extraction
 */
export interface ExtractUrlsOptions {
  /** URL pattern to match (e.g., 'figma.com', 'atlassian.net/wiki') */
  urlPattern: string | RegExp;
  /** Whether to search in plain text nodes with regex (default: true) */
  searchPlainText?: boolean;
  /** Regex for extracting URLs from plain text (default: matches http(s) URLs) */
  plainTextRegex?: RegExp;
}

// ============================================================================
// Traversal
// ============================================================================

/**
 * Traverse an ADF document, calling visitor for each node
 * 
 * Performs depth-first traversal of the ADF tree.
 * Visitor can return false to skip children of current node.
 * 
 * @param adf - ADF document to traverse
 * @param visitor - Function called for each node
 * 
 * @example
 * ```typescript
 * // Count all text nodes
 * let textCount = 0;
 * traverseADF(doc, (node) => {
 *   if (node.type === 'text') textCount++;
 * });
 * ```
 */
export function traverseADF(adf: ADFDocument, visitor: ADFVisitor): void {
  function traverse(node: ADFNode, parent: ADFNode | undefined, depth: number) {
    // Call visitor - if it returns false, skip children
    const shouldContinue = visitor(node, parent, depth);
    if (shouldContinue === false) {
      return;
    }

    // Recursively traverse children
    if (node.content) {
      for (const child of node.content) {
        traverse(child, node, depth + 1);
      }
    }
  }

  // Start with root content nodes
  for (const node of adf.content || []) {
    traverse(node, undefined, 0);
  }
}

/**
 * Traverse ADF nodes array (for when you have content without the doc wrapper)
 * 
 * @param nodes - Array of ADF nodes to traverse
 * @param visitor - Function called for each node
 */
export function traverseADFNodes(nodes: ADFNode[], visitor: ADFVisitor): void {
  function traverse(node: ADFNode, parent: ADFNode | undefined, depth: number) {
    const shouldContinue = visitor(node, parent, depth);
    if (shouldContinue === false) {
      return;
    }

    if (node.content) {
      for (const child of node.content) {
        traverse(child, node, depth + 1);
      }
    }
  }

  for (const node of nodes) {
    traverse(node, undefined, 0);
  }
}

/**
 * Transform an ADF document by applying a transformer function to each node
 * 
 * Performs depth-first transformation of the ADF tree, creating a new document.
 * The transformer can return:
 * - A modified node (transformation applied)
 * - An array of nodes (splits one node into multiple)
 * - null (removes the node)
 * 
 * Children are recursively transformed before the parent transformer is called.
 * 
 * @param adf - ADF document to transform
 * @param transformer - Function that transforms each node
 * @returns New transformed ADF document
 * 
 * @example
 * ```typescript
 * // Convert all text to uppercase
 * const transformed = transformADF(doc, (node) => {
 *   if (node.type === 'text' && node.text) {
 *     return { ...node, text: node.text.toUpperCase() };
 *   }
 *   return node;
 * });
 * ```
 */
export function transformADF(adf: ADFDocument, transformer: ADFTransformer): ADFDocument {
  return {
    ...adf,
    content: transformADFNodes(adf.content || [], transformer)
  };
}

/**
 * Transform an array of ADF nodes
 * 
 * @param nodes - Array of ADF nodes to transform
 * @param transformer - Function that transforms each node
 * @returns New transformed array of nodes
 */
export function transformADFNodes(nodes: ADFNode[], transformer: ADFTransformer): ADFNode[] {
  const result: ADFNode[] = [];

  for (const node of nodes) {
    // First, recursively transform children if they exist
    const nodeWithTransformedChildren = node.content
      ? { ...node, content: transformADFNodes(node.content, transformer) }
      : node;

    // Then apply transformer to the node itself
    const transformed = transformer(nodeWithTransformedChildren);

    if (transformed === null) {
      // Remove node
      continue;
    } else if (Array.isArray(transformed)) {
      // Replace with multiple nodes
      result.push(...transformed);
    } else {
      // Replace with single node
      result.push(transformed);
    }
  }

  return result;
}

// ============================================================================
// URL Extraction
// ============================================================================

/**
 * Extract ALL URLs from an ADF document
 * 
 * Searches through:
 * - inlineCard nodes (embedded links)
 * - text nodes with link marks
 * - plain text URLs (optional, via regex)
 * 
 * @param adf - ADF document to search
 * @param searchPlainText - Whether to search plain text for URLs (default: true)
 * @returns Array of unique URLs found in the document
 */
export function extractAllUrlsFromADF(
  adf: ADFDocument,
  searchPlainText = true
): string[] {
  const urls = new Set<string>();
  const plainTextRegex = /https?:\/\/[^\s)>\]"']+/g;

  traverseADF(adf, (node) => {
    // Check inlineCard nodes
    if (node.type === 'inlineCard' && node.attrs?.url) {
      urls.add(cleanUrl(node.attrs.url));
    }

    // Check text nodes with link marks
    if (node.type === 'text' && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          urls.add(cleanUrl(mark.attrs.href));
        }
      }
    }

    // Check plain text for URLs
    if (searchPlainText && node.type === 'text' && node.text) {
      const matches = node.text.match(plainTextRegex);
      if (matches) {
        for (const match of matches) {
          urls.add(cleanUrl(match));
        }
      }
    }
  });

  return Array.from(urls);
}

/**
 * Clean URL by removing trailing punctuation
 */
function cleanUrl(url: string): string {
  return url.replace(/[),.\]}>]+$/, '').trim();
}

/**
 * Check if a URL matches the given pattern
 */
function urlMatchesPattern(url: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return url.includes(pattern);
  }
  return pattern.test(url);
}

/**
 * Extract URLs from an ADF document that match a specific pattern
 * 
 * Searches through:
 * - inlineCard nodes (embedded links)
 * - text nodes with link marks
 * - plain text URLs (optional, via regex)
 * 
 * @param adf - ADF document to search
 * @param options - URL pattern and extraction options
 * @returns Array of unique matching URLs
 * 
 * @example
 * ```typescript
 * // Extract Figma URLs
 * const figmaUrls = extractUrlsFromADF(doc, { urlPattern: 'figma.com' });
 * 
 * // Extract Confluence URLs
 * const confluenceUrls = extractUrlsFromADF(doc, { 
 *   urlPattern: 'atlassian.net/wiki',
 *   plainTextRegex: /https?:\/\/[^\s]+atlassian\.net\/wiki[^\s]* /g
 * });
 * ```
 */
export function extractUrlsFromADF(
  adf: ADFDocument,
  options: ExtractUrlsOptions
): string[] {
  const { 
    urlPattern, 
    searchPlainText = true,
    plainTextRegex = /https?:\/\/[^\s]+/g
  } = options;

  const urls = new Set<string>();

  traverseADF(adf, (node) => {
    // Check inlineCard nodes
    if (node.type === 'inlineCard' && node.attrs?.url) {
      const url = node.attrs.url;
      if (urlMatchesPattern(url, urlPattern)) {
        urls.add(url);
      }
    }

    // Check text nodes with link marks
    if (node.type === 'text' && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          const url = mark.attrs.href;
          if (urlMatchesPattern(url, urlPattern)) {
            urls.add(url);
          }
        }
      }
    }

    // Check plain text for URLs (regex fallback)
    if (searchPlainText && node.type === 'text' && node.text) {
      const matches = node.text.match(plainTextRegex);
      if (matches) {
        for (const match of matches) {
          // Clean up URL (remove trailing punctuation)
          const cleanUrl = match.replace(/[),.\]}>]+$/, '');
          if (urlMatchesPattern(cleanUrl, urlPattern)) {
            urls.add(cleanUrl);
          }
        }
      }
    }
  });

  return Array.from(urls);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract Figma URLs from an ADF document
 * 
 * @param adf - ADF document to search
 * @returns Array of unique Figma URLs
 */
export function extractFigmaUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: FIGMA_URL_PATTERN,
    plainTextRegex: /https?:\/\/[^\s]+figma\.com[^\s]*/g,
  });
}

/**
 * Extract Confluence URLs from an ADF document
 * 
 * @param adf - ADF document to search
 * @returns Array of unique Confluence URLs
 */
export function extractConfluenceUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: CONFLUENCE_URL_PATTERN,
    plainTextRegex: /https?:\/\/[^\s]+atlassian\.net\/wiki[^\s]*/g,
  });
}

/**
 * Extract Google Docs URLs from an ADF document
 * 
 * Only matches Google Docs URLs (docs.google.com/document/...), 
 * not Sheets, Slides, or other Drive files.
 * 
 * @param adf - ADF document to search
 * @returns Array of unique Google Docs URLs
 */
export function extractGoogleDocsUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: GOOGLE_DOCS_URL_PATTERN,
    plainTextRegex: /https?:\/\/docs\.google\.com\/document\/[^\s)>\]"']+/g,
  });
}

/**
 * Collect all text content from an ADF document
 * 
 * @param adf - ADF document to extract text from
 * @returns Concatenated text content
 */
export function collectTextFromADF(adf: ADFDocument): string {
  const textParts: string[] = [];

  traverseADF(adf, (node) => {
    if (node.type === 'text' && node.text) {
      textParts.push(node.text);
    }
  });

  return textParts.join(' ');
}

/**
 * Find all nodes of a specific type in an ADF document
 * 
 * @param adf - ADF document to search
 * @param nodeType - Type of node to find (e.g., 'heading', 'paragraph', 'inlineCard')
 * @returns Array of matching nodes
 */
export function findNodesByType(adf: ADFDocument, nodeType: string): ADFNode[] {
  const nodes: ADFNode[] = [];

  traverseADF(adf, (node) => {
    if (node.type === nodeType) {
      nodes.push(node);
    }
  });

  return nodes;
}

/**
 * Find all nodes matching a predicate
 * 
 * @param adf - ADF document to search
 * @param predicate - Function that returns true for matching nodes
 * @returns Array of matching nodes
 */
export function findNodes(
  adf: ADFDocument,
  predicate: (node: ADFNode) => boolean
): ADFNode[] {
  const nodes: ADFNode[] = [];

  traverseADF(adf, (node) => {
    if (predicate(node)) {
      nodes.push(node);
    }
  });

  return nodes;
}
