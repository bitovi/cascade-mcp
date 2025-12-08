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
import { downloadFigmaImagesBatch, fetchFigmaFileMetadata } from '../../../figma/figma-helpers.js';
import { getFigmaFileCachePath, ensureValidCacheForFigmaFile, saveFigmaMetadata } from '../../../figma/figma-cache.js';
import { writeNotesForScreen } from '../writing-shell-stories/note-text-extractor.js';
import {
  generateScreenAnalysisPrompt,
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS
} from '../writing-shell-stories/prompt-screen-analysis.js';

/**
 * Screen to analyze
 */
export interface ScreenToAnalyze {
  name: string;           // Node ID (e.g., "1234:5678")
  url: string;            // Full Figma URL
  notes?: string[];       // Optional notes from Figma
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
  const { generateText, figmaClient, screens, allFrames, allNotes, figmaFileKey, epicContext, notify } = params;
  
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
    const analysisPath = path.join(fileCachePath, `${screen.name}.analysis.md`);
    try {
      await fs.access(analysisPath);
      // File exists - skip this screen
      console.log(`     ✓ Cache hit: ${screen.name}`);
      cachedScreens.push(screen.name);
    } catch {
      // File doesn't exist - need to analyze
      console.log(`     ✗ Cache miss: ${screen.name}`);
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
    return { downloadedImages: 0, analyzedScreens: 0, downloadedNotes: 0, usedCache: true };
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
    
    if (notify) {
      await notify(`✅ Downloaded ${Array.from(imagesMap.values()).filter(v => v !== null).length} images. Starting AI analysis...`);
    }
    
  } catch (error: any) {
    console.log(`  ⚠️  Batch download failed: ${error.message}`);
    
    // If this is a rate limit error, propagate it to the user
    if (error.message && error.message.includes('Figma API rate limit exceeded')) {
      throw error;
    }
    
    // For other errors, return what we have
    return { downloadedImages, analyzedScreens, downloadedNotes, usedCache: false };
  }
  
  // ==========================================
  // Phase B: Analyze screens with pre-downloaded images
  // ==========================================
  
  for (let i = 0; i < screensToAnalyze.length; i++) {
    const screen = screensToAnalyze[i];
    const originalIndex = screens.indexOf(screen);
    
    if (notify) {
      await notify(`🤖 Analyzing: ${screen.name}`);
    }
    
    // Find the frame for this screen
    const frame = allFrames.find(f => 
      screen.url.includes(f.id.replace(/:/g, '-'))
    );
    
    if (!frame) {
      console.log(`  ⚠️  Frame not found for screen: ${screen.name}`);
      continue;
    }
    
    // Step 1: Prepare notes file for this screen (if notes provided)
    if (screen.notes && screen.notes.length > 0) {
      const notesWritten = await writeNotesForScreen(
        { name: screen.name, url: screen.url, notes: screen.notes },
        allNotes,
        fileCachePath  // Save to cache directory
      );
      if (notesWritten > 0) {
        downloadedNotes++;
      }
    }
    
    // Step 2: Get pre-downloaded image
    const imageResult = imagesMap.get(frame.id);
    
    if (!imageResult) {
      console.log(`  ⚠️  No image for ${screen.name}`);
      continue;
    }
    
    // Save image to cache directory
    const imagePath = path.join(fileCachePath, `${screen.name}.png`);
    const imageBuffer = Buffer.from(imageResult.base64Data, 'base64');
    await fs.writeFile(imagePath, imageBuffer);
    
    downloadedImages++;
    
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
      const screenPosition = `${originalIndex + 1} of ${screens.length}`;
      const analysisPrompt = generateScreenAnalysisPrompt(
        screen.name,
        screen.url,
        screenPosition,
        notesContent || undefined,
        epicContext
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
      
      // Step 4: Save analysis result to cache directory with Figma URL prepended
      const analysisWithUrl = `**Figma URL:** ${screen.url}\n\n${analysisText}`;
      const analysisPath = path.join(fileCachePath, `${screen.name}.analysis.md`);
      await fs.writeFile(analysisPath, analysisWithUrl, 'utf-8');
      
      analyzedScreens++;
      
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
  
  // After successful analysis, save metadata to enable cache validation
  try {
    const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
    await saveFigmaMetadata(figmaFileKey, fileMetadata);
  } catch (error: any) {
    console.log(`    ⚠️  Failed to save cache metadata: ${error.message}`);
    // Non-fatal - analysis succeeded, just couldn't save timestamp
  }
  
  return { downloadedImages, analyzedScreens, downloadedNotes, usedCache: false };
}

