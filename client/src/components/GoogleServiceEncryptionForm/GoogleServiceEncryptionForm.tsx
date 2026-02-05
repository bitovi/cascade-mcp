import { useState, useEffect } from 'react';
import { GoogleServiceEncryptionResult } from './GoogleServiceEncryptionResult';
import { EncryptionNotAvailableWarning } from './EncryptionNotAvailableWarning';

interface EncryptionResult {
  encrypted: string;
  clientEmail: string;
  projectId: string;
}

interface EncryptionStatus {
  enabled: boolean;
  message: string;
}

interface PublicKeyResponse {
  publicKey: string;
}

export function GoogleServiceEncryptionForm() {
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [result, setResult] = useState<EncryptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    // Check encryption availability via public key endpoint
    fetch('/api/public-key')
      .then((res) => {
        if (!res.ok) {
          return res.json().then(data => {
            setEncryptionStatus({ 
              enabled: false, 
              message: data.error || 'Encryption is not enabled.' 
            });
          });
        }
        return res.json().then((keyData: PublicKeyResponse) => {
          setPublicKey(keyData.publicKey);
          setEncryptionStatus({ 
            enabled: true, 
            message: 'Encryption is available' 
          });
        });
      })
      .catch(() => setEncryptionStatus({ enabled: false, message: 'Failed to check encryption status' }))
      .finally(() => setIsCheckingStatus(false));
  }, []);

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

  const handleCopyPublicKey = async () => {
    if (!publicKey) return;
    
    try {
      await navigator.clipboard.writeText(publicKey);
      alert('✅ Public key copied to clipboard!');
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
      <GoogleServiceEncryptionResult
        encrypted={result.encrypted}
        clientEmail={result.clientEmail}
        projectId={result.projectId}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Encryption Status Warning */}
      {!isCheckingStatus && encryptionStatus && !encryptionStatus.enabled && (
        <EncryptionNotAvailableWarning message={encryptionStatus.message} />
      )}

      {/* Instructions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
          <h3 className="font-semibold text-yellow-900 mb-1">⚠️ Security Note</h3>
          <p className="text-sm text-yellow-800">
            This page encrypts your credentials using RSA asymmetric encryption. The encrypted output is safe to store in config files, environment variables, or version control.
          </p>
        </div>
        
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <p className="text-sm text-blue-900">
            📝 Paste your Google service account JSON below (typically named <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">google.json</code>). We'll encrypt it and give you a string you can use with Google Doc conversion tools.
          </p>
        </div>

        {/* Public Key Section - Only show if encryption is enabled */}
        {publicKey && (
          <div className="bg-purple-50 border-l-4 border-purple-500 p-4">
            <h4 className="font-semibold text-purple-900 mb-2">🔑 Manual Encryption</h4>
            <p className="text-sm text-purple-800 mb-3">
              Want to encrypt locally without using this form? Copy the public key and use it programmatically with your own encryption script.
            </p>
            <button
              onClick={handleCopyPublicKey}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
            >
              📋 Copy Public Key
            </button>
            <p className="text-xs text-purple-700 mt-2">
              Public key is safe to share and can only be used for encryption, not decryption.
            </p>
          </div>
        )}
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
          disabled={isEncrypting || !encryptionStatus?.enabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        
        {error && (
          <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-sm text-red-900 font-mono">{error}</p>
          </div>
        )}
        
        <button
          type="submit"
          disabled={isEncrypting || !serviceAccountJson.trim() || !encryptionStatus?.enabled}
          className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isEncrypting ? '🔄 Encrypting...' : '🔒 Encrypt Credentials'}
        </button>
      </form>
    </div>
  );
}
