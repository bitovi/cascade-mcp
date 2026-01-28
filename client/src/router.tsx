import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { GoogleServiceEncryptPage } from './pages/GoogleServiceEncryptPage';

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/google-service-encrypt" element={<GoogleServiceEncryptPage />} />
      </Routes>
    </BrowserRouter>
  );
}
