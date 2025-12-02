/**
 * Unit tests for ADF operations
 * 
 * These tests validate that ADF manipulation utilities work correctly and preserve
 * all node types, especially hardBreak nodes which are lost in Markdown round-trips.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractAdfSection,
  removeAdfSection,
  appendToAdfSection,
  replaceAdfSection,
  findAdfHeading,
  traverseAdfNodes
} from './adf-operations.js';
import type { ADFNode, ADFDocument } from './markdown-converter.js';
import * as fs from 'fs';
import * as path from 'path';

// Load test fixtures
const fixturesPath = path.join(__dirname, 'test-fixtures/adf');
const epicWithShellStories: ADFDocument = JSON.parse(
  fs.readFileSync(path.join(fixturesPath, 'epic-with-shell-stories.json'), 'utf-8')
);

describe('findAdfHeading', () => {
  it('should find heading by exact text match', () => {
    const content = epicWithShellStories.content;
    const index = findAdfHeading(content, 'Shell Stories');
    expect(index).toBeGreaterThan(-1);
    expect(content[index].type).toBe('heading');
  });

  it('should be case-insensitive', () => {
    const content = epicWithShellStories.content;
    const index = findAdfHeading(content, 'shell stories');
    expect(index).toBeGreaterThan(-1);
  });

  it('should return -1 when heading not found', () => {
    const content = epicWithShellStories.content;
    const index = findAdfHeading(content, 'Nonexistent Heading');
    expect(index).toBe(-1);
  });

  it('should handle empty content array', () => {
    const index = findAdfHeading([], 'Any Heading');
    expect(index).toBe(-1);
  });
});

describe('extractAdfSection', () => {
  it('should extract section between headings', () => {
    const content = epicWithShellStories.content;
    const { section, remaining } = extractAdfSection(content, 'Shell Stories');
    
    // Section should include the heading and content until next heading
    expect(section.length).toBeGreaterThan(0);
    expect(section[0].type).toBe('heading');
    
    // Should contain the bulletList with shell stories
    const hasBulletList = section.some((node: ADFNode) => node.type === 'bulletList');
    expect(hasBulletList).toBe(true);
    
    // Remaining should have content before and after the section
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('should return empty section when heading not found', () => {
    const content = epicWithShellStories.content;
    const { section, remaining } = extractAdfSection(content, 'Nonexistent');
    
    expect(section).toEqual([]);
    expect(remaining).toEqual(content);
  });

  it('should extract section to end of document if no next heading', () => {
    const content = epicWithShellStories.content;
    const { section, remaining } = extractAdfSection(content, 'Other Section');
    
    // Section should include heading and all content after it
    expect(section.length).toBeGreaterThan(0);
    expect(section[0].type).toBe('heading');
    
    // Remaining should not include the section
    const hasOtherSection = remaining.some(
      (node: ADFNode) => node.type === 'heading' && 
              node.content?.[0]?.type === 'text' && 
              node.content[0].text === 'Other Section'
    );
    expect(hasOtherSection).toBe(false);
  });

  it('should preserve all node types including hardBreak', () => {
    const shellStoryWithHardBreak = JSON.parse(
      fs.readFileSync(path.join(fixturesPath, 'shell-story-with-hardbreak.json'), 'utf-8')
    );
    
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Test Section' }]
      },
      {
        type: 'bulletList',
        content: [shellStoryWithHardBreak]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Next Section' }]
      }
    ];
    
    const { section } = extractAdfSection(content, 'Test Section');
    
    // Verify hardBreak nodes are preserved
    let hardBreakCount = 0;
    traverseAdfNodes(section, (node: ADFNode) => {
      if (node.type === 'hardBreak') {
        hardBreakCount++;
      }
    });
    
    expect(hardBreakCount).toBeGreaterThan(0);
  });
});

describe('removeAdfSection', () => {
  it('should remove section and return new array', () => {
    const content = epicWithShellStories.content;
    const originalLength = content.length;
    const updated = removeAdfSection(content, 'Context');
    
    // Should be shorter than original
    expect(updated.length).toBeLessThan(originalLength);
    
    // Should not contain the Context heading
    const hasContext = updated.some(
      (node: ADFNode) => node.type === 'heading' && 
              node.content?.[0]?.type === 'text' && 
              node.content[0].text === 'Context'
    );
    expect(hasContext).toBe(false);
    
    // Original should be unchanged
    expect(content.length).toBe(originalLength);
  });

  it('should return original array when heading not found', () => {
    const content = epicWithShellStories.content;
    const updated = removeAdfSection(content, 'Nonexistent');
    
    expect(updated).toEqual(content);
  });

  it('should handle removing last section', () => {
    const content = epicWithShellStories.content;
    const updated = removeAdfSection(content, 'Other Section');
    
    // Should not contain the Other Section heading
    const hasOtherSection = updated.some(
      (node: ADFNode) => node.type === 'heading' && 
              node.content?.[0]?.type === 'text' && 
              node.content[0].text === 'Other Section'
    );
    expect(hasOtherSection).toBe(false);
  });
});

describe('appendToAdfSection', () => {
  it('should append nodes to existing section', () => {
    const content = epicWithShellStories.content;
    const newParagraph: ADFNode = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'New content appended' }]
    };
    
    const updated = appendToAdfSection(content, 'Shell Stories', [newParagraph]);
    
    // Should be longer than original
    expect(updated.length).toBeGreaterThan(content.length);
    
    // Find Shell Stories section in updated content
    const shellStoriesIndex = findAdfHeading(updated, 'Shell Stories');
    expect(shellStoriesIndex).toBeGreaterThan(-1);
    
    // New paragraph should be in the section
    let found = false;
    for (let i = shellStoriesIndex + 1; i < updated.length; i++) {
      const node = updated[i];
      if (node.type === 'heading') break; // Stop at next heading
      if (node.type === 'paragraph' && 
          node.content?.[0]?.type === 'text' && 
          node.content[0].text === 'New content appended') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('should append at end if heading not found', () => {
    const content = epicWithShellStories.content;
    const newNodes: ADFNode[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'New section content' }] }
    ];
    
    const updated = appendToAdfSection(content, 'New Section', newNodes);
    
    // Should be longer than original
    expect(updated.length).toBeGreaterThan(content.length);
    
    // New nodes should be at the end
    const lastNode = updated[updated.length - 1];
    expect(lastNode.type).toBe('paragraph');
  });

  it('should preserve hardBreak nodes when appending', () => {
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Test' }]
      }
    ];
    
    const newNodes: ADFNode[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Line 2' }
        ]
      }
    ];
    
    const updated = appendToAdfSection(content, 'Test', newNodes);
    
    // Verify hardBreak is preserved
    let hasHardBreak = false;
    traverseAdfNodes(updated, (node: ADFNode) => {
      if (node.type === 'hardBreak') {
        hasHardBreak = true;
      }
    });
    
    expect(hasHardBreak).toBe(true);
  });
});

describe('replaceAdfSection', () => {
  it('should replace section content', () => {
    const content = epicWithShellStories.content;
    const newNodes: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Shell Stories' }]
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Replaced content' }] }
    ];
    
    const updated = replaceAdfSection(content, 'Shell Stories', newNodes);
    
    // Should still have Shell Stories heading
    const shellStoriesIndex = findAdfHeading(updated, 'Shell Stories');
    expect(shellStoriesIndex).toBeGreaterThan(-1);
    
    // Should have replaced content
    let found = false;
    for (let i = shellStoriesIndex + 1; i < updated.length; i++) {
      const node = updated[i];
      if (node.type === 'heading') break;
      if (node.type === 'paragraph' && 
          node.content?.[0]?.type === 'text' && 
          node.content[0].text === 'Replaced content') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('should append at end if heading not found', () => {
    const content = epicWithShellStories.content;
    const newNodes: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Brand New Section' }]
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'New section' }] }
    ];
    
    const updated = replaceAdfSection(content, 'Brand New Section', newNodes);
    
    // Should be longer than original
    expect(updated.length).toBeGreaterThan(content.length);
    
    // Should have new heading at the end
    const newIndex = findAdfHeading(updated, 'Brand New Section');
    expect(newIndex).toBeGreaterThan(-1);
  });

  it('should preserve hardBreak nodes when replacing', () => {
    const content = epicWithShellStories.content;
    const newNodes: ADFNode[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Multi' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Line' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Content' }
        ]
      }
    ];
    
    const updated = replaceAdfSection(content, 'Context', newNodes);
    
    // Count hardBreaks in replaced section
    let hardBreakCount = 0;
    const contextIndex = findAdfHeading(updated, 'Context');
    for (let i = contextIndex + 1; i < updated.length; i++) {
      const node = updated[i];
      if (node.type === 'heading') break;
      traverseAdfNodes([node], (n: ADFNode) => {
        if (n.type === 'hardBreak') hardBreakCount++;
      });
    }
    
    expect(hardBreakCount).toBe(2);
  });
});

describe('traverseAdfNodes', () => {
  it('should visit all nodes in depth-first order', () => {
    const shellStoryWithHardBreak = JSON.parse(
      fs.readFileSync(path.join(fixturesPath, 'shell-story-with-hardbreak.json'), 'utf-8')
    );
    
    const nodes: ADFNode[] = [shellStoryWithHardBreak];
    const visitedTypes: string[] = [];
    
    traverseAdfNodes(nodes, (node: ADFNode) => {
      visitedTypes.push(node.type);
    });
    
    // Should visit listItem, paragraph, text, hardBreak, bulletList, etc.
    expect(visitedTypes).toContain('listItem');
    expect(visitedTypes).toContain('paragraph');
    expect(visitedTypes).toContain('text');
    expect(visitedTypes).toContain('hardBreak');
    expect(visitedTypes).toContain('bulletList');
  });

  it('should allow callback to access node properties', () => {
    const content: ADFNode[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Bold text', marks: [{ type: 'strong' }] }
        ]
      }
    ];
    
    let foundStrong = false;
    traverseAdfNodes(content, (node: ADFNode) => {
      if (node.type === 'text' && node.marks) {
        const hasStrong = node.marks.some((m: any) => m.type === 'strong');
        if (hasStrong) foundStrong = true;
      }
    });
    
    expect(foundStrong).toBe(true);
  });

  it('should handle empty arrays', () => {
    const visitedTypes: string[] = [];
    traverseAdfNodes([], (node: ADFNode) => {
      visitedTypes.push(node.type);
    });
    
    expect(visitedTypes).toEqual([]);
  });

  it('should handle deeply nested structures', () => {
    const deeplyNested: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Level 1' }]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Level 2' }]
                    },
                    {
                      type: 'bulletList',
                      content: [
                        {
                          type: 'listItem',
                          content: [
                            {
                              type: 'paragraph',
                              content: [{ type: 'text', text: 'Level 3' }]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    
    let depth = 0;
    let maxDepth = 0;
    traverseAdfNodes([deeplyNested], (node: ADFNode) => {
      if (node.type === 'bulletList') depth++;
      if (depth > maxDepth) maxDepth = depth;
    });
    
    expect(maxDepth).toBe(3);
  });
});

describe('Edge cases and error handling', () => {
  it('should handle nodes without content property', () => {
    const content: ADFNode[] = [
      { type: 'hardBreak' }, // No content property
      { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }
    ];
    
    const { section, remaining } = extractAdfSection(content, 'Test');
    expect(section).toEqual([]);
    expect(remaining).toEqual(content);
  });

  it('should handle nodes without attrs property', () => {
    const content: ADFNode[] = [
      { type: 'heading', content: [{ type: 'text', text: 'No Attrs' }] } // No attrs
    ];
    
    const index = findAdfHeading(content, 'No Attrs');
    expect(index).toBe(0);
  });

  it('should handle empty section removal', () => {
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Empty Section' }]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Next Section' }]
      }
    ];
    
    const updated = removeAdfSection(content, 'Empty Section');
    expect(updated.length).toBe(1);
    expect(updated[0].content?.[0]?.text).toBe('Next Section');
  });

  it('should preserve unknown node types', () => {
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Test' }]
      },
      { type: 'unknownNodeType', customProp: 'customValue' } as any
    ];
    
    const { section } = extractAdfSection(content, 'Test');
    expect(section.length).toBe(2);
    expect(section[1].type).toBe('unknownNodeType');
  });
});
