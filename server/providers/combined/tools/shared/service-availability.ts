/**
 * Service Availability Message Helpers
 * 
 * Shared utilities for formatting service availability messages
 * used by various tools to report which integrations are connected.
 */

/**
 * Format a service availability message based on which clients are available.
 * 
 * @param options - Object indicating which services are available
 * @returns Human-readable service list string like "Connected to Atlassian, Figma, and Google Drive"
 * 
 * @example
 * // All services
 * formatServiceAvailabilityMessage({ atlassian: true, figma: true, google: true })
 * // => "Connected to Atlassian, Figma, and Google Drive"
 * 
 * @example
 * // Atlassian only
 * formatServiceAvailabilityMessage({ atlassian: true, figma: false, google: false })
 * // => "Connected to Atlassian"
 * 
 * @example
 * // Figma required (write-shell-stories pattern)
 * formatServiceAvailabilityMessage({ atlassian: true, figma: true, google: false })
 * // => "Connected to Figma and Atlassian"
 */
export function formatServiceAvailabilityMessage(options: {
  atlassian?: boolean;
  figma?: boolean;
  google?: boolean;
}): string {
  const { atlassian = true, figma = false, google = false } = options;
  
  const services: string[] = [];
  
  // Order: Figma first (for tools that require it), then Atlassian, then Google Drive
  if (figma) {
    services.push('Figma');
  }
  if (atlassian) {
    services.push('Atlassian');
  }
  if (google) {
    services.push('Google Drive');
  }
  
  if (services.length === 0) {
    return 'No services connected';
  } else if (services.length === 1) {
    return `Connected to ${services[0]}`;
  } else if (services.length === 2) {
    return `Connected to ${services[0]} and ${services[1]}`;
  } else {
    // Oxford comma for 3+ items
    return `Connected to ${services.slice(0, -1).join(', ')}, and ${services[services.length - 1]}`;
  }
}
