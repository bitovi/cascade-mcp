import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.BACKEND_SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  enabled: !!process.env.BACKEND_SENTRY_DSN,
  environment: process.env.VITE_STATUS_REPORTS_ENV,
});

Sentry.profiler.startProfiler();
