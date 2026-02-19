/**
 * Browser MCP Client
 * 
 * Wraps the MCP SDK Client for browser environments with OAuth authentication
 * and sampling support.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { 
  CallToolResult,
  Tool,
  ServerNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { BrowserOAuthClientProvider } from './oauth/provider.js';
import type { SamplingProvider } from './sampling/types.js';

/** Default timeout for MCP tool calls (10 minutes for large Figma files) */
const DEFAULT_TOOL_TIMEOUT_MS = 10 * 60 * 1000;

/** localStorage keys for reconnection state */
const LS_SESSION_ID = 'mcp_session_id';
const LS_LAST_EVENT_ID = 'mcp_last_event_id';
const LS_SERVER_URL = 'mcp_server_url';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'reconnecting' | 'authorizing' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  serverUrl?: string;
}

export type NotificationHandler = (notification: ServerNotification) => void;
export type StatusChangeHandler = (state: ConnectionState) => void;

/**
 * Browser-based MCP Client with OAuth and Sampling support
 */
export class BrowserMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private oauthProvider: BrowserOAuthClientProvider | null = null;
  private samplingProvider: SamplingProvider | null = null;
  private notificationHandlers: NotificationHandler[] = [];
  private statusChangeHandlers: StatusChangeHandler[] = [];
  private connectionState: ConnectionState = { status: 'disconnected' };

  /**
   * Set the sampling provider for handling LLM requests
   */
  setSamplingProvider(provider: SamplingProvider): void {
    this.samplingProvider = provider;
  }

  /**
   * Register a notification handler
   */
  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const index = this.notificationHandlers.indexOf(handler);
      if (index >= 0) {
        this.notificationHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a status change handler
   */
  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusChangeHandlers.push(handler);
    // Immediately call with current state
    handler(this.connectionState);
    return () => {
      const index = this.statusChangeHandlers.indexOf(handler);
      if (index >= 0) {
        this.statusChangeHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Update connection state and notify handlers
   */
  private setStatus(status: ConnectionStatus, error?: string, serverUrl?: string): void {
    this.connectionState = { 
      status, 
      error, 
      serverUrl: serverUrl || this.connectionState.serverUrl 
    };
    for (const handler of this.statusChangeHandlers) {
      handler(this.connectionState);
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if we're returning from an OAuth redirect
   */
  static hasOAuthCallback(): boolean {
    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has('code');
    const hasError = params.has('error');
    console.log('[BrowserMcpClient] 🔍 hasOAuthCallback check:', { 
      hasCode, 
      hasError, 
      code: params.get('code')?.substring(0, 20) + '...',
      search: window.location.search.substring(0, 100)
    });
    return hasCode || hasError;
  }

  /**
   * Check if there is reconnection state saved from a previous session.
   * Returns the saved state if available, or null otherwise.
   */
  static getSavedReconnectionState(): { sessionId: string; lastEventId: string; serverUrl: string } | null {
    const sessionId = localStorage.getItem(LS_SESSION_ID);
    const lastEventId = localStorage.getItem(LS_LAST_EVENT_ID);
    const serverUrl = localStorage.getItem(LS_SERVER_URL);
    if (sessionId && serverUrl) {
      return { sessionId, lastEventId: lastEventId || '', serverUrl };
    }
    return null;
  }

  /**
   * Clear saved reconnection state from localStorage
   */
  static clearReconnectionState(): void {
    localStorage.removeItem(LS_SESSION_ID);
    localStorage.removeItem(LS_LAST_EVENT_ID);
    // Keep mcp_server_url — used by the hook for auto-connect convenience
  }

  /**
   * Set up a new MCP Client with notification and sampling handlers.
   * Shared between connect() and reconnect() flows.
   */
  private setupClientAndHandlers(): Client {
    const client = new Client(
      { 
        name: 'cascade-mcp-browser-client', 
        version: '1.0.0' 
      },
      { 
        capabilities: { 
          sampling: {} // Declare we support sampling
        } 
      }
    );

    // Set up notification handler - use fallback for all notifications
    (client as any).fallbackNotificationHandler = (notification: ServerNotification) => {
      for (const handler of this.notificationHandlers) {
        try {
          handler(notification);
        } catch (e) {
          console.error('Notification handler error:', e);
        }
      }
    };

    // Set up sampling request handler if provider is configured
    if (this.samplingProvider) {
      this.client = client; // Temporarily set for setupSamplingHandler
      this.setupSamplingHandler();
    }

    return client;
  }

  /**
   * Persist reconnection state to localStorage.
   * Called after connect and on every resumption token update.
   */
  private persistReconnectionState(serverUrl: string): void {
    if (this.transport?.sessionId) {
      localStorage.setItem(LS_SESSION_ID, this.transport.sessionId);
    }
    localStorage.setItem(LS_SERVER_URL, serverUrl);
  }

  /**
   * Connect to an MCP server with OAuth authentication
   */
  async connect(serverUrl: string): Promise<void> {
    console.log('[BrowserMcpClient] 🔌 connect() called:', serverUrl);
    
    try {
      this.setStatus('connecting', undefined, serverUrl);
      
      // Reuse existing OAuth provider if it's for the same server, or create new one
      // This is critical for OAuth callback handling - we need the same provider instance
      // that saved the code_verifier before the redirect
      if (!this.oauthProvider || this.oauthProvider.serverUrl !== serverUrl) {
        console.log('[BrowserMcpClient] 📦 Creating NEW OAuth provider...');
        this.oauthProvider = new BrowserOAuthClientProvider(serverUrl);
      } else {
        console.log('[BrowserMcpClient] ♻️ Reusing existing OAuth provider');
      }
      
      // Check if we already have tokens
      const existingTokens = this.oauthProvider.tokens();
      console.log('[BrowserMcpClient] 🎫 Existing tokens?', !!existingTokens);
      
      // Check if we're returning from OAuth callback with an authorization code
      const urlParams = new URLSearchParams(window.location.search);
      const authorizationCode = urlParams.get('code');
      
      if (authorizationCode) {
        console.log('[BrowserMcpClient] 🎟️ Found authorization code in URL:', authorizationCode.substring(0, 10) + '...');
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      // Attempt OAuth authentication
      this.setStatus('authorizing');
      console.log('[BrowserMcpClient] 🔐 Calling auth()...', authorizationCode ? 'with code' : 'without code');
      const authResult = await auth(this.oauthProvider, { 
        serverUrl,
        authorizationCode: authorizationCode || undefined  // Pass the code if we have it!
      });
      console.log('[BrowserMcpClient] ✅ auth() returned:', authResult);
      
      if (authResult !== 'AUTHORIZED') {
        // User will be redirected to OAuth provider
        // Status will remain 'authorizing' until redirect completes
        console.log('[BrowserMcpClient] ↪️ Redirecting for OAuth...');
        return;
      }

      console.log('[BrowserMcpClient] 🎉 AUTHORIZED! Proceeding to connect...');

      // Create transport with auth headers
      const tokens = await this.oauthProvider.tokens();
      console.log('[BrowserMcpClient] 🎫 Got tokens:', { 
        hasAccessToken: !!tokens?.access_token,
        tokenPreview: tokens?.access_token?.substring(0, 20) + '...'
      });
      
      this.transport = new StreamableHTTPClientTransport(
        new URL('/mcp', serverUrl),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${tokens?.access_token}`,
            },
          },
        }
      );

      // Create MCP client with handlers
      this.client = this.setupClientAndHandlers();

      // Connect to server
      await this.client.connect(this.transport);

      // Persist reconnection state continuously
      this.persistReconnectionState(serverUrl);
      
      this.setStatus('connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus('error', message);
      throw error;
    }
  }

  /**
   * Reconnect to an existing MCP session after a browser refresh.
   * Uses only standards-based SDK APIs:
   *  - sessionId on transport constructor (tells SDK to skip initialize)
   *  - resumeStream(lastEventId) to replay missed SSE events
   *  - onresumptiontoken for continuous event ID tracking
   * 
   * @param options.sessionId - The session ID to reconnect to (from getSavedReconnectionState)
   * @param options.lastEventId - The last SSE event ID received (for replay)
   * @returns true if reconnection succeeded, false if session was invalid
   */
  async reconnect(serverUrl: string, options?: { sessionId?: string; lastEventId?: string }): Promise<boolean> {
    // Accept params directly (preferred — avoids localStorage race with React Strict Mode cleanup)
    // or fall back to reading localStorage
    const sessionId = options?.sessionId || localStorage.getItem(LS_SESSION_ID);
    const lastEventId = options?.lastEventId || localStorage.getItem(LS_LAST_EVENT_ID);
    
    if (!sessionId) {
      console.log('[BrowserMcpClient] ❌ reconnect() — no saved sessionId');
      return false;
    }

    console.log('[BrowserMcpClient] 🔄 reconnect() called:', { serverUrl, sessionId, lastEventId });

    try {
      this.setStatus('reconnecting', undefined, serverUrl);

      // Reuse or create OAuth provider
      if (!this.oauthProvider || this.oauthProvider.serverUrl !== serverUrl) {
        this.oauthProvider = new BrowserOAuthClientProvider(serverUrl);
      }

      // Get auth token
      const tokens = this.oauthProvider.tokens();
      if (!tokens?.access_token) {
        console.log('[BrowserMcpClient] ❌ reconnect() — no OAuth tokens available');
        return false;
      }

      // Create transport with stored sessionId — tells SDK this is a reconnection
      this.transport = new StreamableHTTPClientTransport(
        new URL('/mcp', serverUrl),
        {
          sessionId,
          requestInit: {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          },
        }
      );

      // Create fresh client with handlers
      this.client = this.setupClientAndHandlers();

      // Connect — SDK sees transport.sessionId is set
      // The SDK may send initialize (server handles by recreating transport)
      await this.client.connect(this.transport);
      console.log('[BrowserMcpClient] ✅ Reconnected. Transport sessionId:', this.transport.sessionId);

      // Wrap onmessage to intercept replayed tool results.
      // The reconnected client has no response handler for requests started
      // by the previous (destroyed) client, so the SDK Protocol handler would
      // silently drop any replayed JSON-RPC responses.
      const originalOnMessage = this.transport.onmessage;
      this.transport.onmessage = (message: any) => {
        // Forward replayed tool results as notifications so the UI can display them
        if ('result' in message && message.id !== undefined) {
          console.log('[BrowserMcpClient] 📦 Captured replayed tool result (id=' + message.id + ')');
          // Emit the result content as a notification so the hook can log it
          const content = message.result?.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                for (const handler of this.notificationHandlers) {
                  try {
                    handler({
                      method: 'notifications/message',
                      params: {
                        level: 'info',
                        data: `[Recovered result] ${item.text}`,
                      },
                    } as ServerNotification);
                  } catch (e) {
                    console.error('Notification handler error on recovered result:', e);
                  }
                }
              }
            }
          }
        }
        originalOnMessage?.call(this.transport, message);
      };

      // Resume SSE stream with Last-Event-ID to get replayed + remaining events
      if (lastEventId) {
        console.log('[BrowserMcpClient] 🔄 Resuming stream from:', lastEventId);
        await this.transport.resumeStream(lastEventId, {
          onresumptiontoken: (token: string) => {
            localStorage.setItem(LS_LAST_EVENT_ID, token);
          },
        });
      } else {
        // No lastEventId — try to open a fresh GET SSE stream
        console.log('[BrowserMcpClient] 🔄 Opening fresh SSE stream (no lastEventId)');
        if (typeof (this.transport as any)._startOrAuthSse === 'function') {
          (this.transport as any)._startOrAuthSse({}).catch((err: Error) => {
            console.warn('[BrowserMcpClient] _startOrAuthSse fallback failed:', err.message);
          });
        }
      }

      // Update persisted state with potentially new sessionId
      this.persistReconnectionState(serverUrl);
      
      this.setStatus('connected');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reconnection failed';
      console.log('[BrowserMcpClient] ❌ reconnect() failed:', message);
      
      // Clear stale reconnection state — session is gone
      BrowserMcpClient.clearReconnectionState();
      
      this.setStatus('error', message);
      return false;
    }
  }

  /**
   * Set up the sampling request handler
   */
  private setupSamplingHandler(): void {
    if (!this.client || !this.samplingProvider) return;

    const provider = this.samplingProvider;
    
    // The MCP SDK will call this when server sends sampling/createMessage
    // Use 'any' for the complex Zod-inferred types
    this.client.setRequestHandler(
      CreateMessageRequestSchema,
      async (request: any) => {
        const result = await provider.createMessage(request.params);
        return result as any;
      }
    );
  }

  /**
   * Close the transport and client without clearing reconnection state.
   * Use this for React useEffect cleanup — reconnection state must survive
   * React Strict Mode remounts and page-level cleanup.
   */
  async close(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        // Transport may already be closed
      }
      this.transport = null;
    }
    this.client = null;
    this.setStatus('disconnected');
  }

  /**
   * Disconnect from the server (explicit user action).
   * Clears all reconnection state — session will not be resumed on next page load.
   */
  async disconnect(): Promise<void> {
    await this.close();
    
    // Clear reconnection state so we don't try to reconnect to a dead session
    BrowserMcpClient.clearReconnectionState();
  }

  /**
   * List available tools from the server
   */
  async listTools(): Promise<Tool[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * Call a tool on the server.
   * Automatically injects onresumptiontoken to persist SSE event IDs
   * for reconnection support.
   */
  async callTool(name: string, args: Record<string, unknown>, options?: { timeout?: number }): Promise<CallToolResult> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const timeout = options?.timeout ?? DEFAULT_TOOL_TIMEOUT_MS;
    const result = await this.client.callTool({ name, arguments: args }, undefined, {
      timeout,
      onresumptiontoken: (token: string) => {
        localStorage.setItem(LS_LAST_EVENT_ID, token);
      },
    });
    return result as CallToolResult;
  }

  /**
   * Clear stored OAuth tokens (logout)
   */
  clearTokens(): void {
    this.oauthProvider?.clearAll();
  }

  /**
   * Refresh OAuth tokens manually
   * Calls the server's /access-token endpoint with grant_type=refresh_token
   * @returns Object indicating success and which providers were refreshed
   */
  async refreshTokens(): Promise<{ success: boolean; providers: string[]; error?: string }> {
    console.log('[BrowserMcpClient] 🔄 refreshTokens() called');
    
    if (!this.oauthProvider) {
      return { success: false, providers: [], error: 'No OAuth provider configured' };
    }

    const currentTokens = this.oauthProvider.tokens();
    if (!currentTokens?.refresh_token) {
      return { success: false, providers: [], error: 'No refresh token available' };
    }

    const serverUrl = this.connectionState.serverUrl;
    if (!serverUrl) {
      return { success: false, providers: [], error: 'No server URL configured' };
    }

    try {
      console.log('[BrowserMcpClient] 🔄 Calling /access-token with refresh_token grant');
      
      // Get client info for the request
      const clientInfo = this.oauthProvider.clientInformation();
      
      const response = await fetch(new URL('/access-token', serverUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: currentTokens.refresh_token,
          client_id: clientInfo?.client_id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error_description || errorData.error || `HTTP ${response.status}`;
        console.error('[BrowserMcpClient] ❌ Token refresh failed:', errorMsg);
        return { success: false, providers: [], error: errorMsg };
      }

      const newTokens = await response.json();
      console.log('[BrowserMcpClient] ✅ Token refresh successful:', {
        hasAccessToken: !!newTokens.access_token,
        hasRefreshToken: !!newTokens.refresh_token,
        expiresIn: newTokens.expires_in,
      });

      // Save the new tokens
      this.oauthProvider.saveTokens({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_type: newTokens.token_type,
        expires_in: newTokens.expires_in,
        scope: newTokens.scope,
      });

      // Decode the JWT to see which providers were refreshed
      const providers: string[] = [];
      try {
        const payload = JSON.parse(atob(newTokens.access_token.split('.')[1]));
        providers.push(...Object.keys(payload).filter(key => {
          const value = payload[key];
          const isProvider = value && typeof value === 'object' && 'access_token' in value;
          return isProvider;
        }));
      } catch (error) {
        console.error('[BrowserMcpClient] JWT decode error:', error);
        // If we can't decode, just report success
      }

      // Update transport with new token if connected
      if (this.transport && this.client) {
        console.log('[BrowserMcpClient] 🔄 Reconnecting with new tokens...');
        // Need to recreate transport with new token
        await this.transport.close();
        this.transport = new StreamableHTTPClientTransport(
          new URL('/mcp', serverUrl),
          {
            requestInit: {
              headers: {
                'Authorization': `Bearer ${newTokens.access_token}`,
              },
            },
          }
        );
        await this.client.connect(this.transport);
      }

      return { success: true, providers };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserMcpClient] ❌ Token refresh error:', errorMsg);
      return { success: false, providers: [], error: errorMsg };
    }
  }
}
