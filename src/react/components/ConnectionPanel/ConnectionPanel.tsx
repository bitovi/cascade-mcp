/**
 * Connection Panel Component
 * 
 * UI for connecting to the MCP server with OAuth authentication.
 */

import { useState } from 'react';
import type { ConnectionStatus } from '../../../mcp-client/index.js';

interface ConnectionPanelProps {
  status: ConnectionStatus;
  onConnect: (anthropicKey: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export function ConnectionPanel({
  status,
  onConnect,
  onDisconnect,
}: ConnectionPanelProps) {
  const [anthropicKey, setAnthropicKey] = useState(
    () => sessionStorage.getItem('mcp_anthropic_key') || ''
  );
  const [isConnecting, setIsConnecting] = useState(false);

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

  const handleAnthropicKeyChange = (value: string) => {
    setAnthropicKey(value);
    // Store in sessionStorage for persistence
    if (value) {
      sessionStorage.setItem('mcp_anthropic_key', value);
    } else {
      sessionStorage.removeItem('mcp_anthropic_key');
    }
  };

  const isConnected = status === 'connected';
  const isLoading = status === 'connecting' || status === 'authorizing' || isConnecting;

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
                : 'bg-gray-300'
            }`}
          />
          <span className="text-sm text-gray-600">
            {status === 'connected' && 'Connected'}
            {status === 'connecting' && 'Connecting...'}
            {status === 'authorizing' && 'Authorizing...'}
            {status === 'disconnected' && 'Disconnected'}
            {status === 'error' && 'Error connecting'}
          </span>
        </div>

        {/* Connect/Disconnect Button */}
        <div className="flex gap-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
