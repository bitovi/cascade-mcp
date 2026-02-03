/**
 * URL Processor Tests
 * 
 * Tests for URL parsing, validation, and batch fetching.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  fetchFrameNodesFromUrls,
  parseFigmaUrls,
  groupUrlsByFileKey,
  buildFigmaUrl,
} from './url-processor.js';

describe('url-processor', () => {
  // ============================================================================
  // parseFigmaUrls
  // ============================================================================
  
  describe('parseFigmaUrls', () => {
    it('should parse valid Figma URLs', () => {
      const urls = [
        'https://www.figma.com/design/abc123?node-id=123-456',
        'https://www.figma.com/file/xyz789?node-id=789-012',
      ];
      
      const result = parseFigmaUrls(urls);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
      
      expect(result.valid[0]).toEqual({
        url: urls[0],
        fileKey: 'abc123',
        nodeId: '123:456',
      });
      
      expect(result.valid[1]).toEqual({
        url: urls[1],
        fileKey: 'xyz789',
        nodeId: '789:012',
      });
    });
    
    it('should report invalid URL formats', () => {
      const urls = [
        'https://example.com/not-figma',
        'not-a-url',
      ];
      
      const result = parseFigmaUrls(urls);
      
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].error).toBe('Invalid Figma URL format');
      expect(result.invalid[1].error).toBe('Invalid Figma URL format');
    });
    
    it('should report URLs missing node-id', () => {
      const urls = [
        'https://www.figma.com/design/abc123',
        'https://www.figma.com/file/xyz789?other-param=value',
      ];
      
      const result = parseFigmaUrls(urls);
      
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].error).toBe('URL missing node-id parameter');
      expect(result.invalid[1].error).toBe('URL missing node-id parameter');
    });
    
    it('should handle mixed valid and invalid URLs', () => {
      const urls = [
        'https://www.figma.com/design/abc123?node-id=123-456',
        'invalid-url',
        'https://www.figma.com/design/def456', // missing node-id
      ];
      
      const result = parseFigmaUrls(urls);
      
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(2);
    });
    
    it('should accept custom parseFigmaUrl dependency', () => {
      const mockParseFigmaUrl = jest.fn().mockReturnValue({
        fileKey: 'custom',
        nodeId: '999-888',
      });
      
      const urls = ['https://custom.url'];
      
      const result = parseFigmaUrls(urls, {
        parseFigmaUrl: mockParseFigmaUrl,
      });
      
      expect(mockParseFigmaUrl).toHaveBeenCalledWith('https://custom.url');
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].fileKey).toBe('custom');
    });
  });
  
  // ============================================================================
  // groupUrlsByFileKey
  // ============================================================================
  
  describe('groupUrlsByFileKey', () => {
    it('should group URLs by file key', () => {
      const parsedUrls = [
        { url: 'url1', fileKey: 'abc', nodeId: '1:1' },
        { url: 'url2', fileKey: 'xyz', nodeId: '2:2' },
        { url: 'url3', fileKey: 'abc', nodeId: '3:3' },
      ];
      
      const grouped = groupUrlsByFileKey(parsedUrls);
      
      expect(grouped.size).toBe(2);
      expect(grouped.get('abc')).toHaveLength(2);
      expect(grouped.get('xyz')).toHaveLength(1);
    });
    
    it('should handle empty input', () => {
      const grouped = groupUrlsByFileKey([]);
      expect(grouped.size).toBe(0);
    });
  });
  
  // ============================================================================
  // buildFigmaUrl
  // ============================================================================
  
  describe('buildFigmaUrl', () => {
    it('should build correct Figma URL', () => {
      const url = buildFigmaUrl('abc123', '123:456');
      expect(url).toBe('https://www.figma.com/design/abc123?node-id=123-456');
    });
    
    it('should handle multi-segment node IDs', () => {
      const url = buildFigmaUrl('fileKey', '1:2');
      expect(url).toBe('https://www.figma.com/design/fileKey?node-id=1-2');
    });
  });
  
  // ============================================================================
  // fetchFrameNodesFromUrls
  // ============================================================================
  
  describe('fetchFrameNodesFromUrls', () => {
    const mockFigmaClient = {} as any;
    
    it('should group URLs by file key for batching', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map([
        ['123:456', { id: '123:456', type: 'FRAME', name: 'Screen 1' }],
        ['789:012', { id: '789:012', type: 'FRAME', name: 'Screen 2' }],
      ]));
      
      const result = await fetchFrameNodesFromUrls(
        [
          'https://www.figma.com/file/abc?node-id=123-456',
          'https://www.figma.com/file/abc?node-id=789-012',
        ],
        mockFigmaClient,
        { cacheValid: undefined },
        { fetchFigmaNodesBatch: mockFetchBatch }
      );
      
      // Should make ONE batch call for same file key
      expect(mockFetchBatch).toHaveBeenCalledTimes(1);
      expect(mockFetchBatch).toHaveBeenCalledWith(
        mockFigmaClient,
        'abc',
        ['123:456', '789:012']
      );
      
      expect(result.figmaFileKey).toBe('abc');
      expect(result.parsedUrls).toHaveLength(2);
      expect(result.nodesDataMap.size).toBe(2);
    });
    
    it('should throw error for multiple file keys', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map());
      
      await expect(
        fetchFrameNodesFromUrls(
          [
            'https://www.figma.com/file/abc?node-id=123-456',
            'https://www.figma.com/file/xyz?node-id=789-012',
          ],
          mockFigmaClient,
          { cacheValid: undefined },
          { fetchFigmaNodesBatch: mockFetchBatch }
        )
      ).rejects.toThrow('URLs from multiple Figma files detected');
      
      // Should NOT call fetch if validation fails
      expect(mockFetchBatch).not.toHaveBeenCalled();
    });
    
    it('should throw error when no valid URLs', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map());
      
      await expect(
        fetchFrameNodesFromUrls(
          ['invalid-url', 'also-invalid'],
          mockFigmaClient,
          { cacheValid: undefined },
          { fetchFigmaNodesBatch: mockFetchBatch }
        )
      ).rejects.toThrow('No valid Figma URLs to process');
    });
    
    it('should report nodes not found in response', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map([
        // Only return one of two requested nodes
        ['123:456', { id: '123:456', type: 'FRAME', name: 'Screen 1' }],
      ]));
      
      const result = await fetchFrameNodesFromUrls(
        [
          'https://www.figma.com/file/abc?node-id=123-456',
          'https://www.figma.com/file/abc?node-id=789-012', // This one won't be found
        ],
        mockFigmaClient,
        { cacheValid: undefined },
        { fetchFigmaNodesBatch: mockFetchBatch }
      );
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Node 789:012 not found');
    });
    
    it('should collect parse errors for invalid URLs in batch', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map([
        ['123:456', { id: '123:456', type: 'FRAME', name: 'Screen 1' }],
      ]));
      
      const result = await fetchFrameNodesFromUrls(
        [
          'https://www.figma.com/file/abc?node-id=123-456',
          'https://www.figma.com/file/abc', // Missing node-id
          'invalid-url',
        ],
        mockFigmaClient,
        { cacheValid: undefined },
        { fetchFigmaNodesBatch: mockFetchBatch }
      );
      
      expect(result.parsedUrls).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].error).toBe('URL missing node-id parameter');
      expect(result.errors[1].error).toBe('Invalid Figma URL format');
    });
    
    it('should convert node IDs from URL format to API format', async () => {
      const mockFetchBatch = jest.fn().mockResolvedValue(new Map());
      
      await fetchFrameNodesFromUrls(
        ['https://www.figma.com/file/abc?node-id=123-456'],
        mockFigmaClient,
        { cacheValid: undefined },
        { fetchFigmaNodesBatch: mockFetchBatch }
      );
      
      // Node ID should be converted from "123-456" to "123:456"
      expect(mockFetchBatch).toHaveBeenCalledWith(
        mockFigmaClient,
        'abc',
        ['123:456']
      );
    });
  });
});
