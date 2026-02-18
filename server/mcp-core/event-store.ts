/**
 * In-Memory Event Store for MCP SSE Resumability
 * 
 * Implements the SDK's EventStore interface to:
 * 1. Generate unique event IDs for every SSE event (enables debugging and tracing)
 * 2. Store events for replay when clients reconnect with Last-Event-ID
 * 
 * Event ID format: `{streamId}_{sequenceNumber}`
 * This encodes the stream origin so the server can identify which stream
 * to resume when a client sends Last-Event-ID on a GET reconnection.
 * 
 * Memory management:
 * - Events are pruned per-stream when count exceeds MAX_EVENTS_PER_STREAM
 * - Entire streams are pruned when total stream count exceeds MAX_STREAMS
 * - Old streams (by insertion order) are evicted first
 */

import type { EventStore, StreamId, EventId } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const MAX_EVENTS_PER_STREAM = 500;
const MAX_STREAMS = 100;

interface StoredEvent {
  eventId: EventId;
  streamId: StreamId;
  message: JSONRPCMessage;
  timestamp: number;
}

/**
 * In-memory event store that generates sequential event IDs per stream
 * and supports replay for resumability.
 */
export class InMemoryEventStore implements EventStore {
  // streamId → ordered list of events
  private streams = new Map<StreamId, StoredEvent[]>();
  // eventId → stored event (for fast lookup)
  private eventIndex = new Map<EventId, StoredEvent>();
  // Per-stream sequence counter
  private sequenceCounters = new Map<StreamId, number>();

  /**
   * Store an event and return a unique event ID.
   * Called by the SDK before writing each SSE event.
   */
  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const seq = (this.sequenceCounters.get(streamId) || 0) + 1;
    this.sequenceCounters.set(streamId, seq);

    const eventId: EventId = `${streamId}_${seq}`;

    const stored: StoredEvent = {
      eventId,
      streamId,
      message,
      timestamp: Date.now(),
    };

    // Store in stream list
    if (!this.streams.has(streamId)) {
      this.streams.set(streamId, []);
    }
    this.streams.get(streamId)!.push(stored);

    // Store in index
    this.eventIndex.set(eventId, stored);

    // Prune if needed
    this.pruneStreamIfNeeded(streamId);
    this.pruneOldStreamsIfNeeded();

    return eventId;
  }

  /**
   * Get the stream ID from an event ID.
   * Event ID format: `{streamId}_{seq}` — extract everything before the last underscore.
   */
  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    const stored = this.eventIndex.get(eventId);
    if (stored) {
      return stored.streamId;
    }
    // Fallback: parse from event ID format
    const lastUnderscore = eventId.lastIndexOf('_');
    if (lastUnderscore > 0) {
      return eventId.substring(0, lastUnderscore);
    }
    return undefined;
  }

  /**
   * Replay all events after the given event ID on the same stream.
   * Called by the SDK when a client reconnects with Last-Event-ID.
   */
  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const streamId = await this.getStreamIdForEventId(lastEventId);
    if (!streamId) {
      throw new Error(`Unknown event ID: ${lastEventId}`);
    }

    const events = this.streams.get(streamId);
    if (!events) {
      throw new Error(`No events found for stream: ${streamId}`);
    }

    // Find the index of the last event ID and replay everything after it
    const lastIndex = events.findIndex(e => e.eventId === lastEventId);
    if (lastIndex === -1) {
      throw new Error(`Event ID not found in stream: ${lastEventId}`);
    }

    const eventsToReplay = events.slice(lastIndex + 1);
    console.log(`  📼 Replaying ${eventsToReplay.length} events after ${lastEventId} on stream ${streamId}`);

    for (const event of eventsToReplay) {
      await send(event.eventId, event.message);
    }

    return streamId;
  }

  /**
   * Prune oldest events from a stream if it exceeds the max
   */
  private pruneStreamIfNeeded(streamId: StreamId): void {
    const events = this.streams.get(streamId);
    if (!events || events.length <= MAX_EVENTS_PER_STREAM) return;

    const toRemove = events.splice(0, events.length - MAX_EVENTS_PER_STREAM);
    for (const event of toRemove) {
      this.eventIndex.delete(event.eventId);
    }
  }

  /**
   * Prune oldest streams if total stream count exceeds the max
   */
  private pruneOldStreamsIfNeeded(): void {
    if (this.streams.size <= MAX_STREAMS) return;

    // Map iteration order is insertion order — oldest first
    const streamsToRemove = Array.from(this.streams.keys())
      .slice(0, this.streams.size - MAX_STREAMS);

    for (const streamId of streamsToRemove) {
      const events = this.streams.get(streamId);
      if (events) {
        for (const event of events) {
          this.eventIndex.delete(event.eventId);
        }
      }
      this.streams.delete(streamId);
      this.sequenceCounters.delete(streamId);
    }
  }
}
