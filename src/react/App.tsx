import { useState } from 'react';
import { Footer } from './components/Footer/Footer';
import { ConnectionPanel } from './components/ConnectionPanel/ConnectionPanel';
import { ToolSelector } from './components/ToolSelector/ToolSelector';
import { ToolForm } from './components/ToolForm/ToolForm';
import { ProgressLog } from './components/ProgressLog/ProgressLog';
import { ResultDisplay } from './components/ResultDisplay/ResultDisplay';
import { useConfig } from './hooks/useConfig';
import { useMcpClient } from './hooks/useMcpClient';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export default function App() {
  const { config, loading: configLoading } = useConfig();
  const {
    state,
    tools,
    logs,
    connect,
    disconnect,
    callTool,
    setAnthropicKey,
    refreshTokens,
  } = useMcpClient();

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

  const baseUrl = config?.baseUrl || window.location.origin;

  const handleConnect = async (anthropicKey: string) => {
    setResult(null);
    setError(undefined);
    setSelectedTool(null);
    // Set API key before connecting
    if (anthropicKey) {
      setAnthropicKey(anthropicKey);
    }
    // Always connect to our MCP server
    await connect(baseUrl);
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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">
            🚀 CascadeMCP Mini Client
          </h1>
          <p className="text-gray-500 text-sm">
            Browser-based MCP client for testing tools and sampling.{' '}
            <a 
              href="https://bitovi.atlassian.net/wiki/spaces/AIEnabledDevelopment/pages/1695776776/Cascading+v3+Writing+stories+from+Figma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Read the guide for the Jira automation setup
            </a>.
          </p>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Connection Panel */}
          <ConnectionPanel
            status={state.status}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onRefreshTokens={refreshTokens}
          />

          {/* Tool Selection - only show when connected */}
          {state.status === 'connected' && (
            <ToolSelector
              tools={tools}
              selectedTool={selectedTool}
              onSelect={handleToolSelect}
            />
          )}

          {/* Tool Form - only show when tool selected */}
          {state.status === 'connected' && selectedTool && (
            <ToolForm
              tool={selectedTool}
              onExecute={handleExecute}
              isExecuting={isExecuting}
            />
          )}

          {/* Result Display */}
          <ResultDisplay
            result={result}
            error={error}
            toolName={selectedTool?.name}
          />

          {/* Progress Log - always visible */}
          <ProgressLog logs={logs} />
        </div>
      </main>

      <Footer baseUrl={baseUrl} />
    </div>
  );
}
