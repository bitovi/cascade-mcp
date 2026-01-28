import { Link } from 'react-router-dom';

interface FooterProps {
  baseUrl: string;
}

export function Footer({ baseUrl }: FooterProps) {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white py-6 text-sm text-gray-600">
      <div className="max-w-4xl mx-auto px-6">
        <p className="mb-4">
          <strong>CascadeMCP</strong> - MCP tools for software teams.
          <a
            href="https://github.com/bitovi/cascade-mcp"
            className="text-blue-600 hover:underline ml-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2 text-gray-800">Endpoints</h4>
            <ul className="space-y-1">
              <li>
                <a href="/mcp" className="text-blue-600 hover:underline">
                  MCP Endpoint
                </a>
                {' - '}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{baseUrl}/mcp</code>
              </li>
              <li>
                <a href="/.well-known/oauth-authorization-server" className="text-blue-600 hover:underline">
                  OAuth Server Metadata
                </a>
              </li>
              <li>
                <a href="/.well-known/oauth-protected-resource" className="text-blue-600 hover:underline">
                  Protected Resource Metadata
                </a>
              </li>
              <li>
                <a href="/get-access-token" className="text-blue-600 hover:underline">
                  Manual Token Retrieval
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2 text-gray-800">REST API</h4>
            <ul className="space-y-1">
              <li>
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">POST /api/write-shell-stories</code>
              </li>
              <li>
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">POST /api/write-next-story</code>
              </li>
              <li>
                <Link to="/google-service-encrypt" className="text-blue-600 hover:underline">
                  🔐 Encrypt Google Service Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Note: Some tools require{' '}
          <a
            href="https://modelcontextprotocol.io/specification/2025-06-18/client/sampling"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            sampling support
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
