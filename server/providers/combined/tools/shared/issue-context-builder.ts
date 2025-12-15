/**
 * Issue Context Builder
 * 
 * Builds context from Jira issues for use in Figma screen analysis.
 * Extracts descriptions, filters out tool-generated sections, and returns
 * both ADF and markdown formats.
 */

import type { ADFNode, ADFDocument } from '../../../atlassian/markdown-converter.js';
import { 
  convertAdfNodesToMarkdown,
  extractADFSection 
} from '../../../atlassian/markdown-converter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal issue interface for context building
 * Compatible with both JiraIssue from types.ts and raw API responses
 */
export interface IssueForContext {
  key: string;
  fields: {
    summary: string;
    description?: ADFDocument | null;
  };
}

/**
 * Extracted section from an issue
 */
export interface ExtractedSection {
  /** Section name that was extracted */
  sectionName: string;
  /** Issue key the section came from */
  issueKey: string;
  /** ADF nodes of the extracted section */
  adf: ADFNode[];
}

/**
 * Result of building issue context
 */
export interface IssueContextResult {
  /** Combined ADF nodes from all issues (excluding filtered sections) */
  adf: ADFNode[];
  /** Combined markdown from all issues (excluding filtered sections) */
  markdown: string;
  /** Sections that were extracted/removed, keyed by section name */
  extractedSections: Map<string, ExtractedSection>;
}

/**
 * Options for building issue context
 */
export interface BuildIssueContextOptions {
  /** Section names to exclude (e.g., "Shell Stories", "Scope Analysis") */
  excludeSections?: string[];
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Build context from a list of issues for Figma analysis
 * 
 * Extracts descriptions from all issues, optionally filters out specified sections,
 * and returns combined ADF and markdown. Also returns the extracted sections.
 * 
 * @param issues - Array of issues (target + parents, in order of priority)
 * @param options - Options for filtering sections
 * @returns Combined ADF nodes, markdown string, and extracted sections
 */
export function buildIssueContext(
  issues: IssueForContext[],
  options: BuildIssueContextOptions = {}
): IssueContextResult {
  const { excludeSections = [] } = options;
  
  const allAdfNodes: ADFNode[] = [];
  const markdownParts: string[] = [];
  const extractedSections = new Map<string, ExtractedSection>();
  
  for (const issue of issues) {
    if (!issue.fields.description?.content) {
      continue;
    }
    
    let contentNodes = issue.fields.description.content;
    
    // Filter out excluded sections and collect them
    for (const sectionName of excludeSections) {
      const { section, remainingContent } = extractADFSection(contentNodes, sectionName);
      contentNodes = remainingContent;
      
      // Store the first non-empty section found for each section name
      if (section.length > 0 && !extractedSections.has(sectionName)) {
        extractedSections.set(sectionName, {
          sectionName,
          issueKey: issue.key,
          adf: section
        });
      }
    }
    
    if (contentNodes.length === 0) {
      continue;
    }
    
    // Convert to markdown with header
    const markdown = convertAdfNodesToMarkdown(contentNodes);
    if (markdown.trim()) {
      markdownParts.push(`## ${issue.key}: ${issue.fields.summary}\n${markdown}`);
      allAdfNodes.push(...contentNodes);
    }
  }
  
  return {
    adf: allAdfNodes,
    markdown: markdownParts.join('\n\n'),
    extractedSections
  };
}

/**
 * Build context from a hierarchy structure
 * 
 * Convenience wrapper that accepts a hierarchy object with target and parents.
 * 
 * @param hierarchy - Object with target issue and parent issues
 * @param options - Options for filtering sections
 * @returns Combined ADF nodes, markdown string, and extracted sections
 */
export function buildIssueContextFromHierarchy(
  hierarchy: { target: IssueForContext; parents: IssueForContext[] },
  options: BuildIssueContextOptions = {}
): IssueContextResult {
  // Target first, then parents (in order from immediate to root)
  const issues = [hierarchy.target, ...hierarchy.parents];
  return buildIssueContext(issues, options);
}
