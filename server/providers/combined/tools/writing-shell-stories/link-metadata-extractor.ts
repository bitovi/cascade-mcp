/**
 * Link Metadata Extractor
 * 
 * Centralized module that extracts ALL link metadata from a Jira epic description in one pass.
 * This enables early reporting of resource counts immediately after fetching the Jira issue,
 * before any slow external API calls are made.
 * 
 * Key principle: Extraction ≠ Loading
 * - Extraction = parsing URLs from Jira description (instant)
 * - Loading = fetching external data from APIs (slow)
 * 
 * @see /specs/040-improved-progress.md
 */

import type { ADFDocument, ADFNode } from '../../../atlassian/markdown-converter.js';
import { extractFigmaUrlsFromADF, extractConfluenceUrlsFromADF } from '../../../atlassian/adf-utils.js';
import { extractGoogleDocsUrlsFromADF } from '../../../google/google-docs-helpers.js';
import { extractADFSection } from '../../../atlassian/markdown-converter.js';

/**
 * Figma link metadata extracted from ADF
 */
export interface FigmaLinkMetadata {
  url: string;
}

/**
 * Confluence link metadata extracted from ADF
 */
export interface ConfluenceLinkMetadata {
  url: string;
}

/**
 * Google Docs link metadata extracted from ADF
 */
export interface GoogleDocsLinkMetadata {
  url: string;
}

/**
 * Complete link metadata extracted from an epic description
 */
export interface LinkMetadata {
  /** Figma URLs found in the epic */
  figma: FigmaLinkMetadata[];
  /** Confluence URLs found in the epic */
  confluence: ConfluenceLinkMetadata[];
  /** Google Docs URLs found in the epic */
  googleDocs: GoogleDocsLinkMetadata[];
  /** Whether a Scope Analysis section already exists */
  hasScopeAnalysis: boolean;
  /** Whether a Shell Stories section already exists */
  hasShellStories: boolean;
}

/**
 * Extract all link metadata from a Jira epic description in one pass
 * 
 * This is a fast, synchronous operation that parses the ADF document
 * to find all external resource links. The actual loading of these
 * resources happens later in separate phases.
 * 
 * @param epicDescriptionAdf - The epic's description in ADF format
 * @returns LinkMetadata with counts and URLs for all resource types
 */
export function extractAllLinkMetadata(epicDescriptionAdf: ADFDocument): LinkMetadata {
  // Extract Figma URLs
  const figmaUrls = extractFigmaUrlsFromADF(epicDescriptionAdf);
  const figma: FigmaLinkMetadata[] = figmaUrls.map(url => ({ url }));

  // Extract Confluence URLs
  const confluenceUrls = extractConfluenceUrlsFromADF(epicDescriptionAdf);
  const confluence: ConfluenceLinkMetadata[] = confluenceUrls.map(url => ({ url }));

  // Extract Google Docs URLs
  const googleDocsUrls = extractGoogleDocsUrlsFromADF(epicDescriptionAdf);
  const googleDocs: GoogleDocsLinkMetadata[] = googleDocsUrls.map(url => ({ url }));

  // Check for existing Scope Analysis section
  const scopeAnalysisSection = extractADFSection(
    epicDescriptionAdf.content || [],
    'Scope Analysis'
  );
  const hasScopeAnalysis = scopeAnalysisSection.section.length > 0;

  // Check for existing Shell Stories section
  const shellStoriesSection = extractADFSection(
    epicDescriptionAdf.content || [],
    'Shell Stories'
  );
  const hasShellStories = shellStoriesSection.section.length > 0;

  return {
    figma,
    confluence,
    googleDocs,
    hasScopeAnalysis,
    hasShellStories,
  };
}

/**
 * Format link counts for progress notification
 * 
 * @param metadata - Extracted link metadata
 * @returns Human-readable summary string
 */
export function formatLinkCountsMessage(metadata: LinkMetadata): string {
  const parts: string[] = [];
  
  parts.push(`${metadata.figma.length} Figma link(s)`);
  parts.push(`${metadata.confluence.length} Confluence link(s)`);
  parts.push(`${metadata.googleDocs.length} Google Doc(s)`);
  
  return `Found ${parts.join(', ')}`;
}

/**
 * Format service availability message
 * 
 * @param hasGoogleAuth - Whether Google authentication is available
 * @returns Human-readable service list string
 */
export function formatServiceAvailabilityMessage(hasGoogleAuth: boolean): string {
  const services = [
    'Figma',
    'Atlassian',
  ];
  
  if (hasGoogleAuth) {
    services.push('Google Drive');
  }
  
  // Format with "and" before last item
  if (services.length === 2) {
    return `Connected to ${services[0]} and ${services[1]}`;
  } else if (services.length === 3) {
    return `Connected to ${services[0]}, ${services[1]}, and ${services[2]}`;
  }
  
  return `Connected to ${services.join(', ')}`;
}
