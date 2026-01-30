import { Footer } from '../components/Footer/Footer';
import { GoogleServiceEncryptionForm } from '../components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm';
import { useConfig } from '../hooks/useConfig';

export function GoogleServiceEncryptPage() {
  const { config } = useConfig();
  const baseUrl = config?.baseUrl || window.location.origin;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">🔐 Google Service Account Encryption</h1>
          <p className="text-gray-500 text-sm">
            Encrypt your Google service account credentials for secure storage
          </p>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <GoogleServiceEncryptionForm />
        </div>
      </main>

      <Footer baseUrl={baseUrl} />
    </div>
  );
}
