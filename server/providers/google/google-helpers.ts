/**
 * Google Drive API interaction helpers
 * Reusable functions for Google Drive API calls
 */

import type { GoogleClient } from './google-api-client.js';
import type { DriveAboutResponse } from './types.js';

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
