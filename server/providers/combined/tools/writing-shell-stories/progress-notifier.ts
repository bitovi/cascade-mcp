/**
 * Progress Notification Helper
 * 
 * Simplifies sending dual MCP notifications (message + progress) in one call.
 * Follows the pattern from mcp-training for streaming progress updates.
 */

/**
 * Options for sending progress notifications
 */
export interface ProgressNotificationOptions {
  /** The MCP request context (from tool handler `extra` parameter) */
  context: any; // Using any to work with MCP SDK's RequestHandlerExtra type
  /** The message to display to the user */
  message: string;
  /** Log level for notifications/message (default: 'info') */
  level?: 'info' | 'debug' | 'warning' | 'error';
  /** Current progress step (for VS Code progress bar) */
  progress?: number;
  /** Total number of steps (for VS Code progress bar) */
  total?: number;
}

/**
 * Send both logging and progress notifications in one call
 * 
 * Sends two types of notifications:
 * 1. notifications/message - For MCP Inspector and general logging
 * 2. notifications/progress - For VS Code Copilot progress bars (if progressToken available)
 * 
 * @example
 * await sendProgress({
 *   context,
 *   message: 'Phase 1: Fetching epic from Jira...',
 *   level: 'info',
 *   progress: 1,
 *   total: 7
 * });
 */
export async function sendProgress(options: ProgressNotificationOptions): Promise<void> {
  const { context, message, level = 'info', progress, total } = options;

  // 1. Always send logging notification (for MCP Inspector, console debugging)
  await context.sendNotification({
    method: 'notifications/message',
    params: {
      level,
      data: message
    }
  });

  // 2. Send progress notification if progressToken is available (for VS Code)
  if (progress !== undefined && total !== undefined && context._meta?.progressToken) {
    await context.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken: context._meta.progressToken,
        progress,
        total,
        message
      }
    });
  }
}

/**
 * Create a progress notifier bound to a specific context
 * 
 * Useful for creating a reusable notifier within a single tool execution
 * 
 * @example
 * const notify = createProgressNotifier(context, 7); // 7 total steps
 * await notify('Phase 1: Fetching epic...', 1);
 * await notify('Phase 2: Parsing Figma URLs...', 2);
 */
export function createProgressNotifier(
  context: any, // Using any to work with MCP SDK's RequestHandlerExtra type
  total: number
): (message: string, progress: number, level?: 'info' | 'debug' | 'warning' | 'error') => Promise<void> {
  return async (message: string, progress: number, level: 'info' | 'debug' | 'warning' | 'error' = 'info') => {
    await sendProgress({ context, message, level, progress, total });
  };
}
