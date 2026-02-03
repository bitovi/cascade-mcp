/**
 * Jira Hierarchy Fetcher
 * 
 * Recursively fetches Jira issues (parent chain, blockers) and project description
 * to gather comprehensive context for story review.
 */

import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { getJiraIssue, getJiraProject, extractProjectKeyFromIssueKey } from '../../../atlassian/atlassian-helpers.js';
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
// Helper Functions
// ============================================================================

/**
 * Fetch parents and blockers in parallel where possible
 * 
 * Strategy:
 * 1. Fetch all parents recursively (must be sequential due to parent chain)
 * 2. Extract blocker links from target AND parents
 * 3. Fetch all blockers in parallel
 * 4. Fetch all blocking in parallel
 * 
 * @param target - The target issue
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param maxDepth - Maximum depth for parent traversal
 * @param fetchedKeys - Set of already-fetched issue keys
 * @param notify - Progress notification callback
 * @returns Tuple of [parents, blockers, blocking]
 */
async function fetchParentsAndBlockers(
  target: JiraIssue,
  client: AtlassianClient,
  cloudId: string,
  maxDepth: number,
  fetchedKeys: Set<string>,
  notify: (message: string) => Promise<void>
): Promise<[JiraIssue[], JiraIssue[], JiraIssue[]]> {
  
  // Step 1: Recursively fetch parents (must be sequential)
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
  
  console.log(`  ✅ Fetched ${parents.length} parents`);
  
  // Step 2: Extract blocker links from target AND parents
  const allLinks = [target, ...parents].flatMap(item => parseIssueLinks(item.fields.issuelinks));
  
  // Step 3: Group links by type and fetch in parallel
  const blockerLinks = allLinks.filter(link => 
    link.type.toLowerCase().includes('block') && 
    link.direction === 'inward' &&
    !fetchedKeys.has(link.linkedIssueKey)
  );
  
  const blockingLinks = allLinks.filter(link => 
    link.type.toLowerCase().includes('block') && 
    link.direction === 'outward' &&
    !fetchedKeys.has(link.linkedIssueKey)
  );
  
  // Fetch all blockers in parallel
  const blockerPromises = blockerLinks.map(async (link) => {
    await notify(`Fetching blocker ${link.linkedIssueKey}...`);
    const response = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
    const blocker = await response.json() as JiraIssue;
    fetchedKeys.add(blocker.key);
    return blocker;
  });
  
  // Fetch all blocking in parallel
  const blockingPromises = blockingLinks.map(async (link) => {
    await notify(`Fetching blocked item ${link.linkedIssueKey}...`);
    const response = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
    const blocked = await response.json() as JiraIssue;
    fetchedKeys.add(blocked.key);
    return blocked;
  });
  
  const [blockers, blocking] = await Promise.all([
    Promise.all(blockerPromises),
    Promise.all(blockingPromises)
  ]);
  
  console.log(`  ✅ Fetched ${blockers.length} blockers, ${blocking.length} blocking`);
  
  return [parents, blockers, blocking];
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
  
  // IMMEDIATE: Extract project key from issue key (no API call)
  const projectKey = extractProjectKeyFromIssueKey(issueKey);
  console.log(`  Extracted project key: ${projectKey}`);
  
  // PARALLEL BATCH 1: Fetch target issue and project simultaneously
  await notify(`Fetching ${issueKey} and project ${projectKey}...`);
  
  const [targetResponse, projectResponse] = await Promise.all([
    getJiraIssue(client, cloudId, issueKey, HIERARCHY_FIELDS),
    getJiraProject(client, cloudId, projectKey)
  ]);
  
  const target = await targetResponse.json() as JiraIssue;
  fetchedKeys.add(target.key);
  
  const projectData = await projectResponse.json() as { key: string; name: string; description?: string | null };
  const project: JiraProject = {
    key: projectData.key,
    name: projectData.name,
    description: projectData.description || null
  };
  
  console.log(`  ✅ Target and project fetched in parallel`);
  
  // PARALLEL BATCH 2: Fetch parents and blockers
  await notify(`Fetching parents and blockers...`);
  
  const [parents, blockers, blocking] = await fetchParentsAndBlockers(
    target,
    client,
    cloudId,
    maxDepth,
    fetchedKeys,
    notify
  );
  
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
