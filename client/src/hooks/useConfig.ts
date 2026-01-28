import { useState, useEffect } from 'react';

export interface AppConfig {
  baseUrl: string;
}

/**
 * Hook to get runtime configuration from the server.
 * 
 * In development (Vite dev server), we always use window.location.origin
 * so that MCP client requests go through the Vite proxy and avoid CORS issues.
 * 
 * In production, we fetch the server's baseUrl via /api/config since the
 * client and server are served from the same origin.
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        // In development mode (Vite), always use current origin to go through proxy
        // This avoids CORS issues when the backend is on a different port
        if (import.meta.env.DEV) {
          console.log('[useConfig] Development mode - using current origin for proxy');
          setConfig({ baseUrl: window.location.origin });
          return;
        }
        
        // In production, fetch config from server
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
