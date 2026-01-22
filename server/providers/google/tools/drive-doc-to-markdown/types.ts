/**
 * Type Definitions for Google Drive Document to Markdown Converter
 * 
 * Entities and interfaces for the conversion workflow:
 * - ConversionRequest: Input from user
 * - ConversionResult: Response to user
 */

/**
 * Authentication context for Google Drive API access
 * Supports both OAuth (user-delegated) and Service Account (server-to-server) paths
 */
export interface GoogleAuthContext {
  /**
   * OAuth access token (for user-delegated access via MCP)
   */
  accessToken?: string;
  
  /**
   * Service account credentials (for server-to-server access via REST API)
   */
  serviceAccountCredentials?: any; // Using GoogleServiceAccountCredentials from parent types.ts
}

/**
 * User's request to convert a Google Drive document to markdown
 */
export interface ConversionRequest {
  /**
   * Google Drive document URL or document ID
   * Supports formats:
   * - https://docs.google.com/document/d/{id}/edit
   * - https://docs.google.com/document/u/0/d/{id}/mobilebasic
   * - {documentId} (bare ID)
   */
  url: string;
}

/**
 * Final conversion result returned to user
 */
export interface ConversionResult {
  /**
   * Converted markdown content
   */
  markdown: string;
  
  /**
   * Conversion warnings (if any)
   */
  warnings: string[];
}
