import { GoogleServiceEncryptionForm } from '../components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm';

export function GoogleServiceEncryptPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">🔐 Google Service Account Encryption</h1>
        <p className="text-gray-600">Encrypt your Google service account credentials for secure storage</p>
      </div>
      <GoogleServiceEncryptionForm />
    </>
  );
}
