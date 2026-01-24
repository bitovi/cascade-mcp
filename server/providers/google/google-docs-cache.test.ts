/**
 * Google Docs Cache Tests
 * 
 * Tests for caching Google Docs content with modifiedTime-based invalidation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getGoogleDocsCacheBaseDir,
  getGoogleDocCachePath,
  getGoogleDocMetadataPath,
  getGoogleDocMarkdownPath,
  isCacheValid,
  loadGoogleDocMetadata,
  loadGoogleDocMarkdown,
  saveGoogleDocMetadata,
  saveGoogleDocMarkdown,
  ensureValidCacheForGoogleDoc,
  type GoogleDocCacheMetadata,
} from './google-docs-cache.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const testDocId = 'test-doc-123';

const createTestMetadata = (overrides?: Partial<GoogleDocCacheMetadata>): GoogleDocCacheMetadata => ({
  documentId: testDocId,
  title: 'Test Document',
  url: 'https://docs.google.com/document/d/test-doc-123/edit',
  mimeType: 'application/vnd.google-apps.document',
  modifiedTime: '2024-01-15T10:30:00.000Z',
  cachedAt: '2024-01-15T11:00:00.000Z',
  markdownLength: 500,
  ...overrides,
});

const testMarkdownContent = `
# Test Document

This is a test document for caching.

## Section 1
Some content here.

## Section 2
More content here.
`;

// ============================================================================
// Tests: Path Helpers (T025)
// ============================================================================

describe('Google Docs Cache Path Helpers', () => {
  it('getGoogleDocsCacheBaseDir should return cache/google-docs path', () => {
    const baseDir = getGoogleDocsCacheBaseDir();
    
    expect(baseDir).toContain('cache');
    expect(baseDir).toContain('google-docs');
    expect(baseDir.endsWith('google-docs')).toBe(true);
  });

  it('getGoogleDocCachePath should return path with document ID', () => {
    const cachePath = getGoogleDocCachePath(testDocId);
    
    expect(cachePath).toContain('google-docs');
    expect(cachePath).toContain(testDocId);
    expect(cachePath.endsWith(testDocId)).toBe(true);
  });

  it('getGoogleDocMetadataPath should return metadata.json path', () => {
    const metadataPath = getGoogleDocMetadataPath(testDocId);
    
    expect(metadataPath).toContain(testDocId);
    expect(metadataPath.endsWith('metadata.json')).toBe(true);
  });

  it('getGoogleDocMarkdownPath should return content.md path', () => {
    const markdownPath = getGoogleDocMarkdownPath(testDocId);
    
    expect(markdownPath).toContain(testDocId);
    expect(markdownPath.endsWith('content.md')).toBe(true);
  });

  it('path functions should produce consistent structure', () => {
    const basePath = getGoogleDocCachePath(testDocId);
    const metadataPath = getGoogleDocMetadataPath(testDocId);
    const markdownPath = getGoogleDocMarkdownPath(testDocId);
    
    // Both should be under the document's cache directory
    expect(metadataPath.startsWith(basePath)).toBe(true);
    expect(markdownPath.startsWith(basePath)).toBe(true);
  });
});

// ============================================================================
// Tests: Cache Validation (T026)
// ============================================================================

describe('isCacheValid', () => {
  it('should return true when cache modifiedTime matches current modifiedTime', () => {
    const cachedMeta = createTestMetadata({ modifiedTime: '2024-01-15T10:30:00.000Z' });
    const currentModifiedTime = '2024-01-15T10:30:00.000Z';
    
    expect(isCacheValid(cachedMeta, currentModifiedTime)).toBe(true);
  });

  it('should return false when current modifiedTime is newer', () => {
    const cachedMeta = createTestMetadata({ modifiedTime: '2024-01-15T10:30:00.000Z' });
    const currentModifiedTime = '2024-01-15T12:00:00.000Z'; // 1.5 hours later
    
    expect(isCacheValid(cachedMeta, currentModifiedTime)).toBe(false);
  });

  it('should return false when cache modifiedTime is missing', () => {
    const cachedMeta = createTestMetadata();
    (cachedMeta as any).modifiedTime = undefined;
    
    expect(isCacheValid(cachedMeta, '2024-01-15T10:30:00.000Z')).toBe(false);
  });

  it('should return false when current modifiedTime is empty', () => {
    const cachedMeta = createTestMetadata({ modifiedTime: '2024-01-15T10:30:00.000Z' });
    
    expect(isCacheValid(cachedMeta, '')).toBe(false);
  });

  it('should handle different ISO 8601 formats', () => {
    const cachedMeta = createTestMetadata({ modifiedTime: '2024-01-15T10:30:00Z' });
    const currentModifiedTime = '2024-01-15T10:30:00.000Z'; // With milliseconds
    
    // These should be treated as equal (same moment in time)
    expect(isCacheValid(cachedMeta, currentModifiedTime)).toBe(true);
  });
});

// ============================================================================
// Tests: Cache I/O Operations (T027)
// ============================================================================

describe('Cache I/O Operations', () => {
  const testCacheDir = path.join(getGoogleDocsCacheBaseDir(), 'test-io-doc-456');
  const testMetadata = createTestMetadata({ documentId: 'test-io-doc-456' });

  beforeEach(async () => {
    // Ensure test directory exists
    await fs.mkdir(testCacheDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('saveGoogleDocMetadata and loadGoogleDocMetadata', () => {
    it('should save and load metadata correctly', async () => {
      await saveGoogleDocMetadata('test-io-doc-456', testMetadata);
      const loaded = await loadGoogleDocMetadata('test-io-doc-456');
      
      expect(loaded).not.toBeNull();
      expect(loaded?.documentId).toBe('test-io-doc-456');
      expect(loaded?.title).toBe('Test Document');
      expect(loaded?.modifiedTime).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should return null when metadata file does not exist', async () => {
      const loaded = await loadGoogleDocMetadata('non-existent-doc-xyz');
      
      expect(loaded).toBeNull();
    });

    it('should preserve relevance data in metadata', async () => {
      const metaWithRelevance = createTestMetadata({
        documentId: 'test-io-doc-456',
        relevance: {
          documentType: 'requirements',
          toolScores: [
            { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 8.5, summary: 'Good PRD' },
            { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 7.0, summary: 'Clear stories' },
            { toolId: 'write-next-story', decisionPointScores: [], overallScore: 6.5, summary: 'Useful context' },
          ],
        },
      });

      await saveGoogleDocMetadata('test-io-doc-456', metaWithRelevance);
      const loaded = await loadGoogleDocMetadata('test-io-doc-456');
      
      expect(loaded?.relevance).toBeDefined();
      expect(loaded?.relevance?.documentType).toBe('requirements');
      expect(loaded?.relevance?.toolScores).toHaveLength(3);
      expect(loaded?.relevance?.toolScores[0].overallScore).toBe(8.5);
    });
  });

  describe('saveGoogleDocMarkdown and loadGoogleDocMarkdown', () => {
    it('should save and load markdown correctly', async () => {
      await saveGoogleDocMarkdown('test-io-doc-456', testMarkdownContent);
      const loaded = await loadGoogleDocMarkdown('test-io-doc-456');
      
      expect(loaded).not.toBeNull();
      expect(loaded).toBe(testMarkdownContent);
    });

    it('should return null when markdown file does not exist', async () => {
      const loaded = await loadGoogleDocMarkdown('non-existent-doc-xyz');
      
      expect(loaded).toBeNull();
    });

    it('should preserve formatting and special characters', async () => {
      const complexMarkdown = `
# Document with Special Characters

Unicode: 日本語, émojis: 🎉 🚀

\`\`\`javascript
const code = "example";
console.log(code);
\`\`\`

> Blockquote with "quotes" and 'apostrophes'

| Table | Header |
|-------|--------|
| Cell  | Data   |
`;

      await saveGoogleDocMarkdown('test-io-doc-456', complexMarkdown);
      const loaded = await loadGoogleDocMarkdown('test-io-doc-456');
      
      expect(loaded).toBe(complexMarkdown);
    });
  });
});

// ============================================================================
// Tests: ensureValidCacheForGoogleDoc (T028 partial - integration)
// ============================================================================

describe('ensureValidCacheForGoogleDoc', () => {
  const testDocId = 'test-ensure-doc-789';
  const testCacheDir = path.join(getGoogleDocsCacheBaseDir(), testDocId);

  beforeEach(async () => {
    // Cleanup before each test
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return cache hit when modifiedTime matches', async () => {
    // Setup: create valid cache
    const metadata = createTestMetadata({ documentId: testDocId });
    await saveGoogleDocMetadata(testDocId, metadata);
    await saveGoogleDocMarkdown(testDocId, testMarkdownContent);

    const result = await ensureValidCacheForGoogleDoc(testDocId, '2024-01-15T10:30:00.000Z');
    
    expect(result.cacheHit).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.markdown).toBe(testMarkdownContent);
  });

  it('should return cache miss when modifiedTime is newer', async () => {
    // Setup: create stale cache
    const metadata = createTestMetadata({ 
      documentId: testDocId,
      modifiedTime: '2024-01-15T10:30:00.000Z',
    });
    await saveGoogleDocMetadata(testDocId, metadata);
    await saveGoogleDocMarkdown(testDocId, testMarkdownContent);

    // Check with newer modifiedTime
    const result = await ensureValidCacheForGoogleDoc(testDocId, '2024-01-16T09:00:00.000Z');
    
    expect(result.cacheHit).toBe(false);
    expect(result.metadata).toBeNull();
    expect(result.markdown).toBeNull();
  });

  it('should return cache miss when no cache exists', async () => {
    const result = await ensureValidCacheForGoogleDoc(testDocId, '2024-01-15T10:30:00.000Z');
    
    expect(result.cacheHit).toBe(false);
    expect(result.metadata).toBeNull();
    expect(result.markdown).toBeNull();
  });

  it('should clear stale cache when invalidated', async () => {
    // Setup: create stale cache
    const metadata = createTestMetadata({ 
      documentId: testDocId,
      modifiedTime: '2024-01-15T10:30:00.000Z',
    });
    await saveGoogleDocMetadata(testDocId, metadata);
    await saveGoogleDocMarkdown(testDocId, testMarkdownContent);

    // Trigger invalidation
    await ensureValidCacheForGoogleDoc(testDocId, '2024-01-16T09:00:00.000Z');

    // Verify cache was cleared
    const metadataExists = await loadGoogleDocMetadata(testDocId);
    const markdownExists = await loadGoogleDocMarkdown(testDocId);
    
    expect(metadataExists).toBeNull();
    expect(markdownExists).toBeNull();
  });
});
