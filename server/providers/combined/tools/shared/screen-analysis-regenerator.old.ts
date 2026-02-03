/**
 * Screen Analysis Regenerator
 * 
 * Shared utility for regenerating missing screen analysis files.
 * Used by both write-shell-stories and write-next-story tools.
 * 
 * Uses batch downloading: fetches all image URLs in one request, then downloads
 * from CDN in parallel for optimal rate limit efficiency.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { FigmaClient } from '../../../figma/figma-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';
import { downloadFigmaImagesBatch, fetchFigmaFileMetadata, FigmaUnrecoverableError } from '../../../figma/figma-helpers.js';
import { getFigmaFileCachePath, ensureValidCacheForFigmaFile, saveFigmaMetadata } from '../../../figma/figma-cache.js';
import { writeNotesForScreen } from '../writing-shell-stories/note-text-extractor.js';
import {
  generateScreenAnalysisPrompt,
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS
} from '../writing-shell-stories/prompt-screen-analysis.js';
import { generateSemanticXml } from '../../../figma/semantic-xml-generator.js';

/**
 * Screen to analyze
 */
export interface ScreenToAnalyze {
  name: string;           // Sanitized kebab-case name for display
  nodeId: string;         // Original Figma node ID (e.g., "1234:5678")
  url: string;            // Full Figma URL
  notes?: string[];       // Optional notes from Figma
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name if applicable
  sectionId?: string;     // Parent SECTION ID if applicable
  filename?: string;      // Filename without extension
}

/**
 * Parameters for regenerating screen analyses
 */
export interface RegenerateAnalysesParams {
  generateText: GenerateTextFn;   // LLM client for generating analysis
  figmaClient: FigmaClient;        // Figma API client with auth in closure
  screens: ScreenToAnalyze[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  nodesDataMap?: Map<string, any>;  // Map of nodeId -> full node data for semantic XML generation
  epicContext?: string;   // Optional epic description content for context
  notify?: (message: string) => Promise<void>;  // Optional progress callback
}

/**
 * Result of regeneration
 */
export interface RegenerateAnalysesResult {
  downloadedImages: number;
  analyzedScreens: number;
  downloadedNotes: number;
  usedCache: boolean;  // Whether cached data was used
  cachedScreens: number;  // Number of screens that were already cached
}

/**
 * Regenerate missing screen analysis files
 * 
 * Downloads Figma images and generates AI analysis for the specified screens.
 * Uses file-based caching (cache/figma-files/{fileKey}/) with Tier 3 timestamp validation.
 * Skips screens that already have analysis files when cache is valid.
 * Uses pipelining: starts downloading next image while analyzing current screen.
 * Saves both images (.png) and analysis files (.analysis.md) to cache directory.
 * 
 * @param params - Configuration including screens to analyze and Figma context
 * @returns Counts of downloaded images, analyzed screens, and note files
 */
export async function regenerateScreenAnalyses(
  params: RegenerateAnalysesParams
): Promise<RegenerateAnalysesResult> {
  const { generateText, figmaClient, screens, allFrames, allNotes, figmaFileKey, nodesDataMap, epicContext, notify } = params;
  
  let downloadedImages = 0;
  let analyzedScreens = 0;
  let downloadedNotes = 0;
  
  // Use file-based cache path for Figma artifacts (always enabled)
  const fileCachePath = getFigmaFileCachePath(figmaFileKey);
  
  console.log(`  🔍 regenerateScreenAnalyses called with ${screens.length} screens`);
  if (screens.length > 0) {
    console.log(`     Screen names: ${screens.map(s => s.name).join(', ')}`);
  }
  console.log(`     Cache path: ${fileCachePath}`);
  
  // Step 1: Validate cache if it exists (using Tier 3 /meta endpoint)
  await ensureValidCacheForFigmaFile(figmaClient, figmaFileKey);
  
  // Step 2: Check which screens need analysis (not in cache or cache invalid)
  const screensToAnalyze: ScreenToAnalyze[] = [];
  const cachedScreens: string[] = [];
  
  for (const screen of screens) {
    // Invalidate cache if filename property is missing (old format)
    if (!screen.filename) {
      console.log(`     ⚠️  Missing filename property - invalidating cache for screen`);
      screensToAnalyze.push(screen);
      continue;
    }
    
    const filename = screen.filename;
    const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
    
    try {
      await fs.access(analysisPath);
      // File exists - skip this screen
      console.log(`     ✓ Cache hit: ${filename}`);
      cachedScreens.push(screen.name);
    } catch {
      console.log(`     ✗ Cache miss: ${filename}`);
      screensToAnalyze.push(screen);
    }
  }
  
  // Log cached screens if any
  if (cachedScreens.length > 0) {
    console.log(`    ♻️  Cached: ${cachedScreens.join(', ')}`);
  }
  
  // If all screens are cached, return early
  console.log(`  📊 Analysis needed: ${screensToAnalyze.length} screens, Cached: ${cachedScreens.length} screens`);
  if (screensToAnalyze.length === 0) {
    console.log(`  ♻️  All screens cached - returning early`);
    return { downloadedImages: 0, analyzedScreens: 0, downloadedNotes: 0, usedCache: true, cachedScreens: cachedScreens.length };
  }
  
  // ==========================================
  // Phase A: Batch download ALL images upfront
  // ==========================================
  
  if (notify) {
    await notify(`📥 Batch downloading ${screensToAnalyze.length} images...`);
  }
  
  // Map screens to their frame IDs
  const screenFrameMap = new Map<string, { screen: ScreenToAnalyze; frameId: string; originalIndex: number }>();
  const frameIds: string[] = [];
  
  for (const screen of screensToAnalyze) {
    const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
    
    if (!frame) {
      console.log(`  ⚠️  Frame not found for screen: ${screen.name}`);
      continue;
    }
    
    const originalIndex = screens.indexOf(screen);
    screenFrameMap.set(frame.id, { screen, frameId: frame.id, originalIndex });
    frameIds.push(frame.id);
  }
  
  // Batch download all images
  let imagesMap: Map<string, any> = new Map();
  
  try {
    imagesMap = await downloadFigmaImagesBatch(
      figmaClient,
      figmaFileKey,
      frameIds,
      { format: 'png', scale: 1 }
    );
    
  } catch (error: any) {
    console.log(`  ⚠️  Batch download failed: ${error.message}`);
    
    // Re-throw unrecoverable errors (403 permission denied, 429 rate limit)
    // These indicate authentication/authorization issues that won't be fixed by retrying
    if (error instanceof FigmaUnrecoverableError) {
      throw error;
    }
    
    // For other errors, return what we have
    return { downloadedImages, analyzedScreens, downloadedNotes, usedCache: false, cachedScreens: cachedScreens.length };
  }
  
  // ==========================================
  // Phase B: Analyze screens
  // Queue wrapper handles parallel vs sequential automatically:
  // - AI SDK: actual parallel execution
  // - MCP sampling: queued sequential execution
  // ==========================================
  
  console.log(`  📷 Analyzing ${screensToAnalyze.length} screens...`);
  
  if (notify) {
    const imageCount = Array.from(imagesMap.values()).filter(v => v !== null).length;
    await notify(`✅ Downloaded ${imageCount} images. Starting AI analysis...`);
  }
  
  // Use Promise.all - queue wrapper handles sequencing for MCP sampling
  const isSequential = !generateText.supportsParallelRequests;
  
  const analysisPromises = screensToAnalyze.map(async (screen, index) => {
    const originalIndex = screens.indexOf(screen);
    
    // Send progress notification BEFORE analysis starts (only for sequential execution)
    if (notify && isSequential) {
      await notify(`📱 Analyzing screen ${index + 1} of ${screensToAnalyze.length}: ${screen.name}...`);
    }
    
    const result = await analyzeScreen(screen, {
      generateText,
      allFrames,
      allNotes,
      imagesMap,
      fileCachePath,
      nodesDataMap,
      epicContext,
      originalIndex,
      totalScreens: screens.length
    });
    
    // Notify after each completes (for both parallel and sequential)
    if (notify && result.analyzed) {
      await notify(`✅ Analyzed: ${screen.name}`);
    }
    
    return result;
  });
  
  const analysisResults = await Promise.all(analysisPromises);
  
  // Count successes
  downloadedImages = analysisResults.filter(r => r.analyzed).length;
  analyzedScreens = analysisResults.filter(r => r.analyzed).length;
  downloadedNotes = analysisResults.reduce((sum, r) => sum + r.notesWritten, 0);
  
  // After successful analysis, save metadata to enable cache validation
  try {
    const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
    await saveFigmaMetadata(figmaFileKey, fileMetadata);
  } catch (error: any) {
    console.log(`    ⚠️  Failed to save cache metadata: ${error.message}`);
    // Non-fatal - analysis succeeded, just couldn't save timestamp
  }
  
  return { downloadedImages, analyzedScreens, downloadedNotes, usedCache: false, cachedScreens: cachedScreens.length };
}

/**
 * Analyze a single screen with pre-downloaded image
 * 
 * @param screen - Screen to analyze
 * @param params - Analysis parameters (generateText, paths, image data, etc.)
 * @returns Analysis metadata (success, filename, notes written)
 */
async function analyzeScreen(
  screen: ScreenToAnalyze,
  params: {
    generateText: GenerateTextFn;
    allFrames: FigmaNodeMetadata[];
    allNotes: FigmaNodeMetadata[];
    imagesMap: Map<string, any>;
    fileCachePath: string;
    nodesDataMap?: Map<string, any>;
    epicContext?: string;
    originalIndex: number;
    totalScreens: number;
  }
): Promise<{ filename: string; analyzed: boolean; notesWritten: number }> {
  const { generateText, allFrames, allNotes, imagesMap, fileCachePath, nodesDataMap, epicContext, originalIndex, totalScreens } = params;
  
  // Find the frame for this screen
  const frame = allFrames.find(f => 
    screen.url.includes(f.id.replace(/:/g, '-'))
  );
  
  if (!frame) {
    console.log(`  ⚠️  Frame not found for screen: ${screen.name}`);
    return { filename: screen.filename || screen.name, analyzed: false, notesWritten: 0 };
  }
  
  // Use filename if available, fallback to screen.name for backward compatibility
  const filename = screen.filename || screen.name;
  
  // Step 1: Prepare notes file for this screen (if notes provided)
  let notesWritten = 0;
  if (screen.notes && screen.notes.length > 0) {
    notesWritten = await writeNotesForScreen(
      { name: screen.name, nodeId: screen.nodeId, url: screen.url, notes: screen.notes },
      allNotes,
      fileCachePath
    );
  }
  
  // Step 2: Get pre-downloaded image
  const imageResult = imagesMap.get(frame.id);
  
  if (!imageResult) {
    console.log(`  ⚠️  No image for ${screen.name}`);
    return { filename, analyzed: false, notesWritten };
  }
  
  // Save image to cache directory using new filename format
  const imagePath = path.join(fileCachePath, `${filename}.png`);
  const imageBuffer = Buffer.from(imageResult.base64Data, 'base64');
  await fs.writeFile(imagePath, imageBuffer);
  
  // Step 2.5: Generate semantic XML if node data available
  let semanticXml: string | undefined;
  if (nodesDataMap) {
    const frameId = frame.id; // Already have this from finding the frame
    const nodeData = nodesDataMap.get(frameId);
    
    if (nodeData) {
      try {
        semanticXml = generateSemanticXml(nodeData);
        const xmlSizeKb = Math.round(semanticXml.length / 1024);
        
        // Check 200KB size limit
        const maxSizeKb = 200;
        if (xmlSizeKb > maxSizeKb) {
          const originalSizeKb = xmlSizeKb;
          const maxBytes = maxSizeKb * 1024;
          const truncationNote = `\n\n<!-- NOTE: Component structure truncated due to complexity. The above shows the primary components and hierarchy. Some deeply nested or repetitive elements have been omitted. -->`;
          semanticXml = semanticXml.substring(0, maxBytes - truncationNote.length) + truncationNote;
          console.log(`    ⚠️  Semantic XML truncated (original: ${originalSizeKb} KB, limit: ${maxSizeKb} KB)`);
        } else {
          console.log(`    🔍 Generated semantic XML (${xmlSizeKb} KB) for analysis`);
        }
        
        // Save to debug cache if enabled (optional for debugging)
        if (process.env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === 'true') {
          const semanticXmlPath = path.join(fileCachePath, `${filename}.semantic.xml`);
          await fs.writeFile(semanticXmlPath, semanticXml, 'utf-8');
          console.log(`    📁 Saved semantic XML to debug cache`);
        }
      } catch (error: any) {
        console.log(`    ⚠️  Failed to generate semantic XML: ${error.message}`);
        // Continue without semantic XML - not critical
      }
    } else {
      console.log(`    ℹ️  No node data found for frame ${frameId}`);
    }
  } else {
    console.log(`    ℹ️  No semantic structure available (node data not provided)`);
  }
  
  // Step 3: Run AI analysis on screen
  try {
    // Read notes content if available
    let notesContent = '';
    const notesPath = path.join(fileCachePath, `${screen.name}.notes.md`);
    try {
      notesContent = await fs.readFile(notesPath, 'utf-8');
    } catch {
      // No notes file, that's okay
    }
    
    // Generate analysis prompt using helper
    const screenPosition = `${originalIndex + 1} of ${totalScreens}`;
    const analysisPrompt = generateScreenAnalysisPrompt(
      screen.name,
      screen.url,
      screenPosition,
      notesContent || undefined,
      epicContext,
      semanticXml
    );

    // Generate analysis using injected LLM client (with image)
    const analysisResponse = await generateText({
      messages: [
        { role: 'system', content: SCREEN_ANALYSIS_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'image', data: imageResult.base64Data, mimeType: 'image/png' }
          ]
        }
      ],
      maxTokens: SCREEN_ANALYSIS_MAX_TOKENS
    });
    
    const analysisText = analysisResponse.text;
    if (!analysisText) {
      throw new Error('No analysis content received from AI');
    }
    
    // Step 4: Prepend SECTION context header if applicable
    let finalAnalysisContent = analysisText;
    
    if (screen.sectionName) {
      const sectionHeader = `# ${screen.frameName}\n\n**Part of SECTION:** ${screen.sectionName}\n**Frame ID:** ${frame.id}\n\n---\n\n`;
      finalAnalysisContent = sectionHeader + analysisText;
    }
    
    // Step 5: Save analysis result to cache directory with Figma URL prepended
    const analysisWithUrl = `**Figma URL:** ${screen.url}\n\n${finalAnalysisContent}`;
    const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
    await fs.writeFile(analysisPath, analysisWithUrl, 'utf-8');
    
    return { filename, analyzed: true, notesWritten };
    
  } catch (error: any) {
    console.log(`  ⚠️  Failed to analyze ${screen.name}: ${error.message}`);
    
    // Check if this is an authentication/credentials error for better error message
    if (error.message && (
      error.message.includes('invalid x-api-key') ||
      error.message.includes('invalid API key') ||
      error.message.includes('API key') ||
      error.message.includes('authentication') ||
      error.message.includes('unauthorized') ||
      error.message.includes('401')
    )) {
      throw new Error(`AI analysis failed - likely invalid LLM API credentials: ${error.message}`);
    }
    
    // For all errors, throw immediately since downstream requires all screens analyzed
    throw new Error(`Failed to analyze screen ${screen.name}: ${error.message}`);
  }
}
