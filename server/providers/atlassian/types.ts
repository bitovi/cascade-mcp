/**
 * Shared Jira/Atlassian Type Definitions
 * 
 * Centralized types for Jira API responses and data structures.
 * Import from here instead of defining local interfaces.
 */

import type { ADFDocument } from './markdown-converter.js';

// ============================================================================
// Jira Issue Types
// ============================================================================

/**
 * Jira issue as returned by the REST API
 * Used for reading/fetching issues
 */
export interface JiraIssue {
  /** Issue ID */
  id: string;
  /** Issue key (e.g., "PROJ-123") */
  key: string;
  /** Issue fields */
  fields: {
    /** Issue summary/title */
    summary: string;
    /** Issue description in ADF format */
    description?: ADFDocument | null;
    /** Issue type */
    issuetype?: {
      id?: string;
      name: string;
    } | null;
    /** Project */
    project?: {
      id?: string;
      key: string;
      name?: string;
    } | null;
    /** Parent issue */
    parent?: {
      id?: string;
      key: string;
    } | null;
    /** Status */
    status?: {
      id?: string;
      name: string;
    } | null;
    /** Labels */
    labels?: string[];
    /** Issue links */
    issuelinks?: JiraIssueLinkRaw[];
    /** Comments */
    comment?: {
      total?: number;
      comments?: JiraCommentRaw[];
    } | null;
    /** Attachments */
    attachment?: any[];
    /** Allow additional fields */
    [key: string]: any;
  };
}

/**
 * Raw issue link as returned by Jira API
 */
export interface JiraIssueLinkRaw {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: {
    id: string;
    key: string;
    fields?: {
      summary?: string;
      status?: { name: string };
      issuetype?: { name: string };
    };
  };
  outwardIssue?: {
    id: string;
    key: string;
    fields?: {
      summary?: string;
      status?: { name: string };
      issuetype?: { name: string };
    };
  };
}

/**
 * Raw comment as returned by Jira API
 */
export interface JiraCommentRaw {
  id: string;
  body: ADFDocument;
  author?: {
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
  };
  created: string;
  updated?: string;
}

// ============================================================================
// Normalized/Parsed Types (for tool use)
// ============================================================================

/**
 * A normalized link between Jira issues
 */
export interface IssueLink {
  /** Link type (e.g., "Blocks", "is blocked by", "relates to") */
  type: string;
  /** Direction: outward (this blocks X) or inward (X blocks this) */
  direction: 'outward' | 'inward';
  /** The linked issue key */
  linkedIssueKey: string;
  /** The linked issue summary */
  linkedIssueSummary: string;
}

/**
 * A normalized comment on a Jira issue
 */
export interface IssueComment {
  /** Comment body in ADF format */
  body: ADFDocument;
  /** Author display name */
  author: string;
  /** Created timestamp */
  created: string;
  /** Updated timestamp (if comment was edited) */
  updated?: string;
}

/**
 * Jira project information
 */
export interface JiraProject {
  /** Project key */
  key: string;
  /** Project name */
  name: string;
  /** Project description (plain text) */
  description: string | null;
}

// ============================================================================
// Jira Issue Payload (for creating/updating issues)
// ============================================================================

/**
 * Payload for creating a Jira issue
 */
export interface JiraIssuePayload {
  fields: {
    project: {
      key: string;
    };
    issuetype: {
      id?: string;
      name?: string;
    };
    summary: string;
    description: ADFDocument;
    priority?: {
      name: string;
    };
    labels?: string[];
    assignee?: {
      accountId: string;
    };
    [key: string]: any;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse raw issue links into normalized IssueLink array
 */
export function parseIssueLinks(rawLinks: JiraIssueLinkRaw[] | undefined): IssueLink[] {
  if (!rawLinks) return [];
  
  return rawLinks.map((link) => {
    if (link.inwardIssue) {
      return {
        type: link.type.inward,
        direction: 'inward' as const,
        linkedIssueKey: link.inwardIssue.key,
        linkedIssueSummary: link.inwardIssue.fields?.summary || ''
      };
    } else if (link.outwardIssue) {
      return {
        type: link.type.outward,
        direction: 'outward' as const,
        linkedIssueKey: link.outwardIssue.key,
        linkedIssueSummary: link.outwardIssue.fields?.summary || ''
      };
    }
    return null;
  }).filter((link): link is IssueLink => link !== null);
}

/**
 * Parse raw comments into normalized IssueComment array
 */
export function parseComments(rawComments: JiraCommentRaw[] | undefined): IssueComment[] {
  if (!rawComments) return [];
  
  return rawComments.map((comment) => ({
    body: comment.body,
    author: comment.author?.displayName || 'Unknown',
    created: comment.created,
    updated: comment.updated,
  }));
}

/**
 * Build a Jira issue URL from key and site name
 */
export function buildJiraIssueUrl(key: string, siteName: string): string {
  return `https://${siteName}.atlassian.net/browse/${key}`;
}
