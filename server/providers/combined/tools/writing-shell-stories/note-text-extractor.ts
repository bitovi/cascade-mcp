/**
 * Note Text Extractor
 * 
 * Utilities for extracting text content from Figma note nodes.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';
import { convertNodeIdToApiFormat } from '../../../figma/figma-helpers.js';
import type { Screen } from './screen-analyzer.js';

/**
 * Extract text content from a Figma node recursively
 * @param node - Figma node (typically a text node with characters)
 * @returns Extracted text content
 */
function extractText(node: any): string {
  if (node.characters) return node.characters;
  if (node.children) {
    return node.children.map(extractText).join('\n');
  }
  return '';
}

/**
 * Extract note texts for a given screen
 * @param noteUrls - Array of Figma note URLs associated with the screen
 * @param allNotes - Complete array of note metadata from Figma
 * @returns Array of formatted note text strings (with headers)
 */
export function extractNoteTexts(
  noteUrls: string[],
  allNotes: FigmaNodeMetadata[]
): string[] {
  const noteTexts: string[] = [];
  
  for (const noteUrl of noteUrls) {
    // Extract note ID from URL
    const noteIdMatch = noteUrl.match(/node-id=([0-9]+-[0-9]+)/);
    if (!noteIdMatch) continue;
    
    const urlNoteId = noteIdMatch[1];
    const apiNoteId = convertNodeIdToApiFormat(urlNoteId);
    
    // Find the note in our metadata
    const note = allNotes.find(n => n.id === apiNoteId);
    if (note && note.children) {
      // Extract text from note's children (text nodes)
      const noteText = note.children.map(extractText).filter(t => t).join('\n');
      if (noteText) {
        noteTexts.push(`## Note ${noteTexts.length + 1}\n\n${noteText}`);
      }
    }
  }
  
  return noteTexts;
}

/**
 * Format note texts into a markdown document
 * @param screenName - Name of the screen the notes are associated with
 * @param noteTexts - Array of formatted note text strings
 * @returns Markdown formatted note document
 */
export function formatNotesMarkdown(screenName: string, noteTexts: string[]): string {
  return `# Notes for ${screenName}\n\n${noteTexts.join('\n\n---\n\n')}`;
}

/**
 * Write notes for a screen to a markdown file
 * @param screen - Screen object with notes URLs
 * @param allNotes - Complete array of note metadata from Figma
 * @param tempDirPath - Directory path to write the notes file
 * @returns Number of notes written (0 if no notes or error)
 */
export async function writeNotesForScreen(
  screen: Screen,
  allNotes: FigmaNodeMetadata[],
  tempDirPath: string
): Promise<number> {
  if (screen.notes.length === 0) {
    return 0;
  }

  try {
    const noteTexts = extractNoteTexts(screen.notes, allNotes);
    
    if (noteTexts.length > 0) {
      const notesPath = path.join(tempDirPath, `${screen.name}.notes.md`);
      const notesContent = formatNotesMarkdown(screen.name, noteTexts);
      await fs.writeFile(notesPath, notesContent, 'utf-8');
      
      return noteTexts.length;
    }
    
    return 0;
  } catch (error: any) {
    console.log(`    ⚠️ Failed to extract notes for ${screen.name}: ${error.message}`);
    return 0;
  }
}

