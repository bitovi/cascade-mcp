/**
 * Miro Mermaid Builder
 * 
 * Generates a Mermaid flowchart + item index table from normalized board data.
 * Uses numbered IDs matching the SVG labels so agents can cross-reference.
 */

import type { NormalizedItem, NormalizedConnector } from './miro-data-helpers.js';

/**
 * Escape text for Mermaid node labels (double quotes)
 */
function escMermaid(text: string): string {
  return text.replace(/"/g, "'").replace(/\n/g, ' ');
}

/**
 * Build a Mermaid edge arrow string from connector properties
 */
function buildArrow(conn: NormalizedConnector): string {
  if (conn.dashed) {
    return conn.arrowType === 'bidirectional' ? '<-..->' : '-.->';
  }
  switch (conn.arrowType) {
    case 'bidirectional': return '<-->';
    case 'association': return '---';
    case 'none': return '---';
    default: return '-->';
  }
}

/**
 * Build a Mermaid node definition line
 */
function buildNodeDef(item: NormalizedItem, indent: string): string {
  const label = item.type === 'image'
    ? `[IMG] ${item.imageTitle || 'image'}`
    : item.text || '(empty)';
  const truncLabel = label.length > 50 ? label.slice(0, 47) + '...' : label;
  return `${indent}${item.num}["[${item.num}] ${escMermaid(truncLabel)}"]`;
}

/**
 * Build a Mermaid flowchart string from normalized board data.
 * Uses subgraphs for frames that contain child items (supports nesting).
 */
export function buildMermaidGraph(
  items: NormalizedItem[],
  connectors: NormalizedConnector[],
  itemMap: Map<string, NormalizedItem>
): string {
  const lines: string[] = ['```mermaid', 'flowchart TD'];

  // ── Build parent-child map ──
  const childrenByParent = new Map<string, NormalizedItem[]>();
  const itemsWithParent = new Set<string>();

  for (const item of items) {
    if (item.parentId) {
      itemsWithParent.add(item.id);
      const siblings = childrenByParent.get(item.parentId) || [];
      siblings.push(item);
      childrenByParent.set(item.parentId, siblings);
    }
  }

  // ── Recursive helper to render items with nested subgraphs ──
  function renderItem(item: NormalizedItem, indent: string): void {
    const children = childrenByParent.get(item.id);
    if (children && children.length > 0) {
      // Container with children → Mermaid subgraph
      const frameLabel = item.text || item.type;
      lines.push(`${indent}subgraph ${item.num}["[${item.num}] ${escMermaid(frameLabel)}"]`);
      for (const child of children) {
        renderItem(child, indent + '  ');
      }
      lines.push(`${indent}end`);
    } else {
      // Leaf item → node definition
      lines.push(buildNodeDef(item, indent));
    }
  }

  // ── Render top-level items (those without parents) ──
  for (const item of items) {
    if (itemsWithParent.has(item.id)) continue;
    renderItem(item, '  ');
  }

  // ── Edges ──
  for (const conn of connectors) {
    const startItem = itemMap.get(conn.startItemId);
    const endItem = itemMap.get(conn.endItemId);
    if (!startItem || !endItem) continue;

    const arrow = buildArrow(conn);

    if (conn.caption) {
      lines.push(`  ${startItem.num} ${arrow}|${escMermaid(conn.caption)}| ${endItem.num}`);
    } else {
      lines.push(`  ${startItem.num} ${arrow} ${endItem.num}`);
    }
  }

  lines.push('```');

  // ── Item index table ──
  lines.push('');
  lines.push('## Item Index');
  lines.push('| # | Name | Type | Parent | Color |');
  lines.push('|---|------|------|--------|-------|');

  for (const item of items) {
    const name = item.type === 'image'
      ? `[IMG] ${item.imageTitle || 'image'}`
      : (item.text || '(empty)');
    const truncName = name.length > 60 ? name.slice(0, 57) + '...' : name;
    const parentRef = item.parentId
      ? `[${itemMap.get(item.parentId)?.num ?? '?'}]`
      : '';
    lines.push(`| ${item.num} | ${truncName} | ${item.type} | ${parentRef} | ${item.fillColor} |`);
  }

  return lines.join('\n');
}
