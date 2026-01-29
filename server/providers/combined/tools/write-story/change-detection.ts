/**
 * Change Detection Helpers
 * 
 * Utilities for detecting changes in Jira issues, comments, and story content
 * to enable incremental context processing in the write-story tool.
 * 
 * Works directly with ADF (Atlassian Document Format) to avoid lossy conversions.
 */

import type { IssueComment } from '../review-work-item/jira-hierarchy-fetcher.js';
import type { JiraIssue } from '../../../atlassian/types.js';
import type { ADFDocument, ADFNode } from '../../../atlassian/markdown-converter.js';
import { 
  countUnansweredQuestions, 
  countAnsweredQuestions 
} from '../shared/scope-analysis-helpers.js';

/**
 * Extended comment type with update tracking
 */
export interface TrackedComment extends IssueComment {
  /** When the comment was last updated (if different from created) */
  updated?: string;
  /** Plain text version of the comment body (extracted from ADF) */
  bodyText?: string;
}

/**
 * Inline answer detected in story description
 */
export interface InlineAnswer {
  /** The original question text */
  question: string;
  /** The answer text found after the question */
  answer: string;
  /** Index of the node containing the question */
  nodeIndex: number;
}

/**
 * Result of change detection
 */
export interface ChangeDetectionResult {
  /** Comments changed since last update */
  changedComments: TrackedComment[];
  /** Issues changed since last update */
  changedIssues: JiraIssue[];
  /** Inline answers detected in description */
  inlineAnswers: InlineAnswer[];
  /** Last update timestamp */
  lastUpdated: Date;
}

/**
 * Timestamp marker text pattern (used within ADF text nodes)
 * Format: "Last updated by write-story: 2026-01-28T15:30:00Z"
 */
const TIMESTAMP_MARKER_TEXT_PATTERN = /Last updated by write-story:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/i;

/**
 * Extract text from an ADF node (recursive)
 */
function extractTextFromNode(node: ADFNode, prefix: string = ''): string {
  // For list items, add "- " prefix and newline to preserve markdown list format
  if (node.type === 'listItem') {
    const itemText = node.content?.map(n => extractTextFromNode(n)).join('') || '';
    return `- ${itemText}\n`;
  }
  
  if (node.type === 'text' && node.text) {
    return node.text;
  }
  
  if (node.content) {
    return node.content.map(n => extractTextFromNode(n, prefix)).join('');
  }
  
  return '';
}

/**
 * Parse the timestamp marker from story description ADF
 * 
 * Looks for a paragraph or text node containing the timestamp marker pattern.
 * 
 * @param descriptionAdf - Story description in ADF format
 * @returns Parsed Date or null if not found
 */
export function parseTimestampMarkerFromAdf(descriptionAdf: ADFDocument | null | undefined): Date | null {
  if (!descriptionAdf?.content) {
    return null;
  }
  
  // Search through all nodes (typically at the end of the document)
  // Check in reverse order since timestamp is usually at the end
  for (let i = descriptionAdf.content.length - 1; i >= 0; i--) {
    const node = descriptionAdf.content[i];
    const text = extractTextFromNode(node);
    
    const match = text.match(TIMESTAMP_MARKER_TEXT_PATTERN);
    if (match) {
      try {
        return new Date(match[1]);
      } catch {
        console.warn('Failed to parse timestamp marker:', match[1]);
        return null;
      }
    }
  }
  
  return null;
}

/**
 * Create ADF nodes for the timestamp marker section
 * 
 * @param timestamp - Timestamp to include
 * @returns ADF nodes to append to the document
 */
export function createTimestampMarkerAdf(timestamp: Date = new Date()): ADFNode[] {
  return [
    {
      type: 'rule', // Horizontal rule (---)
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Last updated by write-story: ${timestamp.toISOString()}`,
          marks: [{ type: 'em' }], // Italic
        },
      ],
    },
  ];
}

/**
 * Append timestamp marker to story content ADF
 * 
 * Removes any existing timestamp marker and appends a new one.
 * 
 * @param contentAdf - Story content in ADF format
 * @param timestamp - Timestamp to append (defaults to now)
 * @returns Updated ADF document with timestamp marker
 */
export function appendTimestampMarkerToAdf(
  contentAdf: ADFDocument,
  timestamp: Date = new Date()
): ADFDocument {
  // Remove any existing timestamp marker (look for rule + paragraph with marker text)
  const cleanedContent: ADFNode[] = [];
  let skipNext = false;
  
  for (let i = 0; i < contentAdf.content.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    const node = contentAdf.content[i];
    const text = extractTextFromNode(node);
    
    // Check if this is the timestamp paragraph
    if (TIMESTAMP_MARKER_TEXT_PATTERN.test(text)) {
      // Also skip preceding rule if present
      if (cleanedContent.length > 0 && cleanedContent[cleanedContent.length - 1].type === 'rule') {
        cleanedContent.pop();
      }
      continue;
    }
    
    // Check if this is a rule followed by the timestamp paragraph
    if (node.type === 'rule' && i + 1 < contentAdf.content.length) {
      const nextNode = contentAdf.content[i + 1];
      const nextText = extractTextFromNode(nextNode);
      if (TIMESTAMP_MARKER_TEXT_PATTERN.test(nextText)) {
        skipNext = true;
        continue;
      }
    }
    
    cleanedContent.push(node);
  }
  
  // Append new timestamp marker
  const timestampNodes = createTimestampMarkerAdf(timestamp);
  
  return {
    ...contentAdf,
    content: [...cleanedContent, ...timestampNodes],
  };
}

/**
 * Filter comments to only those changed since the given timestamp
 * 
 * @param comments - All comments
 * @param since - Timestamp to compare against
 * @returns Comments created or updated after the timestamp
 */
export function filterChangedComments(
  comments: IssueComment[],
  since: Date
): TrackedComment[] {
  const sinceTime = since.getTime();
  
  return comments
    .filter(comment => {
      const createdTime = new Date(comment.created).getTime();
      const updatedTime = comment.updated ? new Date(comment.updated).getTime() : createdTime;
      
      return createdTime > sinceTime || updatedTime > sinceTime;
    })
    .map(comment => ({
      ...comment,
      // Extract text from ADF body for easier processing
      bodyText: extractTextFromAdf(comment.body),
    }));
}

/**
 * Extract all text from an ADF document
 */
function extractTextFromAdf(adf: ADFDocument | null | undefined): string {
  if (!adf?.content) return '';
  return adf.content.map(node => extractTextFromNode(node)).join('\n');
}

/**
 * Filter issues to only those updated since the given timestamp
 * 
 * @param issues - All linked issues
 * @param since - Timestamp to compare against
 * @returns Issues updated after the timestamp
 */
export function filterChangedIssues(
  issues: JiraIssue[],
  since: Date
): JiraIssue[] {
  const sinceTime = since.getTime();
  
  return issues.filter(issue => {
    const updatedField = issue.fields.updated;
    if (!updatedField) return false;
    
    const updatedTime = new Date(updatedField).getTime();
    return updatedTime > sinceTime;
  });
}

/**
 * Detect inline answers in story description ADF
 * 
 * Looks for list items containing ❓ markers followed by answer text.
 * Pattern in ADF: listItem with text containing "❓ Question? Answer text"
 * 
 * @param descriptionAdf - Story description in ADF format
 * @returns Detected inline answers
 */
export function detectInlineAnswersFromAdf(descriptionAdf: ADFDocument | null | undefined): InlineAnswer[] {
  if (!descriptionAdf?.content) {
    return [];
  }
  
  const answers: InlineAnswer[] = [];
  
  // Recursively search for list items with ❓ markers
  function searchNode(node: ADFNode, nodeIndex: number): void {
    // Check if this is a listItem or paragraph that might contain a question
    if (node.type === 'listItem' || node.type === 'paragraph') {
      const text = extractTextFromNode(node);
      
      // Look for ❓ pattern with answer on same line
      // Pattern: ❓ Question text? Answer text here
      const questionMatch = text.match(/❓\s*(.+?\?)\s*(.+)/);
      if (questionMatch) {
        const question = questionMatch[1].trim();
        const answer = questionMatch[2].trim();
        
        // Only count as answered if there's substantial text after the question mark
        // (not just punctuation or whitespace)
        if (answer && answer.length > 2 && !answer.match(/^[→\s-]+$/)) {
          answers.push({
            question,
            answer,
            nodeIndex,
          });
        }
      }
    }
    
    // Recurse into child content
    if (node.content) {
      node.content.forEach((child, i) => searchNode(child, nodeIndex));
    }
  }
  
  descriptionAdf.content.forEach((node, index) => searchNode(node, index));
  
  return answers;
}

/**
 * Count unanswered questions (❓ markers) in ADF description
 * 
 * Extracts text from ADF and delegates to shared counting function
 * for consistent question counting across all tools.
 * 
 * @param descriptionAdf - Story description in ADF format
 * @returns Number of unanswered questions
 */
export function countUnansweredQuestionsInAdf(descriptionAdf: ADFDocument | null | undefined): number {
  if (!descriptionAdf?.content) {
    return 0;
  }
  
  const fullText = extractTextFromAdf(descriptionAdf);
  return countUnansweredQuestions(fullText);
}

/**
 * Count answered questions (💬 markers) in ADF description
 * 
 * Extracts text from ADF and delegates to shared counting function
 * for consistent question counting across all tools.
 * 
 * @param descriptionAdf - Story description in ADF format
 * @returns Number of answered questions
 */
export function countAnsweredQuestionsInAdf(descriptionAdf: ADFDocument | null | undefined): number {
  if (!descriptionAdf?.content) {
    return 0;
  }
  
  const fullText = extractTextFromAdf(descriptionAdf);
  return countAnsweredQuestions(fullText);
}

/**
 * Remove timestamp marker from ADF and return cleaned document
 * 
 * @param descriptionAdf - Story description in ADF format
 * @returns ADF document without timestamp marker
 */
export function removeTimestampMarkerFromAdf(descriptionAdf: ADFDocument): ADFDocument {
  const cleanedContent: ADFNode[] = [];
  
  for (let i = 0; i < descriptionAdf.content.length; i++) {
    const node = descriptionAdf.content[i];
    const text = extractTextFromNode(node);
    
    // Skip timestamp marker paragraph
    if (TIMESTAMP_MARKER_TEXT_PATTERN.test(text)) {
      // Also skip preceding rule if present
      if (cleanedContent.length > 0 && cleanedContent[cleanedContent.length - 1].type === 'rule') {
        cleanedContent.pop();
      }
      continue;
    }
    
    // Skip rule if followed by timestamp (look ahead)
    if (node.type === 'rule' && i + 1 < descriptionAdf.content.length) {
      const nextNode = descriptionAdf.content[i + 1];
      const nextText = extractTextFromNode(nextNode);
      if (TIMESTAMP_MARKER_TEXT_PATTERN.test(nextText)) {
        continue;
      }
    }
    
    cleanedContent.push(node);
  }
  
  return {
    ...descriptionAdf,
    content: cleanedContent,
  };
}
