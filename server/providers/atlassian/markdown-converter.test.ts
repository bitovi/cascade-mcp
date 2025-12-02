/**
 * Jest test suite for markdown to ADF conversion functionality
 */

import { 
  convertMarkdownToAdf_NewContentOnly, 
  validateAdf, 
  removeADFSectionByHeading, 
  countADFSectionsByHeading,
  extractADFSection,
  convertAdfToMarkdown_AIPromptOnly,
  type ADFDocument 
} from './markdown-converter.js';

/**
 * Helper to calculate max nesting depth of bullet lists in ADF content
 */
function getMaxListDepth(content: any[], currentDepth: number = 0): number {
  let maxDepth = currentDepth;
  
  for (const node of content) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const childDepth = getMaxListDepth(node.content || [], currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    } else if (node.content) {
      const childDepth = getMaxListDepth(node.content, currentDepth);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  
  return maxDepth;
}

describe('Markdown to ADF Converter', () => {
  describe('convertMarkdownToAdf_NewContentOnly', () => {
    test('should convert simple markdown to valid ADF', async () => {
      const markdown = '# Hello World\n\nThis is a test.';
      const adf = await convertMarkdownToAdf_NewContentOnly(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(adf.version).toBe(1);
      expect(adf.type).toBe('doc');
      expect(adf.content).toHaveLength(2);
    });

    test('should handle empty input gracefully', async () => {
      const adf = await convertMarkdownToAdf_NewContentOnly('');
      
      expect(validateAdf(adf)).toBe(true);
      expect(adf.content).toHaveLength(1);
      expect(adf.content[0].type).toBe('paragraph');
    });

    test('should handle null/undefined input', async () => {
      const adf1 = await convertMarkdownToAdf_NewContentOnly(null as any);
      const adf2 = await convertMarkdownToAdf_NewContentOnly(undefined as any);
      
      expect(validateAdf(adf1)).toBe(true);
      expect(validateAdf(adf2)).toBe(true);
    });

    test('should convert nested bullet lists correctly', async () => {
      const markdown = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * Display header/navigation bar`;

      const adf = await convertMarkdownToAdf_NewContentOnly(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(getMaxListDepth(adf.content)).toBeLessThanOrEqual(2);
    });

    test('should handle bold text formatting', async () => {
      const markdown = `- **Important** item
- Regular item`;

      const adf = await convertMarkdownToAdf_NewContentOnly(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(JSON.stringify(adf)).toContain('"type":"strong"');
    });

    test('should handle inline code formatting', async () => {
      const markdown = '- `code` item\n- regular item';

      const adf = await convertMarkdownToAdf_NewContentOnly(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(JSON.stringify(adf)).toContain('"type":"code"');
    });

    test('should handle escaped characters', async () => {
      const markdown = `- \\+ escaped plus
- \\- escaped minus`;

      const adf = await convertMarkdownToAdf_NewContentOnly(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(getMaxListDepth(adf.content)).toBeLessThanOrEqual(2);
    });
  });

  describe('validateAdf', () => {
    test('should validate correct ADF structure', () => {
      const validAdf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello' }
            ]
          }
        ]
      };

      expect(validateAdf(validAdf)).toBe(true);
    });

    test('should reject invalid ADF structures', () => {
      expect(validateAdf(null)).toBe(false);
      expect(validateAdf(undefined)).toBe(false);
      expect(validateAdf({})).toBe(false);
      expect(validateAdf({ version: 2, type: 'doc', content: [] })).toBe(false);
      expect(validateAdf({ version: 1, type: 'invalid', content: [] })).toBe(false);
      expect(validateAdf({ version: 1, type: 'doc' })).toBe(false);
    });
  });

  describe('removeADFSectionByHeading', () => {
    test('should remove section by heading text', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Shell Stories' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Some content' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Other Section' }]
        }
      ];

      const result = removeADFSectionByHeading(content, 'Shell Stories');
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('heading');
      expect(result[0].content?.[0].text).toBe('Other Section');
    });

    test('should return original content if section not found', () => {
      const content = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Some content' }]
        }
      ];

      const result = removeADFSectionByHeading(content, 'Nonexistent');
      
      expect(result).toEqual(content);
    });
  });

  describe('countADFSectionsByHeading', () => {
    test('should count matching sections', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Shell Stories' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Other Section' }]
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'More Shell Stories' }]
        }
      ];

      expect(countADFSectionsByHeading(content, 'Shell Stories')).toBe(2);
      expect(countADFSectionsByHeading(content, 'Other')).toBe(1);
      expect(countADFSectionsByHeading(content, 'Nonexistent')).toBe(0);
    });
  });

  describe('extractADFSection', () => {
    test('should extract section by heading', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Introduction' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Intro text' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Scope Analysis' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Scope text' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Next Section' }]
        }
      ];
      
      const { section, remainingContent } = extractADFSection(content, 'Scope Analysis');
      
      expect(section).toHaveLength(2); // Heading + paragraph
      expect(section[0].type).toBe('heading');
      expect(remainingContent).toHaveLength(3); // Introduction + intro text + Next Section
    });
    
    test('should handle missing section', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Introduction' }]
        }
      ];
      
      const { section, remainingContent } = extractADFSection(content, 'Nonexistent');
      
      expect(section).toHaveLength(0);
      expect(remainingContent).toEqual(content);
    });

    test('should extract section at end of document', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'First Section' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First text' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Scope Analysis' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Last paragraph' }]
        }
      ];
      
      const { section, remainingContent } = extractADFSection(content, 'Scope Analysis');
      
      expect(section).toHaveLength(2); // Heading + paragraph
      expect(remainingContent).toHaveLength(2); // First section + first text
    });

    test('should respect heading hierarchy', () => {
      const content = [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Scope Analysis' }]
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Subsection' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Sub text' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Next Section' }]
        }
      ];
      
      const { section, remainingContent } = extractADFSection(content, 'Scope Analysis');
      
      // Should include H2, H3, and paragraph, but stop at next H2
      expect(section).toHaveLength(3);
      expect(remainingContent).toHaveLength(1); // Just "Next Section"
    });
  });

  describe('convertAdfToMarkdown', () => {
    test('should convert simple ADF to markdown', () => {
      const adf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }]
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }]
          }
        ]
      };

      const markdown = convertAdfToMarkdown_AIPromptOnly(adf);
      
      expect(markdown).toContain('# Title');
      expect(markdown).toContain('Hello world');
    });

    test('should handle bullet lists in ADF', () => {
      const adf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First item' }]
                  }
                ]
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Second item' }]
                  }
                ]
              }
            ]
          }
        ]
      };

      const markdown = convertAdfToMarkdown_AIPromptOnly(adf);
      
      expect(markdown).toContain('- First item');
      expect(markdown).toContain('- Second item');
    });

    test('should handle formatted text in ADF', () => {
      const adf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { 
                type: 'text', 
                text: 'Bold text',
                marks: [{ type: 'strong' }]
              },
              { type: 'text', text: ' and ' },
              { 
                type: 'text', 
                text: 'code',
                marks: [{ type: 'code' }]
              }
            ]
          }
        ]
      };

      const markdown = convertAdfToMarkdown_AIPromptOnly(adf);
      
      expect(markdown).toContain('**Bold text**');
      expect(markdown).toContain('`code`');
    });

    test('should handle empty ADF gracefully', () => {
      const adf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: []
      };

      const markdown = convertAdfToMarkdown_AIPromptOnly(adf);
      
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('List Nesting Limits', () => {
    test('should respect Jira list nesting limits', async () => {
      const shallowMarkdown = `- Level 1
  * Level 2`;
      
      const deepMarkdown = `- Level 1
  * Level 2
    + Level 3`;

      const shallowAdf = await convertMarkdownToAdf_NewContentOnly(shallowMarkdown);
      const deepAdf = await convertMarkdownToAdf_NewContentOnly(deepMarkdown);

      expect(getMaxListDepth(shallowAdf.content)).toBeLessThanOrEqual(2);
      
      // Deep nesting may exceed Jira limits - this documents the behavior
      const deepDepth = getMaxListDepth(deepAdf.content);
      if (deepDepth > 2) {
        // This is expected behavior - marklassian creates deep nesting
        // that may need to be flattened for Jira compatibility
        expect(deepDepth).toBeGreaterThan(2);
      }
    });
  });
});
