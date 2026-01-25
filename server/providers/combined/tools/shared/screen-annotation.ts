/**
 * Screen Annotation Types
 * 
 * Unified interface for contextual information attached to screens.
 * Used by prompts to incorporate notes, comments, and future annotation types
 * without needing to know the source-specific details.
 */

/**
 * A piece of contextual information attached to a screen/frame
 * 
 * This is the unified type consumed by prompt generators. Both notes
 * and comments (and future annotation sources) conform to this interface.
 */
export interface ScreenAnnotation {
  /** Screen/frame identifier (node ID) */
  screenId: string;
  
  /** Human-readable screen name */
  screenName: string;
  
  /** Source of this annotation */
  source: 'notes' | 'comments';
  
  /** Formatted content as markdown, ready for prompt inclusion */
  markdown: string;
}

/**
 * Group annotations by source type
 * 
 * @param annotations - Array of screen annotations
 * @returns Object with arrays grouped by source
 */
export function groupAnnotationsBySource(
  annotations: ScreenAnnotation[]
): { notes: ScreenAnnotation[]; comments: ScreenAnnotation[] } {
  return {
    notes: annotations.filter(a => a.source === 'notes'),
    comments: annotations.filter(a => a.source === 'comments'),
  };
}

/**
 * Group annotations by screen
 * 
 * @param annotations - Array of screen annotations
 * @returns Map of screenId to annotations for that screen
 */
export function groupAnnotationsByScreen(
  annotations: ScreenAnnotation[]
): Map<string, ScreenAnnotation[]> {
  const byScreen = new Map<string, ScreenAnnotation[]>();
  
  for (const annotation of annotations) {
    const existing = byScreen.get(annotation.screenId) || [];
    existing.push(annotation);
    byScreen.set(annotation.screenId, existing);
  }
  
  return byScreen;
}

/**
 * Format annotations as a markdown section for prompt inclusion
 * 
 * Groups by source and formats each group with a header.
 * 
 * @param annotations - Array of screen annotations  
 * @returns Formatted markdown string
 */
export function formatAnnotationsForPrompt(annotations: ScreenAnnotation[]): string {
  if (annotations.length === 0) return '';
  
  const { notes, comments } = groupAnnotationsBySource(annotations);
  const sections: string[] = [];
  
  if (notes.length > 0) {
    const notesContent = notes
      .map(n => `### ${n.screenName}\n\n${n.markdown}`)
      .join('\n\n');
    sections.push(`## Design Notes\n\n${notesContent}`);
  }
  
  if (comments.length > 0) {
    const commentsContent = comments
      .map(c => `### ${c.screenName}\n\n${c.markdown}`)
      .join('\n\n');
    sections.push(`## Stakeholder Comments\n\n${commentsContent}`);
  }
  
  return sections.join('\n\n---\n\n');
}
