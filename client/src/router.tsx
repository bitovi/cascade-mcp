import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header/Header';
import { Footer } from './components/Footer/Footer';
import { HomePage } from './pages/HomePage';
import { GoogleServiceEncryptPage } from './pages/GoogleServiceEncryptPage';
import { useConfig } from './hooks/useConfig';

export function Router() {
  const { config } = useConfig();
  const baseUrl = config?.baseUrl || window.location.origin;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/google-service-encrypt" element={<GoogleServiceEncryptPage />} />
            </Routes>
          </div>
        </main>
        <Footer baseUrl={baseUrl} />
      </div>
    </BrowserRouter>
  );
}
