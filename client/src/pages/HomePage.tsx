import { useState, useEffect } from 'react';
import { ConnectionPanel } from '../components/ConnectionPanel/ConnectionPanel';
import { ToolSelector } from '../components/ToolSelector/ToolSelector';
import { ToolForm } from '../components/ToolForm/ToolForm';
import { ProgressLog } from '../components/ProgressLog/ProgressLog';
import { ResultDisplay } from '../components/ResultDisplay/ResultDisplay';
import { useConfig } from '../hooks/useConfig';
import { useMcpClient } from '../hooks/useMcpClient';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readUrlParams, findToolByKebabName, updateUrlWithTool } from '../lib/url-params';

export function HomePage() {
  const { loading: configLoading } = useConfig();
  const { state, tools, logs, connect, disconnect, callTool, setAnthropicKey, refreshTokens } = useMcpClient();

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingToolSelection, setPendingToolSelection] = useState<string | null>(null);
  const [lastUrlTool, setLastUrlTool] = useState<string | null>(null);

  // Read URL and set pending if it's a new tool (handles mount + OAuth callback timing)
  useEffect(() => {
    if (state.status === 'connected' && !pendingToolSelection) {
      const urlParams = readUrlParams();
      // Only set pending if URL tool is different from what we last attempted
      if (urlParams.tool && urlParams.tool !== lastUrlTool) {
        console.log('[HomePage] New tool in URL:', urlParams.tool);
        setPendingToolSelection(urlParams.tool);
        setLastUrlTool(urlParams.tool);
      }
    }
  }, [state.status, pendingToolSelection, lastUrlTool]);

  // Auto-select tool after connection if pending tool name exists (US1)
  useEffect(() => {
    if (state.status === 'connected' && pendingToolSelection && tools.length > 0) {
      console.log('[HomePage] Attempting to auto-select tool:', pendingToolSelection);
      console.log('[HomePage] Available tools:', tools.map(t => t.name));
      const tool = findToolByKebabName(pendingToolSelection, tools);
      if (tool) {
        console.log('[HomePage] Tool found, selecting:', tool.name);
        setSelectedTool(tool);
      } else {
        console.log('[HomePage] Tool not found - may require OAuth authentication');
      }
      // Clear pending selection whether found or not (single attempt)
      setPendingToolSelection(null);
    }
  }, [state.status, pendingToolSelection, tools]);

  // Update URL when tool selection changes (US3: Manual Tool Selection Updates URL)
  useEffect(() => {
    // Only update URL after connection is established and a tool is selected
    if (state.status === 'connected' && selectedTool) {
      console.log('[HomePage] Updating URL with tool:', selectedTool.name);
      updateUrlWithTool(selectedTool.name);
    }
    // Note: We NEVER remove the tool parameter from the URL
  }, [selectedTool, state.status]);

  if (configLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const handleConnect = async (anthropicKey: string) => {
    setResult(null);
    setError(undefined);
    // Reset last URL tool to allow auto-selection on connect/reconnect
    setLastUrlTool(null);
    if (anthropicKey) {
      setAnthropicKey(anthropicKey);
    }
    await connect(window.location.origin);
  };

  const handleDisconnect = async () => {
    // Don't clear selectedTool - preserve it for US4 (reconnect after expiration)
    // URL parameter should stay intact
    setResult(null);
    setError(undefined);
    await disconnect();
  };

  const handleToolSelect = (tool: Tool | null) => {
    setSelectedTool(tool);
    setResult(null);
    setError(undefined);
  };

  const handleExecute = async (args: Record<string, unknown>) => {
    if (!selectedTool) return;

    setIsExecuting(true);
    setResult(null);
    setError(undefined);

    try {
      const toolResult = await callTool(selectedTool.name, args);
      setResult(toolResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      <ConnectionPanel
        status={state.status}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onRefreshTokens={refreshTokens}
      />

      {state.status === 'connected' && (
        <ToolSelector tools={tools} selectedTool={selectedTool} onSelect={handleToolSelect} />
      )}

      {state.status === 'connected' && selectedTool && (
        <ToolForm tool={selectedTool} onExecute={handleExecute} isExecuting={isExecuting} />
      )}

      <ResultDisplay result={result} error={error} toolName={selectedTool?.name} />

      <ProgressLog logs={logs} />
    </>
  );
}
