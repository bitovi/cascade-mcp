/**
 * Google Drive API interaction helpers
 * Reusable functions for Google Drive API calls
 */

import type { GoogleClient } from './google-api-client.js';
import type { DriveAboutResponse, GoogleDocMetadata } from './types.js';

/**
 * Get the authenticated user's Google Drive information
 * @param client - Authenticated Google API client
 * @returns Promise resolving to Drive user information
 * @throws Error if the API request fails
 *
 * @example
 * ```typescript
 * const client = createGoogleClient(token);
 * const userData = await getGoogleDriveUser(client);
 * console.log(userData.user.emailAddress);
 * ```
 */
export async function getGoogleDriveUser(client: GoogleClient): Promise<DriveAboutResponse> {
  const response = await client.fetch('https://www.googleapis.com/drive/v3/about?fields=user');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<DriveAboutResponse>;
}

/**
 * Get Google Drive document metadata
 * @param client - Authenticated Google API client
 * @param documentId - Google Drive document ID
 * @returns Promise resolving to document metadata
 * @throws Error if the API request fails or document doesn't exist
 *
 * @example
 * ```typescript
 * const client = createGoogleClient(token);
 * const metadata = await getDocumentMetadata(client, '1a2b3c4d5e6f7g8h9i0j');
 * console.log(metadata.name, metadata.modifiedTime);
 * ```
 */
export async function getDocumentMetadata(
  client: GoogleClient,
  documentId: string
): Promise<GoogleDocMetadata> {
  console.log('Fetching document metadata from Drive API');
  
  const fields = 'id,name,mimeType,modifiedTime,size';
  const url = `https://www.googleapis.com/drive/v3/files/${documentId}?fields=${fields}`;
  
  console.log('  Document ID:', documentId);
  
  const response = await client.fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('  Drive API error:', response.status, errorText);
    
    // Provide user-friendly error messages
    if (response.status === 404) {
      throw new Error(
        `Document not found (404). The document may have been deleted, moved, or the ID is incorrect.\n` +
        `Document ID: ${documentId}`
      );
    }
    
    if (response.status === 403) {
      throw new Error(
        `Access denied (403). You don't have permission to access this document.\n` +
        `Please check:\n` +
        `  - The document is shared with you\n` +
        `  - The sharing settings allow at least "View" access\n` +
        `  - Your authentication has the required Google Drive scopes`
      );
    }
    
    if (response.status === 429) {
      throw new Error(
        `Rate limit exceeded (429). Too many requests to Google Drive API.\n` +
        `Please wait a moment and try again.`
      );
    }
    
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }
  
  const metadata = await response.json() as GoogleDocMetadata;
  console.log('  Document metadata retrieved:', metadata.name);
  
  return metadata;
}

/**
 * Export Google Drive document as HTML
 * 
 * Uses Drive API's native export functionality to convert Google Docs to HTML format.
 * 
 * @param client - Authenticated Google API client
 * @param documentId - Google Drive document ID
 * @returns Promise resolving to HTML content string
 * @throws Error if the API request fails or document cannot be exported
 *
 * @example
 * ```typescript
 * const client = createGoogleClient(token);
 * const html = await exportDocumentAsHTML(client, '1a2b3c4d5e6f7g8h9i0j');
 * // html contains the document as HTML string
 * ```
 */
export async function exportDocumentAsHTML(
  client: GoogleClient,
  documentId: string
): Promise<string> {
  console.log('Exporting document as HTML');
  
  const url = `https://www.googleapis.com/drive/v3/files/${documentId}/export?mimeType=text/html`;
  
  console.log('  Document ID:', documentId);
  
  const response = await client.fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('  Drive API export error:', response.status, errorText);
    
    // Provide user-friendly error messages
    if (response.status === 404) {
      throw new Error(
        `Document not found (404). Cannot export document.\n` +
        `Document ID: ${documentId}`
      );
    }
    
    if (response.status === 403) {
      throw new Error(
        `Access denied (403). You don't have permission to export this document.\n` +
        `The document owner must grant at least "View" access.`
      );
    }
    
    if (response.status === 400) {
      throw new Error(
        `Invalid export request (400). This file type cannot be exported as HTML.\n` +
        `Only Google Docs can be converted to Markdown (not Sheets, Slides, PDFs, etc.).`
      );
    }
    
    if (response.status === 429) {
      throw new Error(
        `Rate limit exceeded (429). Too many export requests.\n` +
        `Please wait a moment and try again.`
      );
    }
    
    throw new Error(`Drive API export error (${response.status}): ${errorText}`);
  }
  
  const html = await response.text();
  
  return html;
}
