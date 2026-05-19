/**
 * Unit tests for Miro data helpers, mermaid builder, and SVG renderer.
 * Uses a fixture extracted from a real Miro board cache.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  normalizeItems,
  normalizeConnectors,
  buildBoardData,
  stripHtml,
  type NormalizedItem,
  type NormalizedConnector,
  type BoardData,
} from './miro-data-helpers.js';
import { buildMermaidGraph } from './miro-mermaid-builder.js';
import { buildBoardSvg } from './miro-svg-renderer.js';

const fixturePath = resolve(process.cwd(), 'test/fixtures/miro-board-data.json');

let rawItems: any[];
let rawConnectors: any[];
let boardData: BoardData;

beforeAll(() => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  rawItems = fixture.items;
  rawConnectors = fixture.connectors;
  boardData = buildBoardData(rawItems, rawConnectors);
});

// ── stripHtml ──

describe('stripHtml', () => {
  test('strips paragraph tags', () => {
    expect(stripHtml('<p>Assignment</p>')).toBe('Assignment');
  });

  test('strips nested tags with styles', () => {
    expect(stripHtml('<p><span style="color:rgb(2,53,56)">Job Architecture</span></p>'))
      .toBe('Job Architecture');
  });

  test('strips bold tags with styles', () => {
    expect(stripHtml('<p><strong style="color:rgb(10,10,10)">Senior</strong></p>'))
      .toBe('Senior');
  });

  test('converts <br> to space', () => {
    expect(stripHtml('line1<br/>line2')).toBe('line1 line2');
  });

  test('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe("& < > \" '");
  });

  test('returns empty string for falsy input', () => {
    expect(stripHtml('')).toBe('');
  });
});

// ── normalizeItems ──

describe('normalizeItems', () => {
  test('assigns sequential numbers starting from 1', () => {
    const items = normalizeItems(rawItems);
    expect(items[0].num).toBe(1);
    expect(items[items.length - 1].num).toBe(items.length);
  });

  test('preserves item count', () => {
    const items = normalizeItems(rawItems);
    expect(items.length).toBe(rawItems.length);
  });

  test('strips HTML from card titles', () => {
    const items = normalizeItems(rawItems);
    const assignment = items.find(i => i.text === 'Assignment');
    expect(assignment).toBeDefined();
    expect(assignment!.type).toBe('card');
  });

  test('strips HTML from shape content', () => {
    const items = normalizeItems(rawItems);
    const jobArch = items.find(i => i.text === 'Job Architecture');
    expect(jobArch).toBeDefined();
    expect(jobArch!.type).toBe('shape');
  });

  test('extracts frame titles from data.title (not data.content)', () => {
    const items = normalizeItems(rawItems);
    const frame = items.find(i => i.type === 'frame');
    expect(frame).toBeDefined();
    expect(frame!.text).toBe('Frame 1');
  });

  test('resolves parent_top_left positions to absolute coordinates', () => {
    const items = normalizeItems(rawItems);
    // The frame is at canvas center, children are relative to parent_top_left
    const frame = items.find(i => i.type === 'frame')!;
    const card = items.find(i => i.text === 'Assignment')!;

    // Card should have absolute position = frame_topleft + relative offset
    const frameLeft = frame.x - frame.width / 2;
    const frameTop = frame.y - frame.height / 2;

    // The raw card position is relative to parent_top_left
    const rawCard = rawItems.find(i => i.id === card.id)!;
    const expectedX = frameLeft + rawCard.position.x;
    const expectedY = frameTop + rawCard.position.y;

    expect(card.x).toBeCloseTo(expectedX, 1);
    expect(card.y).toBeCloseTo(expectedY, 1);
  });

  test('items without parent have direct canvas positions', () => {
    const items = normalizeItems(rawItems);
    const frame = items.find(i => i.type === 'frame')!;
    const rawFrame = rawItems.find(i => i.id === frame.id)!;
    expect(frame.x).toBeCloseTo(rawFrame.position.x, 1);
    expect(frame.y).toBeCloseTo(rawFrame.position.y, 1);
  });

  test('sets parentId for items with parents', () => {
    const items = normalizeItems(rawItems);
    const childItems = items.filter(i => i.parentId);
    expect(childItems.length).toBeGreaterThan(0);
    childItems.forEach(item => {
      expect(typeof item.parentId).toBe('string');
    });
  });

  test('extracts fill and border colors from style', () => {
    const items = normalizeItems(rawItems);
    const stickyNote = items.find(i => i.type === 'sticky_note');
    expect(stickyNote).toBeDefined();
    expect(stickyNote!.fillColor).toBeTruthy();
  });

  test('provides default dimensions for items without geometry', () => {
    const items = normalizeItems(rawItems);
    items.forEach(item => {
      expect(item.width).toBeGreaterThan(0);
      expect(item.height).toBeGreaterThan(0);
    });
  });

  test('generates short labels', () => {
    const items = normalizeItems(rawItems);
    items.forEach(item => {
      expect(item.shortLabel.length).toBeLessThanOrEqual(18); // 15 + "..."
    });
  });
});

// ── normalizeConnectors ──

describe('normalizeConnectors', () => {
  test('filters out self-referencing connectors', () => {
    // Raw data has a self-ref connector (SOW → SOW)
    const selfRef = rawConnectors.find(
      c => c.startItem?.id === c.endItem?.id
    );
    expect(selfRef).toBeDefined();

    const normalized = normalizeConnectors(rawConnectors);
    const selfRefNormalized = normalized.find(c => c.startItemId === c.endItemId);
    expect(selfRefNormalized).toBeUndefined();
  });

  test('classifies directional arrows (rounded_stealth end cap)', () => {
    const normalized = normalizeConnectors(rawConnectors);
    const directional = normalized.find(
      c => c.arrowType === 'directional' && !c.dashed
    );
    expect(directional).toBeDefined();
  });

  test('classifies bidirectional arrows (diamond caps)', () => {
    const normalized = normalizeConnectors(rawConnectors);
    const bidir = normalized.find(c => c.arrowType === 'bidirectional');
    expect(bidir).toBeDefined();
  });

  test('detects dashed stroke style', () => {
    const normalized = normalizeConnectors(rawConnectors);
    const dashed = normalized.find(c => c.dashed);
    expect(dashed).toBeDefined();
    expect(dashed!.arrowType).toBe('directional');
  });

  test('extracts caption text from HTML', () => {
    const normalized = normalizeConnectors(rawConnectors);
    const withCaption = normalized.find(c => c.caption);
    expect(withCaption).toBeDefined();
    expect(withCaption!.caption).toBe('FOr');
  });

  test('preserves stroke color', () => {
    const normalized = normalizeConnectors(rawConnectors);
    normalized.forEach(c => {
      expect(c.strokeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

// ── buildBoardData ──

describe('buildBoardData', () => {
  test('creates itemMap with correct entries', () => {
    expect(boardData.itemMap.size).toBe(boardData.items.length);
  });

  test('itemMap keys match item IDs', () => {
    for (const item of boardData.items) {
      expect(boardData.itemMap.get(item.id)).toBe(item);
    }
  });

  test('items and connectors are populated', () => {
    expect(boardData.items.length).toBeGreaterThan(0);
    expect(boardData.connectors.length).toBeGreaterThan(0);
  });
});

// ── buildMermaidGraph ──

describe('buildMermaidGraph', () => {
  let mermaid: string;

  beforeAll(() => {
    mermaid = buildMermaidGraph(boardData.items, boardData.connectors, boardData.itemMap);
  });

  test('starts with mermaid code fence', () => {
    expect(mermaid).toContain('```mermaid');
    expect(mermaid).toContain('flowchart TD');
  });

  test('uses subgraphs for items with children', () => {
    // Frame 1 has children, should be a subgraph
    const frame = boardData.items.find(i => i.type === 'frame')!;
    expect(mermaid).toContain(`subgraph ${frame.num}`);
    expect(mermaid).toContain('Frame 1');
  });

  test('renders child nodes inside subgraph', () => {
    // Children of Frame 1 should appear in the graph
    const childItems = boardData.items.filter(
      i => i.parentId === boardData.items.find(f => f.type === 'frame')?.id
    );
    expect(childItems.length).toBeGreaterThan(0);
    for (const child of childItems.slice(0, 5)) {
      expect(mermaid).toContain(`${child.num}[`);
    }
  });

  test('renders connector edges with arrows', () => {
    // Should have directional arrows
    expect(mermaid).toContain('-->');
  });

  test('renders bidirectional edges', () => {
    expect(mermaid).toContain('<-->');
  });

  test('renders dashed edges', () => {
    expect(mermaid).toContain('-.->');
  });

  test('renders edge captions', () => {
    expect(mermaid).toContain('|FOr|');
  });

  test('includes item index table', () => {
    expect(mermaid).toContain('## Item Index');
    expect(mermaid).toContain('| # | Name | Type | Parent | Color |');
  });

  test('item index table shows parent references', () => {
    // Items with parents should show [parentNum] in Parent column
    const frame = boardData.items.find(i => i.type === 'frame')!;
    expect(mermaid).toContain(`| [${frame.num}] |`);
  });

  test('handles items with no text as (empty)', () => {
    const emptyItems = boardData.items.filter(i => !i.text);
    if (emptyItems.length > 0) {
      expect(mermaid).toContain('(empty)');
    }
  });
});

// ── buildBoardSvg ──

describe('buildBoardSvg', () => {
  test('generates valid SVG with xmlns', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/^<svg/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  test('uses provided viewport dimensions', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors, {
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
  });

  test('renders frames as background containers', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors);
    // Frame should have a title text at top-left
    expect(svg).toContain('Frame 1');
    // Frame should have a fill of #fafafa (background)
    expect(svg).toContain('fill="#fafafa"');
  });

  test('renders regular items with fill colors', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors);
    // Should contain item rectangles
    expect(svg).toContain('<rect');
    // Should contain numbered labels
    expect(svg).toContain('[1]');
  });

  test('renders directional indicators at midpoint', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors);
    expect(svg).toContain('<line');
    // Direction indicators are drawn as polygons or circles at line midpoint
    expect(svg).toContain('<polygon');
  });

  test('renders dashed connectors with stroke-dasharray', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors);
    expect(svg).toContain('stroke-dasharray="8,4"');
  });

  test('filters to specific items when itemIds provided', () => {
    const twoItems = boardData.items.slice(0, 2);
    const itemIds = new Set(twoItems.map(i => i.id));
    const svg = buildBoardSvg(boardData.items, boardData.connectors, { itemIds });

    // Should contain those items' labels
    for (const item of twoItems) {
      expect(svg).toContain(`[${item.num}]`);
    }
  });

  test('shows full text in fullText mode', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors, { fullText: true });
    // Full text mode uses labelMaxChars=40 vs overview's 18
    const longItem = boardData.items.find(i => i.text.length > 18);
    if (longItem) {
      // Should contain more of the text than just the short label
      expect(svg).toContain(longItem.text.slice(0, 20));
    }
  });

  test('returns empty message when no items visible', () => {
    const svg = buildBoardSvg(boardData.items, boardData.connectors, {
      itemIds: new Set(['nonexistent']),
    });
    expect(svg).toContain('No items to display');
  });

  test('only renders connectors between visible items', () => {
    // Pick two items that are NOT connected
    const frame = boardData.items.find(i => i.type === 'frame')!;
    const itemIds = new Set([frame.id]);
    const svg = buildBoardSvg(boardData.items, boardData.connectors, { itemIds });

    // Frame alone has no connectors to itself, so no lines
    expect(svg).not.toContain('<line');
  });
});
