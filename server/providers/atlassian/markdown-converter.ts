/**
 * Markdown to ADF (Atlassian Document Format) converter
 * Uses marklassian for lightweight, reliable conversion
 */

import { marked } from 'marked';
import { markdownToAdf } from 'marklassian';
import { logger } from '../../observability/logger.ts';

// ADF (Atlassian Document Format) interfaces
export interface ADFTextNode {
  type: 'text';
  text: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, any>;
  }>;
}

export interface ADFNode {
  type: string;
  attrs?: any;
  marks?: Array<{ type: string; attrs?: any }>;
  text?: string;
  content?: ADFNode[];
}

export interface ADFParagraph {
  type: 'paragraph';
  content: ADFTextNode[];
}

export interface ADFDocument {
  version: number;
  type: 'doc';
  content: ADFNode[];
}

/**
 * Convert markdown text to ADF format
 * @param markdown - Markdown text to convert
 * @returns ADF document object
 */
export async function convertMarkdownToAdf(markdown: string): Promise<ADFDocument> {
  if (!markdown || typeof markdown !== 'string') {
    logger.warn('Invalid markdown input provided', { markdown });
    return createFallbackAdf(markdown || '');
  }

  logger.info('Converting markdown to ADF', { 
    markdownLength: markdown.length,
    hasNewlines: markdown.includes('\n'),
    hasFormatting: /[*_#`\[\]()]/.test(markdown)
  });

  try {
    const adf = markdownToAdf(markdown) as ADFDocument;
    
    logger.info('Markdown converted to ADF successfully with marklassian', {
      adfVersion: adf.version,
      adfType: adf.type,
      contentBlocks: adf.content?.length || 0
    });

    return adf;
  } catch (error: any) {
    logger.error('Marklassian conversion failed, using fallback', { 
      error: error.message,
      markdownLength: markdown.length 
    });
    
    return createFallbackAdf(markdown);
  }
}

/**
 * Create a simple ADF document for plain text fallback
 * @param text - Plain text content
 * @returns Basic ADF document
 */
function createFallbackAdf(text: string): ADFDocument {
  logger.info('Creating fallback ADF document', { textLength: text.length });
  
  // Split text into paragraphs on double newlines
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  if (paragraphs.length === 0) {
    // Empty content
    return {
      version: 1,
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: []
      }]
    };
  }

  const content: ADFParagraph[] = paragraphs.map(paragraph => ({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: paragraph.trim()
    }]
  }));

  return {
    version: 1,
    type: 'doc',
    content
  };
}

/**
 * Validate ADF document structure
 * @param adf - ADF document to validate
 * @returns True if valid ADF structure
 */
export function validateAdf(adf: any): adf is ADFDocument {
  if (!adf || typeof adf !== 'object') {
    return false;
  }

  const hasRequiredFields = (
    adf.version === 1 &&
    adf.type === 'doc' &&
    Array.isArray(adf.content)
  );

  if (!hasRequiredFields) {
    logger.warn('Invalid ADF structure - missing required fields', { adf });
    return false;
  }

  return true;
}

/**
 * Remove a section from ADF content by heading text
 * 
 * Finds a heading containing the specified text and removes all content
 * between that heading and the next heading of the same or higher level.
 * 
 * @param content - Array of ADF nodes to search
 * @param headingText - Text to search for in headings (case-insensitive)
 * @returns New content array with the section removed
 */
export function removeADFSectionByHeading(content: ADFNode[], headingText: string): ADFNode[] {
  // Look for heading node with matching text
  let sectionStartIndex = -1;
  let sectionLevel = -1;
  
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    
    // Check if this is a heading node
    if (node.type === 'heading') {
      // Check if it contains the target text
      const hasMatchingText = node.content?.some((contentNode: ADFNode) => 
        contentNode.type === 'text' && 
        contentNode.text?.toLowerCase().includes(headingText.toLowerCase())
      );
      
      if (hasMatchingText) {
        sectionStartIndex = i;
        sectionLevel = node.attrs?.level || 2;
        logger.info(`Found existing "${headingText}" section`, { 
          index: i, 
          level: sectionLevel 
        });
        break;
      }
    }
  }
  
  // If section not found, return original content
  if (sectionStartIndex === -1) {
    return content;
  }
  
  // Find where the section ends (next heading of same or higher level)
  let sectionEndIndex = content.length;
  
  // Search for next heading of same or higher level (lower number = higher level)
  for (let i = sectionStartIndex + 1; i < content.length; i++) {
    const node = content[i];
    
    if (node.type === 'heading') {
      const headingLevel = node.attrs?.level || 2;
      
      // If we hit a heading of same or higher level, this is where the section ends
      if (headingLevel <= sectionLevel) {
        sectionEndIndex = i;
        logger.info(`"${headingText}" section ends`, { 
          endIndex: i, 
          nextHeadingLevel: headingLevel 
        });
        break;
      }
    }
  }
  
  // Remove only the content between start and end
  const newContent = [
    ...content.slice(0, sectionStartIndex),
    ...content.slice(sectionEndIndex)
  ];
  
  logger.info(`Removed existing "${headingText}" section`, { 
    startIndex: sectionStartIndex, 
    endIndex: sectionEndIndex - 1,
    removedNodes: sectionEndIndex - sectionStartIndex
  });
  
  return newContent;
}
