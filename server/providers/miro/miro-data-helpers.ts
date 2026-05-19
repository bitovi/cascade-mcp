/**
 * Miro Data Helpers
 * 
 * Shared data normalization for Miro board items and connectors.
 * - Fetches all items and connectors with pagination
 * - Strips HTML from content, resolves positions to absolute coords
 * - Classifies connector arrow types
 */

import type { MiroClient } from './miro-api-client.js';

// ── Types ──

export interface NormalizedItem {
  /** Sequential 1-based number for referencing */
  num: number;
  /** Miro API item ID */
  id: string;
  /** Item type: shape, sticky_note, text, card, frame, image, etc. */
  type: string;
  /** Plain text content (HTML stripped) */
  text: string;
  /** Short label for SVG rendering */
  shortLabel: string;
  /** Shape type (round_rectangle, rectangle, etc.) */
  shape: string;
  /** Absolute canvas position (center) */
  x: number;
  y: number;
  /** Dimensions */
  width: number;
  height: number;
  /** Fill color hex */
  fillColor: string;
  /** Border color hex */
  borderColor: string;
  /** Image URL (for type=image items only) */
  imageUrl?: string;
  /** Image title (for type=image items only) */
  imageTitle?: string;
  /** Parent item ID, if any */
  parentId?: string;
}

export type ArrowType = 'directional' | 'bidirectional' | 'association' | 'none';

export interface NormalizedConnector {
  id: string;
  startItemId: string;
  endItemId: string;
  /** Classified arrow type */
  arrowType: ArrowType;
  /** Line style */
  dashed: boolean;
  /** Caption text (HTML stripped) */
  caption: string;
  /** Stroke color */
  strokeColor: string;
}

export interface BoardData {
  items: NormalizedItem[];
  connectors: NormalizedConnector[];
  /** Map from Miro ID to NormalizedItem for quick lookup */
  itemMap: Map<string, NormalizedItem>;
}

// ── Fetching ──

/**
 * Fetch all items from a board, handling pagination (max 50 per page)
 */
async function fetchAllItems(client: MiroClient, boardId: string): Promise<any[]> {
  const allItems: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);

    const response = await client.fetch(`/boards/${boardId}/items?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Miro API error fetching items (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    allItems.push(...(data.data || []));
    cursor = data.cursor;
  } while (cursor);

  return allItems;
}

/**
 * Fetch all connectors from a board, handling pagination
 */
async function fetchAllConnectors(client: MiroClient, boardId: string): Promise<any[]> {
  const allConnectors: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);

    const response = await client.fetch(`/boards/${boardId}/connectors?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Miro API error fetching connectors (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    allConnectors.push(...(data.data || []));
    cursor = data.cursor;
  } while (cursor);

  return allConnectors;
}

/**
 * Fetch all board data (items + connectors) in parallel
 */
export async function fetchAllBoardData(
  client: MiroClient,
  boardId: string
): Promise<{ rawItems: any[]; rawConnectors: any[] }> {
  const [rawItems, rawConnectors] = await Promise.all([
    fetchAllItems(client, boardId),
    fetchAllConnectors(client, boardId),
  ]);
  return { rawItems, rawConnectors };
}

// ── Normalization ──

/**
 * Strip HTML tags from Miro content strings
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text for short label display
 */
function makeShortLabel(text: string, maxLen: number = 15): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Resolve an item's absolute canvas position.
 * Items with relativeTo=parent_top_left need their parent's absolute position added.
 */
function resolveAbsolutePosition(
  item: any,
  rawItemMap: Map<string, any>,
  resolvedCache: Map<string, { x: number; y: number }>
): { x: number; y: number } {
  const id = item.id;

  if (resolvedCache.has(id)) {
    return resolvedCache.get(id)!;
  }

  const pos = item.position || { x: 0, y: 0 };
  let absX = pos.x || 0;
  let absY = pos.y || 0;

  if (pos.relativeTo === 'parent_top_left' && item.parent?.id) {
    const parent = rawItemMap.get(item.parent.id);
    if (parent) {
      const parentAbs = resolveAbsolutePosition(parent, rawItemMap, resolvedCache);
      const parentGeo = parent.geometry || {};
      const parentW = parentGeo.width || 0;
      const parentH = parentGeo.height || 0;
      // Parent position is center-based, parent_top_left offset from parent's top-left corner
      absX = (parentAbs.x - parentW / 2) + absX;
      absY = (parentAbs.y - parentH / 2) + absY;
    }
  }

  resolvedCache.set(id, { x: absX, y: absY });
  return { x: absX, y: absY };
}

/**
 * Map Miro's named colors to hex values.
 * These are the sticky note / shape fillColor named values from the Miro API.
 */
const MIRO_NAMED_COLORS: Record<string, string> = {
  gray: '#f5f6f8',
  light_yellow: '#fff9b1',
  yellow: '#f5d128',
  orange: '#ff9d48',
  light_green: '#d5f692',
  green: '#8fd14f',
  dark_green: '#0ca789',
  cyan: '#12cdd4',
  light_blue: '#a6ccf5',
  blue: '#2d9bf0',
  dark_blue: '#414bb2',
  light_pink: '#ffcee0',
  pink: '#ff6575',
  violet: '#9510ac',
  red: '#f24726',
  black: '#1a1a2e',
};

function resolveMiroColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith('#')) return color;
  return MIRO_NAMED_COLORS[color] || fallback;
}

/**
 * Normalize raw Miro items into a clean, flat structure with absolute positions
 */
export function normalizeItems(rawItems: any[]): NormalizedItem[] {
  // Build raw item map for parent resolution
  const rawItemMap = new Map<string, any>();
  for (const item of rawItems) {
    rawItemMap.set(item.id, item);
  }

  const resolvedCache = new Map<string, { x: number; y: number }>();
  const normalized: NormalizedItem[] = [];

  for (const item of rawItems) {
    const { x, y } = resolveAbsolutePosition(item, rawItemMap, resolvedCache);
    const geo = item.geometry || {};
    const style = item.style || {};
    const data = item.data || {};

    const rawText = data.content || data.title || '';
    const text = stripHtml(rawText);
    const isImage = item.type === 'image';

    const normalizedItem: NormalizedItem = {
      num: 0, // assigned after filtering
      id: item.id,
      type: item.type || 'unknown',
      text,
      shortLabel: isImage
        ? `[IMG] ${makeShortLabel(data.title || 'image')}`
        : makeShortLabel(text),
      shape: data.shape || 'rectangle',
      x,
      y,
      width: geo.width || 100,
      height: geo.height || 50,
      fillColor: resolveMiroColor(style.fillColor, '#ffffff'),
      borderColor: resolveMiroColor(style.borderColor || style.cardTheme, '#cccccc'),
      parentId: item.parent?.id,
    };

    if (isImage) {
      normalizedItem.imageUrl = data.imageUrl;
      normalizedItem.imageTitle = data.title;
    }

    normalized.push(normalizedItem);
  }

  // Assign sequential numbers
  for (let i = 0; i < normalized.length; i++) {
    normalized[i].num = i + 1;
  }

  return normalized;
}

/**
 * Classify connector arrow type from stroke cap styles
 */
function classifyArrowType(startCap: string, endCap: string): ArrowType {
  const directionalCaps = ['rounded_stealth', 'stealth', 'arrow', 'triangle', 'filled_triangle'];
  const bidirectionalCaps = ['diamond', 'filled_diamond'];
  const associationCaps = ['oval', 'filled_oval'];

  const startIsDirectional = directionalCaps.includes(startCap);
  const endIsDirectional = directionalCaps.includes(endCap);
  const startIsBidi = bidirectionalCaps.includes(startCap);
  const endIsBidi = bidirectionalCaps.includes(endCap);
  const startIsAssoc = associationCaps.includes(startCap);
  const endIsAssoc = associationCaps.includes(endCap);

  if (startIsBidi && endIsBidi) return 'bidirectional';
  if (startIsAssoc && endIsAssoc) return 'association';
  if (startIsDirectional || endIsDirectional) return 'directional';
  if (startCap === 'none' && endCap === 'none') return 'none';
  return 'directional';
}

/**
 * Normalize raw connectors, filtering out unsupported and self-referencing ones
 */
export function normalizeConnectors(rawConnectors: any[]): NormalizedConnector[] {
  const normalized: NormalizedConnector[] = [];

  for (const conn of rawConnectors) {
    // Skip unsupported connectors (no start/end item)
    if (conn.isSupported === false) continue;
    if (!conn.startItem?.id || !conn.endItem?.id) continue;
    // Skip self-referencing connectors
    if (conn.startItem.id === conn.endItem.id) continue;

    const style = conn.style || {};
    const captionText = (conn.captions || [])
      .map((c: any) => stripHtml(c.content || ''))
      .filter(Boolean)
      .join('; ');

    normalized.push({
      id: conn.id,
      startItemId: conn.startItem.id,
      endItemId: conn.endItem.id,
      arrowType: classifyArrowType(style.startStrokeCap || 'none', style.endStrokeCap || 'none'),
      dashed: style.strokeStyle === 'dashed',
      caption: captionText,
      strokeColor: style.strokeColor || '#333333',
    });
  }

  return normalized;
}

/**
 * Build complete normalized board data from raw API responses
 */
export function buildBoardData(rawItems: any[], rawConnectors: any[]): BoardData {
  const items = normalizeItems(rawItems);
  const connectors = normalizeConnectors(rawConnectors);

  const itemMap = new Map<string, NormalizedItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  return { items, connectors, itemMap };
}
