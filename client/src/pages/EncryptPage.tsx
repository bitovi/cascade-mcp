import { EncryptionForm } from '../components/EncryptionForm/EncryptionForm';

export function EncryptPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">🔐 Encryption</h1>
        <p className="text-gray-600">Encrypt sensitive data (API keys, credentials, configuration files) for secure storage</p>
      </div>
      <EncryptionForm />
    </>
  );
}
