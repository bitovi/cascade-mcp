import { useState } from 'react';
import { ConnectionPanel } from '../components/ConnectionPanel/ConnectionPanel';
import { ToolSelector } from '../components/ToolSelector/ToolSelector';
import { ToolForm } from '../components/ToolForm/ToolForm';
import { ProgressLog } from '../components/ProgressLog/ProgressLog';
import { ResultDisplay } from '../components/ResultDisplay/ResultDisplay';
import { useConfig } from '../hooks/useConfig';
import { useMcpClient } from '../hooks/useMcpClient';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function HomePage() {
  const { loading: configLoading } = useConfig();
  const { state, tools, logs, connect, disconnect, callTool, setAnthropicKey, refreshTokens } = useMcpClient();

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | undefined>(undefined);

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
    setSelectedTool(null);
    if (anthropicKey) {
      setAnthropicKey(anthropicKey);
    }
    await connect(window.location.origin);
  };

  const handleDisconnect = async () => {
    setSelectedTool(null);
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
