/**
 * Core Logic for figma-ask-scope-questions-for-page
 * 
 * Fetches all data for a Figma page, writes it to a server-side scope cache,
 * and returns a lightweight manifest + workflow instructions (spec 067).
 * 
 * Data flow:
 * 1. Fetch frame data via shared pipeline (URL → nodes → images → annotations → ordering)
 * 2. Fetch file metadata (lightweight /meta call for file name)
 * 3. Generate semantic XML per frame
 * 4. Write everything to server-side scope cache
 * 5. Return lightweight manifest (~3-5KB) with workflow instructions
 */

import type { FigmaClient } from '../../figma-api-client.js';
import type { AnalyzedFrame } from '../../screen-analyses-workflow/types.js';
import { fetchFigmaFileMetadata } from '../../figma-helpers.js';
import { fetchFrameData, type FetchFrameDataOptions } from '../../screen-analyses-workflow/frame-data-fetcher.js';
import { generateSemanticXml } from '../../semantic-xml-generator.js';
import { buildFrameContextMarkdown, findConnections } from './frame-context-builder.js';
import {
  FRAME_ANALYSIS_PROMPT_TEXT,
  SCOPE_SYNTHESIS_PROMPT_TEXT,
  QUESTIONS_GENERATION_PROMPT_TEXT,
} from './prompt-constants.js';
import type { ContentBlock, EmbeddedResource, ImageContent, TextContent } from '../../../../utils/embedded-prompt-builder.js';
import type { DownloadedImage } from '../../screen-analyses-workflow/image-downloader.js';
import { createScopeCache, type CreateScopeCacheInput } from '../../scope-cache.js';
import { buildFigmaUrl } from '../../screen-analyses-workflow/url-processor.js';

// ============================================================================
// Types
// ============================================================================

export interface PageQuestionsContextParams {
  url: string;
  context?: string;
  /** Progress notification callback */
  notify?: (message: string) => Promise<void>;
}

export interface PageQuestionsContextResult {
  [key: string]: unknown;
  content: ContentBlock[];
  isError?: boolean;
}

interface FrameData {
  analyzed: AnalyzedFrame;
  nodeData: any; // Full node tree for semantic XML
  image?: { base64Data: string; mimeType: string };
  semanticXml: string;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute the page questions context workflow
 * 
 * Uses the shared fetchFrameData() pipeline for data fetching (URL parsing,
 * node fetching, image downloading, annotation association, ordering), then
 * generates semantic XML and builds the multi-part MCP response.
 * 
 * @param params - Tool parameters (url, optional context, optional notify)
 * @param figmaClient - Authenticated Figma API client
 * @returns Multi-part MCP response with all frame data and embedded prompts
 */
export async function executePageQuestionsContext(
  params: PageQuestionsContextParams,
  figmaClient: FigmaClient
): Promise<PageQuestionsContextResult> {
  const { url, context, notify } = params;

  // Step 1: Fetch frame data via shared pipeline
  const fetchOptions: FetchFrameDataOptions = {
    imageOptions: { format: 'png', scale: 2 },
    notify,
  };

  let frameData;
  try {
    frameData = await fetchFrameData([url], figmaClient, fetchOptions);
  } catch (err: any) {
    return buildErrorResult(`Failed to fetch Figma data: ${err.message}`);
  }

  const { fileKey, frames, nodesDataMap, images } = frameData;

  if (frames.length === 0) {
    return buildErrorResult('No frames found on the target page');
  }

  // Step 2: Fetch file metadata (lightweight /meta call)
  let fileName = 'Untitled';
  try {
    const metadata = await fetchFigmaFileMetadata(figmaClient, fileKey);
    fileName = metadata.name || 'Untitled';
  } catch (err) {
    console.warn('  Could not fetch file metadata, using default name');
  }

  // Step 3: Derive page info from nodesDataMap
  // The URL pointed to a page (CANVAS node), which is in nodesDataMap
  const pageInfo = derivePageInfo(nodesDataMap);

  // Step 4: Build frame data (semantic XML generation)
  const frameDataList = buildFrameDataList(frames, nodesDataMap, images);

  // Step 5: Build context markdown for each frame
  const allFrameRefs = frameDataList.map(fd => ({
    id: fd.analyzed.nodeId,
    name: fd.analyzed.frameName || fd.analyzed.name,
  }));

  // Build feature-context-aware frame analysis prompt
  const frameAnalysisPrompt = context
    ? FRAME_ANALYSIS_PROMPT_TEXT.replace(
        /\n\n## How To Analyze/,
        `\n\n## Feature Context\n\n${context}\n\n## How To Analyze`,
      )
    : FRAME_ANALYSIS_PROMPT_TEXT;

  // Step 6: Write everything to server-side scope cache
  const cacheInput: CreateScopeCacheInput = {
    fileKey,
    fileName,
    pageName: pageInfo.pageName,
    pageId: pageInfo.pageId,
    featureContext: context,
    frames: frameDataList.map(fd => {
      const connections = findConnections(fd.nodeData, allFrameRefs);
      const contextMd = buildFrameContextMarkdown(
        {
          id: fd.analyzed.nodeId,
          name: fd.analyzed.frameName || fd.analyzed.name,
          sectionName: fd.analyzed.sectionName,
          url: fd.analyzed.url,
        },
        fd.analyzed.annotations,
        connections
      );
      return {
        nodeId: fd.analyzed.nodeId,
        name: fd.analyzed.frameName || fd.analyzed.name,
        order: fd.analyzed.order ?? 0,
        section: fd.analyzed.sectionName || null,
        annotationCount: fd.analyzed.annotations.length,
        url: fd.analyzed.url || buildFigmaUrl(fileKey, fd.analyzed.nodeId),
        imageBase64: fd.image?.base64Data,
        imageMimeType: fd.image?.mimeType,
        contextMd,
        semanticXml: fd.semanticXml,
      };
    }),
  };

  let cacheToken: string;
  try {
    cacheToken = await createScopeCache(cacheInput);
    console.log(`  ✅ Scope cache created: ${cacheToken}`);
  } catch (err: any) {
    console.warn(`  ⚠️ Failed to create scope cache: ${err.message}`);
    // Fall through — still return manifest, just without cacheToken
    cacheToken = '';
  }

  // Step 7: Build lightweight manifest response
  const content = buildManifestResponse(
    frameDataList,
    {
      fileKey,
      fileName,
      pageName: pageInfo.pageName,
      pageId: pageInfo.pageId,
      cacheToken,
      featureContext: context,
    }
  );

  return { content };
}

// ============================================================================
// Step Functions
// ============================================================================

/**
 * Derive page info from the nodesDataMap
 * 
 * When a page URL is passed to fetchFrameData, the CANVAS node
 * is in nodesDataMap with its children. We find it to extract
 * the page name and ID.
 */
function derivePageInfo(
  nodesDataMap: Map<string, any>
): { pageName: string; pageId: string; allPages: Array<{ id: string; name: string }> } {
  // Look for the CANVAS (page) node in the map
  for (const [nodeId, nodeData] of nodesDataMap.entries()) {
    if (nodeData?.type === 'CANVAS') {
      return {
        pageName: nodeData.name || 'Untitled Page',
        pageId: nodeId,
        allPages: [{ id: nodeId, name: nodeData.name || 'Untitled Page' }],
      };
    }
  }

  // Fallback: no CANVAS found (shouldn't happen for page URLs)
  return {
    pageName: 'Unknown Page',
    pageId: '',
    allPages: [],
  };
}

/**
 * Build enriched frame data with semantic XML from fetchFrameData results
 */
function buildFrameDataList(
  frames: AnalyzedFrame[],
  nodesDataMap: Map<string, any>,
  images: Map<string, DownloadedImage>
): FrameData[] {
  return frames.map(frame => {
    const nodeData = nodesDataMap.get(frame.nodeId) || {};
    const image = images.get(frame.nodeId);

    let semanticXml = '';
    try {
      semanticXml = generateSemanticXml(nodeData);
    } catch (err) {
      console.warn(`  Failed to generate semantic XML for ${frame.name}: ${err}`);
    }

    return {
      analyzed: frame,
      nodeData,
      image: image ? { base64Data: image.base64Data, mimeType: image.mimeType } : undefined,
      semanticXml,
    };
  });
}

/**
 * Build a lightweight manifest response (spec 067).
 * 
 * The actual frame data is stored in the server-side scope cache.
 * This response is ~3-5KB — just a JSON manifest + workflow instructions.
 */
function buildManifestResponse(
  frameDataList: FrameData[],
  meta: {
    fileKey: string;
    fileName: string;
    pageName: string;
    pageId: string;
    cacheToken: string;
    featureContext?: string;
  }
): ContentBlock[] {
  const content: ContentBlock[] = [];
  const frameCount = frameDataList.length;
  const cacheExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 1. MANIFEST JSON
  const manifest = {
    fileKey: meta.fileKey,
    fileName: meta.fileName,
    pageName: meta.pageName,
    pageId: meta.pageId,
    cacheToken: meta.cacheToken,
    cacheExpiresAt,
    frameCount,
    frames: frameDataList.map(fd => ({
      id: fd.analyzed.nodeId,
      name: fd.analyzed.frameName || fd.analyzed.name,
      order: fd.analyzed.order,
      section: fd.analyzed.sectionName || null,
      annotationCount: fd.analyzed.annotations.length,
      hasImage: !!fd.image,
      url: fd.analyzed.url || buildFigmaUrl(meta.fileKey, fd.analyzed.nodeId),
    })),
    featureContext: meta.featureContext || null,
    retrievalTool: 'figma-frame-analysis',
  };

  content.push({
    type: 'text',
    text: JSON.stringify(manifest, null, 2),
  } as TextContent);

  // 2. WORKFLOW INSTRUCTIONS
  content.push({
    type: 'text',
    text: buildCacheWorkflowInstructions(meta.fileKey, meta.cacheToken, frameDataList, cacheExpiresAt),
  } as TextContent);

  // 3. EMBEDDED PROMPT RESOURCES (scope-synthesis and generate-questions)
  content.push({
    type: 'resource',
    resource: {
      uri: 'prompt://scope-synthesis',
      mimeType: 'text/markdown',
      text: SCOPE_SYNTHESIS_PROMPT_TEXT,
    },
  } as EmbeddedResource);

  content.push({
    type: 'resource',
    resource: {
      uri: 'prompt://generate-questions',
      mimeType: 'text/markdown',
      text: QUESTIONS_GENERATION_PROMPT_TEXT,
    },
  } as EmbeddedResource);

  return content;
}

// ============================================================================
// Workflow Instructions Builder (Spec 067 — Cache + Per-Frame Pattern)
// ============================================================================

/**
 * Build workflow instructions for the cache-based pattern.
 * The agent gets a lightweight manifest and uses `figma-frame-analysis`
 * to retrieve data one frame at a time.
 */
function buildCacheWorkflowInstructions(
  fileKey: string,
  cacheToken: string,
  frameDataList: FrameData[],
  cacheExpiresAt: string
): string {
  const frameCount = frameDataList.length;

  // Build per-frame lines for the workflow
  const frameLines = frameDataList.map(fd => {
    const name = fd.analyzed.frameName || fd.analyzed.name;
    const url = fd.analyzed.url || buildFigmaUrl(fileKey, fd.analyzed.nodeId);
    return `- **${name}** — \`figma-frame-analysis\` with url="${url}" and cacheToken="${cacheToken}"`;
  }).join('\n');

  return `# Design Review Scope Questions — Workflow Instructions

You have received a manifest describing ${frameCount} Figma frames cached on the server.
The actual frame data (images, structure, annotations) is NOT in this response —
it's stored server-side and must be retrieved one frame at a time.

## Step 1: Analyze each frame

> **⚡ PARALLEL**: Launch one subagent per frame for isolated analysis.
> Each subagent MUST have MCP tool access — it needs to call \`figma-frame-analysis\`.
> Use the default subagent (the same type that can call any tool you can call).
> Each frame analysis benefits from a clean context window — this is why subagents are important.

For each frame in the manifest, call \`figma-frame-analysis\` with:
- \`url\`: the frame's \`url\` from the manifest
- \`cacheToken\`: "${cacheToken}" (reads from server cache — fast, 0 Figma API calls)

Frames to analyze:
${frameLines}

### Subagent Prompt (copy this for each frame, substituting url)

Each subagent should receive a prompt like the following. The subagent must be
capable of calling MCP tools (specifically \`figma-frame-analysis\`):

\`\`\`
You are analyzing a single Figma design frame. You MUST call the MCP tool
\`figma-frame-analysis\` with the url and cacheToken provided to retrieve
the frame data. This is an MCP tool call, not a file read.

Call \`figma-frame-analysis\` with:
  url: "<frame url>"
  cacheToken: "${cacheToken}"

The response contains:
- An image of the frame (use as vision input)
- Context markdown with annotations and connections
- Semantic XML structure of the component tree
- Analysis prompt with detailed instructions
- Instructions for where to save your analysis

Follow the analysis prompt instructions to produce your analysis.
Save your analysis to the file path specified in the response.
\`\`\`

## Step 2: Synthesize scope

After ALL frame analyses are complete, use the embedded resource \`prompt://scope-synthesis\`
(included in this response) for synthesis instructions.

Read all \`temp/cascade/${fileKey}/frames/*/analysis.md\` files.
Synthesize a cross-screen scope analysis following the prompt.
Save to \`temp/cascade/${fileKey}/scope-analysis.md\`

## Step 3: Generate questions

Use the embedded resource \`prompt://generate-questions\`
(included in this response) for question generation instructions.

Read \`scope-analysis.md\` + all frame analyses.
Generate frame-specific clarifying questions.
Save to \`temp/cascade/${fileKey}/questions.md\`

## Step 4: Present to user

Output the full contents of \`temp/cascade/${fileKey}/questions.md\` directly in your response to the user.
Do not summarize — paste the entire questions document verbatim.
The user may then:
- Answer questions directly
- Ask you to post them to Figma as comments
- Ask for revisions

## Cache Expiration

The cached data expires at ${cacheExpiresAt} (10 minutes from now).
If you get a cache expiration error, call \`figma-ask-scope-questions-for-page\`
again with the same URL to refresh.

## Writing Analyses

Save frame analyses and scope analysis to your local workspace:
\`\`\`
temp/cascade/${fileKey}/
├── frames/
│   ├── {frame-name}/
│   │   └── analysis.md
│   └── ...
├── scope-analysis.md
└── questions.md
\`\`\`

## Fallback: Sequential Processing

Only if your runtime truly cannot launch subagents, process frames sequentially as a last resort:
For each frame, call \`figma-frame-analysis\` (MCP tool call), analyze, and save.
Note: sequential processing uses one shared context for all frames, which reduces analysis quality.
Then proceed to scope synthesis.
`;
}

// ============================================================================
// Error Helpers
// ============================================================================

function buildErrorResult(message: string): PageQuestionsContextResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }),
      } as TextContent,
    ],
    isError: true,
  };
}
