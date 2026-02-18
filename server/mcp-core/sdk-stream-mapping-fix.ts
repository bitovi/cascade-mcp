/**
 * SDK Stream Mapping Fix
 * 
 * Workaround for an MCP SDK bug in WebStandardStreamableHTTPServerTransport.replayEvents()
 * where the ReadableStream's cancel() callback doesn't remove entries from _streamMapping.
 * 
 * BUG: When a browser disconnects (refresh/close), the SSE ReadableStream gets cancelled
 * via the internal [[CancelSteps]] algorithm. The standalone GET handler and POST response
 * handler both properly call _streamMapping.delete() in their cancel() callbacks, but
 * replayEvents() has an empty cancel() callback. This leaves ghost entries in _streamMapping
 * that cause 409 Conflict on subsequent reconnection attempts.
 * 
 * FIX: Before handling GET requests, we proactively clean up stale _streamMapping entries
 * so the SDK's conflict check passes.
 * 
 * This workaround accesses SDK internals (_webStandardTransport._streamMapping) and should
 * be removed when the SDK fixes the bug upstream.
 * 
 * @see https://github.com/modelcontextprotocol/typescript-sdk — check for fix in replayEvents()
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Clean up stale SSE stream mappings from the transport's internal state.
 * 
 * When a browser refreshes, the SSE connection drops but the mapping entry persists,
 * causing 409 Conflict responses on subsequent reconnections via resumeStream().
 * 
 * This function should be called before delegating GET requests to the SDK transport.
 * 
 * @param transport - The StreamableHTTPServerTransport to clean up
 * @param lastEventId - The Last-Event-ID header value, if present
 */
export function cleanupStaleStreamMappings(
  transport: StreamableHTTPServerTransport,
  lastEventId: string | undefined
): void {
  // Access internal WebStandard transport's _streamMapping
  const webTransport = (transport as any)._webStandardTransport;
  if (!webTransport?._streamMapping || !(webTransport._streamMapping instanceof Map)) {
    return;
  }

  const streamMapping = webTransport._streamMapping as Map<string, { cleanup: () => void }>;
  if (streamMapping.size === 0) {
    return;
  }

  if (lastEventId) {
    // Derive streamId from event ID format: "{streamId}_{sequenceNumber}"
    const lastUnderscore = lastEventId.lastIndexOf('_');
    if (lastUnderscore > 0) {
      const streamId = lastEventId.substring(0, lastUnderscore);
      const existing = streamMapping.get(streamId);
      if (existing) {
        console.log(`  🧹 Cleaning up stale replay stream before reconnection: ${streamId}`);
        try { existing.cleanup(); } catch { /* controller may already be closed */ }
      }
    }
  }

  // Also clean up standalone GET stream if present — when a new GET arrives,
  // any existing standalone stream is stale (browser disconnected)
  const standaloneKey = '_GET_stream';
  const standaloneStream = streamMapping.get(standaloneKey);
  if (standaloneStream) {
    console.log('  🧹 Cleaning up stale standalone SSE stream before reconnection');
    try { standaloneStream.cleanup(); } catch { /* controller may already be closed */ }
  }
}
