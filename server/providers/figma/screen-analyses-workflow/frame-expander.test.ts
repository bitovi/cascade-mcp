/**
 * Frame Expander Tests
 * 
 * Tests for CANVAS/SECTION/FRAME expansion logic.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  expandNode,
  expandNodes,
  separateFramesAndNotes,
  deduplicateFrames,
} from './frame-expander.js';

describe('frame-expander', () => {
  // ============================================================================
  // expandNode
  // ============================================================================
  
  describe('expandNode', () => {
    it('should return single frame for FRAME node', () => {
      const nodeData = {
        id: '123:456',
        type: 'FRAME',
        name: 'Login Screen',
        visible: true,
        locked: false,
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      };
      
      const result = expandNode(nodeData, '123:456');
      
      expect(result.frames).toHaveLength(1);
      expect(result.notes).toHaveLength(0);
      expect(result.frames[0].name).toBe('Login Screen');
      expect(result.frames[0].type).toBe('FRAME');
    });
    
    it('should return single note for Note INSTANCE', () => {
      const nodeData = {
        id: '789:012',
        type: 'INSTANCE',
        name: 'Note',
        visible: true,
        locked: false,
        absoluteBoundingBox: { x: 100, y: 100, width: 50, height: 50 },
      };
      
      const result = expandNode(nodeData, '789:012');
      
      expect(result.frames).toHaveLength(0);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].name).toBe('Note');
    });
    
    it('should expand CANVAS to child frames', () => {
      const nodeData = {
        id: '0:1',
        type: 'CANVAS',
        name: 'Page 1',
        children: [
          { id: '1:1', type: 'FRAME', name: 'Screen A', visible: true, locked: false, absoluteBoundingBox: null },
          { id: '1:2', type: 'FRAME', name: 'Screen B', visible: true, locked: false, absoluteBoundingBox: null },
          { id: '1:3', type: 'INSTANCE', name: 'Note', visible: true, locked: false, absoluteBoundingBox: null },
          { id: '1:4', type: 'VECTOR', name: 'Decoration', visible: true, locked: false }, // Should be ignored
        ],
      };
      
      const result = expandNode(nodeData, '0:1');
      
      expect(result.frames).toHaveLength(2);
      expect(result.notes).toHaveLength(1);
      expect(result.frames[0].name).toBe('Screen A');
      expect(result.frames[1].name).toBe('Screen B');
    });
    
    it('should expand SECTION to child frames with context', () => {
      const nodeData = {
        id: '2:1',
        type: 'SECTION',
        name: 'Login Flow',
        children: [
          { id: '2:2', type: 'FRAME', name: 'Login', visible: true, locked: false, absoluteBoundingBox: null },
          { id: '2:3', type: 'FRAME', name: 'Signup', visible: true, locked: false, absoluteBoundingBox: null },
        ],
      };
      
      const result = expandNode(nodeData, '2:1');
      
      expect(result.frames).toHaveLength(2);
      expect(result.sectionContext).toBeDefined();
      expect(result.sectionContext?.sectionName).toBe('Login Flow');
      expect(result.sectionContext?.sectionId).toBe('2:1');
    });
    
    it('should auto-expand SECTIONs inside CANVAS', () => {
      const nodeData = {
        id: '0:1',
        type: 'CANVAS',
        name: 'Design Page',
        children: [
          { id: '1:1', type: 'FRAME', name: 'Standalone', visible: true, locked: false, absoluteBoundingBox: null },
          {
            id: '2:1',
            type: 'SECTION',
            name: 'Login Flow',
            children: [
              { id: '2:2', type: 'FRAME', name: 'Login', visible: true, locked: false, absoluteBoundingBox: null },
              { id: '2:3', type: 'FRAME', name: 'Signup', visible: true, locked: false, absoluteBoundingBox: null },
            ],
          },
        ],
      };
      
      const result = expandNode(nodeData, '0:1');
      
      // Should have 3 frames total: 1 standalone + 2 from section
      expect(result.frames).toHaveLength(3);
      expect(result.frames.map(f => f.name)).toContain('Standalone');
      expect(result.frames.map(f => f.name)).toContain('Login');
      expect(result.frames.map(f => f.name)).toContain('Signup');
    });
    
    it('should return empty for unsupported node types', () => {
      const nodeData = {
        id: '123:456',
        type: 'VECTOR',
        name: 'Some Vector',
        visible: true,
        locked: false,
      };
      
      const result = expandNode(nodeData, '123:456');
      
      expect(result.frames).toHaveLength(0);
      expect(result.notes).toHaveLength(0);
    });
    
    it('should return empty for null node data', () => {
      const result = expandNode(null, '123:456');
      
      expect(result.frames).toHaveLength(0);
      expect(result.notes).toHaveLength(0);
    });
    
    it('should handle CANVAS with no children', () => {
      const nodeData = {
        id: '0:1',
        type: 'CANVAS',
        name: 'Empty Page',
        children: [],
      };
      
      const result = expandNode(nodeData, '0:1');
      
      expect(result.frames).toHaveLength(0);
      expect(result.notes).toHaveLength(0);
    });
  });
  
  // ============================================================================
  // expandNodes (batch)
  // ============================================================================
  
  describe('expandNodes', () => {
    it('should expand multiple nodes and combine results', () => {
      const nodesDataMap = new Map<string, any>([
        ['1:1', {
          id: '1:1',
          type: 'FRAME',
          name: 'Frame A',
          visible: true,
          locked: false,
          absoluteBoundingBox: null,
        }],
        ['1:2', {
          id: '1:2',
          type: 'FRAME',
          name: 'Frame B',
          visible: true,
          locked: false,
          absoluteBoundingBox: null,
        }],
      ]);
      
      const result = expandNodes(nodesDataMap);
      
      expect(result.frames).toHaveLength(2);
      expect(result.notes).toHaveLength(0);
    });
    
    it('should deduplicate frames by ID', () => {
      // Same frame ID appears in two different requests
      const nodesDataMap = new Map<string, any>([
        ['canvas:1', {
          id: 'canvas:1',
          type: 'CANVAS',
          name: 'Page 1',
          children: [
            { id: '1:1', type: 'FRAME', name: 'Frame A', visible: true, locked: false, absoluteBoundingBox: null },
          ],
        }],
        ['1:1', { // Direct request for same frame
          id: '1:1',
          type: 'FRAME',
          name: 'Frame A',
          visible: true,
          locked: false,
          absoluteBoundingBox: null,
        }],
      ]);
      
      const result = expandNodes(nodesDataMap);
      
      // Should only have one frame (deduplicated)
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].id).toBe('1:1');
    });
  });
  
  // ============================================================================
  // separateFramesAndNotes
  // ============================================================================
  
  describe('separateFramesAndNotes', () => {
    it('should separate frames from notes', () => {
      const metadata = [
        { id: '1:1', type: 'FRAME', name: 'Frame', visible: true, locked: false, absoluteBoundingBox: null },
        { id: '1:2', type: 'INSTANCE', name: 'Note', visible: true, locked: false, absoluteBoundingBox: null },
        { id: '1:3', type: 'FRAME', name: 'Frame 2', visible: true, locked: false, absoluteBoundingBox: null },
      ];
      
      const result = separateFramesAndNotes(metadata);
      
      expect(result.frames).toHaveLength(2);
      expect(result.notes).toHaveLength(1);
    });
    
    it('should ignore non-Note INSTANCE types', () => {
      const metadata = [
        { id: '1:1', type: 'INSTANCE', name: 'Button', visible: true, locked: false, absoluteBoundingBox: null }, // Not a Note
        { id: '1:2', type: 'INSTANCE', name: 'Note', visible: true, locked: false, absoluteBoundingBox: null },
      ];
      
      const result = separateFramesAndNotes(metadata);
      
      expect(result.frames).toHaveLength(0);
      expect(result.notes).toHaveLength(1);
    });
  });
  
  // ============================================================================
  // deduplicateFrames
  // ============================================================================
  
  describe('deduplicateFrames', () => {
    it('should remove duplicate frames by ID', () => {
      const frames = [
        { id: '1:1', type: 'FRAME', name: 'Frame A', visible: true, locked: false, absoluteBoundingBox: null },
        { id: '1:2', type: 'FRAME', name: 'Frame B', visible: true, locked: false, absoluteBoundingBox: null },
        { id: '1:1', type: 'FRAME', name: 'Frame A Copy', visible: true, locked: false, absoluteBoundingBox: null }, // Duplicate ID
      ];
      
      const result = deduplicateFrames(frames);
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1:1');
      expect(result[1].id).toBe('1:2');
    });
    
    it('should preserve first occurrence when deduplicating', () => {
      const frames = [
        { id: '1:1', type: 'FRAME', name: 'First', visible: true, locked: false, absoluteBoundingBox: null },
        { id: '1:1', type: 'FRAME', name: 'Second', visible: true, locked: false, absoluteBoundingBox: null },
      ];
      
      const result = deduplicateFrames(frames);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('First'); // First occurrence preserved
    });
  });
});
