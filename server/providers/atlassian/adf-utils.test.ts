/**
 * Unit tests for ADF utilities
 */

import { describe, test, expect } from '@jest/globals';
import { extractFigmaUrlsFromADF } from './adf-utils.js';
import type { ADFDocument } from './markdown-converter.js';

// ============================================================================
// extractFigmaUrlsFromADF tests
// ============================================================================

describe('extractFigmaUrlsFromADF', () => {
  describe('blockCard nodes (Jira smart cards)', () => {
    test('extracts URL from blockCard node', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'blockCard',
            attrs: {
              url: 'https://www.figma.com/design/abc123/My-Design?node-id=1-2',
            },
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/abc123/My-Design?node-id=1-2']);
    });

    test('extracts URL from actual DRIOT-8 ticket format', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            attrs: {
              localId: '28d7aca50475',
            },
          },
          {
            type: 'blockCard',
            attrs: {
              url: 'https://www.figma.com/design/zm8VZCEsJFFxJOiSC1HtUt/Riot-Games-App-Design?node-id=4390-6129',
              localId: '9a342f73e8a5',
            },
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual([
        'https://www.figma.com/design/zm8VZCEsJFFxJOiSC1HtUt/Riot-Games-App-Design?node-id=4390-6129',
      ]);
    });
  });

  describe('inlineCard nodes', () => {
    test('extracts URL from inlineCard node', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'inlineCard',
                attrs: {
                  url: 'https://www.figma.com/design/inline456/Inline-Card?node-id=3-4',
                },
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/inline456/Inline-Card?node-id=3-4']);
    });
  });

  describe('smart card format in plain text', () => {
    test('extracts URL from smart card format with pipes [url|url]', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Check out this design: [https://www.figma.com/design/abc123/My-Design?node-id=1-2|https://www.figma.com/design/abc123/My-Design?node-id=1-2]',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/abc123/My-Design?node-id=1-2']);
    });

    test('extracts URL from URL-encoded smart card format [url%7Curl%7Csmart-card]', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Design link: [https://www.figma.com/design/xyz789/Project?node-id=10-20%7Chttps://www.figma.com/design/xyz789/Project?node-id=10-20%7Csmart-card]',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/xyz789/Project?node-id=10-20']);
    });

    test('does not duplicate URL from smart card format', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '[https://www.figma.com/design/test/Test?node-id=1-1|https://www.figma.com/design/test/Test?node-id=1-1]',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toHaveLength(1);
      expect(urls).toEqual(['https://www.figma.com/design/test/Test?node-id=1-1']);
    });
  });

  describe('regular Figma URLs in plain text', () => {
    test('extracts regular Figma URL from text', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'See design: https://www.figma.com/design/regular123/Normal-Link?node-id=5-10',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/regular123/Normal-Link?node-id=5-10']);
    });

    test('extracts multiple Figma URLs from text', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Check https://www.figma.com/design/file1/Design1?node-id=1-1 and https://www.figma.com/design/file2/Design2?node-id=2-2',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://www.figma.com/design/file1/Design1?node-id=1-1');
      expect(urls).toContain('https://www.figma.com/design/file2/Design2?node-id=2-2');
    });
  });

  describe('text with link marks', () => {
    test('extracts URL from text node with link mark', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'click here',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://www.figma.com/design/linked/Design?node-id=7-8',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/linked/Design?node-id=7-8']);
    });
  });

  describe('mixed formats', () => {
    test('extracts URLs from multiple format types in same document', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'blockCard',
            attrs: {
              url: 'https://www.figma.com/design/block1/Block-Card?node-id=1-1',
            },
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Also see: https://www.figma.com/design/plain2/Plain-Text?node-id=2-2 and [https://www.figma.com/design/smart3/Smart-Card?node-id=3-3|https://www.figma.com/design/smart3/Smart-Card?node-id=3-3]',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'inlineCard',
                attrs: {
                  url: 'https://www.figma.com/design/inline4/Inline-Card?node-id=4-4',
                },
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toHaveLength(4);
      expect(urls).toContain('https://www.figma.com/design/block1/Block-Card?node-id=1-1');
      expect(urls).toContain('https://www.figma.com/design/plain2/Plain-Text?node-id=2-2');
      expect(urls).toContain('https://www.figma.com/design/smart3/Smart-Card?node-id=3-3');
      expect(urls).toContain('https://www.figma.com/design/inline4/Inline-Card?node-id=4-4');
    });
  });

  describe('edge cases', () => {
    test('returns empty array for document with no Figma URLs', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'No Figma links here',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual([]);
    });

    test('returns empty array for empty document', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual([]);
    });

    test('ignores non-Figma URLs', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Check https://www.google.com and https://github.com',
              },
            ],
          },
          {
            type: 'blockCard',
            attrs: {
              url: 'https://www.atlassian.net/browse/ISSUE-123',
            },
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual([]);
    });

    test('deduplicates identical URLs', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'blockCard',
            attrs: {
              url: 'https://www.figma.com/design/same/Same?node-id=1-1',
            },
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'URL: https://www.figma.com/design/same/Same?node-id=1-1',
              },
            ],
          },
          {
            type: 'inlineCard',
            attrs: {
              url: 'https://www.figma.com/design/same/Same?node-id=1-1',
            },
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toHaveLength(1);
      expect(urls).toEqual(['https://www.figma.com/design/same/Same?node-id=1-1']);
    });

    test('handles nested paragraph structures', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Nested: ',
              },
              {
                type: 'text',
                text: 'https://www.figma.com/design/nested/Nested?node-id=9-9',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls).toEqual(['https://www.figma.com/design/nested/Nested?node-id=9-9']);
    });
  });

  describe('URL validation', () => {
    test('extracts valid Figma file URLs', () => {
      const validUrls = [
        'https://www.figma.com/file/abc123/MyFile',
        'https://www.figma.com/design/xyz789/MyDesign',
        'https://figma.com/design/def456/MyDesign',
      ];

      validUrls.forEach((url) => {
        const adf: ADFDocument = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: url,
                },
              ],
            },
          ],
        };

        const urls = extractFigmaUrlsFromADF(adf);
        expect(urls).toContain(url);
      });
    });

    test('extracts Figma URLs with various query parameters', () => {
      const adf: ADFDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'https://www.figma.com/design/abc/Design?node-id=1-1&t=xyz&scaling=min-zoom&page-id=2',
              },
            ],
          },
        ],
      };

      const urls = extractFigmaUrlsFromADF(adf);
      expect(urls[0]).toContain('node-id=1-1');
      expect(urls[0]).toContain('scaling=min-zoom');
    });
  });
});
