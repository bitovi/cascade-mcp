/**
 * Figma API Client Factory
 * 
 * Creates a pre-configured client for making Figma API requests.
 * The access token is captured in the closure, eliminating the need to
 * pass authentication context through function parameters.
 * 
 * Usage:
 *   const client = createFigmaClient(accessToken);
 *   const response = await client.fetch(url, options);
 */

import type {
  FigmaComment,
  FigmaCommentsResponse,
  PostCommentRequest,
  PostCommentResponse,
} from './figma-comment-types';

/**
 * Figma API Client interface
 * 
 * Provides methods for making authenticated requests to Figma API.
 * All methods have the access token pre-configured via closure.
 */
export interface FigmaClient {
  /**
   * Make an authenticated fetch request to Figma API
   * @param url - The full URL to fetch
   * @param options - Standard fetch options (method, body, etc.)
   * @returns Promise resolving to fetch Response
   */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  
  /**
   * Get the base API URL for Figma
   * @returns Base URL for Figma REST API
   */
  getBaseUrl: () => string;

  /**
   * Fetch all comments for a Figma file
   * @param fileKey - The Figma file key
   * @returns Promise resolving to array of comments
   * @throws Error if API request fails
   */
  fetchComments: (fileKey: string) => Promise<FigmaComment[]>;

  /**
   * Post a comment to a Figma file
   * @param fileKey - The Figma file key
   * @param request - Comment content and optional position
   * @returns Promise resolving to the created comment
   * @throws Error if API request fails (e.g., missing file_comments:write scope)
   */
  postComment: (fileKey: string, request: PostCommentRequest) => Promise<FigmaComment>;

  /**
   * Delete a comment from a Figma file
   * @param fileKey - The Figma file key
   * @param commentId - The ID of the comment to delete
   * @returns Promise resolving when comment is deleted
   * @throws Error if API request fails (e.g., missing file_comments:write scope)
   */
  deleteComment: (fileKey: string, commentId: string) => Promise<void>;
}

/**
 * Create a Figma API client with pre-configured authentication
 * 
 * @param accessToken - Figma personal access token or OAuth token
 * @returns FigmaClient with token captured in closure
 * 
 * @example
 * ```typescript
 * const client = createFigmaClient(token);
 * 
 * // Fetch with auth automatically included (Authorization Bearer header)
 * const response = await client.fetch(
 *   `${client.getBaseUrl()}/files/${fileKey}/nodes?ids=${nodeId}`,
 *   { method: 'GET' }
 * );
 * ```
 * 
 * @note OAuth tokens use Authorization Bearer, PATs use X-Figma-Token
 * @see https://www.figma.com/developers/api#authentication
 */
export function createFigmaClient(accessToken: string): FigmaClient {
  const apiClient: FigmaClient = {
    fetch: async (url: string, options: RequestInit = {}) => {
      // Token is captured in this closure!
      // OAuth tokens use Authorization Bearer header (figu_ prefix)
      // PATs use X-Figma-Token header (figd_ prefix)
      const isOAuthToken = accessToken.startsWith('figu_');
      const headers = {
        ...options.headers,
        ...(isOAuthToken 
          ? { 'Authorization': `Bearer ${accessToken}` }
          : { 'X-Figma-Token': accessToken }
        ),
      };
      
      return fetch(url, {
        ...options,
        headers,
      });
    },
    
    getBaseUrl: () => {
      return 'https://api.figma.com/v1';
    },

    fetchComments: async (fileKey: string): Promise<FigmaComment[]> => {
      const baseUrl = 'https://api.figma.com/v1';
      const url = `${baseUrl}/files/${fileKey}/comments`;

      const response = await apiClient.fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 403) {
          // Check if it's a scope issue
          console.warn('⚠️  Figma comments fetch failed (403). Token may lack file_comments:read scope.');
          throw new Error(`Cannot access Figma comments. Check file permissions or OAuth scope (file_comments:read). Status: 403`);
        }
        throw new Error(`Failed to fetch Figma comments: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as FigmaCommentsResponse;
      return data.comments;
    },

    postComment: async (fileKey: string, request: PostCommentRequest): Promise<FigmaComment> => {
      const baseUrl = 'https://api.figma.com/v1';
      const url = `${baseUrl}/files/${fileKey}/comments`;

      const response = await apiClient.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 403) {
          throw new Error(`Missing Figma scope: file_comments:write. Please re-authorize with the required scope to post comments.`);
        }
        if (response.status === 429) {
          // Rate limit - include Retry-After header info if available
          const retryAfter = response.headers.get('Retry-After');
          throw new Error(`Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : ''} Status: 429`);
        }
        throw new Error(`Failed to post Figma comment: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as { id: string; message: string; user: { handle: string; img_url: string }; created_at: string };
      
      // Return the created comment
      return {
        id: data.id,
        message: data.message,
        user: data.user,
        created_at: data.created_at,
        client_meta: request.client_meta,
      };
    },

    deleteComment: async (fileKey: string, commentId: string): Promise<void> => {
      const baseUrl = 'https://api.figma.com/v1';
      const url = `${baseUrl}/files/${fileKey}/comments/${commentId}`;

      const response = await apiClient.fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 403) {
          throw new Error(`Missing Figma scope: file_comments:write. Please re-authorize with the required scope to delete comments.`);
        }
        if (response.status === 404) {
          throw new Error(`Comment not found: ${commentId}`);
        }
        if (response.status === 429) {
          // Rate limit - include Retry-After header info if available
          const retryAfter = response.headers.get('Retry-After');
          throw new Error(`Rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : ''} Status: 429`);
        }
        throw new Error(`Failed to delete Figma comment: ${response.status} ${errorText}`);
      }
    },
  };

  return apiClient;
}
