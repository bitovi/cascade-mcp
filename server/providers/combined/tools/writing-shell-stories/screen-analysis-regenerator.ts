/**
 * Screen Analysis Regenerator
 * 
 * Shared utility for regenerating missing screen analysis files.
 * Used by both write-shell-stories and write-next-story tools.
 * 
 * Uses pipelined downloading: starts downloading next image while analyzing current screen
 * for optimal performance with multiple screens.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';
import { downloadFigmaImage } from '../../../figma/figma-helpers.js';
import { writeNotesForScreen } from './note-text-extractor.js';
import {
  generateScreenAnalysisPrompt,
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS
} from './prompt-screen-analysis.js';

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
  mcp: McpServer;
  screens: ScreenToAnalyze[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  figmaToken: string;
  tempDirPath: string;
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
}

/**
 * Regenerate missing screen analysis files
 * 
 * Downloads Figma images and generates AI analysis for the specified screens.
 * Uses pipelining: starts downloading next image while analyzing current screen.
 * Saves both images (.png) and analysis files (.analysis.md) to temp directory.
 * 
 * @param params - Configuration including screens to analyze and Figma context
 * @returns Counts of downloaded images, analyzed screens, and note files
 */
export async function regenerateScreenAnalyses(
  params: RegenerateAnalysesParams
): Promise<RegenerateAnalysesResult> {
  const { mcp, screens, allFrames, allNotes, figmaFileKey, figmaToken, tempDirPath, epicContext, notify } = params;
  
  console.log(`Regenerating analysis for ${screens.length} screens...`);
  
  let downloadedImages = 0;
  let analyzedScreens = 0;
  let downloadedNotes = 0;
  
  // Helper to download image for a screen
  async function downloadScreenImage(screen: ScreenToAnalyze, frameId: string): Promise<{
    base64Data: string;
    byteSize: number;
  } | null> {
    try {
      const imageResult = await downloadFigmaImage(
        figmaFileKey,
        frameId,
        figmaToken,
        { format: 'png', scale: 1 }
      );
      
      const imageSizeKB = Math.round(imageResult.byteSize / 1024);
      
      // Save image to temp directory
      const imagePath = path.join(tempDirPath, `${screen.name}.png`);
      const imageBuffer = Buffer.from(imageResult.base64Data, 'base64');
      await fs.writeFile(imagePath, imageBuffer);
      
      console.log(`  ✅ Downloaded image: ${screen.name}.png (${imageSizeKB}KB)`);
      
      return imageResult;
    } catch (error: any) {
      console.log(`  ⚠️  Failed to download image for ${screen.name}: ${error.message}`);
      return null;
    }
  }
  
  // Pipeline: Start downloading the first image
  let nextImagePromise: Promise<{ base64Data: string; byteSize: number } | null> | null = null;
  
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    console.log(`  Processing screen ${i + 1}/${screens.length}: ${screen.name}`);
    
    if (notify) {
      await notify(`Analyzing screen: ${screen.name} (${i + 1}/${screens.length})`);
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
        tempDirPath
      );
      if (notesWritten > 0) {
        console.log(`  ✅ Prepared notes: ${screen.name}.notes.md (${notesWritten} notes)`);
        downloadedNotes++;
      }
    }
    
    // Step 2: Download current image (or await previous download if pipelined)
    let imageResult: { base64Data: string; byteSize: number } | null = null;
    
    if (i === 0) {
      // First screen: download directly
      imageResult = await downloadScreenImage(screen, frame.id);
    } else {
      // Subsequent screens: await the previous iteration's prefetch
      imageResult = await nextImagePromise!;
    }
    
    if (imageResult) {
      downloadedImages++;
    }
    
    // Step 3: Start downloading NEXT image while we analyze CURRENT (pipeline optimization)
    const nextScreen = screens[i + 1];
    if (nextScreen) {
      const nextFrame = allFrames.find(f => 
        nextScreen.url.includes(f.id.replace(/:/g, '-'))
      );
      
      if (nextFrame) {
        // Start next download in background (don't await)
        nextImagePromise = downloadScreenImage(nextScreen, nextFrame.id);
      }
    }
    
    // Step 4: Run AI analysis on CURRENT screen (while next image downloads in parallel)
    if (imageResult) {
      try {
        console.log(`  🤖 Analyzing screen with AI...`);
        
        // Read notes content if available
        let notesContent = '';
        const notesPath = path.join(tempDirPath, `${screen.name}.notes.md`);
        try {
          notesContent = await fs.readFile(notesPath, 'utf-8');
        } catch {
          // No notes file, that's okay
        }
        
        // Generate analysis prompt using helper
        const screenPosition = `${i + 1} of ${screens.length}`;
        const analysisPrompt = generateScreenAnalysisPrompt(
          screen.name,
          screen.url,
          screenPosition,
          notesContent || undefined,
          epicContext
        );

        // Send sampling request with image (while next image downloads)
        const samplingResponse = await mcp.server.request({
          "method": "sampling/createMessage",
          "params": {
            "messages": [
              {
                "role": "user",
                "content": {
                  "type": "text",
                  "text": analysisPrompt
                }
              },
              {
                "role": "user",
                "content": {
                  "type": "image",
                  "data": imageResult.base64Data,
                  "mimeType": "image/png"
                }
              }
            ],
            "speedPriority": 0.5,
            "systemPrompt": SCREEN_ANALYSIS_SYSTEM_PROMPT,
            "maxTokens": SCREEN_ANALYSIS_MAX_TOKENS
          }
        }, CreateMessageResultSchema);
        
        const analysisText = samplingResponse.content?.text as string;
        if (!analysisText) {
          throw new Error('No analysis content received from AI');
        }
        
        console.log(`  ✅ AI analysis complete (${analysisText.length} characters)`);
        
        // Step 5: Save analysis result with Figma URL prepended
        const analysisWithUrl = `**Figma URL:** ${screen.url}\n\n${analysisText}`;
        const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
        await fs.writeFile(analysisPath, analysisWithUrl, 'utf-8');
        
        console.log(`  ✅ Saved analysis: ${screen.name}.analysis.md`);
        analyzedScreens++;
        
      } catch (error: any) {
        console.log(`  ⚠️  Failed to analyze ${screen.name}: ${error.message}`);
      }
    }
  }
  
  console.log(`  Regeneration complete: ${downloadedImages}/${screens.length} images, ${analyzedScreens} analyses, ${downloadedNotes} note files`);
  
  return { downloadedImages, analyzedScreens, downloadedNotes };
}
