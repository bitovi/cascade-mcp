/**
 * Read URL query parameters for form state restoration
 */

import type { UrlParamsState } from './types';

/**
 * Read URL parameters from current window location
 * @returns Object containing anthropicKey and tool parameters if present
 */
export function readUrlParams(): UrlParamsState {
  const params = new URLSearchParams(window.location.search);
  return {
    anthropicKey: params.get('anthropicKey') || undefined,
    tool: params.get('tool') || undefined,
  };
}
