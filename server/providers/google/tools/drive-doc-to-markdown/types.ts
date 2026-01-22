/**
 * Type Definitions for Google Drive Document to Markdown Converter
 * 
 * Entities and interfaces for the conversion workflow:
 * - ConversionRequest: Input from user
 * - DriveDocument: Document metadata from Drive API
 * - MarkdownContent: Converted output entity
 * - ConversionResult: Response to user
 */

import type { GoogleDocMetadata } from '../../types.js';

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
 * Document metadata (simplified for external API responses)
 */
export interface DocumentMetadata {
  documentId: string;
  title: string;
  url: string;
  modifiedTime: string;
  size: number;
}

/**
 * Google Drive document with metadata and content
 * Intermediate entity during conversion workflow
 */
export interface DriveDocument {
  /**
   * Document ID (extracted from URL)
   */
  documentId: string;
  
  /**
   * Document title from Drive API
   */
  title: string;
  
  /**
   * Original Drive URL (normalized)
   */
  url: string;
  
  /**
   * MIME type from Drive API
   * Expected: "application/vnd.google-apps.document"
   */
  mimeType: string;
  
  /**
   * Last modified timestamp (ISO 8601)
   */
  modifiedTime: string;
  
  /**
   * Document size in bytes
   */
  size: number;
  
  /**
   * HTML content (exported from Drive API)
   */
  html: string;
}

/**
 * Converted markdown content with metadata
 */
export interface MarkdownContent {
  /**
   * Markdown text content
   */
  content: string;
  
  /**
   * Document metadata
   */
  metadata: DocumentMetadata;
  
  /**
   * Conversion timestamp (Unix timestamp in milliseconds)
   */
  conversionTimestamp: number;
  
  /**
   * Conversion warnings
   * Examples: "Unsupported style: ...", "Image not found: ..."
   */
  warnings: string[];
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
   * Document metadata
   */
  metadata: DocumentMetadata;
  
  /**
   * Conversion warnings (if any)
   */
  warnings: string[];
  
  /**
   * Processing time in milliseconds (for debugging)
   */
  processingTimeMs?: number;
}
