/**
 * Tool Selector Component
 * 
 * Dropdown to select a tool from the available tools list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ToolSelectorProps {
  tools: Tool[];
  selectedTool: Tool | null;
  onSelect: (tool: Tool | null) => void;
}

export function ToolSelector({ tools, selectedTool, onSelect }: ToolSelectorProps) {
  if (tools.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Tools</h2>
        <p className="text-gray-500">No tools available. Connect to a server first.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Tools</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="tool-select" className="block text-sm font-medium text-gray-700 mb-1">
            Select a Tool
          </label>
          <select
            id="tool-select"
            value={selectedTool?.name || ''}
            onChange={(e) => {
              const tool = tools.find((t) => t.name === e.target.value) || null;
              onSelect(tool);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select a tool --</option>
            {tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTool && (
          <div className="bg-gray-50 rounded p-4">
            <h3 className="font-medium text-gray-800 mb-2">{selectedTool.name}</h3>
            <p className="text-sm text-gray-600">{selectedTool.description || 'No description'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
