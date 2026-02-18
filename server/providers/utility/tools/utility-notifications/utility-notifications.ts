/**
 * Utility Notifications Tool
 * 
 * Diagnostic tool for testing MCP notification mechanisms.
 * Sends periodic notifications to verify frontend is receiving progress updates.
 * 
 * Default behavior: Sends 1 notification/second for 60 seconds
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { sendProgress } from '../../../combined/tools/writing-shell-stories/progress-notifier.js';

export interface UtilityNotificationsArgs {
  /** Number of seconds to send notifications (default: 60) */
  durationSeconds?: number;
  /** Interval between notifications in milliseconds (default: 1000) */
  intervalMs?: number;
  /** Custom message prefix (default: "Test notification") */
  messagePrefix?: string;
}

/**
 * Register the utility-notifications MCP tool
 */
export function registerUtilityNotificationsTool(mcp: McpServer): void {
  mcp.registerTool(
    'utility-notifications',
    {
      title: 'Utility Notifications',
      description: 'Diagnostic tool that sends periodic notifications to test the MCP notification mechanism. Useful for debugging frontend progress/log display.',
      inputSchema: {
        durationSeconds: z.number().optional()
          .describe('Number of seconds to send notifications (default: 60)'),
        intervalMs: z.number().optional()
          .describe('Interval between notifications in milliseconds (default: 1000)'),
        messagePrefix: z.string().optional()
          .describe('Custom message prefix (default: "Test notification")'),
      },
    },
    async ({ durationSeconds, intervalMs, messagePrefix }: UtilityNotificationsArgs, context) => {
      const duration = durationSeconds ?? 60;
      const interval = intervalMs ?? 1000;
      const prefix = messagePrefix ?? 'Test notification';

      console.log('utility-notifications called', {
        duration,
        interval,
        prefix
      });

      const totalNotifications = Math.floor((duration * 1000) / interval);
      let sentCount = 0;
      const startTime = Date.now();

      try {
        // Send initial notification
        await sendProgress({
          context,
          message: `🚀 Starting notification test: ${totalNotifications} notifications over ${duration}s`,
          level: 'info',
          progress: 0,
          total: totalNotifications
        });

        // Send periodic notifications
        for (let i = 1; i <= totalNotifications; i++) {
          // Wait for the interval
          await sleep(interval);

          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = duration - elapsed;

          await sendProgress({
            context,
            message: `${prefix} ${i}/${totalNotifications} (${elapsed}s elapsed, ${remaining}s remaining)`,
            level: 'info',
            progress: i,
            total: totalNotifications
          });

          sentCount = i;
          console.log(`  ✅ Sent notification ${i}/${totalNotifications}`);
        }

        // Send final notification
        await sendProgress({
          context,
          message: `✅ Notification test complete! Sent ${sentCount} notifications.`,
          level: 'info',
          progress: totalNotifications,
          total: totalNotifications
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                notificationsSent: sentCount,
                durationSeconds: Math.floor((Date.now() - startTime) / 1000),
                configuration: {
                  durationSeconds: duration,
                  intervalMs: interval,
                  messagePrefix: prefix
                }
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Error in utility-notifications:', error);
        
        await sendProgress({
          context,
          message: `❌ Error after ${sentCount} notifications: ${error instanceof Error ? error.message : String(error)}`,
          level: 'error',
          progress: sentCount,
          total: totalNotifications
        });

        throw error;
      }
    }
  );
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
