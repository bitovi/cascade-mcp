import { useState, useEffect } from 'react';

export interface AppConfig {
  baseUrl: string;
}

/**
 * Hook to get runtime configuration from the server.
 * In development, the baseUrl comes from the Vite proxy (same origin).
 * In production, the server provides the actual URL via /api/config.
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`);
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        // Fallback to current origin if config endpoint fails
        console.warn('Failed to fetch config, using current origin:', err);
        setConfig({ baseUrl: window.location.origin });
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  return { config, loading, error };
}
