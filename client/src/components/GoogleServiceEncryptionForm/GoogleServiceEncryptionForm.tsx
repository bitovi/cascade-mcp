import { useState } from 'react';

interface EncryptionResult {
  encrypted: string;
  clientEmail: string;
  projectId: string;
}

export function GoogleServiceEncryptionForm() {
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [result, setResult] = useState<EncryptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEncrypting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/google-service-encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serviceAccountJson }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Encryption failed');
      }

      // Parse JSON response
      const data = await response.json();
      
      // Parse the service account to get email and project
      const parsed = JSON.parse(serviceAccountJson);
      
      setResult({
        encrypted: data.encrypted,
        clientEmail: data.clientEmail,
        projectId: data.projectId,
      });
      setServiceAccountJson(''); // Clear the form
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    
    try {
      await navigator.clipboard.writeText(result.encrypted);
      alert('✅ Copied to clipboard!');
    } catch {
      alert('❌ Failed to copy. Please select and copy manually.');
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setServiceAccountJson('');
  };

  if (result) {
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
              <span className="text-gray-600 font-mono">{result.clientEmail}</span>
              <span className="font-semibold text-gray-700">Project ID:</span>
              <span className="text-gray-600 font-mono">{result.projectId}</span>
              <span className="font-semibold text-gray-700">Encryption:</span>
              <span className="text-gray-600 font-mono">RSA-OAEP with SHA-256 (4096-bit key)</span>
            </div>
          </div>

          <h4 className="text-base font-semibold text-gray-800 mb-2">📋 Encrypted Credentials</h4>
          <p className="text-sm text-gray-600 mb-3">Copy this encrypted string and store it safely:</p>
          <textarea
            readOnly
            value={result.encrypted}
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
              onClick={handleReset}
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
            
            <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">Store in environment variable</h5>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-xs">
{`# .env file
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:...

# Your Google Doc tools will automatically use this encrypted credential`}
            </pre>
            
            <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">Pass to Google Doc conversion tools</h5>
            <p className="text-sm text-gray-600">
              Use this encrypted string wherever Google service account credentials are needed for converting Google Docs to Markdown.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
          <h3 className="font-semibold text-yellow-900 mb-1">⚠️ Security Note</h3>
          <p className="text-sm text-yellow-800">
            This page encrypts your credentials using RSA asymmetric encryption. The encrypted output is safe to store in config files, environment variables, or version control.
          </p>
        </div>
        
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
          <p className="text-sm text-blue-900">
            📝 Paste your Google service account JSON below (typically named <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">google.json</code>). We'll encrypt it and give you a string you can use with Google Doc conversion tools.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <label htmlFor="serviceAccountJson" className="block font-medium text-gray-700 mb-2">
          Service Account JSON:
        </label>
        <textarea
          id="serviceAccountJson"
          value={serviceAccountJson}
          onChange={(e) => setServiceAccountJson(e.target.value)}
          rows={18}
          placeholder={`Paste your service account JSON here...

Example:
{
  "type": "service_account",
  "project_id": "my-project-123",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",
  "client_email": "my-service@my-project.iam.gserviceaccount.com",
  ...
}`}
          required
          disabled={isEncrypting}
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        
        {error && (
          <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-sm text-red-900 font-mono">{error}</p>
          </div>
        )}
        
        <button
          type="submit"
          disabled={isEncrypting || !serviceAccountJson.trim()}
          className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isEncrypting ? '🔄 Encrypting...' : '🔒 Encrypt Credentials'}
        </button>
      </form>
    </div>
  );
}
