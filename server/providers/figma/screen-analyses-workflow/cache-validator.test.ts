/**
 * Cache Validator Tests
 * 
 * Tests for cache validation and management.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  validateCache,
  saveCacheMetadata,
} from './cache-validator.js';

describe('cache-validator', () => {
  const mockFigmaClient = {} as any;
  
  // ============================================================================
  // validateCache
  // ============================================================================
  
  describe('validateCache', () => {
    it('should invalidate cache when Figma file is newer', async () => {
      const mockFetchMetadata = jest.fn().mockResolvedValue({
        fileKey: 'abc123',
        name: 'Test File',
        lastTouchedAt: '2026-01-26T15:00:00Z',
        version: '1.0.0',
      });
      const mockGetCachePath = jest.fn().mockReturnValue('/cache/abc123');
      const mockIsCacheValid = jest.fn().mockResolvedValue(false);
      const mockClearCache = jest.fn().mockResolvedValue(undefined);
      
      const result = await validateCache(mockFigmaClient, 'abc123', {
        fetchFigmaFileMetadata: mockFetchMetadata,
        getFigmaFileCachePath: mockGetCachePath,
        isCacheValid: mockIsCacheValid,
        clearFigmaCache: mockClearCache,
      });
      
      expect(result.wasInvalidated).toBe(true);
      expect(mockClearCache).toHaveBeenCalledWith('abc123');
    });
    
    it('should keep valid cache', async () => {
      const mockFetchMetadata = jest.fn().mockResolvedValue({
        fileKey: 'abc123',
        name: 'Test File',
        lastTouchedAt: '2026-01-25T15:00:00Z',
        version: '1.0.0',
      });
      const mockGetCachePath = jest.fn().mockReturnValue('/cache/abc123');
      const mockIsCacheValid = jest.fn().mockResolvedValue(true);
      const mockClearCache = jest.fn();
      
      const result = await validateCache(mockFigmaClient, 'abc123', {
        fetchFigmaFileMetadata: mockFetchMetadata,
        getFigmaFileCachePath: mockGetCachePath,
        isCacheValid: mockIsCacheValid,
        clearFigmaCache: mockClearCache,
      });
      
      expect(result.wasInvalidated).toBe(false);
      expect(mockClearCache).not.toHaveBeenCalled();
    });
    
    it('should return file metadata for later use', async () => {
      const mockMetadata = {
        fileKey: 'abc123',
        name: 'Test File',
        lastTouchedAt: '2026-01-26T15:00:00Z',
        version: '1.0.0',
      };
      const mockFetchMetadata = jest.fn().mockResolvedValue(mockMetadata);
      const mockGetCachePath = jest.fn().mockReturnValue('/cache/abc123');
      const mockIsCacheValid = jest.fn().mockResolvedValue(true);
      
      const result = await validateCache(mockFigmaClient, 'abc123', {
        fetchFigmaFileMetadata: mockFetchMetadata,
        getFigmaFileCachePath: mockGetCachePath,
        isCacheValid: mockIsCacheValid,
      });
      
      expect(result.fileMetadata).toEqual(mockMetadata);
      expect(result.lastTouchedAt).toBe('2026-01-26T15:00:00Z');
    });
    
    it('should return correct cache path', async () => {
      const mockFetchMetadata = jest.fn().mockResolvedValue({
        fileKey: 'abc123',
        lastTouchedAt: '2026-01-26T15:00:00Z',
      });
      const mockGetCachePath = jest.fn().mockReturnValue('/custom/cache/path');
      const mockIsCacheValid = jest.fn().mockResolvedValue(true);
      
      const result = await validateCache(mockFigmaClient, 'abc123', {
        fetchFigmaFileMetadata: mockFetchMetadata,
        getFigmaFileCachePath: mockGetCachePath,
        isCacheValid: mockIsCacheValid,
      });
      
      expect(result.cachePath).toBe('/custom/cache/path');
    });
  });
  
  // ============================================================================
  // saveCacheMetadata
  // ============================================================================
  
  describe('saveCacheMetadata', () => {
    it('should call saveFigmaMetadata with correct params', async () => {
      const mockSaveMetadata = jest.fn().mockResolvedValue(undefined);
      const fileMetadata = {
        fileKey: 'abc123',
        name: 'Test',
        lastTouchedAt: '2026-01-26T15:00:00Z',
        version: '1.0.0',
      };
      
      await saveCacheMetadata('abc123', fileMetadata, {
        saveFigmaMetadata: mockSaveMetadata,
      });
      
      expect(mockSaveMetadata).toHaveBeenCalledWith('abc123', fileMetadata);
    });
  });
});
