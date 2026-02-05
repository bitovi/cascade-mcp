import { useState, useEffect } from 'react';
import { EncryptionResult } from './EncryptionResult';
import { EncryptionNotAvailableWarning } from './EncryptionNotAvailableWarning';

interface EncryptionResult {
  encrypted: string;
}

interface EncryptionStatus {
  enabled: boolean;
  message: string;
}

interface PublicKeyResponse {
  publicKey: string;
}

export function EncryptionForm() {
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [result, setResult] = useState<EncryptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);

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
      // Client-side size validation (50KB = 51200 bytes)
      const sizeInBytes = new Blob([serviceAccountJson]).size;
      if (sizeInBytes > 51200) {
        throw new Error('Data exceeds 50KB size limit. Please reduce the size of your input.');
      }

      const response = await fetch('/encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: serviceAccountJson }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Encryption failed');
      }

      // Parse JSON response
      const data = await response.json();
      
      setResult({
        encrypted: data.encrypted,
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
      <EncryptionResult
        encrypted={result.encrypted}
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

      {/* Collapsible Details Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${showDetails ? 'rounded-t-lg' : 'rounded-lg'}`}
        >
          <span className="font-medium text-gray-700">ℹ️ Additional Information</span>
          <span className="text-gray-500">{showDetails ? '▲' : '▼'}</span>
        </button>
        
        {showDetails && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
            {/* Provider-Specific Requirements */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
              <h3 className="font-semibold text-blue-900 mb-1">Provider Requirements</h3>
              <p className="text-sm text-blue-800">
                This tool encrypts any sensitive data (API keys, credentials, configuration files). 
                Some API endpoints may only accept specific encrypted formats (e.g., <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">X-Google-Token</code> for Google service accounts).
                Check your endpoint's documentation for requirements.
              </p>
            </div>

            {/* Security Note */}
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
              <h3 className="font-semibold text-yellow-900 mb-1">⚠️ Security Note</h3>
              <p className="text-sm text-yellow-800">
                This page encrypts your credentials using RSA asymmetric encryption. The encrypted output is safe to store in config files and environment variables.
              </p>
            </div>

            {/* Public Key Section */}
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
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <label htmlFor="serviceAccountJson" className="block font-medium text-gray-700 mb-2">
          Data to Encrypt:
        </label>
        <textarea
          id="serviceAccountJson"
          value={serviceAccountJson}
          onChange={(e) => setServiceAccountJson(e.target.value)}
          rows={18}
          placeholder={`Paste your sensitive data here (max 50KB)...

Examples:
- API keys: "sk-1234567890abcdefg..."
- Service account JSON: {"type": "service_account", "project_id": "..."}
- Configuration: {"db_password": "secret", "api_key": "..."}
- Any UTF-8 text under 50KB`}
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
          {isEncrypting ? '🔄 Encrypting...' : '🔒 Encrypt Data'}
        </button>
      </form>
    </div>
  );
}
