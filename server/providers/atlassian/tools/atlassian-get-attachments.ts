/**
 * Get Jira Attachments Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from '../../../mcp-core/auth-helpers.ts';
import { resolveCloudId } from '../atlassian-helpers.ts';
import type { McpServer } from '../../../mcp-core/mcp-types.ts';

// Tool parameters interface
interface GetJiraAttachmentsParams {
  attachmentIds: string[];
  cloudId?: string;
  siteName?: string;
}

// Attachment response interface
interface AttachmentResponse {
  id: string;
  encoded: string;
  mimeType: string;
  size: number;
}

/**
 * Convert a blob to base64 string
 * @param blob - The blob to convert
 * @returns Base64 encoded string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  try {
    logger.debug('Converting blob to base64', { 
      blobSize: blob.size, 
      blobType: blob.type 
    });
    
    const arrayBuffer = await blob.arrayBuffer(); // Get the ArrayBuffer from the Blob
    logger.debug('ArrayBuffer created', { bufferLength: arrayBuffer.byteLength });
    
    const buffer = Buffer.from(arrayBuffer); // Create a Buffer from the ArrayBuffer
    logger.debug('Buffer created', { bufferLength: buffer.length });
    
    const base64String = buffer.toString('base64');
    logger.debug('Base64 conversion complete', { base64Length: base64String.length });
    
    return base64String;
  } catch (error: any) {
    logger.error('Failed to convert blob to base64:', error);
    throw new Error(`Failed to convert blob to base64: ${error.message}`);
  }
}

/**
 * Register the atlassian-get-attachments tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerAtlassianGetAttachmentsTool(mcp: McpServer): void {
  mcp.registerTool(
    'atlassian-get-attachments',
    {
      title: 'Get Jira Issues Attachments',
      description: 'Fetch Jira attachments by attachment ID',
      inputSchema: {
        attachmentIds: z.array(z.string()).describe('Array of attachment IDs to fetch'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ attachmentIds, cloudId, siteName }: GetJiraAttachmentsParams, context) => {
      logger.info('atlassian-get-attachments called', { 
        attachmentIds, 
        cloudId, 
        siteName,
        attachmentCount: attachmentIds?.length 
      });

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'atlassian-get-attachments');
      const token = authInfo?.atlassian?.access_token;

      if (!token) {
        logger.error('No Atlassian access token found in auth context');
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found in session context.',
            },
          ],
        };
      }

      logger.info('Found valid auth token, proceeding with attachment fetch');

      try {
        // Resolve the target cloud ID using the utility function
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(token, cloudId, siteName);
        } catch (error: any) {
          logger.error('Failed to resolve cloud ID:', error);
          return { 
            content: [{ 
              type: 'text', 
              text: `Error: ${error.message}` 
            }] 
          };
        }
        
        const targetCloudId = siteInfo.cloudId;

        logger.info('Starting parallel fetch of attachments', { 
          attachmentIds, 
          cloudId: targetCloudId,
          fetchUrl: `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/attachment/content/` 
        });

        // Fetch all attachments in parallel
        const attachmentPromises = attachmentIds.map(async (id): Promise<AttachmentResponse | { error: string; id: string }> => {
          try {
            logger.info(`Fetching attachment ${id}`, { 
              attachmentId: id,
              cloudId: targetCloudId 
            });

            const attachmentUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/attachment/content/${id}`;
            const attachmentRes = await fetch(attachmentUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            logger.info(`Attachment ${id} fetch response`, {
              status: attachmentRes.status,
              statusText: attachmentRes.statusText,
              contentType: attachmentRes.headers.get('content-type'),
              contentLength: attachmentRes.headers.get('content-length')
            });

            if (attachmentRes.status === 404) {
              logger.warn(`Attachment ${id} not found`);
              return { error: `Attachment ${id} not found`, id };
            }

            handleJiraAuthError(attachmentRes, `Fetch attachment ${id}`);

            const blob = await attachmentRes.blob();
            logger.info(`Attachment ${id} blob received`, {
              blobSize: blob.size,
              blobType: blob.type
            });

            const encoded = await blobToBase64(blob);
            logger.info(`Attachment ${id} encoded to base64`, {
              encodedLength: encoded.length
            });

            return {
              id,
              encoded,
              mimeType: blob.type,
              size: blob.size,
            };
          } catch (error: any) {
            logger.error(`Error fetching attachment ${id}:`, error);
            return { error: `Error fetching attachment ${id}: ${error.message}`, id };
          }
        });

        const results = await Promise.all(attachmentPromises);

        // Separate successful responses from errors
        const successfulResponses: AttachmentResponse[] = [];
        const errors: string[] = [];

        results.forEach(result => {
          if ('error' in result) {
            errors.push(result.error);
          } else {
            successfulResponses.push(result);
          }
        });

        logger.info('Building response content', {
          successfulCount: successfulResponses.length,
          errorCount: errors.length
        });

        const content: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string }> = [];
        
        // Add any errors as text content first
        if (errors.length > 0) {
          content.push({
            type: 'text',
            text: `Some attachments failed to load:\n${errors.join('\n')}\n\nSuccessfully loaded ${successfulResponses.length} attachment(s):`,
          });
        }

        // Add successful images
        successfulResponses.forEach(({ id, encoded, mimeType, size }) => {
          logger.info(`Adding content for attachment ${id}`, {
            mimeType,
            size,
            isImage: mimeType.startsWith('image/'),
            base64Length: encoded.length
          });

          if (mimeType.startsWith('image/')) {
            content.push({
              type: 'image',
              mimeType: mimeType,
              data: encoded,
            });
          } else {
            // For non-image attachments, provide info instead of binary data
            content.push({
              type: 'text',
              text: `Attachment ${id}: ${mimeType} (${Math.round(size / 1024)}KB) - Binary file content not displayed`,
            });
          }
        });

        logger.info('Returning response content', {
          contentItems: content.length,
          imageItems: content.filter(c => c.type === 'image').length,
          textItems: content.filter(c => c.type === 'text').length
        });

        return { content };
      } catch (err: any) {
        logger.error('Error fetching attachments from Jira:', err);
        return { content: [{ type: 'text', text: `Error fetching attachments from Jira: ${err.message}` }] };
      }
    },
  );
}
