/**
 * Test SECTION handling implementation
 */

import { describe, test, expect } from '@jest/globals';
import { toKebabCase, generateScreenFilename, getFramesAndNotesForNode } from './figma-helpers.js';

describe('SECTION Handling - Filename Utilities', () => {
  describe('toKebabCase', () => {
    test('converts spaces to dashes', () => {
      expect(toKebabCase('Workshop Grid 1024px')).toBe('workshop-grid-1024px');
    });

    test('removes special characters', () => {
      expect(toKebabCase('User Profile (Editing)')).toBe('user-profile-editing');
      expect(toKebabCase('Special@#$Chars')).toBe('specialchars');
    });

    test('trims spaces', () => {
      expect(toKebabCase('  Spaces   Everywhere  ')).toBe('spaces-everywhere');
    });

    test('collapses multiple dashes', () => {
      expect(toKebabCase('Multiple---Dashes')).toBe('multiple-dashes');
    });

    test('removes leading and trailing dashes', () => {
      expect(toKebabCase('-leading-trailing-')).toBe('leading-trailing');
    });
  });

  describe('generateScreenFilename', () => {
    test('generates filename with frame name and node ID', () => {
      expect(generateScreenFilename('workshop grid 1024px', '5101:4299'))
        .toBe('workshop-grid-1024px_5101-4299');
    });

    test('handles simple names', () => {
      expect(generateScreenFilename('Dashboard Main', '1234:5678'))
        .toBe('dashboard-main_1234-5678');
    });

    test('handles special characters in frame name', () => {
      expect(generateScreenFilename('User Profile (Editing)', '9999:1111'))
        .toBe('user-profile-editing_9999-1111');
    });

    test('converts colons to dashes in node ID', () => {
      expect(generateScreenFilename('Frame Name', '1234:5678'))
        .toBe('frame-name_1234-5678');
    });
  });

  describe('getFramesAndNotesForNode - Automatic SECTION Expansion', () => {
    test('expands SECTION nodes when loading a CANVAS', () => {
      // Mock Figma file with CANVAS containing a SECTION
      const mockFileData = {
        document: {
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              type: 'CANVAS',
              name: 'Page 1',
              children: [
                {
                  id: '2:2',
                  type: 'FRAME',
                  name: 'Top Level Frame',
                  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
                },
                {
                  id: '3:3',
                  type: 'SECTION',
                  name: 'Workshop Section',
                  children: [
                    {
                      id: '4:4',
                      type: 'FRAME',
                      name: 'Frame A',
                      absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 100 }
                    },
                    {
                      id: '5:5',
                      type: 'FRAME',
                      name: 'Frame B',
                      absoluteBoundingBox: { x: 400, y: 0, width: 100, height: 100 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      const results = getFramesAndNotesForNode(mockFileData, '1:1');

      // Should return 3 frames: 1 top-level + 2 from SECTION
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('2:2');
      expect(results[0].name).toBe('Top Level Frame');
      expect(results[1].id).toBe('4:4');
      expect(results[1].name).toBe('Frame A');
      expect(results[2].id).toBe('5:5');
      expect(results[2].name).toBe('Frame B');
    });

    test('handles nested SECTIONS', () => {
      const mockFileData = {
        document: {
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              type: 'CANVAS',
              name: 'Page 1',
              children: [
                {
                  id: '2:2',
                  type: 'SECTION',
                  name: 'Outer Section',
                  children: [
                    {
                      id: '3:3',
                      type: 'SECTION',
                      name: 'Inner Section',
                      children: [
                        {
                          id: '4:4',
                          type: 'FRAME',
                          name: 'Nested Frame',
                          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      const results = getFramesAndNotesForNode(mockFileData, '1:1');

      // Should recursively expand nested sections
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('4:4');
      expect(results[0].name).toBe('Nested Frame');
    });

    test('preserves notes when expanding sections', () => {
      const mockFileData = {
        document: {
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              type: 'CANVAS',
              name: 'Page 1',
              children: [
                {
                  id: '2:2',
                  type: 'SECTION',
                  name: 'Workshop Section',
                  children: [
                    {
                      id: '3:3',
                      type: 'FRAME',
                      name: 'Frame A',
                      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 }
                    },
                    {
                      id: '4:4',
                      type: 'INSTANCE',
                      name: 'Note',
                      absoluteBoundingBox: { x: 50, y: 50, width: 10, height: 10 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      const results = getFramesAndNotesForNode(mockFileData, '1:1');

      // Should return both frame and note from section
      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('FRAME');
      expect(results[1].type).toBe('INSTANCE');
      expect(results[1].name).toBe('Note');
    });
  });
});
