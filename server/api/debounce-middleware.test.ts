/**
 * Tests for request debounce functionality
 */

import { checkDebounce, clearDebounceCache } from './debounce-middleware.js';

describe('debounce-middleware', () => {
  beforeEach(() => {
    // Clear any previous state before each test
    clearDebounceCache();
  });

  describe('checkDebounce', () => {
    it('should allow first request', () => {
      const result = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('should reject immediate duplicate request', () => {
      // First request
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // Immediate second request
      const second = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(second.allowed).toBe(false);
      expect(second.retryAfterMs).toBeGreaterThan(0);
      expect(second.retryAfterMs).toBeLessThanOrEqual(5000);
    });

    it('should allow request after debounce window expires', async () => {
      // First request
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // Wait for debounce window to expire (5 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      // Second request after window
      const second = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(second.allowed).toBe(true);
      expect(second.retryAfterMs).toBeUndefined();
    });

    it('should handle different keys independently', () => {
      // First epic
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // Different epic - should be allowed
      const second = checkDebounce('write-shell-stories:bitovi:PROJ-456');
      expect(second.allowed).toBe(true);
    });

    it('should handle different tools on same key independently', () => {
      // write-shell-stories on PROJ-123
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // write-next-story on same epic - should be allowed (different tool)
      const second = checkDebounce('write-next-story:bitovi:PROJ-123');
      expect(second.allowed).toBe(true);
    });

    it('should handle different sites with same epic key independently', () => {
      // bitovi site
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // acme site with same epic key - should be allowed (different site)
      const second = checkDebounce('write-shell-stories:acme:PROJ-123');
      expect(second.allowed).toBe(true);
    });

    it('should handle missing siteName (MCP without siteName)', () => {
      // First request without siteName
      const first = checkDebounce('write-shell-stories:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // Second request without siteName - should be rejected
      const second = checkDebounce('write-shell-stories:PROJ-123');
      expect(second.allowed).toBe(false);
      expect(second.retryAfterMs).toBeGreaterThan(0);
    });

    it('should treat requests with and without siteName as different', () => {
      // Request with siteName
      const first = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      expect(first.allowed).toBe(true);
      
      // Request without siteName - should be allowed (different key)
      const second = checkDebounce('write-shell-stories:PROJ-123');
      expect(second.allowed).toBe(true);
    });
  });

  describe('clearDebounceCache', () => {
    it('should clear all tracked requests', () => {
      checkDebounce('write-shell-stories:bitovi:PROJ-123');
      checkDebounce('write-shell-stories:bitovi:PROJ-456');
      
      clearDebounceCache();
      
      // After clear, same requests should be allowed
      const result1 = checkDebounce('write-shell-stories:bitovi:PROJ-123');
      const result2 = checkDebounce('write-shell-stories:bitovi:PROJ-456');
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });
});
