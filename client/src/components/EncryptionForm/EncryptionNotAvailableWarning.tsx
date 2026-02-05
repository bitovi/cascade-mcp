interface EncryptionNotAvailableWarningProps {
  message: string;
}

export function EncryptionNotAvailableWarning({ message }: EncryptionNotAvailableWarningProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-red-300 p-6">
      <div className="bg-red-50 border-l-4 border-red-500 p-4">
        <h3 className="font-semibold text-red-900 mb-2">🔒 Encryption Not Available</h3>
        <p className="text-sm text-red-800 mb-3">
          {message}
        </p>
        <div className="bg-red-100 rounded-md p-3 mt-3">
          <p className="text-xs text-red-900 font-semibold mb-2">To enable encryption:</p>
          <ol className="text-xs text-red-900 space-y-1 ml-4 list-decimal">
            <li>Run <code className="bg-red-200 px-1 py-0.5 rounded">./scripts/generate-rsa-keys.sh</code> to generate keys</li>
            <li>Copy the base64-encoded keys to your <code className="bg-red-200 px-1 py-0.5 rounded">.env</code> file</li>
            <li>Set <code className="bg-red-200 px-1 py-0.5 rounded">RSA_PUBLIC_KEY</code> and <code className="bg-red-200 px-1 py-0.5 rounded">RSA_PRIVATE_KEY</code></li>
            <li>Restart the server</li>
          </ol>
          <p className="text-xs text-red-900 mt-2">
            See <code className="bg-red-200 px-1 py-0.5 rounded">docs/encryption-setup.md</code> for key setup and <code className="bg-red-200 px-1 py-0.5 rounded">docs/google-drive-setup.md</code> for Google credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
