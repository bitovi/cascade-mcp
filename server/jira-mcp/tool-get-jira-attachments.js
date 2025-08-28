/**
 * Get Jira Attachments Tool
 */

import { z } from 'zod';
import { logger } from '../logger.js';
import { getAuthInfo, handleJiraAuthError, resolveCloudId } from './auth-helpers.js';

/**
 * Convert a blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} Base64 encoded string
 */
async function blobToBase64(blob) {
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
  } catch (error) {
    logger.error('Failed to convert blob to base64:', error);
    throw new Error(`Failed to convert blob to base64: ${error.message}`);
  }
}

/**
 * Register the get-jira-attachments tool with the MCP server
 * @param {McpServer} mcp - MCP server instance
 */
export function registerGetJiraAttachmentsTool(mcp) {
  mcp.registerTool(
    'get-jira-attachments',
    {
      title: 'Get Jira Issues Attachments',
      description: 'Fetch Jira attachments by attachment ID',
      inputSchema: {
        attachmentIds: z.array(z.string()).describe('Array of attachment IDs to fetch'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ attachmentIds, cloudId, siteName }, context) => {
      logger.info('get-jira-attachments called', { 
        attachmentIds, 
        cloudId, 
        siteName,
        attachmentCount: attachmentIds?.length 
      });

      const authInfo = getAuthInfo(context);
      const token = authInfo?.atlassian_access_token;

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
        } catch (error) {
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

        const responses = await Promise.allSettled(
          attachmentIds.map(async (id) => {
            logger.info(`Fetching attachment ${id}`);
            try {
              const fetchUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/attachment/content/${id}`;
              logger.debug(`Making request to: ${fetchUrl}`);
              
              const response = await fetch(fetchUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  // Don't specify Accept header for binary content
                },
              });

              logger.info(`Response for attachment ${id}:`, {
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type'),
                contentLength: response.headers.get('content-length')
              });

              handleJiraAuthError(response, `Fetch attachment ${id}`);

              logger.info(`Converting response to blob for attachment ${id}`);
              const blob = await response.blob();
              
              logger.info(`Blob created for attachment ${id}:`, {
                size: blob.size,
                type: blob.type
              });
              
              // Check blob size to prevent memory issues
              if (blob.size > 10 * 1024 * 1024) { // 10MB limit
                throw new Error(`Attachment ${id} is too large (${Math.round(blob.size / 1024 / 1024)}MB)`);
              }

              logger.info(`Converting blob to base64 for attachment ${id}`);
              const base64Data = await blobToBase64(blob);
              logger.info(`Base64 conversion complete for attachment ${id}`, {
                base64Length: base64Data.length
              });
              
              return {
                id,
                mimeType: blob.type || 'application/octet-stream',
                encoded: base64Data,
                size: blob.size,
              };
            } catch (error) {
              logger.error(`Error fetching attachment ${id}:`, error);
              throw error;
            }
          }),
        );

        // Filter successful responses and handle failures
        logger.info('Processing attachment fetch results', {
          totalResponses: responses.length,
          fulfilled: responses.filter(r => r.status === 'fulfilled').length,
          rejected: responses.filter(r => r.status === 'rejected').length
        });

        const successfulResponses = [];
        const errors = [];

        responses.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            logger.info(`Attachment ${attachmentIds[index]} fetched successfully`, {
              size: result.value.size,
              mimeType: result.value.mimeType
            });
            successfulResponses.push(result.value);
          } else {
            logger.error(`Attachment ${attachmentIds[index]} failed:`, result.reason);
            errors.push(`Attachment ${attachmentIds[index]}: ${result.reason.message}`);
          }
        });

        if (successfulResponses.length === 0) {
          logger.warn('No attachments could be fetched', { errors });
          return { 
            content: [{ 
              type: 'text', 
              text: `No attachments could be fetched. Errors:\n${errors.join('\n')}` 
            }] 
          };
        }

        logger.info('Building response content', {
          successfulCount: successfulResponses.length,
          errorCount: errors.length
        });

        const content = [];
        
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
      } catch (err) {
        logger.error('Error fetching attachments from Jira:', err);
        return { content: [{ type: 'text', text: `Error fetching attachments from Jira: ${err.message}` }] };
      }
    },
  );
}
