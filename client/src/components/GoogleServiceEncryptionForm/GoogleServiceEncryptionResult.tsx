interface GoogleServiceEncryptionResultProps {
  encrypted: string;
  clientEmail: string;
  projectId: string;
  onReset: () => void;
}

export function GoogleServiceEncryptionResult({ 
  encrypted, 
  clientEmail, 
  projectId, 
  onReset 
}: GoogleServiceEncryptionResultProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(encrypted);
      alert('✅ Copied to clipboard!');
    } catch {
      alert('❌ Failed to copy. Please select and copy manually.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Success Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
          <h3 className="text-lg font-semibold text-green-900 mb-2">
            ✅ Encryption Successful!
          </h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold text-gray-700">Service Account:</span>
            <span className="text-gray-600 font-mono">{clientEmail}</span>
            <span className="font-semibold text-gray-700">Project ID:</span>
            <span className="text-gray-600 font-mono">{projectId}</span>
            <span className="font-semibold text-gray-700">Encryption:</span>
            <span className="text-gray-600 font-mono">RSA-OAEP with SHA-256 (4096-bit key)</span>
          </div>
        </div>

        <h4 className="text-base font-semibold text-gray-800 mb-2">📋 Encrypted Credentials</h4>
        <p className="text-sm text-gray-600 mb-3">Copy this encrypted string and store it safely:</p>
        <textarea
          readOnly
          value={encrypted}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs bg-gray-50 resize-vertical"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            📋 Copy to Clipboard
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
          >
            🔒 Encrypt Another
          </button>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="bg-gray-50 rounded-md p-5">
          <h4 className="text-base font-semibold text-gray-800 mb-3">💡 How to Use</h4>
          
          <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">Pass in REST API headers</h5>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-xs">
{`# Use in Jira automations, scripts, or API calls
X-Google-Token: RSA-ENCRYPTED:...

# Example: curl request
curl -X POST https://your-server.com/api/write-shell-stories \\
  -H "X-Atlassian-Token: your-jira-token" \\
  -H "X-Google-Token: RSA-ENCRYPTED:..." \\
  -H "Content-Type: application/json"`}
          </pre>
        </div>
      </div>
    </div>
  );
}
