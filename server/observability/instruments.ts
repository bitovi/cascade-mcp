import * as Sentry from '@sentry/node';
// Temporarily disabled profiling due to native module dependency issue
// import { nodeProfilingIntegration } from '@sentry/profiling-node';

interface SentryConfig {
  dsn: string | undefined;
  integrations: Array<any>;
  tracesSampleRate: number;
  enabled: boolean;
  environment: string | undefined;
}

const sentryConfig: SentryConfig = {
  dsn: process.env.BACKEND_SENTRY_DSN,
  integrations: [], // nodeProfilingIntegration() disabled
  tracesSampleRate: 1.0,
  enabled: !!process.env.BACKEND_SENTRY_DSN,
  environment: process.env.VITE_STATUS_REPORTS_ENV,
};

Sentry.init(sentryConfig);

// Sentry.profiler.startProfiler(); // disabled
