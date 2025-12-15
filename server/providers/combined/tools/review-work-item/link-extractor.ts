/**
 * Link Extraction Utilities
 * 
 * Extracts and classifies URLs from various sources:
 * - ADF documents (issue descriptions, comments)
 * - Plain text (project descriptions)
 * 
 * Design:
 * 1. Extract ALL URLs from source (generic extraction)
 * 2. Classify URLs by type (Confluence, Figma, Jira, etc.)
 */

import type { ADFDocument } from '../../../atlassian/markdown-converter.js';
import { extractAllUrlsFromADF } from '../../../atlassian/adf-utils.js';
import type { JiraIssueHierarchy, JiraIssue } from './jira-hierarchy-fetcher.js';
import { parseComments } from './jira-hierarchy-fetcher.js';

// ============================================================================
// Types
// ============================================================================

/**
 * All extracted links grouped by type
 */
export interface ExtractedLinks {
  /** Confluence page URLs */
  confluence: string[];
  /** Figma file URLs */
  figma: string[];
  /** Jira issue URLs (beyond parent/blockers already in hierarchy) */
  jira: string[];
}

/**
 * URL type classification result
 */
export type UrlType = 'confluence' | 'figma' | 'jira' | 'unknown';

// ============================================================================
// URL Classification
// ============================================================================

/**
 * Classify a URL by its type
 * 
 * @param url - URL to classify
 * @returns URL type ('confluence', 'figma', 'jira', or 'unknown')
 */
export function classifyUrl(url: string): UrlType {
  if (isConfluenceUrl(url)) return 'confluence';
  if (isFigmaUrl(url)) return 'figma';
  if (isJiraUrl(url)) return 'jira';
  return 'unknown';
}

/**
 * Check if URL is a Confluence page
 */
export function isConfluenceUrl(url: string): boolean {
  return url.includes('atlassian.net/wiki/');
}

/**
 * Check if URL is a Figma file/design
 */
export function isFigmaUrl(url: string): boolean {
  return url.includes('figma.com/');
}

/**
 * Check if URL is a Jira issue
 */
export function isJiraUrl(url: string): boolean {
  return /atlassian\.net\/browse\/[A-Z]+-\d+/i.test(url);
}

/**
 * Extract Jira issue key from URL
 * @example "https://bitovi.atlassian.net/browse/PROJ-123" → "PROJ-123"
 */
export function extractJiraKeyFromUrl(url: string): string | null {
  const match = url.match(/browse\/([A-Z]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Classify and group URLs by type
 * 
 * @param urls - Array of URLs to classify
 * @param excludeJiraKeys - Jira keys to exclude from results (already fetched)
 * @returns URLs grouped by type
 */
export function classifyUrls(urls: string[], excludeJiraKeys?: Set<string>): ExtractedLinks {
  const confluence: string[] = [];
  const figma: string[] = [];
  const jira: string[] = [];
  
  for (const url of urls) {
    const type = classifyUrl(url);
    
    switch (type) {
      case 'confluence':
        confluence.push(url);
        break;
      case 'figma':
        figma.push(url);
        break;
      case 'jira':
        // Skip already-fetched Jira issues
        if (excludeJiraKeys) {
          const key = extractJiraKeyFromUrl(url);
          if (key && excludeJiraKeys.has(key)) continue;
        }
        jira.push(url);
        break;
    }
  }
  
  return { confluence, figma, jira };
}

// ============================================================================
// URL Extraction from Sources
// ============================================================================

/**
 * Extract all URLs from an ADF document
 */
export function extractUrlsFromADF(adf: ADFDocument | null | undefined): string[] {
  if (!adf) return [];
  return extractAllUrlsFromADF(adf);
}

/**
 * Extract all URLs from plain text
 */
export function extractUrlsFromPlainText(text: string | null | undefined): string[] {
  if (!text) return [];
  
  const urlRegex = /https?:\/\/[^\s)>\]"']+/gi;
  const matches = text.match(urlRegex) || [];
  
  // Clean trailing punctuation
  return matches.map(url => url.replace(/[,.\]}>)]+$/, '').trim());
}

/**
 * Extract all URLs from a Jira issue (description + comments)
 */
export function extractUrlsFromIssue(issue: JiraIssue): string[] {
  const urls = new Set<string>();
  
  // Description
  for (const url of extractUrlsFromADF(issue.fields.description)) {
    urls.add(url);
  }
  
  // Comments
  const comments = parseComments(issue.fields.comment?.comments);
  for (const comment of comments) {
    for (const url of extractUrlsFromADF(comment.body)) {
      urls.add(url);
    }
  }
  
  return Array.from(urls);
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Extract all links from an issue hierarchy
 * 
 * Sources searched:
 * - Target issue description + comments
 * - Parent issues descriptions
 * - Blocker issues descriptions
 * - Project description (plain text)
 * 
 * @param hierarchy - Issue hierarchy from fetchJiraIssueHierarchy
 * @returns Deduplicated links grouped by type
 */
export function extractLinksFromHierarchy(hierarchy: JiraIssueHierarchy): ExtractedLinks {
  // Already-fetched Jira issues (don't include in results)
  const fetchedJiraKeys = new Set(hierarchy.allItems.map(item => item.key));
  
  // Collect all URLs from all sources
  const allUrls = new Set<string>();
  
  // Target issue (description + comments)
  console.log(`  🔗 Extracting links from ${hierarchy.target.key}...`);
  for (const url of extractUrlsFromIssue(hierarchy.target)) {
    allUrls.add(url);
  }
  
  // Parent issues (description only - skip comments to keep scope focused)
  for (const parent of hierarchy.parents) {
    console.log(`    📄 Extracting links from parent ${parent.key}...`);
    for (const url of extractUrlsFromADF(parent.fields.description)) {
      allUrls.add(url);
    }
  }
  
  // Blockers (description only)
  for (const blocker of hierarchy.blockers) {
    console.log(`    🚧 Extracting links from blocker ${blocker.key}...`);
    for (const url of extractUrlsFromADF(blocker.fields.description)) {
      allUrls.add(url);
    }
  }
  
  // Project description (plain text)
  if (hierarchy.project.description) {
    console.log(`    📁 Extracting links from project ${hierarchy.project.key}...`);
    for (const url of extractUrlsFromPlainText(hierarchy.project.description)) {
      allUrls.add(url);
    }
  }
  
  // Classify all collected URLs
  const result = classifyUrls(Array.from(allUrls), fetchedJiraKeys);
  
  console.log(`  ✅ Found ${result.confluence.length} Confluence, ${result.figma.length} Figma, ${result.jira.length} Jira links`);
  
  return result;
}

/**
 * Build a markdown summary of the issue hierarchy for LLM context
 */
export function buildHierarchyContextMarkdown(hierarchy: JiraIssueHierarchy): string {
  const sections: string[] = [];
  const target = hierarchy.target;
  
  // Target issue
  sections.push(`## ${target.key}: ${target.fields.summary}`);
  sections.push(`**Type:** ${target.fields.issuetype?.name || 'Unknown'}`);
  sections.push(`**Status:** ${target.fields.status?.name || 'Unknown'}`);
  if (target.fields.labels && target.fields.labels.length > 0) {
    sections.push(`**Labels:** ${target.fields.labels.join(', ')}`);
  }
  sections.push('');
  
  // Parent chain
  if (hierarchy.parents.length > 0) {
    sections.push('### Parent Hierarchy');
    for (const parent of hierarchy.parents) {
      sections.push(`- **${parent.key}** (${parent.fields.issuetype?.name}): ${parent.fields.summary}`);
    }
    sections.push('');
  }
  
  // Blockers
  if (hierarchy.blockers.length > 0) {
    sections.push('### Blockers');
    for (const blocker of hierarchy.blockers) {
      sections.push(`- **${blocker.key}** (${blocker.fields.issuetype?.name}): ${blocker.fields.summary} [${blocker.fields.status?.name}]`);
    }
    sections.push('');
  }
  
  // Project context
  if (hierarchy.project.description) {
    sections.push(`### Project: ${hierarchy.project.name}`);
    sections.push(hierarchy.project.description);
    sections.push('');
  }
  
  return sections.join('\n');
}
