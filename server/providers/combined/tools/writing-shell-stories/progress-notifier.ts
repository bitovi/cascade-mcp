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
 * Useful for creating a reusable notifier within a single tool execution.
 * Supports adding additional steps dynamically for cases where the total number
 * of steps is unknown initially (e.g., discovered after processing).
 * 
 * @example
 * const notify = createProgressNotifier(context, 6); // 6 total steps initially
 * await notify('Phase 1: Fetching epic...', 1);
 * await notify('Phase 2: Parsing Figma URLs...', 2);
 * await notify('Phase 3: Generating YAML...', 3);
 * // Discovered 10 screens, add them to the total
 * await notify('Phase 4: Starting analysis...', 4, 'info', 10); // Adds 10 steps (now 16 total)
 * await notify('Analyzing screen 1...', 5);
 * await notify('Analyzing screen 2...', 6);
 */
export function createProgressNotifier(
  context: any, // Using any to work with MCP SDK's RequestHandlerExtra type
  initialTotal: number
): (message: string, progress: number, level?: 'info' | 'debug' | 'warning' | 'error', addSteps?: number) => Promise<void> {
  let currentTotal = initialTotal;
  
  return async (
    message: string, 
    progress: number, 
    level: 'info' | 'debug' | 'warning' | 'error' = 'info',
    addSteps?: number
  ) => {
    // Add additional steps to total if provided
    if (addSteps !== undefined) {
      currentTotal += addSteps;
    }
    
    await sendProgress({ context, message, level, progress, total: currentTotal });
  };
}
