#!/usr/bin/env node

/**
 * Runner script for the Atlassian MCP Analysis Test
 * 
 * Usage:
 *   npm run atlassian-mcp-test
 *   or
 *   node specs/atlassian-mcp-analysis/run-test.js
 * 
 * Options:
 *   --duration <minutes>  Test duration in minutes (default: 60)
 *   --interval <seconds>  Interval between test cycles in seconds (default: 30)
 *   --help               Show this help message
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function showHelp() {
  console.log(`
Atlassian MCP Analysis Test Runner

This test analyzes Atlassian's official MCP server behavior, especially
with authentication issues, and logs all requests/responses for analysis.

Usage:
  node run-test.js [options]

Options:
  --duration <minutes>   Test duration in minutes (default: 60)
  --interval <seconds>   Interval between cycles in seconds (default: 30)
  --help                Show this help message

Examples:
  node run-test.js                    # Run for 1 hour with 30s intervals
  node run-test.js --duration 30      # Run for 30 minutes
  node run-test.js --duration 120 --interval 60  # Run for 2 hours with 1min intervals

The test will create a timestamped JSON log file with all interactions.
Press Ctrl+C to stop the test early.
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    duration: 60, // minutes
    interval: 30  // seconds
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      case '--duration':
        config.duration = parseInt(args[++i]);
        if (isNaN(config.duration) || config.duration <= 0) {
          console.error('Error: Duration must be a positive number');
          process.exit(1);
        }
        break;
      case '--interval':
        config.interval = parseInt(args[++i]);
        if (isNaN(config.interval) || config.interval <= 0) {
          console.error('Error: Interval must be a positive number');
          process.exit(1);
        }
        break;
      default:
        console.error(`Error: Unknown option ${args[i]}`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
  }

  return config;
}

function main() {
  const config = parseArgs();
  
  console.log('='.repeat(60));
  console.log('  ATLASSIAN MCP SERVER ANALYSIS TEST');
  console.log('='.repeat(60));
  console.log(`Duration: ${config.duration} minutes`);
  console.log(`Interval: ${config.interval} seconds between cycles`);
  console.log(`Target: https://mcp.atlassian.com/v1/sse`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Starting test... Press Ctrl+C to stop early.');
  console.log('');

  // Set environment variables for the test script
  process.env.TEST_DURATION_MINUTES = config.duration.toString();
  process.env.TEST_INTERVAL_SECONDS = config.interval.toString();

  // Run the test script
  const testScript = path.join(__dirname, 'atlassian-mcp-test.js');
  const child = spawn('node', [testScript], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', (error) => {
    console.error('Failed to start test:', error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    console.log('');
    console.log('='.repeat(60));
    console.log(`Test completed with exit code: ${code}`);
    console.log('Check the generated JSON log file for detailed results.');
    console.log('='.repeat(60));
    process.exit(code);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\nStopping test...');
    child.kill('SIGINT');
  });
}

main();
