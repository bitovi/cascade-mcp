/**
 * Connection Panel Component
 * 
 * UI for connecting to the MCP server with OAuth authentication.
 */

import { useState } from 'react';
import type { ConnectionStatus } from '../../lib/mcp-client/index.js';

interface ConnectionPanelProps {
  status: ConnectionStatus;
  onConnect: (anthropicKey: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onRefreshTokens?: () => Promise<{ success: boolean; providers: string[]; error?: string }>;
}

export function ConnectionPanel({
  status,
  onConnect,
  onDisconnect,
  onRefreshTokens,
}: ConnectionPanelProps) {
  const [anthropicKey, setAnthropicKey] = useState(
    () => localStorage.getItem('mcp_anthropic_key') || ''
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ success: boolean; providers: string[]; error?: string } | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect(anthropicKey);
    } catch (error) {
      // Error is handled by the hook
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await onDisconnect();
  };

  const handleRefreshTokens = async () => {
    if (!onRefreshTokens) return;
    
    setIsRefreshing(true);
    setRefreshResult(null);
    try {
      const result = await onRefreshTokens();
      setRefreshResult(result);
      // Auto-clear result after 5 seconds
      setTimeout(() => setRefreshResult(null), 5000);
    } catch (error) {
      setRefreshResult({ success: false, providers: [], error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAnthropicKeyChange = (value: string) => {
    setAnthropicKey(value);
    // Store in localStorage for persistence across refreshes
    if (value) {
      localStorage.setItem('mcp_anthropic_key', value);
    } else {
      localStorage.removeItem('mcp_anthropic_key');
    }
  };

  const isConnected = status === 'connected';
  const isLoading = status === 'connecting' || status === 'authorizing' || status === 'reconnecting' || isConnecting;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Connection</h2>
      
      <div className="space-y-4">
        {/* Anthropic API Key */}
        <div>
          <label htmlFor="anthropic-key" className="block text-sm font-medium text-gray-700 mb-1">
            Anthropic API Key
            <span className="text-gray-500 font-normal ml-1">(optional - for sampling)</span>
          </label>
          <input
            id="anthropic-key"
            type="password"
            value={anthropicKey}
            onChange={(e) => handleAnthropicKeyChange(e.target.value)}
            disabled={isConnected}
            placeholder="sk-ant-..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Only needed if tools require LLM sampling. Stored locally in your browser. It's best practice to give a short lived API key.
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'connected'
                ? 'bg-green-500'
                : status === 'error'
                ? 'bg-red-500'
                : status === 'connecting' || status === 'authorizing'
                ? 'bg-yellow-500 animate-pulse'
                : status === 'reconnecting'
                ? 'bg-blue-500 animate-pulse'
                : 'bg-gray-300'
            }`}
          />
          <span className="text-sm text-gray-600">
            {status === 'connected' && 'Connected'}
            {status === 'connecting' && 'Connecting...'}
            {status === 'authorizing' && 'Authorizing...'}
            {status === 'reconnecting' && 'Reconnecting to session...'}
            {status === 'disconnected' && 'Disconnected'}
            {status === 'error' && 'Error connecting'}
          </span>
        </div>

        {/* Connect/Disconnect/Refresh Buttons */}
        <div className="flex gap-2 flex-wrap">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Disconnect
              </button>
              {onRefreshTokens && (
                <button
                  onClick={handleRefreshTokens}
                  disabled={isRefreshing}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed transition-colors"
                  title="Test refresh token flow - refreshes both Atlassian and Figma tokens"
                >
                  {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Tokens'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Refresh Result Display */}
        {refreshResult && (
          <div className={`p-3 rounded-md text-sm ${
            refreshResult.success 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {refreshResult.success ? (
              <span>
                ✅ Tokens refreshed successfully!
                {refreshResult.providers.length > 0 && (
                  <span className="ml-1">
                    Providers: <strong>{refreshResult.providers.join(', ')}</strong>
                  </span>
                )}
              </span>
            ) : (
              <span>❌ Refresh failed: {refreshResult.error}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
