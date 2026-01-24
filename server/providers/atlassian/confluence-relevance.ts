/**
 * Confluence Relevance Scoring
 * 
 * Scores how relevant a Confluence document is to each of the combined tools
 * (analyze-feature-scope, write-shell-stories, write-next-story).
 * 
 * Uses LLM to analyze document content and score relevance against
 * tool summaries (raw markdown passed directly to LLM).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { GenerateTextFn } from '../../llm-client/types.js';
import type { DocumentRelevance, ToolRelevanceScore } from './confluence-cache.js';
import { getProjectRoot } from '../../utils/file-paths.js';

// ============================================================================
// Types
// ============================================================================

/** Tool IDs for the combined tools */
export type ToolId = 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';

/** Raw tool summary (just the markdown content) */
export interface RawToolSummary {
  toolId: ToolId;
  markdown: string;
}

// ============================================================================
// Tool Summary Loading
// ============================================================================

/** In-memory cache for tool summaries */
let toolSummariesCache: RawToolSummary[] | null = null;

/**
 * Load raw tool summary markdown files
 * 
 * Caches results in memory (summaries don't change at runtime).
 */
export async function loadToolSummaries(): Promise<RawToolSummary[]> {
  // Return cached if available
  if (toolSummariesCache) {
    return toolSummariesCache;
  }
  
  const projectRoot = getProjectRoot();
  const toolsBasePath = path.join(projectRoot, 'server/providers/combined/tools');
  
  const toolPaths: Array<{ toolId: ToolId; folder: string }> = [
    { toolId: 'analyze-feature-scope', folder: 'analyze-feature-scope' },
    { toolId: 'write-shell-stories', folder: 'writing-shell-stories' },
    { toolId: 'write-next-story', folder: 'write-next-story' },
  ];
  
  const summaries: RawToolSummary[] = [];
  
  for (const { toolId, folder } of toolPaths) {
    const summaryPath = path.join(toolsBasePath, folder, 'tool-summary.md');
    
    try {
      const markdown = await fs.readFile(summaryPath, 'utf-8');
      summaries.push({ toolId, markdown });
      console.log(`  📋 Loaded tool summary: ${toolId}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`  ⚠️  Tool summary not found: ${summaryPath}`);
        summaries.push({ toolId, markdown: `# ${toolId}\n\nNo summary available.` });
      } else {
        throw error;
      }
    }
  }
  
  // Cache and return
  toolSummariesCache = summaries;
  return summaries;
}

/**
 * Clear the tool summaries cache (useful for testing)
 */
export function clearToolSummariesCache(): void {
  toolSummariesCache = null;
}

// ============================================================================
// Relevance Scoring
// ============================================================================

/**
 * Build the prompt for relevance scoring
 */
function buildRelevanceScoringPrompt(
  title: string,
  documentContent: string,
  toolSummaries: RawToolSummary[]
): string {
  const toolsSection = toolSummaries.map(tool => 
    `### ${tool.toolId}\n\n${tool.markdown}`
  ).join('\n\n---\n\n');

  return `You are evaluating how relevant a Confluence document is to software development tools.

## Document to Evaluate
Title: ${title}

Content:
${documentContent}

---

## Tool Summaries
Each tool below has a summary describing what it does and what information helps it make decisions.

${toolsSection}

---

## Task
Score how relevant the document is to each tool on a 0-10 scale:
- 0: No relevant information
- 1-3: Tangentially related, minor context
- 4-6: Moderately useful, some applicable information  
- 7-9: Highly relevant, directly addresses tool's needs
- 10: Essential, primary source for this tool

Also determine the document type:
- "requirements": PRDs, feature specs, user stories, acceptance criteria
- "technical": Architecture docs, API specs, data models, technical decisions
- "context": Background info, project goals, constraints, timelines
- "dod": Definition of Done, quality gates, testing requirements
- "unknown": Doesn't fit other categories

Output JSON only (no markdown code blocks):
{
  "documentType": "requirements|technical|context|dod|unknown",
  "toolScores": [
    {
      "toolId": "analyze-feature-scope",
      "overallScore": 7.5,
      "summary": "Brief explanation of why this document is/isn't relevant"
    },
    {
      "toolId": "write-shell-stories",
      "overallScore": 6.0,
      "summary": "Brief explanation"
    },
    {
      "toolId": "write-next-story",
      "overallScore": 8.0,
      "summary": "Brief explanation"
    }
  ]
}`;
}

/**
 * Parse the LLM response into structured relevance data
 */
function parseRelevanceResponse(response: string): DocumentRelevance {
  // Try to extract JSON from the response
  let jsonStr = response.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  
  const toolIds: ToolId[] = ['analyze-feature-scope', 'write-shell-stories', 'write-next-story'];
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Validate document type
    const documentType = ['requirements', 'technical', 'context', 'dod', 'unknown'].includes(parsed.documentType)
      ? parsed.documentType
      : 'unknown';
    
    // Build tool scores
    const toolScores: ToolRelevanceScore[] = toolIds.map(toolId => {
      const toolScore = parsed.toolScores?.find((t: any) => t.toolId === toolId);
      
      return {
        toolId,
        decisionPointScores: [], // Not using individual decision points anymore
        overallScore: toolScore?.overallScore ?? 5,
        summary: toolScore?.summary ?? 'No summary provided',
      };
    });
    
    return { documentType, toolScores };
  } catch (error) {
    console.log('  ⚠️  Failed to parse relevance response, using defaults');
    // Return default scores on parse failure
    return {
      documentType: 'unknown',
      toolScores: toolIds.map(toolId => ({
        toolId,
        decisionPointScores: [],
        overallScore: 5, // Middle score as default
        summary: 'Parse error - using default score',
      })),
    };
  }
}

/**
 * Score document relevance against all tools using LLM
 * 
 * @param generateText - LLM client function
 * @param title - Document title
 * @param markdown - Full document content in markdown
 * @returns Relevance scores for all tools
 */
export async function scoreDocumentRelevance(
  generateText: GenerateTextFn,
  title: string,
  markdown: string
): Promise<DocumentRelevance> {
  // Load tool summaries
  const summaries = await loadToolSummaries();
  
  // Truncate very long documents to avoid token limits
  // Keep first 30KB for relevance scoring (should be plenty for categorization)
  const maxContentLength = 30000;
  const truncatedContent = markdown.length > maxContentLength
    ? markdown.substring(0, maxContentLength) + '\n\n[Content truncated for relevance scoring...]'
    : markdown;
  
  console.log(`  🎯 Scoring document relevance: "${title}"`);
  
  const prompt = buildRelevanceScoringPrompt(title, truncatedContent, summaries);
  
  const response = await generateText({
    messages: [
      { role: 'user', content: prompt },
    ],
    maxTokens: 2000,
    temperature: 0.3, // Lower temperature for more consistent scoring
  });
  
  const relevance = parseRelevanceResponse(response.text);
  
  console.log(`    📊 Document type: ${relevance.documentType}`);
  for (const toolScore of relevance.toolScores) {
    console.log(`    📊 ${toolScore.toolId}: ${toolScore.overallScore}/10`);
  }
  
  return relevance;
}

/**
 * Get relevance threshold from environment variable
 * 
 * Supports both shared and legacy environment variables:
 * - DOCS_RELEVANCE_THRESHOLD (shared, preferred)
 * - CONFLUENCE_RELEVANCE_THRESHOLD (legacy, for backward compatibility)
 * 
 * @returns Minimum score for a document to be considered relevant
 */
export function getRelevanceThreshold(): number {
  // Check shared threshold first, then legacy Confluence-specific
  const thresholdStr = process.env.DOCS_RELEVANCE_THRESHOLD 
    ?? process.env.CONFLUENCE_RELEVANCE_THRESHOLD 
    ?? '3.0';
  const threshold = parseFloat(thresholdStr);
  return isNaN(threshold) ? 3.0 : threshold;
}

/**
 * Get relevance threshold from environment variable (shared alias)
 * 
 * This is the preferred function for new code. Uses DOCS_RELEVANCE_THRESHOLD
 * with fallback to CONFLUENCE_RELEVANCE_THRESHOLD for backward compatibility.
 * 
 * @returns Minimum score for a document to be considered relevant (default 3.0)
 */
export function getDocsRelevanceThreshold(): number {
  return getRelevanceThreshold();
}
