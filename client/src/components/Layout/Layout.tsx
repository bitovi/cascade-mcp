import { ReactNode } from 'react';
import { Header } from '../Header/Header';
import { Footer } from '../Footer/Footer';
import { useConfig } from '../../hooks/useConfig';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { config } = useConfig();
  const baseUrl = config?.baseUrl || window.location.origin;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
      <Footer baseUrl={baseUrl} />
    </div>
  );
}
