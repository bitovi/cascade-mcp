/**
 * Unit tests for Google Docs helpers
 * 
 * Tests URL extraction from ADF, URL parsing, MIME type validation,
 * and deduplication by document ID.
 */

import { describe, test, expect } from '@jest/globals';
import { 
  extractGoogleDocsUrlsFromADF,
  parseGoogleDocUrl,
  isGoogleDoc,
  deduplicateByDocumentId
} from './google-docs-helpers.js';
import type { ADFDocument } from '../atlassian/markdown-converter.js';

// ============================================================================
// T004: Unit test for extractGoogleDocsUrlsFromADF()
// ============================================================================

describe('extractGoogleDocsUrlsFromADF', () => {
  test('extracts Google Docs URL from inlineCard node', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineCard',
              attrs: {
                url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit'
              }
            }
          ]
        }
      ]
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit');
  });

  test('extracts Google Docs URL from text node with link mark', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'See requirements',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://docs.google.com/document/d/abc123xyz456/view'
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://docs.google.com/document/d/abc123xyz456/view');
  });

  test('extracts multiple Google Docs URLs from same document', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineCard',
              attrs: { url: 'https://docs.google.com/document/d/doc1/edit' }
            },
            { type: 'text', text: ' and ' },
            {
              type: 'inlineCard',
              attrs: { url: 'https://docs.google.com/document/d/doc2/edit' }
            }
          ]
        }
      ]
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    expect(urls).toHaveLength(2);
    expect(urls).toContain('https://docs.google.com/document/d/doc1/edit');
    expect(urls).toContain('https://docs.google.com/document/d/doc2/edit');
  });

  test('ignores non-Google-Docs URLs', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineCard',
              attrs: { url: 'https://confluence.atlassian.net/wiki/spaces/PROJ/pages/123' }
            },
            {
              type: 'inlineCard',
              attrs: { url: 'https://docs.google.com/spreadsheets/d/sheet123/edit' }
            },
            {
              type: 'inlineCard',
              attrs: { url: 'https://docs.google.com/document/d/doc123/edit' }
            }
          ]
        }
      ]
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    // Only the Google Doc should be extracted, not Sheets or Confluence
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://docs.google.com/document/d/doc123/edit');
  });

  test('returns empty array for ADF with no Google Docs URLs', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'No links here' }
          ]
        }
      ]
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    expect(urls).toHaveLength(0);
  });

  test('handles empty ADF content', () => {
    const adf: ADFDocument = {
      version: 1,
      type: 'doc',
      content: []
    };

    const urls = extractGoogleDocsUrlsFromADF(adf);
    
    expect(urls).toHaveLength(0);
  });
});

// ============================================================================
// T005: Unit test for parseGoogleDocUrl()
// ============================================================================

describe('parseGoogleDocUrl', () => {
  test('parses standard Google Docs URL format', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0jklmnop/edit');
    
    expect(result).not.toBeNull();
    expect(result?.documentId).toBe('1a2b3c4d5e6f7g8h9i0jklmnop');
  });

  test('parses mobile/app URL format', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/document/u/0/d/abc123xyz456_789-def/mobilebasic');
    
    expect(result).not.toBeNull();
    expect(result?.documentId).toBe('abc123xyz456_789-def');
  });

  test('parses direct link format (no /edit suffix)', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/document/d/docid12345678901234567890');
    
    expect(result).not.toBeNull();
    expect(result?.documentId).toBe('docid12345678901234567890');
  });

  test('parses URL with query parameters', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit?usp=sharing&ouid=12345');
    
    expect(result).not.toBeNull();
    expect(result?.documentId).toBe('1a2b3c4d5e6f7g8h9i0j');
  });

  test('returns null for invalid URL', () => {
    const result = parseGoogleDocUrl('https://example.com/not-a-google-doc');
    
    expect(result).toBeNull();
  });

  test('returns null for Google Sheets URL', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/spreadsheets/d/sheet123/edit');
    
    expect(result).toBeNull();
  });

  test('returns null for Google Slides URL', () => {
    const result = parseGoogleDocUrl('https://docs.google.com/presentation/d/slides123/edit');
    
    expect(result).toBeNull();
  });

  test('returns null for empty string', () => {
    const result = parseGoogleDocUrl('');
    
    expect(result).toBeNull();
  });

  test('returns null for malformed URL', () => {
    const result = parseGoogleDocUrl('not-a-url-at-all');
    
    expect(result).toBeNull();
  });
});

// ============================================================================
// T006: Unit test for isGoogleDoc()
// ============================================================================

describe('isGoogleDoc', () => {
  test('returns true for Google Docs MIME type', () => {
    expect(isGoogleDoc('application/vnd.google-apps.document')).toBe(true);
  });

  test('returns false for Google Sheets MIME type', () => {
    expect(isGoogleDoc('application/vnd.google-apps.spreadsheet')).toBe(false);
  });

  test('returns false for Google Slides MIME type', () => {
    expect(isGoogleDoc('application/vnd.google-apps.presentation')).toBe(false);
  });

  test('returns false for Google Drive folder MIME type', () => {
    expect(isGoogleDoc('application/vnd.google-apps.folder')).toBe(false);
  });

  test('returns false for PDF MIME type', () => {
    expect(isGoogleDoc('application/pdf')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isGoogleDoc('')).toBe(false);
  });
});

// ============================================================================
// T006a: Unit test for duplicate URL deduplication by document ID
// ============================================================================

describe('deduplicateByDocumentId', () => {
  test('removes duplicate URLs with same document ID', () => {
    const urls = [
      'https://docs.google.com/document/d/doc123/edit',
      'https://docs.google.com/document/d/doc456/edit',
      'https://docs.google.com/document/d/doc123/view', // Same doc as first
    ];

    const deduplicated = deduplicateByDocumentId(urls);
    
    expect(deduplicated).toHaveLength(2);
    // Should keep the first occurrence of each unique document ID
    expect(deduplicated).toContain('https://docs.google.com/document/d/doc123/edit');
    expect(deduplicated).toContain('https://docs.google.com/document/d/doc456/edit');
  });

  test('preserves order (keeps first occurrence)', () => {
    const urls = [
      'https://docs.google.com/document/d/first/edit',
      'https://docs.google.com/document/d/second/edit',
      'https://docs.google.com/document/d/first/view', // Duplicate
    ];

    const deduplicated = deduplicateByDocumentId(urls);
    
    expect(deduplicated[0]).toBe('https://docs.google.com/document/d/first/edit');
    expect(deduplicated[1]).toBe('https://docs.google.com/document/d/second/edit');
  });

  test('handles empty array', () => {
    const deduplicated = deduplicateByDocumentId([]);
    
    expect(deduplicated).toHaveLength(0);
  });

  test('handles single URL', () => {
    const urls = ['https://docs.google.com/document/d/only/edit'];

    const deduplicated = deduplicateByDocumentId(urls);
    
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]).toBe('https://docs.google.com/document/d/only/edit');
  });

  test('skips URLs that cannot be parsed', () => {
    const urls = [
      'https://docs.google.com/document/d/valid123/edit',
      'https://invalid-url.com/something',
      'https://docs.google.com/document/d/valid456/edit',
    ];

    const deduplicated = deduplicateByDocumentId(urls);
    
    // Should keep valid URLs and skip the invalid one
    expect(deduplicated).toHaveLength(2);
  });
});
