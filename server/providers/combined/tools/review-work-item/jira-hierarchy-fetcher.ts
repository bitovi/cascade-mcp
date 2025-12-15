/**
 * Jira Hierarchy Fetcher
 * 
 * Recursively fetches Jira issues (parent chain, blockers) and project description
 * to gather comprehensive context for story review.
 */

import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { getJiraIssue, getJiraProject } from '../../../atlassian/atlassian-helpers.js';
import {
  type JiraIssue,
  type JiraProject,
  type IssueLink,
  type IssueComment,
  parseIssueLinks,
  parseComments,
  buildJiraIssueUrl
} from '../../../atlassian/types.js';

// Re-export shared types for convenience
export type { JiraIssue, JiraProject, IssueLink, IssueComment };
export { parseIssueLinks, parseComments, buildJiraIssueUrl };

// ============================================================================
// Types
// ============================================================================

/**
 * Result of fetching issue hierarchy
 */
export interface JiraIssueHierarchy {
  /** The target issue */
  target: JiraIssue;
  /** Parent issues (ordered from immediate parent to root) */
  parents: JiraIssue[];
  /** Blockers (issues blocking this issue) */
  blockers: JiraIssue[];
  /** Items blocked by this issue */
  blocking: JiraIssue[];
  /** Project information */
  project: JiraProject;
  /** All unique issues (target + parents + linked) for easy iteration */
  allItems: JiraIssue[];
  /** Site name for URL construction */
  siteName: string;
}

/**
 * Options for fetching issue hierarchy
 */
export interface FetchHierarchyOptions {
  /** Maximum depth for parent traversal (default: 5) */
  maxDepth?: number;
  /** Cloud ID for the Jira site */
  cloudId: string;
  /** Site name (e.g., "bitovi" from bitovi.atlassian.net) */
  siteName: string;
  /** Optional progress notification callback */
  notify?: (message: string) => Promise<void>;
}

// ============================================================================
// Main Export
// ============================================================================

/** Fields to fetch for hierarchy context */
const HIERARCHY_FIELDS = 'summary,description,issuetype,project,parent,status,labels,issuelinks,comment';

/**
 * Fetch an issue with its full hierarchy context
 * 
 * Recursively fetches:
 * - The target issue
 * - All parent items up to maxDepth (or root)
 * - Blocking and blocked-by issues (1 level)
 * - Project description
 * 
 * @param issueKey - The target issue key (e.g., "PROJ-123")
 * @param client - Atlassian API client
 * @param options - Fetch options
 * @returns Complete issue hierarchy
 */
export async function fetchJiraIssueHierarchy(
  issueKey: string,
  client: AtlassianClient,
  options: FetchHierarchyOptions
): Promise<JiraIssueHierarchy> {
  const { maxDepth = 5, cloudId, siteName, notify = async () => {} } = options;
  
  console.log(`📋 Fetching issue hierarchy for ${issueKey}`);
  console.log(`  Max depth: ${maxDepth}, cloudId: ${cloudId}`);
  
  // Track fetched items to avoid duplicates
  const fetchedKeys = new Set<string>();
  
  // Step 1: Fetch target issue
  await notify(`Fetching ${issueKey}...`);
  const targetResponse = await getJiraIssue(client, cloudId, issueKey, HIERARCHY_FIELDS);
  const target = await targetResponse.json() as JiraIssue;
  fetchedKeys.add(target.key);
  
  // Step 2: Recursively fetch parents
  const parents: JiraIssue[] = [];
  let currentItem = target;
  let depth = 0;
  
  while (currentItem.fields.parent?.key && depth < maxDepth) {
    const parentKey = currentItem.fields.parent.key;
    
    if (fetchedKeys.has(parentKey)) {
      console.log(`  ⚠️ Circular reference detected at ${parentKey}, stopping`);
      break;
    }
    
    await notify(`Fetching parent ${parentKey}...`);
    const parentResponse = await getJiraIssue(client, cloudId, parentKey, HIERARCHY_FIELDS);
    const parent = await parentResponse.json() as JiraIssue;
    parents.push(parent);
    fetchedKeys.add(parent.key);
    
    currentItem = parent;
    depth++;
  }
  
  // Step 3: Fetch blockers and blocked-by issues
  const blockers: JiraIssue[] = [];
  const blocking: JiraIssue[] = [];
  
  // Find blocking relationships from target and all parents
  const allLinks = [target, ...parents].flatMap(item => parseIssueLinks(item.fields.issuelinks));
  
  for (const link of allLinks) {
    if (fetchedKeys.has(link.linkedIssueKey)) {
      continue; // Already fetched
    }
    
    if (link.type.toLowerCase().includes('block')) {
      if (link.direction === 'inward') {
        // This issue IS blocked BY link.linkedIssueKey (blocker)
        await notify(`Fetching blocker ${link.linkedIssueKey}...`);
        const blockerResponse = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
        const blocker = await blockerResponse.json() as JiraIssue;
        blockers.push(blocker);
        fetchedKeys.add(blocker.key);
      } else if (link.direction === 'outward') {
        // This issue BLOCKS link.linkedIssueKey
        await notify(`Fetching blocked item ${link.linkedIssueKey}...`);
        const blockedResponse = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
        const blocked = await blockedResponse.json() as JiraIssue;
        blocking.push(blocked);
        fetchedKeys.add(blocked.key);
      }
    }
  }
  
  // Step 4: Fetch project description
  const projectKey = target.fields.project?.key;
  if (!projectKey) {
    throw new Error(`Issue ${issueKey} has no project key`);
  }
  
  await notify(`Fetching project ${projectKey}...`);
  const projectResponse = await getJiraProject(client, cloudId, projectKey);
  const projectData = await projectResponse.json() as { key: string; name: string; description?: string | null };
  const project: JiraProject = {
    key: projectData.key,
    name: projectData.name,
    description: projectData.description || null
  };
  
  // Combine all items
  const allItems = [target, ...parents, ...blockers, ...blocking];
  
  console.log(`  ✅ Fetched ${allItems.length} items total`);
  console.log(`    Target: ${target.key} (${target.fields.issuetype?.name})`);
  console.log(`    Parents: ${parents.map(p => p.key).join(' → ') || 'none'}`);
  console.log(`    Blockers: ${blockers.map(b => b.key).join(', ') || 'none'}`);
  console.log(`    Blocking: ${blocking.map(b => b.key).join(', ') || 'none'}`);
  
  return {
    target,
    parents,
    blockers,
    blocking,
    project,
    allItems,
    siteName
  };
}
