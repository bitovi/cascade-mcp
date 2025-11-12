/**
 * Progress Comment Manager
 * 
 * Manages creating and updating progress comments on Jira issues during long-running operations.
 * Comments are created lazily on first notification and updated with each progress message.
 * 
 * Features:
 * - Lazy initialization: Comment created on first notify() call
 * - Appends progress messages as numbered list items
 * - Handles errors with two-part format (final list item + detailed error content)
 * - Graceful degradation: Falls back to console-only after 3 consecutive failures
 * - Always logs to console as backup
 */

import type { AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { addIssueComment, updateIssueComment } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';

/**
 * Context needed for creating and updating progress comments
 */
export interface ProgressCommentContext {
  epicKey: string;
  cloudId: string;
  client: AtlassianClient;
  operationName: string; // Display name (e.g., "Write Shell Stories")
}

/**
 * Progress comment manager interface
 */
export interface ProgressCommentManager {
  /**
   * Notify progress - creates comment on first call, updates thereafter
   * Progress and success messages are appended as numbered list items
   */
  notify(message: string): Promise<void>;
  
  /**
   * Append error details to comment (called from catch block)
   * Adds final list item indicating failure + full error details after list
   */
  appendError(errorMarkdown: string): Promise<void>;
  
  /**
   * Get the notify function to pass to core logic
   */
  getNotifyFunction(): (message: string) => Promise<void>;
}

/**
 * Create a progress comment manager for tracking operation progress in Jira
 * 
 * @param context - Context with epic key, cloud ID, client, and operation name
 * @returns ProgressCommentManager instance
 */
export function createProgressCommentManager(
  context: ProgressCommentContext
): ProgressCommentManager {
  // Internal state
  let commentId: string | null = null;
  let messages: string[] = [];
  let errorDetails: string | null = null;
  let consecutiveFailures = 0;
  let isCommentingDisabled = false;

  /**
   * Build the complete comment markdown from current state
   */
  function buildCommentMarkdown(): string {
    let markdown = `🔄 **${context.operationName} Progress**\n\n`;
    
    // Add numbered list of progress messages
    messages.forEach((msg, index) => {
      markdown += `${index + 1}. ${msg}\n`;
    });
    
    // If there's an error, append it after the list
    if (errorDetails) {
      markdown += '\n---\n\n';
      markdown += errorDetails;
    }
    
    return markdown;
  }

  /**
   * Attempt to create or update the progress comment
   * Returns true on success, false on failure
   */
  async function tryUpdateComment(markdown: string): Promise<boolean> {
    try {
      if (commentId === null) {
        // Create initial comment (lazy initialization)
        logger.info('Creating progress comment', { 
          epicKey: context.epicKey,
          operationName: context.operationName 
        });
        
        const startTime = Date.now();
        const result = await addIssueComment(
          context.client,
          context.cloudId,
          context.epicKey,
          markdown
        );
        const duration = Date.now() - startTime;
        
        commentId = result.commentId;
        
        logger.info('Progress comment created', { 
          epicKey: context.epicKey,
          commentId,
          duration 
        });
      } else {
        // Update existing comment
        logger.info('Updating progress comment', { 
          epicKey: context.epicKey,
          commentId,
          messageCount: messages.length 
        });
        
        const startTime = Date.now();
        await updateIssueComment(
          context.client,
          context.cloudId,
          context.epicKey,
          commentId,
          markdown
        );
        const duration = Date.now() - startTime;
        
        logger.info('Progress comment updated', { 
          epicKey: context.epicKey,
          commentId,
          messageCount: messages.length,
          duration 
        });
      }
      
      // Success - reset failure counter
      consecutiveFailures = 0;
      return true;
      
    } catch (error: any) {
      consecutiveFailures++;
      logger.error('Failed to update progress comment', { 
        epicKey: context.epicKey,
        commentId,
        error: error.message,
        failureCount: consecutiveFailures 
      });
      
      // Disable commenting after 3 consecutive failures
      if (consecutiveFailures >= 3) {
        isCommentingDisabled = true;
        logger.warn('Progress commenting disabled after consecutive failures', { 
          epicKey: context.epicKey,
          failureCount: consecutiveFailures 
        });
      }
      
      return false;
    }
  }

  /**
   * Implementation of notify() - append progress message
   */
  async function notify(message: string): Promise<void> {
    // Always log to console as backup
    console.log(`[Progress] ${message}`);
    
    // If commenting is disabled, return early
    if (isCommentingDisabled) {
      return;
    }
    
    // Add message to list
    messages.push(message);
    
    // Build and post/update comment
    const markdown = buildCommentMarkdown();
    await tryUpdateComment(markdown);
  }

  /**
   * Implementation of appendError() - append error details
   */
  async function appendError(errorMarkdown: string): Promise<void> {
    // Always log to console as backup
    console.error(`[Progress Error] Operation failed`);
    
    // If commenting is disabled, return early
    if (isCommentingDisabled) {
      return;
    }
    
    // Add final failure indicator to the numbered list
    messages.push('❌ **Operation Failed**');
    
    // Store the full error details (will be appended after list)
    errorDetails = errorMarkdown;
    
    // Build and post/update comment
    const markdown = buildCommentMarkdown();
    await tryUpdateComment(markdown);
  }

  /**
   * Get the notify function to pass to core logic
   */
  function getNotifyFunction(): (message: string) => Promise<void> {
    return notify;
  }

  // Return the manager interface
  return {
    notify,
    appendError,
    getNotifyFunction
  };
}
