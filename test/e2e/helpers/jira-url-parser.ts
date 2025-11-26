/**
 * Parse Jira URLs to extract epic key and site name
 */

export interface ParsedJiraUrl {
  epicKey: string;
  siteName: string;
}

/**
 * Parse a Jira URL to extract the epic key and site name
 * 
 * Supports URL format: https://{siteName}.atlassian.net/browse/{KEY}
 * 
 * @param url - Full Jira URL (e.g., "https://bitovi.atlassian.net/browse/PLAY-123")
 * @returns Object with epicKey and siteName
 * @throws Error if URL is invalid or cannot be parsed
 * 
 * @example
 * parseJiraUrl('https://bitovi.atlassian.net/browse/PLAY-123')
 * // Returns: { epicKey: 'PLAY-123', siteName: 'bitovi' }
 */
export function parseJiraUrl(url: string): ParsedJiraUrl {
  if (!url) {
    throw new Error('Jira URL is required');
  }

  // Check if this is just an epic key (PROJECT-123 format)
  const epicKeyPattern = /^[A-Z]+-\d+$/;
  if (epicKeyPattern.test(url.trim())) {
    throw new Error(
      `Plain epic key "${url}" is not supported. Please provide a full Jira URL like: https://{siteName}.atlassian.net/browse/${url}`
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  // Extract site name from hostname (e.g., "bitovi" from "bitovi.atlassian.net")
  const hostname = parsedUrl.hostname;
  const atlassianNetMatch = hostname.match(/^([^.]+)\.atlassian\.net$/);
  
  if (!atlassianNetMatch) {
    throw new Error(
      `Could not extract site name from hostname: ${hostname}. Expected format: {siteName}.atlassian.net`
    );
  }

  const siteName = atlassianNetMatch[1];

  // Extract epic key from path (e.g., "PLAY-123" from "/browse/PLAY-123")
  const pathMatch = parsedUrl.pathname.match(/\/browse\/([A-Z]+-\d+)/);
  
  if (!pathMatch) {
    throw new Error(
      `Could not extract epic key from path: ${parsedUrl.pathname}. Expected format: /browse/{PROJECT-123}`
    );
  }

  const epicKey = pathMatch[1];

  return { epicKey, siteName };
}
