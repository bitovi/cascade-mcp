import { useState } from 'react';

interface EncryptionResultProps {
  encrypted: string;
  onReset: () => void;
}

export function EncryptionResult({ 
  encrypted,
  onReset 
}: EncryptionResultProps) {
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
          <p className="text-sm text-gray-700 mb-2">
            Your data has been encrypted using RSA-OAEP with SHA-256 (4096-bit key)
          </p>
        </div>

        <h4 className="text-base font-semibold text-gray-800 mb-2">📋 Encrypted Data</h4>
        <p className="text-sm text-gray-600 mb-3">Copy this encrypted string and use it securely:</p>
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
    </div>
  );
}
