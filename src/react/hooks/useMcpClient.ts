/**
 * React Hook for MCP Client
 * 
 * Provides a React-friendly interface to the BrowserMcpClient.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  BrowserMcpClient, 
  AnthropicSamplingProvider,
  type ConnectionState,
  type ConnectionStatus,
} from '../../mcp-client/index.js';
import type { Tool, ServerNotification } from '@modelcontextprotocol/sdk/types.js';

export interface UseMcpClientOptions {
  /** Anthropic API key for sampling */
  anthropicApiKey?: string;
}

export interface UseMcpClientReturn {
  /** Current connection state */
  state: ConnectionState;
  /** Available tools (after connection) */
  tools: Tool[];
  /** Log messages from notifications */
  logs: LogEntry[];
  /** Connect to an MCP server */
  connect: (serverUrl: string) => Promise<void>;
  /** Disconnect from the server */
  disconnect: () => Promise<void>;
  /** Call a tool */
  callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  /** Set Anthropic API key */
  setAnthropicKey: (key: string) => void;
  /** Clear logs */
  clearLogs: () => void;
  /** Refresh OAuth tokens (for testing refresh flow) */
  refreshTokens: () => Promise<{ success: boolean; providers: string[]; error?: string }>;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'debug' | 'warning' | 'error';
  message: string;
}

/**
 * Hook to manage MCP client connection and state
 */
export function useMcpClient(options: UseMcpClientOptions = {}): UseMcpClientReturn {
  const clientRef = useRef<BrowserMcpClient | null>(null);
  const [state, setState] = useState<ConnectionState>({ status: 'disconnected' });
  const [tools, setTools] = useState<Tool[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [anthropicKey, setAnthropicKeyState] = useState(options.anthropicApiKey || '');
  
  // Track if we've already started OAuth callback handling (prevents React Strict Mode double-run)
  const oauthHandledRef = useRef(false);

  // Initialize client on mount
  useEffect(() => {
    console.log('[useMcpClient] 🚀 Hook initializing...');
    console.log('[useMcpClient]   Current URL:', window.location.href);
    console.log('[useMcpClient]   Search params:', window.location.search);
    
    clientRef.current = new BrowserMcpClient();
    
    // Set up status change handler
    const unsubscribe = clientRef.current.onStatusChange((newState) => {
      console.log('[useMcpClient] 📊 Status changed:', newState);
      setState(newState);
    });

    // Set up notification handler
    const unsubNotif = clientRef.current.onNotification((notification) => {
      handleNotification(notification);
    });

    // Check for OAuth callback on mount
    const hasCallback = BrowserMcpClient.hasOAuthCallback();
    console.log('[useMcpClient] 🔍 Has OAuth callback?', hasCallback);
    console.log('[useMcpClient]   URL search params:', window.location.search);
    console.log('[useMcpClient]   All localStorage keys:', Object.keys(localStorage).filter(k => k.startsWith('mcp_')));
    
    // Prevent duplicate handling in React Strict Mode
    if (hasCallback && oauthHandledRef.current) {
      console.log('[useMcpClient] ⏭️ OAuth callback already being handled, skipping...');
      return () => {
        unsubscribe();
        unsubNotif();
      };
    }
    
    if (hasCallback) {
      oauthHandledRef.current = true;
      
      // Get stored server URL and reconnect
      const storedUrl = localStorage.getItem('mcp_pending_server_url');
      console.log('[useMcpClient] 📦 Stored server URL:', storedUrl);
      
      if (storedUrl) {
        console.log('[useMcpClient] ✅ Found stored URL, will auto-connect');
        // Don't remove until after successful connection
        // Auto-reconnect after OAuth callback
        console.log('[useMcpClient] ⏳ Will auto-connect in 100ms...');
        setTimeout(() => {
          console.log('[useMcpClient] 🔄 Auto-connecting to:', storedUrl);
          if (clientRef.current) {
            clientRef.current.connect(storedUrl).then(() => {
              console.log('[useMcpClient] 🎉 Auto-connect succeeded!');
              localStorage.removeItem('mcp_pending_server_url');
              // Fetch tools after successful connection
              return clientRef.current!.listTools();
            }).then((toolList) => {
              console.log('[useMcpClient] 📋 Got tools:', toolList.length);
              setTools(toolList);
            }).catch((err) => {
              console.error('[useMcpClient] ❌ Auto-connect failed:', err);
            });
          }
        }, 100);
      } else {
        console.log('[useMcpClient] ⚠️ No stored URL found for OAuth callback!');
        console.log('[useMcpClient]   localStorage contents:', JSON.stringify(Object.fromEntries(
          Object.keys(localStorage).filter(k => k.startsWith('mcp_')).map(k => [k, localStorage.getItem(k)?.substring(0, 50)])
        )));
      }
    } else {
      console.log('[useMcpClient] ℹ️ No OAuth callback detected');
      
      // Check if we have stored tokens and can auto-reconnect
      const storedUrl = localStorage.getItem('mcp_last_server_url');
      if (storedUrl && !oauthHandledRef.current) {
        oauthHandledRef.current = true;
        console.log('[useMcpClient] 🔑 Found stored server URL, attempting auto-reconnect:', storedUrl);
        setTimeout(() => {
          if (clientRef.current) {
            clientRef.current.connect(storedUrl).then(() => {
              console.log('[useMcpClient] 🎉 Auto-reconnect succeeded!');
              return clientRef.current!.listTools();
            }).then((toolList) => {
              console.log('[useMcpClient] 📋 Got tools:', toolList.length);
              setTools(toolList);
            }).catch((err) => {
              console.error('[useMcpClient] ❌ Auto-reconnect failed:', err);
              // Clear stored URL if reconnect fails (likely token expired)
              // localStorage.removeItem('mcp_last_server_url');
            });
          }
        }, 100);
      }
    }

    return () => {
      unsubscribe();
      unsubNotif();
      clientRef.current?.disconnect();
    };
  }, []);

  // Update sampling provider when API key changes
  useEffect(() => {
    if (clientRef.current && anthropicKey) {
      clientRef.current.setSamplingProvider(
        new AnthropicSamplingProvider(anthropicKey)
      );
    }
  }, [anthropicKey]);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
    }]);
  }, []);

  const handleNotification = useCallback((notification: ServerNotification) => {
    // Handle different notification types
    if (notification.method === 'notifications/message') {
      const params = notification.params as { level?: string; data?: string };
      const level = (params.level || 'info') as LogEntry['level'];
      const message = params.data || JSON.stringify(params);
      addLog(level, message);
    } else if (notification.method === 'notifications/progress') {
      const params = notification.params as { 
        progressToken?: string; 
        progress?: number; 
        total?: number;
        message?: string;
      };
      const msg = params.message || `Progress: ${params.progress}/${params.total}`;
      addLog('info', msg);
    } else {
      // Log unknown notifications
      addLog('debug', `Notification: ${notification.method}`);
    }
  }, [addLog]);

  const connect = useCallback(async (serverUrl: string) => {
    console.log('[useMcpClient] 🔌 connect() called with:', serverUrl);
    
    if (!clientRef.current) {
      console.log('[useMcpClient] ❌ No client ref!');
      return;
    }

    // Store server URL for OAuth callback and auto-reconnect
    console.log('[useMcpClient] 💾 Storing server URL in localStorage');
    localStorage.setItem('mcp_pending_server_url', serverUrl);

    try {
      addLog('info', `Connecting to ${serverUrl}...`);
      
      // Set sampling provider if we have an API key
      if (anthropicKey) {
        clientRef.current.setSamplingProvider(
          new AnthropicSamplingProvider(anthropicKey)
        );
      }

      await clientRef.current.connect(serverUrl);
      
      // If we get here, we're connected (not redirected)
      addLog('info', 'Connected! Fetching tools...');
      
      const toolList = await clientRef.current.listTools();
      setTools(toolList);
      addLog('info', `Found ${toolList.length} tools`);
      
      // Save as last successful server URL for auto-reconnect, clean up pending
      localStorage.setItem('mcp_last_server_url', serverUrl);
      localStorage.removeItem('mcp_pending_server_url');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      addLog('error', message);
      throw error;
    }
  }, [anthropicKey, addLog]);

  const disconnect = useCallback(async () => {
    if (!clientRef.current) return;
    
    await clientRef.current.disconnect();
    setTools([]);
    
    // Clear stored OAuth tokens and server URL to prevent auto-reconnect
    clientRef.current.clearTokens();
    localStorage.removeItem('mcp_last_server_url');
    localStorage.removeItem('mcp_pending_server_url');
    
    addLog('info', 'Disconnected');
  }, [addLog]);

  const callTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    if (!clientRef.current) {
      throw new Error('Not connected');
    }

    addLog('info', `Calling tool: ${name}`);
    
    try {
      const result = await clientRef.current.callTool(name, args);
      addLog('info', `Tool ${name} completed`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool call failed';
      addLog('error', `Tool ${name} failed: ${message}`);
      throw error;
    }
  }, [addLog]);

  const setAnthropicKey = useCallback((key: string) => {
    setAnthropicKeyState(key);
    // Store in localStorage for persistence across page reloads
    if (key) {
      localStorage.setItem('mcp_anthropic_key', key);
    } else {
      localStorage.removeItem('mcp_anthropic_key');
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const refreshTokens = useCallback(async () => {
    if (!clientRef.current) {
      return { success: false, providers: [], error: 'Not connected' };
    }

    addLog('info', '🔄 Refreshing OAuth tokens...');
    
    try {
      const result = await clientRef.current.refreshTokens();
      
      if (result.success) {
        const providersStr = result.providers.length > 0 
          ? result.providers.join(', ') 
          : 'unknown';
        addLog('info', `✅ Token refresh successful! Providers: ${providersStr}`);
      } else {
        addLog('error', `❌ Token refresh failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      addLog('error', `❌ Token refresh error: ${message}`);
      return { success: false, providers: [], error: message };
    }
  }, [addLog]);

  // Load stored API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('mcp_anthropic_key');
    if (storedKey && !anthropicKey) {
      setAnthropicKeyState(storedKey);
    }
  }, []);

  return {
    state,
    tools,
    logs,
    connect,
    disconnect,
    callTool,
    setAnthropicKey,
    clearLogs,
    refreshTokens,
  };
}
