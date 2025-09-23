import { z } from 'zod';
import FormData from 'form-data';
import { logger } from '../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.ts';
import { resolveCloudId } from './atlassian-helpers.ts';
import { convertMarkdownToAdf, validateAdf, type ADFDocument } from './markdown-converter.ts';
import { extractHttpImageUrls, downloadHttpImages } from './download-helpers.ts';
import type { McpServer } from './mcp-types.ts';

// Tool parameters interface
interface UpdateIssueDescriptionParams {
  issueKey: string;
  description: string;
  cloudId?: string;
  siteName?: string;
  notifyUsers?: boolean;
  attachments?: Array<{
    filename: string;
    content: string; // base64-encoded file content
    mimeType: string;
    markdownRef: string; // Original markdown reference path
  }>;
}

// Attachment upload response interface
interface AttachmentResponse {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string; // URL to attachment content
  thumbnail?: string;
  author: {
    accountId: string;
    displayName: string;
  };
  created: string;
}

// Jira update payload interface
interface JiraUpdatePayload {
  fields: {
    description: ADFDocument;
  };
}

/**
 * Upload attachments to a Jira issue
 * @param token - Atlassian access token
 * @param cloudId - Jira cloud ID
 * @param issueKey - Issue key or ID
 * @param attachments - Array of attachment data
 * @returns Array of uploaded attachment responses
 */
async function uploadAttachmentsToJira(
  token: string,
  cloudId: string,
  issueKey: string,
  attachments: UpdateIssueDescriptionParams['attachments']
): Promise<AttachmentResponse[]> {
  console.log('Uploading attachments to Jira', { 
    issueKey, 
    cloudId, 
    attachmentCount: attachments?.length || 0 
  });

  if (!attachments || attachments.length === 0) {
    return [];
  }

  const uploadedAttachments: AttachmentResponse[] = [];

  for (const attachment of attachments) {
    console.log('  Uploading attachment', { 
      filename: attachment.filename, 
      mimeType: attachment.mimeType,
      markdownRef: attachment.markdownRef 
    });

    try {
      // Convert base64 to Buffer
      const buffer = Buffer.from(attachment.content, 'base64');
      
      // Create FormData for multipart upload
      const form = new FormData();
      form.append('file', buffer, {
        filename: attachment.filename,
        contentType: attachment.mimeType
      });

      // Upload to Jira
      const uploadUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/attachments`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Atlassian-Token': 'no-check', // Required for CSRF protection
          ...form.getHeaders()
        },
        body: form as any
      });

      console.log('  Attachment upload response', {
        filename: attachment.filename,
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        // Handle authentication errors
        handleJiraAuthError(response, `Upload attachment ${attachment.filename}`);
        
        // If we get here, it's a different error
        const errorText = await response.text();
        logger.error('Failed to upload attachment', {
          filename: attachment.filename,
          status: response.status,
          error: errorText
        });
        throw new Error(`Failed to upload ${attachment.filename}: ${response.status} ${response.statusText}`);
      }

      const uploadResult = await response.json() as AttachmentResponse[];
      
      if (uploadResult && uploadResult.length > 0) {
        const uploadedAttachment = uploadResult[0]; // Jira returns array with single item
        uploadedAttachments.push(uploadedAttachment);
        
        console.log('  Successfully uploaded attachment', {
          filename: attachment.filename,
          attachmentId: uploadedAttachment.id,
          contentUrl: uploadedAttachment.content
        });
      } else {
        throw new Error(`Unexpected upload response format for ${attachment.filename}`);
      }
      
    } catch (error: any) {
      logger.error('Error uploading attachment', {
        filename: attachment.filename,
        error: error.message
      });
      throw new Error(`Failed to upload attachment ${attachment.filename}: ${error.message}`);
    }
  }

  console.log('All attachments uploaded successfully', { 
    uploadedCount: uploadedAttachments.length 
  });

  return uploadedAttachments;
}

/**
 * Replace markdown image references with Jira attachment URLs
 * @param markdown - Original markdown content
 * @param uploadedAttachments - Array of uploaded attachment responses
 * @param originalAttachments - Original attachment input data
 * @returns Updated markdown with Jira URLs
 */
function replaceImageReferences(
  markdown: string,
  uploadedAttachments: AttachmentResponse[],
  originalAttachments: Array<{
    filename: string;
    content: string;
    mimeType: string;
    markdownRef: string;
  }>
): string {
  console.log('Replacing image references in markdown', {
    originalLength: markdown.length,
    uploadedCount: uploadedAttachments.length,
    originalCount: originalAttachments?.length || 0
  });

  if (!originalAttachments || originalAttachments.length === 0) {
    return markdown;
  }

  let updatedMarkdown = markdown;

  // Create mapping from original markdown reference to uploaded attachment
  for (let i = 0; i < originalAttachments.length; i++) {
    const original = originalAttachments[i];
    const uploaded = uploadedAttachments[i]; // Should match by order

    if (uploaded) {
      // For HTTP URLs, we need to escape the full URL for regex
      let escapedRef;
      if (original.markdownRef.startsWith('http')) {
        // For HTTP URLs, escape all special regex characters
        escapedRef = original.markdownRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Create regex to match the full image markdown with optional title: ![alt](url "title")
        const imageRefRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRef}(?:\\s+"[^"]*")? *\\)`, 'g');
        updatedMarkdown = updatedMarkdown.replace(imageRefRegex, `![$1](${uploaded.content})`);
      } else {
        // For local file paths, use the original logic
        escapedRef = original.markdownRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const imageRefRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRef}\\)`, 'g');
        updatedMarkdown = updatedMarkdown.replace(imageRefRegex, `![$1](${uploaded.content})`);
      }
      
      console.log('  Replaced image reference', {
        original: original.markdownRef,
        jiraUrl: uploaded.content,
        filename: uploaded.filename,
        type: original.markdownRef.startsWith('http') ? 'HTTP URL' : 'local path'
      });
    }
  }

  console.log('Completed markdown image reference replacement', {
    originalLength: markdown.length,
    updatedLength: updatedMarkdown.length
  });

  return updatedMarkdown;
}

/**
 * Register the update-issue-description tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerUpdateIssueDescriptionTool(mcp: McpServer): void {
  mcp.registerTool(
    'update-issue-description',
    {
      title: 'Update Jira Issue Description',
      description: 'Updates a Jira issue description with markdown content that will be converted to Atlassian Document Format (ADF). Automatically detects and uploads HTTP(S) image URLs from markdown. Optionally supports uploading additional attachments that are referenced in the markdown.',
      inputSchema: {
        issueKey: z.string().describe('The Jira issue key or ID (e.g., "PROJ-123", "USER-10")'),
        description: z.string().describe('Issue description in markdown format (will be converted to ADF)'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
        notifyUsers: z.boolean().optional().default(true).describe('Whether to send notifications to users (default: true)'),
        attachments: z.array(z.object({
          filename: z.string().describe('Original filename (e.g., "screenshot.png")'),
          content: z.string().describe('Base64-encoded file content'),
          mimeType: z.string().describe('MIME type (e.g., "image/png")'),
          markdownRef: z.string().describe('Original markdown reference path (e.g., "./screenshot.png")')
        })).optional().describe('Optional array of image attachments referenced in markdown'),
      },
    },
    async ({ 
      issueKey, 
      description, 
      cloudId, 
      siteName, 
      notifyUsers = true,
      attachments = []
    }: UpdateIssueDescriptionParams, context) => {
      logger.info('update-issue-description called', { 
        issueKey, 
        cloudId, 
        siteName,
        descriptionLength: description?.length || 0,
        attachmentCount: attachments?.length || 0,
        notifyUsers
      });

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'update-issue-description');
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

      logger.info('Found valid auth token, proceeding with description update');

      try {
        // Input validation
        if (!issueKey || !issueKey.trim()) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Issue key is required.'
            }]
          };
        }

        if (!description || typeof description !== 'string') {
          return {
            content: [{
              type: 'text',
              text: 'Error: Description is required and must be a string.'
            }]
          };
        }

        // Resolve the target cloud ID
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

        // Handle attachments if provided
        let processedDescription = description;
        let uploadedAttachments: AttachmentResponse[] = [];
        let allAttachments: Array<{
          filename: string;
          content: string;
          mimeType: string;
          markdownRef: string;
        }> = [];
        
        // Process explicit attachments (if provided)
        if (attachments && attachments.length > 0) {
          allAttachments.push(...attachments);
        }
        
        // Auto-detect and download HTTP(S) image URLs from markdown
        try {
          const httpImageUrls = extractHttpImageUrls(description);
          if (httpImageUrls.length > 0) {
            logger.info('Found HTTP image URLs in markdown', {
              issueKey,
              httpImageCount: httpImageUrls.length,
              urls: httpImageUrls.map(img => img.url)
            });
            
            const downloadedImages = await downloadHttpImages(httpImageUrls);
            if (downloadedImages.length > 0) {
              allAttachments.push(...downloadedImages);
              logger.info('Successfully downloaded HTTP images', {
                issueKey,
                downloadedCount: downloadedImages.length
              });
            }
          }
        } catch (error: any) {
          logger.warn('Failed to process HTTP images', { issueKey, error: error.message });
          // Continue without HTTP images - don't fail the whole operation
        }
        
        // Upload all attachments (explicit + downloaded) to Jira
        if (allAttachments.length > 0) {
          logger.info('Processing all attachments', { 
            issueKey,
            totalAttachmentCount: allAttachments.length,
            explicitCount: attachments?.length || 0,
            httpImageCount: allAttachments.length - (attachments?.length || 0),
            attachmentFiles: allAttachments.map(a => a.filename)
          });
          
          try {
            // Upload attachments to Jira
            uploadedAttachments = await uploadAttachmentsToJira(token, targetCloudId, issueKey, allAttachments);
            
            // Replace markdown image references with Jira URLs
            processedDescription = replaceImageReferences(description, uploadedAttachments, allAttachments);
            
            logger.info('Successfully processed all attachments', {
              issueKey,
              uploadedCount: uploadedAttachments.length,
              processedDescriptionLength: processedDescription.length
            });
            
          } catch (error: any) {
            logger.error('Failed to process attachments', { issueKey, error: error.message });
            return {
              content: [{
                type: 'text',
                text: `Error processing attachments: ${error.message}`
              }]
            };
          }
        }

        // Convert markdown to ADF
        logger.info('Converting markdown description to ADF', { 
          issueKey,
          descriptionLength: processedDescription.length,
          hasAttachments: uploadedAttachments.length > 0
        });

        const adfDescription = await convertMarkdownToAdf(processedDescription);

        // Validate ADF structure
        if (!validateAdf(adfDescription)) {
          logger.error('Generated ADF is invalid', { adf: adfDescription });
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to convert markdown to valid ADF format.'
            }]
          };
        }

        // Build the API URL with query parameters
        const updateUrl = new URL(`https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue/${issueKey}`);
        if (notifyUsers !== undefined) {
          updateUrl.searchParams.set('notifyUsers', notifyUsers.toString());
        }

        // Prepare the update payload
        const updatePayload: JiraUpdatePayload = {
          fields: {
            description: adfDescription
          }
        };

        logger.info('Updating issue description', { 
          issueKey,
          cloudId: targetCloudId,
          updateUrl: updateUrl.toString(),
          adfContentBlocks: adfDescription.content?.length || 0,
          notifyUsers
        });

        // Make the API request
        const updateResponse = await fetch(updateUrl.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        logger.info('Update API response', {
          status: updateResponse.status,
          statusText: updateResponse.statusText,
          contentType: updateResponse.headers.get('content-type')
        });

        // Handle specific error cases
        if (updateResponse.status === 404) {
          logger.warn('Issue not found', { issueKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Issue ${issueKey} not found.` 
            }] 
          };
        }

        if (updateResponse.status === 403) {
          logger.warn('Insufficient permissions', { issueKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Insufficient permissions to update issue ${issueKey}. Please ensure you have 'Edit Issues' permission for this project.` 
            }] 
          };
        }

        handleJiraAuthError(updateResponse, `Update issue ${issueKey} description`);

        // Success response (usually 204 No Content)
        logger.info('Issue description updated successfully', {
          issueKey,
          status: updateResponse.status,
          descriptionLength: processedDescription.length,
          attachmentsUploaded: uploadedAttachments.length
        });

        // Build comprehensive success message
        let successMessage = `Successfully updated description for issue ${issueKey}.`;
        
        if (uploadedAttachments.length > 0) {
          const explicitAttachmentCount = attachments?.length || 0;
          const httpImageCount = uploadedAttachments.length - explicitAttachmentCount;
          
          const attachmentNames = uploadedAttachments.map(a => a.filename).join(', ');
          successMessage += `\n\nUploaded ${uploadedAttachments.length} attachment(s): ${attachmentNames}`;
          
          if (httpImageCount > 0 && explicitAttachmentCount > 0) {
            successMessage += `\n\n(${explicitAttachmentCount} explicit attachment(s) + ${httpImageCount} HTTP image(s) detected in markdown)`;
          } else if (httpImageCount > 0) {
            successMessage += `\n\n(${httpImageCount} HTTP image(s) automatically detected and downloaded from markdown)`;
          }
          
          // Add attachment details
          const attachmentDetails = uploadedAttachments.map(att => 
            `- ${att.filename} (${att.mimeType}, ${att.size} bytes)`
          ).join('\n');
          successMessage += `\n\nAttachment details:\n${attachmentDetails}`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: successMessage,
            },
          ],
        };

      } catch (err: any) {
        logger.error('Error updating Jira issue description:', err);
        
        // Provide helpful error messages for common scenarios
        let errorMessage = `Error updating issue ${issueKey}: ${err.message}`;
        
        if (err.message.includes('Authentication required')) {
          errorMessage = `Authentication expired. Please re-authenticate with Jira to update issue ${issueKey}.`;
        } else if (err.message.includes('404')) {
          errorMessage = `Issue ${issueKey} not found or you don't have access to it.`;
        } else if (err.message.includes('403')) {
          errorMessage = `Insufficient permissions to update issue ${issueKey}.`;
        }
        
        return { 
          content: [{ 
            type: 'text', 
            text: errorMessage
          }] 
        };
      }
    },
  );
}
