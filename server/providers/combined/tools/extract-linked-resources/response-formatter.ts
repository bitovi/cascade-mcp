/**
 * Response Formatter for extract-linked-resources
 * 
 * Builds markdown-with-YAML-frontmatter responses that the agent
 * can write directly to .temp/cascade/context/{type}/{identifier}.md
 */

import type { ClassifiedLinks, ClassifiedUrl } from './url-classifier.js';

// ============================================================================
// Types
// ============================================================================

export interface JiraResponseData {
  url: string;
  issueKey: string;
  summary: string;
  status: string;
  issueType: string;
  parentKey?: string;
  descriptionMarkdown: string;
  comments: { author: string; body: string; created: string }[];
  commentsTotal: number;
  commentsIncluded: number;
  hasMoreComments: boolean;
  discoveredLinks: ClassifiedLinks;
}

export interface ConfluenceResponseData {
  url: string;
  pageId: string;
  title: string;
  spaceKey?: string;
  contentMarkdown: string;
  discoveredLinks: ClassifiedLinks;
}

export interface GoogleDocResponseData {
  url: string;
  title: string;
  contentMarkdown: string;
  discoveredLinks: ClassifiedLinks;
}

export interface FigmaResponseData {
  url: string;
}

// ============================================================================
// YAML Frontmatter Helpers
// ============================================================================

/** Escape a string for YAML (wrap in quotes if needed) */
function yamlStr(value: string): string {
  if (!value) return '""';
  // Wrap in quotes if it contains special YAML characters
  if (/[:#{}[\],&*?|>!%@`"'\n]/.test(value) || value.trim() !== value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function formatDiscoveredLinksYaml(links: ClassifiedLinks): string {
  const sections: string[] = [];

  const formatSection = (name: string, items: ClassifiedUrl[]) => {
    if (items.length === 0) return;
    sections.push(`  ${name}:`);
    for (const item of items) {
      sections.push(`    - url: ${yamlStr(item.url)}`);
      if (item.relationship) {
        sections.push(`      relationship: ${item.relationship}`);
      }
      if (item.context) {
        sections.push(`      context: ${yamlStr(item.context)}`);
      }
    }
  };

  formatSection('figma', links.figma);
  formatSection('confluence', links.confluence);
  formatSection('jira', links.jira);
  formatSection('googleDocs', links.googleDocs);
  formatSection('googleSheets', links.googleSheets);
  formatSection('other', links.other);

  if (sections.length === 0) {
    return 'discoveredLinks: {}';
  }

  return `discoveredLinks:\n${sections.join('\n')}`;
}

// ============================================================================
// Response Formatters
// ============================================================================

export function formatJiraResponse(data: JiraResponseData): string {
  const frontmatter = [
    '---',
    `url: ${yamlStr(data.url)}`,
    'type: jira',
    `title: ${yamlStr(data.summary)}`,
    `issueKey: ${data.issueKey}`,
    `status: ${yamlStr(data.status)}`,
    `issueType: ${yamlStr(data.issueType)}`,
  ];

  if (data.parentKey) {
    frontmatter.push(`parent: ${data.parentKey}`);
  }

  frontmatter.push(`commentsTotal: ${data.commentsTotal}`);
  frontmatter.push(`commentsIncluded: ${data.commentsIncluded}`);
  frontmatter.push(`hasMoreComments: ${data.hasMoreComments}`);
  frontmatter.push(formatDiscoveredLinksYaml(data.discoveredLinks));
  frontmatter.push('---');

  const body: string[] = [];
  body.push(`# ${data.issueKey}: ${data.summary}`);
  body.push('');
  body.push(`**Status:** ${data.status} | **Type:** ${data.issueType}${data.parentKey ? ` | **Parent:** ${data.parentKey}` : ''}`);
  body.push('');
  body.push('## Description');
  body.push('');
  body.push(data.descriptionMarkdown || '(No description)');

  if (data.comments.length > 0) {
    body.push('');
    if (data.hasMoreComments) {
      body.push(`## Comments (1–${data.commentsIncluded} of ${data.commentsTotal})`);
    } else {
      body.push('## Comments');
    }
    body.push('');

    for (const comment of data.comments) {
      const date = new Date(comment.created).toISOString().split('T')[0];
      body.push(`### ${comment.author} — ${date}`);
      body.push(comment.body);
      body.push('');
    }
  }

  return `${frontmatter.join('\n')}\n\n${body.join('\n')}`;
}

export function formatConfluenceResponse(data: ConfluenceResponseData): string {
  const frontmatter = [
    '---',
    `url: ${yamlStr(data.url)}`,
    'type: confluence',
    `title: ${yamlStr(data.title)}`,
    `pageId: ${data.pageId}`,
  ];

  if (data.spaceKey) {
    frontmatter.push(`spaceKey: ${data.spaceKey}`);
  }

  frontmatter.push(formatDiscoveredLinksYaml(data.discoveredLinks));
  frontmatter.push('---');

  const body: string[] = [];
  body.push(`# ${data.title}`);
  body.push('');
  body.push(data.contentMarkdown || '(No content)');

  return `${frontmatter.join('\n')}\n\n${body.join('\n')}`;
}

export function formatGoogleDocResponse(data: GoogleDocResponseData): string {
  const frontmatter = [
    '---',
    `url: ${yamlStr(data.url)}`,
    'type: google-doc',
    `title: ${yamlStr(data.title)}`,
    formatDiscoveredLinksYaml(data.discoveredLinks),
    '---',
  ];

  const body: string[] = [];
  body.push(data.contentMarkdown || '(No content)');

  return `${frontmatter.join('\n')}\n\n${body.join('\n')}`;
}

export function formatFigmaResponse(data: FigmaResponseData): string {
  const frontmatter = [
    '---',
    `url: ${yamlStr(data.url)}`,
    'type: figma',
    'discoveredLinks: {}',
    '---',
  ];

  return `${frontmatter.join('\n')}\n\nThis is a Figma URL. Use the \`figma-batch-load\` tool to fetch Figma design data instead.`;
}

export function formatUnsupportedResponse(url: string): string {
  const frontmatter = [
    '---',
    `url: ${yamlStr(url)}`,
    'type: unknown',
    'discoveredLinks: {}',
    '---',
  ];

  return `${frontmatter.join('\n')}\n\nUnsupported URL type. This tool supports Jira, Confluence, Google Docs, and Google Sheets URLs.`;
}
