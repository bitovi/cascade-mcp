/**
 * Progress Comment Manager Tests
 * 
 * Tests the progress comment manager's functionality including:
 * - Lazy initialization (comment created on first notify)
 * - Progress message accumulation
 * - Error handling with two-part format
 * - Graceful degradation after failures
 * - Console logging backup
 */

import { createProgressCommentManager } from './progress-comment-manager.js';
import type { AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';

// Mock the helper functions
jest.mock('../providers/atlassian/atlassian-helpers.js', () => ({
  addIssueComment: jest.fn(),
  updateIssueComment: jest.fn()
}));

jest.mock('../observability/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { addIssueComment, updateIssueComment } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';

describe('Progress Comment Manager', () => {
  let mockClient: AtlassianClient;
  const context = {
    epicKey: 'TEST-123',
    cloudId: 'cloud-id-123',
    client: {} as AtlassianClient,
    operationName: 'Test Operation'
  };

  // Spy on console methods
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { 
      fetch: jest.fn(),
      getJiraBaseUrl: jest.fn(() => 'https://mock-jira-url.atlassian.net')
    } as unknown as AtlassianClient;
    context.client = mockClient;
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Lazy Initialization', () => {
    it('should create comment on first notify call', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });

      const manager = createProgressCommentManager(context);
      
      // First notify should create comment
      await manager.notify('First message');

      expect(addIssueComment).toHaveBeenCalledTimes(1);
      expect(addIssueComment).toHaveBeenCalledWith(
        mockClient,
        'cloud-id-123',
        'TEST-123',
        expect.stringContaining('🔄 **Test Operation Progress**')
      );
      expect(addIssueComment).toHaveBeenCalledWith(
        mockClient,
        'cloud-id-123',
        'TEST-123',
        expect.stringContaining('1. First message')
      );
      expect(updateIssueComment).not.toHaveBeenCalled();
    });

    it('should update existing comment on subsequent notify calls', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });
      (updateIssueComment as jest.Mock).mockResolvedValue({ ok: true });

      const manager = createProgressCommentManager(context);
      
      await manager.notify('First message');
      await manager.notify('Second message');
      await manager.notify('Third message');

      expect(addIssueComment).toHaveBeenCalledTimes(1);
      expect(updateIssueComment).toHaveBeenCalledTimes(2);
      
      // Check that update includes all messages
      const lastUpdateCall = (updateIssueComment as jest.Mock).mock.calls[1];
      expect(lastUpdateCall[4]).toContain('1. First message');
      expect(lastUpdateCall[4]).toContain('2. Second message');
      expect(lastUpdateCall[4]).toContain('3. Third message');
    });
  });

  describe('Progress Message Accumulation', () => {
    it('should accumulate messages as numbered list', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });
      (updateIssueComment as jest.Mock).mockResolvedValue({ ok: true });

      const manager = createProgressCommentManager(context);
      
      await manager.notify('Starting operation...');
      await manager.notify('Phase 1 complete');
      await manager.notify('Phase 2 complete');

      const lastUpdateCall = (updateIssueComment as jest.Mock).mock.calls[1];
      const markdown = lastUpdateCall[4];
      
      expect(markdown).toContain('1. Starting operation...');
      expect(markdown).toContain('2. Phase 1 complete');
      expect(markdown).toContain('3. Phase 2 complete');
      expect(markdown).toContain('🔄 **Test Operation Progress**');
    });
  });

  describe('Error Handling', () => {
    it('should append error with two-part format', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });
      (updateIssueComment as jest.Mock).mockResolvedValue({ ok: true });

      const manager = createProgressCommentManager(context);
      
      await manager.notify('Starting operation...');
      await manager.notify('Phase 1 complete');
      
      const errorMarkdown = '## ❌ Error Details\n\n**Error**: Test error\n\n**Stack**: test stack';
      await manager.appendError(errorMarkdown);

      const lastUpdateCall = (updateIssueComment as jest.Mock).mock.calls[1];
      const markdown = lastUpdateCall[4];
      
      // Check numbered list includes failure indicator
      expect(markdown).toContain('1. Starting operation...');
      expect(markdown).toContain('2. Phase 1 complete');
      expect(markdown).toContain('3. ❌ **Operation Failed**');
      
      // Check error details appended after separator
      expect(markdown).toContain('---');
      expect(markdown).toContain('## ❌ Error Details');
      expect(markdown).toContain('**Error**: Test error');
    });

    it('should call console.error when error is appended', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });

      const manager = createProgressCommentManager(context);
      await manager.appendError('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Progress Error] Operation failed')
      );
    });
  });



  describe('Graceful Degradation', () => {
    it('should disable commenting after 3 consecutive failures', async () => {
      (addIssueComment as jest.Mock).mockRejectedValue(new Error('Network error'));

      const manager = createProgressCommentManager(context);
      
      // First 3 failures should try to create comment
      await manager.notify('Message 1');
      await manager.notify('Message 2');
      await manager.notify('Message 3');
      
      expect(addIssueComment).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Progress commenting disabled after consecutive failures',
        expect.objectContaining({
          epicKey: 'TEST-123',
          failureCount: 3
        })
      );
      
      // 4th message should not attempt to create comment
      await manager.notify('Message 4');
      expect(addIssueComment).toHaveBeenCalledTimes(3); // Still 3, not 4
    });

    it('should reset failure counter on successful comment operation', async () => {
      let callCount = 0;
      (addIssueComment as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          commentId: 'comment-1',
          response: { ok: true }
        });
      });
      (updateIssueComment as jest.Mock).mockResolvedValue({ ok: true });

      const manager = createProgressCommentManager(context);
      
      // First 2 calls fail
      await manager.notify('Message 1');
      await manager.notify('Message 2');
      
      // 3rd call succeeds
      await manager.notify('Message 3');
      
      expect(addIssueComment).toHaveBeenCalledTimes(3);
      
      // 4th call should use update (not disabled)
      await manager.notify('Message 4');
      expect(updateIssueComment).toHaveBeenCalledTimes(1);
    });
  });

  describe('getNotifyFunction()', () => {
    it('should return a function that works like notify()', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });

      const manager = createProgressCommentManager(context);
      const notifyFn = manager.getNotifyFunction();
      
      await notifyFn('Test message via function');

      expect(addIssueComment).toHaveBeenCalledWith(
        mockClient,
        'cloud-id-123',
        'TEST-123',
        expect.stringContaining('1. Test message via function')
      );
    });
  });

  describe('Structured Logging', () => {
    it('should log comment creation with structured data', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });

      const manager = createProgressCommentManager(context);
      await manager.notify('Test message');

      expect(logger.info).toHaveBeenCalledWith(
        'Creating progress comment',
        expect.objectContaining({
          epicKey: 'TEST-123',
          operationName: 'Test Operation'
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Progress comment created',
        expect.objectContaining({
          epicKey: 'TEST-123',
          commentId: 'comment-1'
        })
      );
    });

    it('should log comment updates with message count', async () => {
      (addIssueComment as jest.Mock).mockResolvedValue({
        commentId: 'comment-1',
        response: { ok: true }
      });
      (updateIssueComment as jest.Mock).mockResolvedValue({ ok: true });

      const manager = createProgressCommentManager(context);
      await manager.notify('Message 1');
      await manager.notify('Message 2');

      expect(logger.info).toHaveBeenCalledWith(
        'Progress comment updated',
        expect.objectContaining({
          epicKey: 'TEST-123',
          commentId: 'comment-1',
          messageCount: 2
        })
      );
    });

    it('should log errors with failure count', async () => {
      (addIssueComment as jest.Mock).mockRejectedValue(new Error('Network error'));

      const manager = createProgressCommentManager(context);
      await manager.notify('Test message');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update progress comment',
        expect.objectContaining({
          epicKey: 'TEST-123',
          error: 'Network error',
          failureCount: 1
        })
      );
    });
  });
});
