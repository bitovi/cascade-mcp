/**
 * Unit tests for Shell Story ADF Parser
 * 
 * These tests validate that shell story parsing preserves all ADF formatting,
 * especially hardBreak nodes that are lost in Markdown round-trips.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseShellStoriesFromAdf,
  addCompletionMarkerToStory,
  type ParsedShellStory
} from './shell-story-adf-parser.js';
import type { ADFNode, ADFDocument } from '../../../atlassian/markdown-converter.js';
import { extractADFSection } from '../../../atlassian/markdown-converter.js';
import * as fs from 'fs';
import * as path from 'path';

// Load test fixtures
const fixturesPath = path.join(__dirname, '../../../atlassian/test-fixtures/adf');
const epicWithShellStories: ADFDocument = JSON.parse(
  fs.readFileSync(path.join(fixturesPath, 'epic-with-shell-stories.json'), 'utf-8')
);
const shellStoryWithHardBreak: ADFNode = JSON.parse(
  fs.readFileSync(path.join(fixturesPath, 'shell-story-with-hardbreak.json'), 'utf-8')
);
const completedShellStory: ADFNode = JSON.parse(
  fs.readFileSync(path.join(fixturesPath, 'completed-shell-story.json'), 'utf-8')
);

describe('parseShellStoriesFromAdf', () => {
  it('should parse basic shell stories from bulletList', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Login Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can log into the application' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'SCREENS: Login Page (Fig-001)' }]
                    }
                  ]
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'DEPENDENCIES: None' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].title).toBe('Login Story');
    // Screens should be empty since we didn't provide link marks
    expect(stories[0].screens).toEqual([]);
    // "None" dependencies should be filtered out to empty array
    expect(stories[0].dependencies).toEqual([]);
  });

  it('should parse shell stories with hardBreak nodes', () => {
    const stories = parseShellStoriesFromAdf([
      {
        type: 'bulletList',
        content: [shellStoryWithHardBreak]
      }
    ]);

    expect(stories.length).toBe(1);
    const story = stories[0];
    
    // Screens should be parsed correctly despite hardBreak
    expect(story.screens.length).toBe(2);
    expect(story.screens).toContain('https://figma.com/file/test?node-id=001');
    expect(story.screens).toContain('https://figma.com/file/test?node-id=002');
    
    // Dependencies should handle hardBreak
    expect(story.dependencies.length).toBe(2);
    expect(story.dependencies).toContain('Authentication');
    expect(story.dependencies).toContain('Data Layer');
  });

  it('should parse multiple shell stories', () => {
    // Get Shell Stories section from fixture
    const content = epicWithShellStories.content;
    const shellStoriesSection = content.find((node: ADFNode) => 
      node.type === 'bulletList'
    );

    if (!shellStoriesSection) {
      throw new Error('Shell Stories section not found in fixture');
    }

    const stories = parseShellStoriesFromAdf([shellStoriesSection]);
    
    expect(stories.length).toBeGreaterThanOrEqual(2);
    
    // Verify first story
    const loginStory = stories.find((s: ParsedShellStory) => s.title.includes('Login'));
    expect(loginStory).toBeDefined();
    
    // Verify second story
    const dashboardStory = stories.find((s: ParsedShellStory) => s.title.includes('Dashboard'));
    expect(dashboardStory).toBeDefined();
  });

  it('should detect completion marker (✓)', () => {
    const stories = parseShellStoriesFromAdf([
      {
        type: 'bulletList',
        content: [completedShellStory]
      }
    ]);

    expect(stories.length).toBe(1);
    const story = stories[0];
    
    // Title should contain checkmark
    expect(story.title).toContain('✓');
  });

  it('should extract Figma URLs from screens field', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Form Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can fill out forms' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'SCREENS: ' },
                        { 
                          type: 'text', 
                          text: 'https://www.figma.com/design/ABC/XYZ?node-id=123',
                          marks: [{ type: 'link', attrs: { href: 'https://www.figma.com/design/ABC/XYZ?node-id=123' } }]
                        },
                        { type: 'hardBreak' },
                        { 
                          type: 'text', 
                          text: 'https://www.figma.com/design/DEF/UVW?node-id=456',
                          marks: [{ type: 'link', attrs: { href: 'https://www.figma.com/design/DEF/UVW?node-id=456' } }]
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

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].screens.length).toBe(2);
    expect(stories[0].screens[0]).toContain('figma.com');
    expect(stories[0].screens[1]).toContain('figma.com');
  });

  it('should parse included items (☐)', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Feature Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can access feature functionality' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '☐ Form validation' }]
                    }
                  ]
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '☐ Error messages' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].included.length).toBe(2);
    expect(stories[0].included).toContain('Form validation');
    expect(stories[0].included).toContain('Error messages');
  });

  it('should parse low priority items (⏬)', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'UI Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can interact with UI elements' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '⏬ Animation polish' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].lowPriority.length).toBe(1);
    expect(stories[0].lowPriority).toContain('Animation polish');
  });

  it('should parse excluded items (❌)', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'API Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can access API endpoints' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '❌ Deprecated endpoint' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].excluded.length).toBe(1);
    expect(stories[0].excluded).toContain('Deprecated endpoint');
  });

  it('should parse questions (❓)', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Auth Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can authenticate' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '❓ Which OAuth provider?' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].questions.length).toBe(1);
    expect(stories[0].questions).toContain('Which OAuth provider?');
  });

  it('should handle stories without nested lists', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Simple Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ A simple story without nested lists' }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].title).toBe('Simple Story');
    expect(stories[0].screens).toEqual([]);
    expect(stories[0].dependencies).toEqual([]);
  });

  it('should preserve rawAdf field', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Story with ADF', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ This story preserves ADF' }
              ]
            }
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    
    expect(stories.length).toBe(1);
    expect(stories[0].rawAdf).toBeDefined();
    expect(stories[0].rawAdf?.length).toBeGreaterThan(0);
  });
});

describe('extractADFSection and parseShellStoriesFromAdf (two-step pattern)', () => {
  it('should extract section and parse shell stories from epic content', () => {
    const { section } = extractADFSection(epicWithShellStories.content, 'Shell Stories');
    const stories = parseShellStoriesFromAdf(section);

    // Should find stories
    expect(stories.length).toBeGreaterThan(0);
  });

  it('should handle epic without shell stories section', () => {
    const emptyDoc: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Context' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Some context text' }]
        }
      ]
    };

    const { section } = extractADFSection(emptyDoc.content, 'Shell Stories');
    const stories = parseShellStoriesFromAdf(section);

    // Should return empty stories
    expect(stories).toEqual([]);
  });
});

describe('addCompletionMarkerToStory', () => {
  it('should add ✓ marker to uncompleted story title', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Login Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can log into the application' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'SCREENS: Login (Fig-001)' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const updated = addCompletionMarkerToStory([bulletList], 'st001', 'PROJ-123', 'https://jira.com/PROJ-123');

    // Find the updated story title
    const listItem = updated[0].content?.[0];
    const titleParagraph = listItem?.content?.[0];
    
    // Find the title text node (has 'strong' mark)
    const titleNode = titleParagraph?.content?.find((node: any) => 
      node.marks?.some((mark: any) => mark.type === 'strong')
    );

    // Title should have both 'strong' and 'link' marks (completion is indicated by link)
    expect(titleNode?.marks?.some((m: any) => m.type === 'link')).toBe(true);
    expect(titleNode?.marks?.some((m: any) => m.type === 'strong')).toBe(true);
  });

  it('should add Jira URL and timestamp to story metadata', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Dashboard Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ User can view dashboard' }
              ]
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'SCREENS: Dashboard (Fig-002)' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const jiraUrl = 'https://jira.com/PROJ-456';
    const updated = addCompletionMarkerToStory([bulletList], 'st001', 'PROJ-456', jiraUrl);

    // Parse the updated story
    const stories = parseShellStoriesFromAdf(updated);
    expect(stories.length).toBe(1);
    
    const story = stories[0];
    expect(story.jiraUrl).toBe(jiraUrl);
    expect(story.timestamp).toBeDefined();
  });

  it('should not modify already completed stories', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [completedShellStory]
    };

    const updated = addCompletionMarkerToStory([bulletList], 'st001', 'PROJ-789', 'https://jira.com/PROJ-789');

    // Should be essentially unchanged (already has ✓)
    const stories = parseShellStoriesFromAdf(updated);
    expect(stories.length).toBe(1);
    expect(stories[0].title).toContain('✓');
  });

  it('should preserve hardBreak nodes when adding completion marker', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [shellStoryWithHardBreak]
    };

    const updated = addCompletionMarkerToStory([bulletList], 'st001', 'PROJ-999', 'https://jira.com/PROJ-999');

    // Verify hardBreaks are still present
    let hardBreakCount = 0;
    function countHardBreaks(nodes: ADFNode[]) {
      for (const node of nodes) {
        if (node.type === 'hardBreak') hardBreakCount++;
        if (node.content) countHardBreaks(node.content);
      }
    }
    countHardBreaks(updated);

    expect(hardBreakCount).toBeGreaterThan(0);
  });

  it('should handle story ID not found', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Some Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ Some description' }
              ]
            }
          ]
        }
      ]
    };

    // Should throw error when story ID is not found
    expect(() => {
      addCompletionMarkerToStory([bulletList], 'nonexistent-id', 'PROJ-000', 'https://jira.com/PROJ-000');
    }).toThrow('Story nonexistent-id not found in Shell Stories section');
  });
});

describe('Error handling and edge cases', () => {
  it('should handle empty bulletList', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: []
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    expect(stories).toEqual([]);
  });

  it('should handle malformed story structure', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [] // Empty listItem
        }
      ]
    };

    // Should throw validation error for malformed story
    expect(() => {
      parseShellStoriesFromAdf([bulletList]);
    }).toThrow('Shell story missing ID');
  });

  it('should handle nested lists without proper structure', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'bulletList', // Nested list without paragraph first
              content: []
            }
          ]
        }
      ]
    };

    // Should throw validation error for missing story ID
    expect(() => {
      parseShellStoriesFromAdf([bulletList]);
    }).toThrow('Shell story missing ID');
  });

  it('should handle text nodes without content', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text' } // No text property
              ]
            }
          ]
        }
      ]
    };

    // Should throw validation error for missing story ID
    expect(() => {
      parseShellStoriesFromAdf([bulletList]);
    }).toThrow('Shell story missing ID');
  });

  it('should preserve unknown node types', () => {
    const bulletList: ADFNode = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'st001', marks: [{ type: 'code' }] },
                { type: 'text', text: ' ' },
                { type: 'text', text: 'Story', marks: [{ type: 'strong' }] },
                { type: 'text', text: ' ⟩ Test story with unknown nodes' }
              ]
            },
            { type: 'unknownNode', customProp: 'value' } as any
          ]
        }
      ]
    };

    const stories = parseShellStoriesFromAdf([bulletList]);
    expect(stories.length).toBe(1);
    expect(stories[0].rawAdf).toBeDefined();
  });
});
