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

export interface ADFParagraph {
  type: 'paragraph';
  content: ADFTextNode[];
}

export interface ADFDocument {
  version: number;
  type: 'doc';
  content: ADFParagraph[];
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
