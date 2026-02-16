import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800">
          <Link to="/" className="hover:text-blue-600 transition-colors">
            🚀 CascadeMCP Mini Client
          </Link>
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
          </a>
          .
        </p>
      </div>
    </header>
  );
}
