/**
 * Unit tests for size-helpers.ts
 */

import { calculateAdfSize, wouldExceedLimit } from '../size-helpers.js';
import type { ADFDocument, ADFNode } from '../../../../atlassian/markdown-converter.js';

describe('size-helpers', () => {
  describe('calculateAdfSize', () => {
    it('should calculate size of simple ADF document', () => {
      const doc: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }]
        }]
      };
      
      const size = calculateAdfSize(doc);
      expect(size).toBe(JSON.stringify(doc).length);
    });

    it('should calculate size of complex ADF document', () => {
      const doc: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Heading' }]
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Regular text ' },
              { type: 'text', text: 'bold text', marks: [{ type: 'strong' }] }
            ]
          }
        ]
      };
      
      const size = calculateAdfSize(doc);
      expect(size).toBe(JSON.stringify(doc).length);
    });

    it('should handle empty content', () => {
      const doc: ADFDocument = {
        version: 1,
        type: 'doc',
        content: []
      };
      
      const size = calculateAdfSize(doc);
      expect(size).toBe(JSON.stringify(doc).length);
      expect(size).toBeGreaterThan(0); // Still has version, type, content array
    });
  });
  
  describe('wouldExceedLimit', () => {
    it('should return false for small content', () => {
      const existing: ADFNode[] = [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Small content' }]
      }];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'More content' }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(false);
    });
    
    it('should return true for content near limit', () => {
      // Create large content that would exceed 41KB (43838 - 2000 safety margin)
      // Need to account for JSON overhead: ~150 chars for structure per node
      const largeText = 'x'.repeat(21000); // Combined will be > 41838
      
      const existing: ADFNode[] = [{
        type: 'paragraph',
        content: [{ type: 'text', text: largeText }]
      }];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: largeText }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(true);
    });

    it('should use 2KB safety margin (41838 limit)', () => {
      // Create content that's just under the actual limit but over the safety limit
      // JIRA_LIMIT = 43838, SAFETY_MARGIN = 2000, effectiveLimit = 41838
      // Combined size needs to be > 41838 but < 43838
      const largeText = 'x'.repeat(20920); // Combined: ~41840-41900 (just over safety limit)
      
      const existing: ADFNode[] = [{
        type: 'paragraph',
        content: [{ type: 'text', text: largeText }]
      }];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: largeText }]
        }]
      };
      
      // Combined size calculation to verify we're in the right range
      const combinedDoc = {
        version: 1,
        type: 'doc',
        content: [...existing, ...newContent.content]
      };
      const actualSize = JSON.stringify(combinedDoc).length;
      
      // Verify we're testing the safety margin correctly
      expect(actualSize).toBeGreaterThan(41838);
      expect(actualSize).toBeLessThan(43838);
      
      // Should be flagged as exceeding due to safety margin
      expect(wouldExceedLimit(existing, newContent)).toBe(true);
    });

    it('should handle empty existing content', () => {
      const existing: ADFNode[] = [];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'New content' }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(false);
    });

    it('should handle complex nested structures', () => {
      const existing: ADFNode[] = [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }]
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item 1' }]
              }]
            }
          ]
        }
      ];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Additional paragraph' }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(false);
    });
  });
});
