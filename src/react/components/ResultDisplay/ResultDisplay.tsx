/**
 * Result Display Component
 * 
 * Shows the result of a tool execution with proper formatting.
 * Handles JSON, text, and error results.
 */

interface ResultDisplayProps {
  result: unknown;
  error?: string;
  toolName?: string;
}

export function ResultDisplay({ result, error, toolName }: ResultDisplayProps) {
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          {toolName ? `Result: ${toolName}` : 'Result'}
        </h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-red-500 text-lg">⚠️</span>
            <div>
              <p className="font-medium text-red-700">Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result === undefined || result === null) {
    return null;
  }

  // Format the result based on its type
  const formatResult = (value: unknown): string => {
    if (typeof value === 'string') {
      // Try to parse as JSON for pretty printing
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, null, 2);
  };

  const formattedResult = formatResult(result);
  const isJson = formattedResult.startsWith('{') || formattedResult.startsWith('[');

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        {toolName ? `Result: ${toolName}` : 'Result'}
      </h2>
      
      <div className={`rounded-lg border ${isJson ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'}`}>
        <pre className={`p-4 overflow-x-auto text-sm ${isJson ? 'font-mono text-gray-700' : 'text-green-700 whitespace-pre-wrap'}`}>
          {formattedResult}
        </pre>
      </div>
    </div>
  );
}
