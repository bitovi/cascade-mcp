/**
 * Frame Context Builder
 * 
 * Builds markdown context for individual frames, including comments,
 * sticky notes, and prototype connections.
 */

import type { FrameAnnotation } from '../../screen-analyses-workflow/types.js';

/**
 * A frame connection detected from Figma prototype reactions
 */
export interface FrameConnection {
  targetId: string;
  targetName: string;
  trigger: string;
}

/**
 * Build a markdown context document for a single frame
 * 
 * Combines comments, sticky notes, section info, and prototype connections
 * into a structured markdown document for agent consumption.
 * 
 * @param frame - Frame metadata
 * @param annotations - Annotations (comments + notes) for the frame
 * @param connections - Prototype connections from this frame to other frames
 * @returns Markdown string
 */
export function buildFrameContextMarkdown(
  frame: { id: string; name: string; sectionName?: string; url?: string },
  annotations: FrameAnnotation[],
  connections: FrameConnection[]
): string {
  let md = `# ${frame.name} (Frame ${frame.id})\n\n`;

  if (frame.sectionName) {
    md += `**Section:** ${frame.sectionName}\n\n`;
  }

  // Comments section
  const comments = annotations.filter(a => a.type === 'comment');
  if (comments.length > 0) {
    md += `## Comments\n`;
    for (const comment of comments) {
      const author = comment.author ? `@${comment.author}` : 'Unknown';
      md += `- **${author}**: ${comment.content}\n`;
    }
    md += '\n';
  }

  // Notes section (sticky notes)
  const notes = annotations.filter(a => a.type === 'note');
  if (notes.length > 0) {
    md += `## Notes\n`;
    for (const note of notes) {
      md += `- ${note.content}\n`;
    }
    md += '\n';
  }

  // Connections section
  if (connections.length > 0) {
    md += `## Related Frames\n`;
    for (const conn of connections) {
      md += `- Connects to: ${conn.targetName} (${conn.targetId}) [${conn.trigger}]\n`;
    }
    md += '\n';
  }

  return md;
}

/**
 * Find prototype connections from a frame to other frames
 * 
 * Parses Figma's `reactions` data on child nodes to find navigation
 * actions that link to other frames in the file.
 * 
 * @param frameNode - The full Figma frame node tree (with children)
 * @param allFrames - All frames in the page (for target name resolution)
 * @returns Array of connections
 */
export function findConnections(
  frameNode: any,
  allFrames: Array<{ id: string; name: string }>
): FrameConnection[] {
  const connections: FrameConnection[] = [];
  const seenTargets = new Set<string>();

  // Build lookup for frame names
  const frameNameMap = new Map<string, string>();
  for (const frame of allFrames) {
    // Store both API format (123:456) and URL format (123-456)
    frameNameMap.set(frame.id, frame.name);
    frameNameMap.set(frame.id.replace(/:/g, '-'), frame.name);
  }

  function walk(node: any): void {
    if (node.reactions && Array.isArray(node.reactions)) {
      for (const reaction of node.reactions) {
        const action = reaction.action;
        if (!action) continue;

        // Only follow NODE navigation actions (skip URL, BACK, etc.)
        if (action.type === 'NODE' && action.destinationId) {
          const targetId = action.destinationId;
          if (seenTargets.has(targetId)) continue;
          seenTargets.add(targetId);

          const targetName = frameNameMap.get(targetId) 
            || frameNameMap.get(targetId.replace(/:/g, '-'))
            || 'Unknown Frame';
          const trigger = reaction.trigger?.type || 'ON_CLICK';

          connections.push({ targetId, targetName, trigger });
        }
      }
    }

    // Recurse into children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(frameNode);
  return connections;
}
