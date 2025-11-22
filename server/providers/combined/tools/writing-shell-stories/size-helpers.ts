/**
 * Size calculation helpers for Jira description limits
 * 
 * Jira Cloud has a 43,838 character limit for description fields.
 * These utilities help predict and validate content size before API calls.
 */

import type { ADFDocument, ADFNode } from '../../../atlassian/markdown-converter.js';

/**
 * Calculate the JSON string size of an ADF document
 * 
 * @param adfDoc - ADF document to calculate size for
 * @returns Size in characters (as Jira counts them)
 */
export function calculateAdfSize(adfDoc: ADFDocument): number {
  return JSON.stringify(adfDoc).length;
}

/**
 * Check if adding new content would exceed Jira's 43KB limit
 * 
 * Uses a 2KB safety margin to account for minor variations in serialization.
 * 
 * @param existingContent - Current ADF nodes in the description
 * @param newContentAdf - New ADF content to be added
 * @returns True if combined content would exceed safe limit
 */
export function wouldExceedLimit(
  existingContent: ADFNode[],
  newContentAdf: ADFDocument
): boolean {
  const JIRA_LIMIT = 43838;
  const SAFETY_MARGIN = 2000;
  const effectiveLimit = JIRA_LIMIT - SAFETY_MARGIN;
  
  const combinedDoc: ADFDocument = {
    version: 1,
    type: 'doc',
    content: [...existingContent, ...newContentAdf.content]
  };
  
  const totalSize = calculateAdfSize(combinedDoc);
  
  return totalSize > effectiveLimit;
}
