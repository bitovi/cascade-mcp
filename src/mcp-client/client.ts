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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'authorizing' | 'connected' | 'error';

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

      // Clean up URL after OAuth callback
      if (BrowserMcpClient.hasOAuthCallback()) {
        console.log('[BrowserMcpClient] 🧹 Cleaning up URL...');
        window.history.replaceState({}, '', window.location.pathname);
      }

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

      // Create MCP client with sampling capability
      this.client = new Client(
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
      // The SDK's typed handlers are complex, so we use a general approach
      (this.client as any).fallbackNotificationHandler = (notification: ServerNotification) => {
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
        this.setupSamplingHandler();
      }

      // Connect to server
      await this.client.connect(this.transport);
      
      this.setStatus('connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus('error', message);
      throw error;
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
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.client = null;
    this.setStatus('disconnected');
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
   * Call a tool on the server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const result = await this.client.callTool({ name, arguments: args });
    return result as CallToolResult;
  }

  /**
   * Clear stored OAuth tokens (logout)
   */
  clearTokens(): void {
    this.oauthProvider?.clearAll();
  }
}
