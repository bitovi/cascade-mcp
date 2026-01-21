/**
 * Core Business Logic for Google Drive Document to Markdown Conversion
 * 
 * Shared conversion workflow used by both MCP tool and REST API endpoint.
 * Implements the dual-interface pattern: OAuth (MCP) and PAT (REST API) paths
 * converge on identical business logic.
 * 
 * Workflow:
 * 1. Parse URL → Extract document ID
 * 2. Fetch metadata from Drive API
 * 3. Export document as HTML from Drive API
 * 4. Convert HTML to Markdown
 * 5. Return result
 */

import type { GoogleClient } from '../../google-api-client.js';
import type { ConversionRequest, ConversionResult, DocumentMetadata } from './types.js';
import { parseGoogleDriveUrl } from './url-parser.js';
import { getDocumentMetadata, exportDocumentAsHTML } from '../../google-helpers.js';

/**
 * Execute the complete document-to-markdown conversion workflow
 * 
 * This is the main entry point for conversion, used by both:
 * - MCP tool (with OAuth client)
 * - REST API endpoint (with PAT client)
 * 
 * @param request - Conversion request (URL + optional forceRefresh)
 * @param client - Authenticated Google API client
 * @returns Promise resolving to conversion result
 * @throws Error for invalid URLs, API errors, or conversion failures
 * 
 * @example
 * ```typescript
 * const client = createGoogleClient(accessToken);
 * const result = await executeDriveDocToMarkdown(
 *   { url: "https://docs.google.com/document/d/abc123/edit" },
 *   client
 * );
 * console.log(result.markdown);
 * ```
 */
export async function executeDriveDocToMarkdown(
  request: ConversionRequest,
  client: GoogleClient
): Promise<ConversionResult> {
  console.log('Starting Drive document to Markdown conversion');
  
  const startTime = Date.now();
  
  // Step 1: Parse URL and extract document ID
  console.log('Step 1: Parsing URL');
  const { documentId } = parseGoogleDriveUrl(request.url);
  
  // Step 2: Fetch document metadata
  console.log('Step 2: Fetching document metadata');
  const metadata = await getDocumentMetadata(client, documentId);
  
  // Validate document type
  if (metadata.mimeType !== 'application/vnd.google-apps.document') {
    const friendlyType = getFriendlyMimeType(metadata.mimeType);
    throw new Error(
      `Unsupported document type: ${friendlyType}.\\n` +
      `Only Google Docs can be converted to Markdown.\\n` +
      `Unsupported types: Sheets, Slides, PDFs, Forms, Drawings, etc.`
    );
  }
  
  // Validate file size (10MB limit to prevent memory issues)
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  if (metadata.size && metadata.size > MAX_SIZE_BYTES) {
    const sizeMB = (metadata.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Document too large: ${sizeMB}MB (maximum: 10MB).\\n` +
      `Large documents may cause conversion timeouts or memory issues.\\n` +
      `Consider splitting the document into smaller sections.`
    );
  }
  
  // Step 3: Export document as HTML
  console.log('Step 3: Exporting document as HTML');
  const html = await exportDocumentAsHTML(client, documentId);
  
  // Step 4: Convert HTML to Markdown
  console.log('Step 4: Converting HTML to Markdown');
  const { htmlToMarkdown } = await import('./conversion-helpers.js');
  const markdown = htmlToMarkdown(html);
  const warnings: string[] = [];
  
  // Step 5: Return result
  const processingTimeMs = Date.now() - startTime;
  const documentMetadata: DocumentMetadata = {
    documentId: metadata.id,
    title: metadata.name,
    url: normalizeDocumentUrl(documentId),
    modifiedTime: metadata.modifiedTime,
    size: metadata.size || 0
  };
  
  console.log('Conversion complete in', processingTimeMs, 'ms');
  
  return {
    markdown,
    metadata: documentMetadata,
    warnings,
    processingTimeMs
  };
}

/**
 * Normalize document URL to standard format
 * @param documentId - Google Drive document ID
 * @returns Normalized URL
 */
function normalizeDocumentUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

/**
 * Get friendly name for Google Drive MIME type
 * @param mimeType - Google Drive MIME type
 * @returns Human-readable document type name
 */
function getFriendlyMimeType(mimeType: string): string {
  const mimeTypeMap: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  };
  
  return mimeTypeMap[mimeType] || mimeType;
}
