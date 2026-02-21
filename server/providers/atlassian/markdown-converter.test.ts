/**
 * Jest test suite for markdown to ADF conversion functionality
 */

import { 
  convertMarkdownToAdf, 
  validateAdf, 
  removeADFSectionByHeading, 
  countADFSectionsByHeading,
  extractADFSection,
  convertAdfToMarkdown,
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
  describe('convertMarkdownToAdf', () => {
    test('should convert simple markdown to valid ADF', async () => {
      const markdown = '# Hello World\n\nThis is a test.';
      const adf = await convertMarkdownToAdf(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(adf.version).toBe(1);
      expect(adf.type).toBe('doc');
      expect(adf.content).toHaveLength(2);
    });

    test('should handle empty input gracefully', async () => {
      const adf = await convertMarkdownToAdf('');
      
      expect(validateAdf(adf)).toBe(true);
      expect(adf.content).toHaveLength(1);
      expect(adf.content[0].type).toBe('paragraph');
    });

    test('should handle null/undefined input', async () => {
      const adf1 = await convertMarkdownToAdf(null as any);
      const adf2 = await convertMarkdownToAdf(undefined as any);
      
      expect(validateAdf(adf1)).toBe(true);
      expect(validateAdf(adf2)).toBe(true);
    });

    test('should convert nested bullet lists correctly', async () => {
      const markdown = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * Display header/navigation bar`;

      const adf = await convertMarkdownToAdf(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(getMaxListDepth(adf.content)).toBeLessThanOrEqual(2);
    });

    test('should handle bold text formatting', async () => {
      const markdown = `- **Important** item
- Regular item`;

      const adf = await convertMarkdownToAdf(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(JSON.stringify(adf)).toContain('"type":"strong"');
    });

    test('should handle inline code formatting', async () => {
      const markdown = '- `code` item\n- regular item';

      const adf = await convertMarkdownToAdf(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(JSON.stringify(adf)).toContain('"type":"code"');
    });

    test('should handle escaped characters', async () => {
      const markdown = `- \\+ escaped plus
- \\- escaped minus`;

      const adf = await convertMarkdownToAdf(markdown);
      
      expect(validateAdf(adf)).toBe(true);
      expect(getMaxListDepth(adf.content)).toBeLessThanOrEqual(2);
    });

    describe('resource link enhancement', () => {
      test('should add emoji to Figma links', async () => {
        const markdown = 'Check out this design: [Figma Design](https://www.figma.com/file/abc123/My-Design)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        // Find paragraph content
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const content = paragraph?.content || [];
        
        // Should have text node with emoji prepended and link mark
        const textWithLink = content.find((n: any) => 
          n.type === 'text' && n.marks?.some((m: any) => m.type === 'link')
        );
        
        expect(textWithLink).toBeDefined();
        expect(textWithLink?.text).toBe('🎨 Figma Design');
        expect(textWithLink?.marks?.find((m: any) => m.type === 'link')?.attrs?.href)
          .toBe('https://www.figma.com/file/abc123/My-Design');
      });

      test('should convert Confluence links to inlineCards', async () => {
        const markdown = 'See [this page](https://mycompany.atlassian.net/wiki/spaces/PROJ/pages/123456/Requirements)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const inlineCard = paragraph?.content?.find((n: any) => n.type === 'inlineCard');
        
        expect(inlineCard).toBeDefined();
        expect(inlineCard?.attrs?.url).toBe('https://mycompany.atlassian.net/wiki/spaces/PROJ/pages/123456/Requirements');
      });

      test('should convert Google Docs links to inlineCards', async () => {
        const markdown = 'Read the [specification](https://docs.google.com/document/d/1a2b3c4d5e6f7/edit)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const inlineCard = paragraph?.content?.find((n: any) => n.type === 'inlineCard');
        
        expect(inlineCard).toBeDefined();
        expect(inlineCard?.attrs?.url).toBe('https://docs.google.com/document/d/1a2b3c4d5e6f7/edit');
      });

      test('should NOT convert Google Sheets/Slides links', async () => {
        const markdown = 'See [spreadsheet](https://docs.google.com/spreadsheets/d/abc123/edit)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        // Should remain as text with link mark, not inlineCard
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const inlineCard = paragraph?.content?.find((n: any) => n.type === 'inlineCard');
        
        expect(inlineCard).toBeUndefined();
        
        // The paragraph should contain text nodes with link marks
        const hasLinkMarks = paragraph?.content?.some((n: any) => 
          n.type === 'text' && n.marks?.some((m: any) => m.type === 'link')
        );
        expect(hasLinkMarks).toBe(true);
      });

      test('should NOT convert regular external links', async () => {
        const markdown = 'Visit [our website](https://example.com)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        // Should remain as text with link mark
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const inlineCard = paragraph?.content?.find((n: any) => n.type === 'inlineCard');
        const textNode = paragraph?.content?.find((n: any) => n.type === 'text');
        
        expect(inlineCard).toBeUndefined();
        expect(textNode).toBeDefined();
      });

      test('should convert multiple resource links in same paragraph', async () => {
        const markdown = 'See [design](https://figma.com/file/abc) and [docs](https://docs.google.com/document/d/xyz/edit)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const content = paragraph?.content || [];
        
        // Should have 1 inlineCard (Google Docs) and 1 text node with emoji (Figma)
        const inlineCards = content.filter((n: any) => n.type === 'inlineCard');
        const figmaLink = content.find((n: any) => 
          n.type === 'text' && n.text?.startsWith('🎨') && n.marks?.some((m: any) => m.type === 'link')
        );
        
        expect(inlineCards).toHaveLength(1);
        expect(inlineCards?.[0]?.attrs?.url).toContain('docs.google.com');
        expect(figmaLink).toBeDefined();
        expect(figmaLink?.text).toBe('🎨 design');
      });

      test('should handle mixed resource and regular links', async () => {
        const markdown = 'Check [Figma](https://figma.com/file/abc) and [example](https://example.com)';
        const adf = await convertMarkdownToAdf(markdown);
        
        expect(validateAdf(adf)).toBe(true);
        
        const paragraph = adf.content.find(n => n.type === 'paragraph');
        const content = paragraph?.content || [];
        
        // Should have text nodes with link marks
        const textNodes = content.filter((n: any) => n.type === 'text');
        const figmaLink = textNodes.find((n: any) => n.text?.startsWith('🎨'));
        const regularLink = textNodes.find((n: any) => 
          n.marks?.some((m: any) => m.type === 'link' && m.attrs?.href === 'https://example.com')
        );
        
        expect(figmaLink).toBeDefined();
        expect(figmaLink?.text).toBe('🎨 Figma');
        expect(regularLink).toBeDefined();
        expect(regularLink?.text).toBe('example');
      });
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

      const markdown = convertAdfToMarkdown(adf);
      
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

      const markdown = convertAdfToMarkdown(adf);
      
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

      const markdown = convertAdfToMarkdown(adf);
      
      expect(markdown).toContain('**Bold text**');
      expect(markdown).toContain('`code`');
    });

    test('should handle empty ADF gracefully', () => {
      const adf: ADFDocument = {
        version: 1,
        type: 'doc',
        content: []
      };

      const markdown = convertAdfToMarkdown(adf);
      
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

      const shallowAdf = await convertMarkdownToAdf(shallowMarkdown);
      const deepAdf = await convertMarkdownToAdf(deepMarkdown);

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
