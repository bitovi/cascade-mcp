/**
 * Progress Log Component
 * 
 * Displays real-time logs and notifications from MCP operations.
 * Auto-scrolls to bottom and color-codes by log level.
 */

import { useEffect, useRef } from 'react';

export interface LogEntry {
  id?: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'warning' | 'error' | 'debug';
  message: string;
  data?: unknown;
}

interface ProgressLogProps {
  logs: LogEntry[];
  maxHeight?: string;
}

export function ProgressLog({ logs, maxHeight = '300px' }: ProgressLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return 'text-blue-600';
      case 'warn':
      case 'warning':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      case 'debug':
        return 'text-gray-500';
      default:
        return 'text-gray-700';
    }
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    const baseClasses = 'px-1.5 py-0.5 rounded text-xs font-mono uppercase';
    switch (level) {
      case 'info':
        return `${baseClasses} bg-blue-100 text-blue-700`;
      case 'warn':
      case 'warning':
        return `${baseClasses} bg-yellow-100 text-yellow-700`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-700`;
      case 'debug':
        return `${baseClasses} bg-gray-100 text-gray-600`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-700`;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Progress Log</h2>
        <p className="text-gray-500 text-sm italic">No logs yet. Connect to server and execute tools to see activity.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Progress Log</h2>
      
      <div
        ref={containerRef}
        className="bg-gray-50 rounded border border-gray-200 overflow-auto font-mono text-sm"
        style={{ maxHeight }}
      >
        {logs.map((log, index) => (
          <div
            key={index}
            className={`px-3 py-2 border-b border-gray-100 last:border-b-0 ${
              log.level === 'error' ? 'bg-red-50' : ''
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-gray-400 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className={getLevelBadge(log.level)}>
                {log.level}
              </span>
              <span className={`${getLevelColor(log.level)} break-all`}>
                {log.message}
              </span>
            </div>
            {log.data !== undefined && log.data !== null && (
              <pre className="mt-1 ml-20 text-xs text-gray-600 bg-gray-100 p-2 rounded overflow-x-auto">
                {String(typeof log.data === 'string'
                  ? log.data
                  : JSON.stringify(log.data, null, 2))}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
