/**
 * Zip Builder for figma-batch-load
 * 
 * Takes fetched Figma frame data and builds a zip file containing:
 * - manifest.json (frame list with metadata)
 * - prompts/frame-analysis.md (analysis instructions)
 * - prompts/scope-synthesis.md (synthesis instructions) 
 * - frames/{dirName}/image.png (actual PNG binary per frame)
 * - frames/{dirName}/structure.xml (semantic component tree per frame)
 * 
 * Comments are NOT included — fetched separately via figma-get-comments.
 */

import archiver from 'archiver';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { FRAME_ANALYSIS_PROMPT_TEXT, SCOPE_SYNTHESIS_PROMPT_TEXT } from '../figma-ask-scope-questions-for-page/prompt-constants.js';

export interface ZipFrameData {
  nodeId: string;
  name: string;
  dirName: string;
  imageBase64: string;
  structureXml: string;
  url: string;
  order: number;
  section?: string;
}

export interface ZipFileData {
  fileKey: string;
  fileName: string;
  frames: ZipFrameData[];
}

export interface ZipBuildResult {
  zipPath: string;
  manifest: {
    files: Array<{
      fileKey: string;
      fileName: string;
      frames: Array<{
        nodeId: string;
        name: string;
        dirName: string;
        url: string;
        order: number;
      }>;
    }>;
    totalFrames: number;
    zipSizeBytes: number;
  };
}

/**
 * Build a zip file from fetched Figma data
 * 
 * @param files - Array of per-file frame data
 * @returns Path to the zip file and manifest
 */
export async function buildZip(files: ZipFileData[]): Promise<ZipBuildResult> {
  const zipPath = path.join(os.tmpdir(), `cascade-figma-${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  return new Promise<ZipBuildResult>((resolve, reject) => {
    output.on('close', () => {
      const stat = fs.statSync(zipPath);
      
      const manifest = {
        files: files.map(f => ({
          fileKey: f.fileKey,
          fileName: f.fileName,
          frames: f.frames.map(fr => ({
            nodeId: fr.nodeId,
            name: fr.name,
            dirName: fr.dirName,
            url: fr.url,
            order: fr.order,
          })),
        })),
        totalFrames: files.reduce((sum, f) => sum + f.frames.length, 0),
        zipSizeBytes: stat.size,
      };

      resolve({ zipPath, manifest });
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    for (const file of files) {
      const prefix = files.length > 1 ? `${file.fileKey}/` : '';

      // manifest.json
      const fileManifest = {
        fileKey: file.fileKey,
        fileName: file.fileName,
        frames: file.frames.map(fr => ({
          nodeId: fr.nodeId,
          name: fr.name,
          dirName: fr.dirName,
          url: fr.url,
          order: fr.order,
          section: fr.section,
        })),
      };
      archive.append(JSON.stringify(fileManifest, null, 2), { name: `${prefix}manifest.json` });

      // Prompts
      archive.append(FRAME_ANALYSIS_PROMPT_TEXT, { name: `${prefix}prompts/frame-analysis.md` });
      archive.append(SCOPE_SYNTHESIS_PROMPT_TEXT, { name: `${prefix}prompts/scope-synthesis.md` });

      // Per-frame data
      for (const frame of file.frames) {
        archive.append(Buffer.from(frame.imageBase64, 'base64'), { name: `${prefix}frames/${frame.dirName}/image.png` });
        archive.append(frame.structureXml, { name: `${prefix}frames/${frame.dirName}/structure.xml` });
      }
    }

    archive.finalize();
  });
}
