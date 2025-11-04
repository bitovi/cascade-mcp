/**
 * Debug helpers for OAuth flow troubleshooting
 */

/**
 * Log environment comparison between local and staging
 * Call this at server startup
 */
export function logEnvironmentInfo() {
    console.log(`\n========== ENVIRONMENT INFO ==========`);
    console.log(`Node version: ${process.version}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Port: ${process.env.PORT || 3000}`);
    console.log(`\n--- OAuth Configuration ---`);
    console.log(`VITE_AUTH_SERVER_URL: ${process.env.VITE_AUTH_SERVER_URL || 'not set'}`);
    console.log(`VITE_JIRA_CLIENT_ID: ${process.env.VITE_JIRA_CLIENT_ID ? process.env.VITE_JIRA_CLIENT_ID.substring(0, 10) + '... (length: ' + process.env.VITE_JIRA_CLIENT_ID.length + ')' : 'NOT SET'}`);
    console.log(`JIRA_CLIENT_SECRET: ${process.env.JIRA_CLIENT_SECRET ? 'present (length: ' + process.env.JIRA_CLIENT_SECRET.length + ')' : 'NOT SET'}`);
    console.log(`VITE_JIRA_SCOPE: ${process.env.VITE_JIRA_SCOPE || 'not set, will use default'}`);
    console.log(`\n--- Session Configuration ---`);
    console.log(`SESSION_SECRET: ${process.env.SESSION_SECRET ? 'present (length: ' + process.env.SESSION_SECRET.length + ')' : 'NOT SET (using default)'}`);
    console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'present (length: ' + process.env.JWT_SECRET.length + ')' : 'NOT SET (using default)'}`);
    console.log(`========== ENVIRONMENT INFO END ==========\n`);
}

/**
 * Mask sensitive data in strings for logging
 */
export function maskSensitive(value: string | undefined, showLength: number = 10): string {
    if (!value) return 'NOT SET';
    if (value.length <= showLength) return value; // Don't mask if too short
    return `${value.substring(0, showLength)}... (length: ${value.length})`;
}

/**
 * Log a clear separator for debugging
 */
export function logSeparator(title: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'='.repeat(60)}\n`);
}

/**
 * Compare two values and log if they're different
 */
export function compareAndLog(label: string, expected: any, actual: any) {
    if (expected !== actual) {
        console.log(`⚠️  MISMATCH: ${label}`);
        console.log(`   Expected: ${expected}`);
        console.log(`   Actual: ${actual}`);
        return false;
    } else {
        console.log(`✓ ${label}: ${actual}`);
        return true;
    }
}
