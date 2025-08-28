/**
 * Atlassian Official MCP Server Analysis Test
 * 
 * This test analyzes how Atlassian's official MCP server (https://mcp.atlassian.com/v1/sse)
 * behaves, especially with unauthenticated tokens. It logs all requests and responses
 * to help understand the expected behavior for building our own MCP service.
 * 
 * The test will run for approximately 1 hour, making various requests and capturing:
 * - Authentication flows
 * - Error responses for invalid/expired tokens
 * - MCP protocol initialization
 * - Tool discovery and execution attempts
 * - SSE connection behavior
 * 
 * All interactions are logged to a timestamped file for analysis.
 */

import fs from 'fs';
import path from 'path';
import EventSource from 'eventsource';
import fetch from 'node-fetch';
import { getPkceAccessToken } from './pkce-auth.js';

// Configuration
const ATLASSIAN_MCP_URL = 'https://mcp.atlassian.com/v1/sse';
const TEST_DURATION_MS = (parseInt(process.env.TEST_DURATION_MINUTES) || 60) * 60 * 1000;
const REQUEST_INTERVAL_MS = (parseInt(process.env.TEST_INTERVAL_SECONDS) || 30) * 1000;
const LOG_FILE = `atlassian-mcp-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

// Test scenarios to run
const TEST_SCENARIOS = [
  'no_auth',
  'invalid_token',
  'expired_token',
  'malformed_token',
  'bearer_without_token',
  'query_param_auth',
  'valid_token_initialize',
  'valid_token_tools_list',
  'valid_token_sse',
  'initialization_request',
  'tools_list_request',
  'invalid_method',
  'large_payload',
  'concurrent_connections',
  'token_comparison'
];

class AtlassianMCPAnalyzer {
  constructor() {
    this.logFile = path.join(process.cwd(), 'specs', 'atlassian-mcp-analysis', LOG_FILE);
    this.logs = [];
    this.testStartTime = new Date();
    this.currentScenario = 0;
    this.isRunning = true;
    this.validToken = null;
    this.tokenExpiry = null;
    
    console.log(`Starting Atlassian MCP Analysis Test`);
    console.log(`Test duration: ${Math.round(TEST_DURATION_MS / 60000)} minutes`);
    console.log(`Logging to: ${this.logFile}`);
    console.log(`Start time: ${this.testStartTime.toISOString()}`);
  }

  log(entry) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      elapsed_ms: Date.now() - this.testStartTime.getTime(),
      ...entry
    };
    
    this.logs.push(logEntry);
    console.log(`[${timestamp}] ${entry.scenario || 'GENERAL'}: ${entry.description || 'Log entry'}`);
    
    // Write to file every 10 entries or on important events
    if (this.logs.length % 10 === 0 || entry.type === 'error' || entry.type === 'response') {
      this.writeLogsToFile();
    }
  }

  writeLogsToFile() {
    try {
      const logData = {
        test_info: {
          start_time: this.testStartTime.toISOString(),
          target_url: ATLASSIAN_MCP_URL,
          duration_planned_ms: TEST_DURATION_MS,
          scenarios: TEST_SCENARIOS,
          has_valid_token: !!this.validToken,
          token_expiry: this.tokenExpiry
        },
        logs: this.logs
      };
      
      fs.writeFileSync(this.logFile, JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('Failed to write logs to file:', error);
    }
  }

  async authenticate() {
    console.log('\n🔐 Starting OAuth authentication...');
    this.log({
      type: 'auth_start',
      description: 'Starting PKCE OAuth authentication flow'
    });

    try {
      const tokenSet = await getPkceAccessToken(ATLASSIAN_MCP_URL, {
        scope: 'read:jira-work offline_access',
        openBrowser: true
      });

      this.validToken = tokenSet.access_token;
      
      // Calculate token expiry if provided
      if (tokenSet.expires_in) {
        this.tokenExpiry = new Date(Date.now() + (tokenSet.expires_in * 1000)).toISOString();
      }

      this.log({
        type: 'auth_success',
        token_type: tokenSet.token_type,
        expires_in: tokenSet.expires_in,
        scope: tokenSet.scope,
        has_refresh_token: !!tokenSet.refresh_token,
        token_expiry: this.tokenExpiry,
        description: 'OAuth authentication successful'
      });

      console.log('✅ Authentication successful!');
      console.log(`📝 Token expires: ${this.tokenExpiry || 'Not specified'}`);
      
      return true;
    } catch (error) {
      this.log({
        type: 'auth_error',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        description: 'OAuth authentication failed'
      });

      console.log('❌ Authentication failed:', error.message);
      console.log('⚠️  Will proceed with unauthenticated tests only');
      return false;
    }
  }

  async makeRequest(scenario, options = {}) {
    const requestId = `${scenario}-${Date.now()}`;
    const startTime = Date.now();
    
    const requestData = {
      id: requestId,
      scenario,
      type: 'request',
      method: options.method || 'POST',
      url: options.url || ATLASSIAN_MCP_URL,
      headers: options.headers || {},
      body: options.body,
      description: options.description
    };
    
    this.log(requestData);
    
    try {
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body ? JSON.stringify(requestData.body) : undefined,
        timeout: 30000 // 30 second timeout
      });
      
      const responseTime = Date.now() - startTime;
      const responseText = await response.text();
      let responseBody;
      
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
      
      const responseData = {
        id: requestId,
        scenario,
        type: 'response',
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        response_time_ms: responseTime,
        description: `Response for ${scenario}`
      };
      
      this.log(responseData);
      return { response, responseData };
      
    } catch (error) {
      const errorData = {
        id: requestId,
        scenario,
        type: 'error',
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack
        },
        response_time_ms: Date.now() - startTime,
        description: `Error in ${scenario}`
      };
      
      this.log(errorData);
      return { error: errorData };
    }
  }

  async testSSEConnection(scenario, headers = {}) {
    const requestId = `${scenario}-sse-${Date.now()}`;
    
    this.log({
      id: requestId,
      scenario,
      type: 'sse_attempt',
      headers,
      description: `Attempting SSE connection for ${scenario}`
    });
    
    try {
      const eventSource = new EventSource(ATLASSIAN_MCP_URL, {
        headers,
        timeout: 30000
      });
      
      let messageCount = 0;
      const startTime = Date.now();
      
      eventSource.onopen = () => {
        this.log({
          id: requestId,
          scenario,
          type: 'sse_open',
          description: `SSE connection opened for ${scenario}`
        });
      };
      
      eventSource.onmessage = (event) => {
        messageCount++;
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          data = event.data;
        }
        
        this.log({
          id: requestId,
          scenario,
          type: 'sse_message',
          message_number: messageCount,
          event_type: event.type,
          data: data,
          description: `SSE message ${messageCount} for ${scenario}`
        });
      };
      
      eventSource.onerror = (error) => {
        this.log({
          id: requestId,
          scenario,
          type: 'sse_error',
          error: {
            readyState: eventSource.readyState,
            type: error.type,
            message: error.message
          },
          connection_duration_ms: Date.now() - startTime,
          messages_received: messageCount,
          description: `SSE error for ${scenario}`
        });
      };
      
      // Close connection after 30 seconds
      setTimeout(() => {
        eventSource.close();
        this.log({
          id: requestId,
          scenario,
          type: 'sse_closed',
          connection_duration_ms: Date.now() - startTime,
          messages_received: messageCount,
          description: `SSE connection closed for ${scenario}`
        });
      }, 30000);
      
    } catch (error) {
      this.log({
        id: requestId,
        scenario,
        type: 'sse_error',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        description: `SSE connection failed for ${scenario}`
      });
    }
  }

  // Test scenario implementations
  async testNoAuth() {
    return await this.makeRequest('no_auth', {
      description: 'Request without any authentication',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testInvalidToken() {
    return await this.makeRequest('invalid_token', {
      description: 'Request with invalid bearer token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_12345'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testExpiredToken() {
    // Generate a JWT-like token that appears valid but is expired
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
    
    return await this.makeRequest('expired_token', {
      description: 'Request with expired token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expiredToken}`
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testMalformedToken() {
    return await this.makeRequest('malformed_token', {
      description: 'Request with malformed token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not.a.valid.jwt.token'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testBearerWithoutToken() {
    return await this.makeRequest('bearer_without_token', {
      description: 'Request with Bearer header but no token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testQueryParamAuth() {
    const url = `${ATLASSIAN_MCP_URL}?token=invalid_query_token`;
    return await this.makeRequest('query_param_auth', {
      description: 'Request with token in query parameter',
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testToolsList() {
    return await this.makeRequest('tools_list_request', {
      description: 'Request to list available tools',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token'
      },
      body: {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      }
    });
  }

  async testInvalidMethod() {
    return await this.makeRequest('invalid_method', {
      description: 'Request with invalid HTTP method',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1
      }
    });
  }

  async testLargePayload() {
    const largeData = 'x'.repeat(10000); // 10KB of data
    return await this.makeRequest('large_payload', {
      description: 'Request with large payload',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          },
          largeData: largeData
        },
        id: 1
      }
    });
  }

  async testSSEScenarios() {
    // Test SSE connections with various auth scenarios
    await this.testSSEConnection('sse_no_auth');
    await this.testSSEConnection('sse_invalid_token', {
      'Authorization': 'Bearer invalid_token'
    });
    await this.testSSEConnection('sse_malformed_auth', {
      'Authorization': 'NotBearer invalid_token'
    });
    
    // Test with valid token if available
    if (this.validToken) {
      await this.testSSEConnection('sse_valid_token', {
        'Authorization': `Bearer ${this.validToken}`
      });
    }
  }

  async testValidTokenInitialize() {
    if (!this.validToken) {
      this.log({
        scenario: 'valid_token_initialize',
        type: 'skipped',
        description: 'Skipped - no valid token available'
      });
      return;
    }

    return await this.makeRequest('valid_token_initialize', {
      description: 'Initialize request with valid bearer token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.validToken}`
      },
      body: {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          },
          clientInfo: {
            name: 'atlassian-mcp-test-client',
            version: '1.0.0'
          }
        },
        id: 1
      }
    });
  }

  async testValidTokenToolsList() {
    if (!this.validToken) {
      this.log({
        scenario: 'valid_token_tools_list',
        type: 'skipped',
        description: 'Skipped - no valid token available'
      });
      return;
    }

    return await this.makeRequest('valid_token_tools_list', {
      description: 'Tools list request with valid bearer token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.validToken}`
      },
      body: {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      }
    });
  }

  async testValidTokenSSE() {
    if (!this.validToken) {
      this.log({
        scenario: 'valid_token_sse',
        type: 'skipped',
        description: 'Skipped - no valid token available'
      });
      return;
    }

    await this.testSSEConnection('valid_token_sse', {
      'Authorization': `Bearer ${this.validToken}`
    });
  }

  async testTokenComparison() {
    if (!this.validToken) {
      this.log({
        scenario: 'token_comparison',
        type: 'skipped',
        description: 'Skipped - no valid token available'
      });
      return;
    }

    // Test the same request with valid vs invalid tokens
    const testRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'comparison-test',
          version: '1.0.0'
        }
      },
      id: 99
    };

    // First with valid token
    await this.makeRequest('token_comparison_valid', {
      description: 'Comparison test with valid token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.validToken}`
      },
      body: testRequest
    });

    // Then with invalid token
    await this.makeRequest('token_comparison_invalid', {
      description: 'Comparison test with invalid token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_comparison_token'
      },
      body: testRequest
    });

    // Then with no token
    await this.makeRequest('token_comparison_none', {
      description: 'Comparison test with no token',
      headers: {
        'Content-Type': 'application/json'
      },
      body: testRequest
    });
  }

  async runTestCycle() {
    const scenarios = [
      () => this.testNoAuth(),
      () => this.testInvalidToken(),
      () => this.testExpiredToken(),
      () => this.testMalformedToken(),
      () => this.testBearerWithoutToken(),
      () => this.testQueryParamAuth(),
      () => this.testValidTokenInitialize(),
      () => this.testValidTokenToolsList(),
      () => this.testValidTokenSSE(),
      () => this.testToolsList(),
      () => this.testInvalidMethod(),
      () => this.testLargePayload(),
      () => this.testSSEScenarios(),
      () => this.testTokenComparison()
    ];

    for (const scenario of scenarios) {
      if (!this.isRunning) break;
      
      try {
        await scenario();
      } catch (error) {
        this.log({
          type: 'test_error',
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          description: 'Error running test scenario'
        });
      }
      
      // Wait between scenarios
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  async start() {
    this.log({
      type: 'test_start',
      description: 'Starting Atlassian MCP analysis test',
      target_url: ATLASSIAN_MCP_URL,
      planned_duration_ms: TEST_DURATION_MS
    });

    // Attempt authentication first
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: OAuth Authentication');
    console.log('='.repeat(60));
    
    const authSuccess = await this.authenticate();
    
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Running Test Scenarios');
    console.log('='.repeat(60));

    const endTime = Date.now() + TEST_DURATION_MS;
    let cycleCount = 0;

    while (Date.now() < endTime && this.isRunning) {
      cycleCount++;
      
      this.log({
        type: 'cycle_start',
        cycle_number: cycleCount,
        remaining_time_ms: endTime - Date.now(),
        has_valid_token: !!this.validToken,
        description: `Starting test cycle ${cycleCount}`
      });

      await this.runTestCycle();

      // Wait before next cycle
      if (Date.now() < endTime) {
        const waitTime = Math.min(REQUEST_INTERVAL_MS, endTime - Date.now());
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.log({
      type: 'test_complete',
      total_cycles: cycleCount,
      total_duration_ms: Date.now() - this.testStartTime.getTime(),
      total_log_entries: this.logs.length,
      authentication_used: !!this.validToken,
      description: 'Atlassian MCP analysis test completed'
    });

    this.writeLogsToFile();
    console.log(`\nTest completed! Results saved to: ${this.logFile}`);
    console.log(`Total cycles: ${cycleCount}`);
    console.log(`Total log entries: ${this.logs.length}`);
    console.log(`Authentication: ${this.validToken ? 'SUCCESS' : 'FAILED/SKIPPED'}`);
  }

  stop() {
    this.isRunning = false;
    this.log({
      type: 'test_stopped',
      description: 'Test stopped by user'
    });
    this.writeLogsToFile();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping test...');
  if (analyzer) {
    analyzer.stop();
  }
  process.exit(0);
});

// Start the test
const analyzer = new AtlassianMCPAnalyzer();
analyzer.start().catch(error => {
  console.error('Test failed:', error);
  analyzer.log({
    type: 'fatal_error',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    description: 'Fatal error caused test to stop'
  });
  analyzer.writeLogsToFile();
  process.exit(1);
});
