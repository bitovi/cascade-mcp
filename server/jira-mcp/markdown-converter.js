/**
 * Markdown to ADF (Atlassian Document Format) converter
 * Uses marklassian for lightweight, reliable conversion
 */

import { logger } from '../logger.js';
import { markdownToAdf } from 'marklassian';

/**
 * Convert markdown text to ADF format
 * @param {string} markdown - Markdown text to convert
 * @returns {Promise<Object>} ADF document object
 */
export async function convertMarkdownToAdf(markdown) {
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
    const adf = markdownToAdf(markdown);
    
    logger.info('Markdown converted to ADF successfully with marklassian', {
      adfVersion: adf.version,
      adfType: adf.type,
      contentBlocks: adf.content?.length || 0
    });

    return adf;
  } catch (error) {
    logger.error('Marklassian conversion failed, using fallback', { 
      error: error.message,
      markdownLength: markdown.length 
    });
    
    return createFallbackAdf(markdown);
  }
}

/**
 * Create a simple ADF document for plain text fallback
 * @param {string} text - Plain text content
 * @returns {Object} Basic ADF document
 */
function createFallbackAdf(text) {
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

  const content = paragraphs.map(paragraph => ({
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
 * @param {Object} adf - ADF document to validate
 * @returns {boolean} True if valid ADF structure
 */
export function validateAdf(adf) {
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
