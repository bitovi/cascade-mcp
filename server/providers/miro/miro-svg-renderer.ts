/**
 * Miro SVG Renderer
 * 
 * Builds SVG from normalized board items and connectors, then renders to PNG via sharp.
 * Supports overview (full board, low res) and region (zoomed, high res) modes.
 */

import sharp from 'sharp';
import type { NormalizedItem, NormalizedConnector } from './miro-data-helpers.js';

export interface RenderOptions {
  /** Target viewport width in pixels */
  viewportWidth?: number;
  /** Target viewport height in pixels */
  viewportHeight?: number;
  /** Padding around the bounding box as fraction (0.05 = 5%) */
  padding?: number;
  /** Whether to show full text inside shapes (region zoom mode) */
  fullText?: boolean;
  /** Items to include (if undefined, include all) */
  itemIds?: Set<string>;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Compute bounding box from items
 */
function computeBoundingBox(items: NormalizedItem[]): BoundingBox {
  if (items.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const item of items) {
    const left = item.x - item.width / 2;
    const right = item.x + item.width / 2;
    const top = item.y - item.height / 2;
    const bottom = item.y + item.height / 2;

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Escape text for safe SVG embedding
 */
function escSvg(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Calculate a contrasting text color for a given background
 */
function contrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) return '#000000';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

/**
 * Build an SVG string from normalized board items and connectors
 */
export function buildBoardSvg(
  items: NormalizedItem[],
  connectors: NormalizedConnector[],
  options: RenderOptions = {}
): string {
  const {
    viewportWidth = 3200,
    viewportHeight = 2400,
    padding = 0.05,
    fullText = false,
    itemIds,
  } = options;

  // Filter items if itemIds specified
  const visibleItems = itemIds
    ? items.filter(item => itemIds.has(item.id))
    : items;

  if (visibleItems.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}"><text x="50%" y="50%" text-anchor="middle" fill="#666">No items to display</text></svg>`;
  }

  const bbox = computeBoundingBox(visibleItems);
  const padX = bbox.width * padding;
  const padY = bbox.height * padding;
  const contentW = bbox.width + padX * 2;
  const contentH = bbox.height + padY * 2;

  // Scale to fit viewport while maintaining aspect ratio
  const scale = Math.min(viewportWidth / contentW, viewportHeight / contentH);
  const offsetX = -(bbox.minX - padX);
  const offsetY = -(bbox.minY - padY);

  // When items are very spread out, the scale gets tiny and items become dots.
  // Compute a size multiplier to ensure items remain readable in the viewport.
  // If scale < 1, items in board-coords are shrunk. We enlarge them so the
  // rendered size (boardSize * scale * sizeMultiplier) stays reasonable.
  // Target: each item should be at least ~40px wide in the final image.
  const minRenderedWidth = 40; // px in final image
  const avgItemWidth = visibleItems.reduce((s, i) => s + i.width, 0) / visibleItems.length;
  const renderedAvgWidth = avgItemWidth * scale;
  const sizeMultiplier = renderedAvgWidth < minRenderedWidth
    ? minRenderedWidth / renderedAvgWidth
    : 1;

  // Build item ID set for connector filtering
  const visibleItemIds = new Set(visibleItems.map(i => i.id));

  // Filter connectors to only those connecting visible items
  const visibleConnectors = connectors.filter(
    c => visibleItemIds.has(c.startItemId) && visibleItemIds.has(c.endItemId)
  );

  // Build item position lookup for connectors
  const itemPosMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const item of visibleItems) {
    itemPosMap.set(item.id, { x: item.x, y: item.y, w: item.width, h: item.height });
  }

  const fontSize = (fullText ? 16 : 13) * sizeMultiplier;
  const labelMaxChars = fullText ? 40 : 18;
  const strokeWidth = 1.5 * sizeMultiplier;
  const connStrokeWidth = 2 * sizeMultiplier;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}" viewBox="0 0 ${viewportWidth} ${viewportHeight}">`;
  svg += `<rect width="${viewportWidth}" height="${viewportHeight}" fill="#f5f5f5"/>`;
  svg += `<g transform="scale(${scale}) translate(${offsetX}, ${offsetY})">`;

  // Separate container items (frames + large shapes) from regular items.
  // Large shapes (area > 100k) act as visual containers in Miro and should
  // render as subtle backgrounds, not opaque rectangles that cover children.
  const CONTAINER_AREA_THRESHOLD = 100_000;
  const containerItems = visibleItems.filter(
    i => i.type === 'frame' || (i.type === 'shape' && i.width * i.height > CONTAINER_AREA_THRESHOLD)
  );
  // Sort containers largest-first so nested containers layer correctly
  containerItems.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const containerIds = new Set(containerItems.map(i => i.id));
  // Sort regular items by area descending (painter's algorithm):
  // larger items render first, smaller items render on top
  const regularItems = visibleItems
    .filter(i => !containerIds.has(i.id))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  // ── Containers: frames + large shapes (draw first as background) ──
  for (const item of containerItems) {
    const left = item.x - item.width / 2;
    const top = item.y - item.height / 2;
    const isFrame = item.type === 'frame';

    // Container background with subtle fill and border
    const fill = isFrame ? '#fafafa' : (item.fillColor || '#fbfcfc');
    const stroke = isFrame ? '#d0d0d0' : (item.borderColor || '#d0d0d0');
    const rx = item.shape.includes('round') ? 8 * sizeMultiplier : 4 * sizeMultiplier;
    svg += `<rect x="${left}" y="${top}" width="${item.width}" height="${item.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="${rx}"/>`;

    // Container title at top-left
    const titleLabel = `[${item.num}] ${item.text || (isFrame ? 'Frame' : 'Group')}`;
    svg += `<text x="${left + 8 * sizeMultiplier}" y="${top + 16 * sizeMultiplier}" text-anchor="start" font-size="${fontSize}" fill="#666" font-family="Arial, sans-serif" font-weight="bold">${escSvg(titleLabel)}</text>`;
  }

  // ── Connectors (draw behind regular items but on top of frames) ──
  for (const conn of visibleConnectors) {
    const start = itemPosMap.get(conn.startItemId);
    const end = itemPosMap.get(conn.endItemId);
    if (!start || !end) continue;

    const dashAttr = conn.dashed ? ' stroke-dasharray="8,4"' : '';

    // Draw the line
    svg += `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${conn.strokeColor}" stroke-width="${connStrokeWidth}"${dashAttr}/>`;

    // Draw direction indicator at midpoint
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const indicatorSize = 10 * sizeMultiplier;

    if (conn.arrowType === 'directional') {
      // Single arrow pointing end→start
      const dx = start.x - end.x;
      const dy = start.y - end.y;
      const angle = Math.atan2(dy, dx);
      const p1x = midX - indicatorSize * Math.cos(angle - Math.PI / 6);
      const p1y = midY - indicatorSize * Math.sin(angle - Math.PI / 6);
      const p2x = midX - indicatorSize * Math.cos(angle + Math.PI / 6);
      const p2y = midY - indicatorSize * Math.sin(angle + Math.PI / 6);
      svg += `<polygon points="${midX},${midY} ${p1x},${p1y} ${p2x},${p2y}" fill="${conn.strokeColor}"/>`;
    } else if (conn.arrowType === 'bidirectional') {
      // Diamond at midpoint
      const d = 6 * sizeMultiplier;
      svg += `<polygon points="${midX},${midY - d} ${midX + d},${midY} ${midX},${midY + d} ${midX - d},${midY}" fill="${conn.strokeColor}"/>`;
    } else if (conn.arrowType === 'association') {
      // Circle at midpoint
      svg += `<circle cx="${midX}" cy="${midY}" r="${indicatorSize}" fill="${conn.strokeColor}"/>`;
    }

    // Caption text at midpoint (offset slightly if there's a direction indicator)
    if (conn.caption) {
      const capW = 60 * sizeMultiplier;
      const capH = 16 * sizeMultiplier;
      const captionOffsetY = conn.arrowType === 'none' ? 0 : 12 * sizeMultiplier; // Offset if indicator present
      svg += `<rect x="${midX - capW / 2}" y="${midY - capH / 2 + captionOffsetY}" width="${capW}" height="${capH}" fill="#f5f5f5" rx="${3 * sizeMultiplier}" opacity="0.9"/>`;
      svg += `<text x="${midX}" y="${midY + 2 * sizeMultiplier + captionOffsetY}" text-anchor="middle" font-size="${10 * sizeMultiplier}" fill="#555" font-family="Arial, sans-serif">${escSvg(conn.caption)}</text>`;
    }
  }

  // ── Regular Items (on top of everything) ──
  for (const item of regularItems) {
    // When sizeMultiplier > 1, enlarge item rects around their center
    const w = item.width * sizeMultiplier;
    const h = item.height * sizeMultiplier;
    const left = item.x - w / 2;
    const top = item.y - h / 2;
    const isImage = item.type === 'image';
    const rx = (item.shape.includes('round') ? 8 : 2) * sizeMultiplier;

    // Rectangle
    if (isImage) {
      // Dashed border for image placeholder
      svg += `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#e8e8e8" stroke="#999" stroke-width="${strokeWidth}" stroke-dasharray="${6 * sizeMultiplier},${3 * sizeMultiplier}" rx="${rx}"/>`;
      // Image icon placeholder
      const iconX = item.x - 12 * sizeMultiplier;
      const iconY = item.y - 20 * sizeMultiplier;
      svg += `<text x="${iconX}" y="${iconY}" font-size="${20 * sizeMultiplier}" fill="#888" font-family="Arial, sans-serif">🖼</text>`;
    } else {
      svg += `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="${item.fillColor}" stroke="${item.borderColor}" stroke-width="${strokeWidth}" rx="${rx}"/>`;
    }

    // Label text
    const label = `[${item.num}] ${fullText ? item.text.slice(0, labelMaxChars) : item.shortLabel}`;
    const textColor = isImage ? '#666' : contrastColor(item.fillColor);
    const textY = item.y + (fontSize / 3);

    svg += `<text x="${item.x}" y="${textY}" text-anchor="middle" font-size="${fontSize}" fill="${textColor}" font-family="Arial, sans-serif" font-weight="bold">${escSvg(label)}</text>`;
  }

  svg += '</g></svg>';
  return svg;
}

/**
 * Render an SVG string to PNG buffer via sharp
 */
export async function renderSvgToPng(svgString: string): Promise<Buffer> {
  return sharp(Buffer.from(svgString))
    .png()
    .toBuffer();
}
