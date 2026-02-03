/**
 * Image Downloader Tests
 * 
 * Tests for batch image downloading.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  downloadImages,
  downloadImage,
} from './image-downloader.js';

describe('image-downloader', () => {
  const mockFigmaClient = {} as any;
  
  // ============================================================================
  // downloadImages
  // ============================================================================
  
  describe('downloadImages', () => {
    it('should batch download images', async () => {
      const mockDownloadBatch = jest.fn().mockResolvedValue(
        new Map([
          ['123:456', {
            base64Data: 'abc123...',
            mimeType: 'image/png',
            byteSize: 1024,
            imageUrl: 'https://cdn.figma.com/...',
          }],
          ['789:012', {
            base64Data: 'def456...',
            mimeType: 'image/png',
            byteSize: 2048,
            imageUrl: 'https://cdn.figma.com/...',
          }],
        ])
      );
      
      const result = await downloadImages(
        mockFigmaClient,
        'fileKey',
        ['123:456', '789:012'],
        { format: 'png', scale: 1 },
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      expect(mockDownloadBatch).toHaveBeenCalledWith(
        mockFigmaClient,
        'fileKey',
        ['123:456', '789:012'],
        { format: 'png', scale: 1 }
      );
      
      expect(result.images.size).toBe(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalBytes).toBe(3072);
    });
    
    it('should track failed downloads', async () => {
      const mockDownloadBatch = jest.fn().mockResolvedValue(
        new Map([
          ['123:456', {
            base64Data: 'abc123...',
            mimeType: 'image/png',
            byteSize: 1024,
            imageUrl: 'https://cdn.figma.com/...',
          }],
          // 789:012 not in results = failed
        ])
      );
      
      const result = await downloadImages(
        mockFigmaClient,
        'fileKey',
        ['123:456', '789:012'],
        {},
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      expect(result.images.size).toBe(1);
      expect(result.failed).toEqual(['789:012']);
    });
    
    it('should handle empty node list', async () => {
      const mockDownloadBatch = jest.fn();
      
      const result = await downloadImages(
        mockFigmaClient,
        'fileKey',
        [],
        {},
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      expect(mockDownloadBatch).not.toHaveBeenCalled();
      expect(result.images.size).toBe(0);
      expect(result.failed).toHaveLength(0);
    });
    
    it('should preserve node IDs in result', async () => {
      const mockDownloadBatch = jest.fn().mockResolvedValue(
        new Map([
          ['123:456', {
            base64Data: 'data',
            mimeType: 'image/png',
            byteSize: 100,
            imageUrl: 'url',
          }],
        ])
      );
      
      const result = await downloadImages(
        mockFigmaClient,
        'fileKey',
        ['123:456'],
        {},
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      const image = result.images.get('123:456');
      expect(image?.nodeId).toBe('123:456');
    });
  });
  
  // ============================================================================
  // downloadImage (single)
  // ============================================================================
  
  describe('downloadImage', () => {
    it('should download single image', async () => {
      const mockDownloadBatch = jest.fn().mockResolvedValue(
        new Map([
          ['123:456', {
            base64Data: 'abc123...',
            mimeType: 'image/png',
            byteSize: 1024,
            imageUrl: 'https://cdn.figma.com/...',
          }],
        ])
      );
      
      const result = await downloadImage(
        mockFigmaClient,
        'fileKey',
        '123:456',
        {},
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      expect(result).not.toBeNull();
      expect(result?.nodeId).toBe('123:456');
      expect(result?.base64Data).toBe('abc123...');
    });
    
    it('should return null if download fails', async () => {
      const mockDownloadBatch = jest.fn().mockResolvedValue(new Map());
      
      const result = await downloadImage(
        mockFigmaClient,
        'fileKey',
        '123:456',
        {},
        { downloadFigmaImagesBatch: mockDownloadBatch }
      );
      
      expect(result).toBeNull();
    });
  });
});
