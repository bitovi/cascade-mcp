/**
 * Atlassian MCP Token Lifecycle Test
 * 
 * This test validates the complete token lifecycle with the Atlassian MCP service:
 * 1. Authorize with Atlassian MCP service to get a token
 * 2. Use token to get tools list and call getAccessibleAtlassianResources
 * 3. Wait for token expiration and test behavior with expired token
 * 4. Try to re-initialize with expired token and test tool calls
 * 
 * Mimics the traffic logger format for consistency with analysis logs.
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { getPkceAccessToken } from './pkce-auth.js';

// Load environment variables from the main project directory
config({ path: '../../.env' });

// Configuration
const ATLASSIAN_MCP_URL = 'https://mcp.atlassian.com/v1/sse';
const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com';
const ATLASSIAN_MCP_TOKEN_URL = 'https://atlassian-remote-mcp-production.atlassian-remote-mcp-server-production.workers.dev/v1/token';
// Note: MCP dynamic registration doesn't require pre-configured client credentials
const JIRA_SCOPE = process.env.VITE_JIRA_SCOPE || 'read:jira-work write:jira-work';
const CALLBACK_URL = process.env.VITE_JIRA_CALLBACK_URL || 'http://localhost:3000/callback';
const TEST_TOKEN = process.env.TEST_TOKEN; // Manual token for now

// Test state
let results = [];
let trafficLogs = [];
let accessToken = null;
let refreshToken = null;
let actualClientId = null; // Track the actual client ID used in PKCE flow
let tokenExpirationTime = null; // Store when the token expires
let sessionId = null;
let sessionEndpoint = null;
let toolsList = null;
let sseReader = null; // Keep the SSE reader alive
let sseDecoder = null;
const startTime = new Date();
const logSessionId = startTime.toISOString().replace(/[:.]/g, '-');

// Helper function for base64 decoding (Node.js doesn't have atob)
function atob(str) {
  return Buffer.from(str, 'base64').toString('binary');
}

function generateRequestId(testName) {
  return `${testName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  if (sanitized.Authorization) {
    sanitized.Authorization = '[REDACTED - Bearer token present]';
  }
  if (sanitized.authorization) {
    sanitized.authorization = '[REDACTED - Bearer token present]';
  }
  return sanitized;
}

function logTraffic(requestId, mcpName, direction, event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    requestId,
    mcpName,
    direction,
    event,
    data
  };
  trafficLogs.push(entry);
  
  // Also write immediately to file for real-time monitoring
  const trafficFile = path.join(process.cwd(), `mcp-traffic-lifecycle-${logSessionId}.jsonl`);
  const entryLine = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(trafficFile, entryLine);
  } catch (error) {
    console.log(`⚠️  Failed to write traffic log: ${error.message}`);
  }
}

function log(test, result, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    test,
    result,
    ...details
  };
  results.push(entry);
  
  const status = result === 'PASS' ? '✅' : result === 'FAIL' ? '❌' : result === 'SKIP' ? '⏭️' : '⚠️';
  console.log(`${status} ${test}: ${details.description || result}`);
}

async function makeRequest(url, options = {}, testName = 'unknown') {
  const requestId = generateRequestId(testName);
  const mcpName = 'atlassian-mcp-official';
  
  // Log the request
  logTraffic(requestId, mcpName, 'REQUEST', 'HTTP_REQUEST', {
    method: options.method || 'POST',
    url,
    headers: sanitizeHeaders(options.headers || {}),
    body: options.body,
    isStreaming: false,
    fullHeaders: options.headers || {}
  });

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      ...options
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const responseData = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: data,
      isStreaming: false,
      contentType: response.headers.get('content-type')
    };

    // Log the response
    logTraffic(requestId, mcpName, 'RESPONSE', 'HTTP_RESPONSE', responseData);

    return {
      ...responseData,
      ok: response.ok,
      requestId
    };
  } catch (error) {
    // Log the error
    logTraffic(requestId, mcpName, 'ERROR', 'REQUEST_ERROR', {
      error: 'FETCH_ERROR',
      message: error.message,
      stack: error.stack
    });

    return {
      error: error.message,
      status: 0,
      requestId
    };
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function authorizeWithAtlassian() {
  // Check if manual token is provided first
  if (TEST_TOKEN) {
    log('authorizeWithAtlassian', 'MANUAL', {
      description: 'Using provided TEST_TOKEN for authorization',
      token_length: TEST_TOKEN.length
    });
    accessToken = TEST_TOKEN;
    console.log('🔐 Using manual TEST_TOKEN for authorization');
    return TEST_TOKEN;
  }

  try {
    log('authorizeWithAtlassian', 'INFO', {
      description: 'Starting PKCE OAuth flow with Atlassian MCP (dynamic client registration)',
      scope: JIRA_SCOPE,
      callback_url: CALLBACK_URL
    });

    console.log('🔐 Starting PKCE OAuth flow with dynamic client registration...');
    console.log(`   Scope: ${JIRA_SCOPE}`);
    console.log(`   Callback: ${CALLBACK_URL}`);

    const tokenSet = await getPkceAccessToken(ATLASSIAN_MCP_URL, {
      redirectUri: CALLBACK_URL,
      scope: JIRA_SCOPE,
      openBrowser: true
    });

    if (tokenSet.access_token) {
      accessToken = tokenSet.access_token;
      refreshToken = tokenSet.refresh_token;
      actualClientId = tokenSet.client_id; // Capture the actual client ID used
      
      // Calculate and store token expiration time
      if (tokenSet.expires_in) {
        tokenExpirationTime = Date.now() + (tokenSet.expires_in * 1000);
      }
      
      log('authorizeWithAtlassian', 'PASS', {
        description: 'Successfully obtained access token via PKCE flow',
        token_type: tokenSet.token_type,
        expires_in: tokenSet.expires_in,
        scope: tokenSet.scope,
        token_length: accessToken.length,
        has_refresh_token: !!tokenSet.refresh_token,
        actual_client_id: actualClientId,
        expiration_time: tokenExpirationTime ? new Date(tokenExpirationTime).toISOString() : null
      });

      console.log('✅ Access token obtained successfully');
      console.log(`   Actual Client ID: ${actualClientId}`);
      if (tokenSet.expires_in) {
        console.log(`   Token expires in: ${tokenSet.expires_in} seconds`);
        if (tokenExpirationTime) {
          console.log(`   Token expires at: ${new Date(tokenExpirationTime).toISOString()}`);
        }
      }
      
      return accessToken;
    } else {
      log('authorizeWithAtlassian', 'FAIL', {
        description: 'PKCE flow completed but no access token received',
        token_set: tokenSet
      });
      return null;
    }

  } catch (error) {
    log('authorizeWithAtlassian', 'FAIL', {
      description: 'PKCE OAuth flow failed',
      error: error.message,
      stack: error.stack
    });
    
    console.error('❌ PKCE OAuth flow failed:', error.message);
    console.log('\n💡 You can also use a manual token by setting TEST_TOKEN environment variable');
    return null;
  }
}

async function initializeMCP() {
  if (!accessToken) {
    log('initializeMCP', 'SKIP', {
      description: 'No access token available'
    });
    return null;
  }

  try {
    // Step 1: Establish SSE connection to get session endpoint
    log('initializeMCP', 'START', {
      description: 'Establishing SSE connection to get session endpoint'
    });
    
    const requestId = generateRequestId('sse-establish');
    
    logTraffic(requestId, 'atlassian-mcp-official', 'REQUEST', 'HTTP_REQUEST', {
      method: 'GET',
      url: ATLASSIAN_MCP_URL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      isStreaming: true
    });

    const sseResponse = await fetch(ATLASSIAN_MCP_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });

    logTraffic(requestId, 'atlassian-mcp-official', 'RESPONSE', 'HTTP_RESPONSE', {
      status: sseResponse.status,
      statusText: sseResponse.statusText,
      headers: Object.fromEntries(sseResponse.headers.entries()),
      isStreaming: true,
      contentType: sseResponse.headers.get('content-type')
    });

    if (!sseResponse.ok) {
      log('initializeMCP', 'FAIL', {
        description: 'Failed to establish SSE connection',
        status: sseResponse.status,
        statusText: sseResponse.statusText
      });
      return null;
    }

    // Step 2: Parse SSE stream to get session endpoint (using built-in fetch ReadableStream)
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();
    
    // Store the reader and decoder globally so we can use them later
    sseReader = reader;
    sseDecoder = decoder;
    
    // Read the first SSE chunk to get the endpoint
    const { value } = await reader.read();
    const chunk = decoder.decode(value);
    
    logTraffic(requestId, 'atlassian-mcp-official', 'STREAM_CHUNK', 'STREAM_DATA', {
      chunkNumber: 1,
      chunkSize: chunk.length,
      content: chunk,
      isSSE: true
    });
    
    // Look for endpoint in SSE data
    const endpointMatch = chunk.match(/event: endpoint\ndata: (.+)/);
    if (endpointMatch) {
      const rawEndpoint = endpointMatch[1].trim();
      
      // Convert relative path to absolute URL
      if (rawEndpoint.startsWith('/')) {
        const baseUrl = new URL(ATLASSIAN_MCP_URL);
        sessionEndpoint = `${baseUrl.protocol}//${baseUrl.host}${rawEndpoint}`;
      } else {
        sessionEndpoint = rawEndpoint;
      }
      
      log('initializeMCP', 'SSE_ENDPOINT', {
        description: 'Received session endpoint from SSE',
        raw_endpoint: rawEndpoint,
        full_endpoint: sessionEndpoint
      });
    }

    // DO NOT close the SSE reader - we need it for subsequent responses
    // reader.releaseLock(); // REMOVED - keep it alive for tools list responses

    if (!sessionEndpoint) {
      log('initializeMCP', 'FAIL', {
        description: 'No session endpoint received from SSE stream',
        sse_chunk: chunk
      });
      return null;
    }

    // Step 3: Send initialize message to session endpoint
    const initRequestId = generateRequestId('initializeMCP');
    const initializePayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
          elicitation: {}
        },
        clientInfo: {
          name: 'Token Lifecycle Test',
          version: '1.0.0'
        }
      }
    };

    logTraffic(initRequestId, 'atlassian-mcp-official', 'REQUEST', 'HTTP_REQUEST', {
      method: 'POST',
      url: sessionEndpoint,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: initializePayload,
      isStreaming: false
    });

    const response = await fetch(sessionEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initializePayload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    logTraffic(initRequestId, 'atlassian-mcp-official', 'RESPONSE', 'HTTP_RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseData,
      isStreaming: false,
      contentType: response.headers.get('content-type')
    });

    if (response.status === 202) {
      // Store session endpoint for future requests
      sessionId = sessionEndpoint;
      
      log('initializeMCP', 'PASS', {
        description: 'Successfully queued initialize message via SSE',
        status: response.status,
        session_endpoint: sessionEndpoint,
        note: 'Response will come via SSE stream'
      });
      
      return {
        status: response.status,
        sessionEndpoint: sessionEndpoint,
        requestId: initRequestId
      };
    } else {
      log('initializeMCP', 'FAIL', {
        description: 'Unexpected response from initialize',
        status: response.status,
        response: responseData
      });
      return null;
    }

  } catch (error) {
    log('initializeMCP', 'ERROR', {
      description: 'Error during MCP initialization',
      error: error.message
    });
    return null;
  }
}

async function getToolsList() {
  if (!sessionId) {
    log('getToolsList', 'SKIP', {
      description: 'No session ID available (MCP not initialized)'
    });
    return null;
  }

  try {
    const requestId = generateRequestId('getToolsList');
    const toolsPayload = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    logTraffic(requestId, 'atlassian-mcp-official', 'REQUEST', 'HTTP_REQUEST', {
      method: 'POST',
      url: sessionId, // sessionId is the session endpoint URL
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: toolsPayload,
      isStreaming: false
    });

    const response = await fetch(sessionId, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolsPayload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    logTraffic(requestId, 'atlassian-mcp-official', 'RESPONSE', 'HTTP_RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseData,
      isStreaming: false,
      contentType: response.headers.get('content-type')
    });

    if (response.status === 202) {
      log('getToolsList', 'PASS', {
        description: 'Successfully queued tools/list request via SSE',
        status: response.status,
        note: 'Tool list response will come via SSE stream'
      });

      // Now we need to listen for the actual response via SSE
      console.log('🔍 Listening for tools list response via SSE...');
      
      try {
        // Use the global SSE reader that was preserved from initializeMCP
        if (!sseReader) {
          throw new Error('No active SSE reader available from initializeMCP');
        }
        
        // Listen for responses with a reasonable timeout
        const timeout = 8000; // 8 seconds (logs show response comes within seconds)
        const startTime = Date.now();
        let toolsFound = false;
        let jsonBuffer = ''; // Buffer to accumulate multi-chunk JSON responses
        
        while (Date.now() - startTime < timeout && !toolsFound) {
          try {
            const { value, done } = await sseReader.read();
            if (done) {
              console.log('📡 SSE stream ended');
              break;
            }
            
            const chunk = sseDecoder.decode(value);
            
            // Log SSE chunk to traffic logs instead of console
            log('getToolsList', 'SSE_CHUNK', {
              description: 'Received SSE chunk during tools list retrieval',
              chunk: chunk.trim(),
              chunk_length: chunk.length
            });
            
            // Look for JSON-RPC response with tools list - handle multi-chunk responses
            const lines = chunk.split('\n');
            for (const line of lines) {
              // Handle "data: {jsonrpc...}" format - start of JSON response
              if (line.startsWith('data: {')) {
                // If we already have a buffer, this is a new response
                if (jsonBuffer.length > 0) {
                  // Try to parse the previous accumulated JSON first
                  try {
                    const prevJsonResponse = JSON.parse(jsonBuffer);
                    if (prevJsonResponse.id === 2 && prevJsonResponse.result && prevJsonResponse.result.tools) {
                      // Process the previous response
                      const tools = prevJsonResponse.result.tools;
                      console.log(`🛠️  Found ${tools.length} available tools from Atlassian:`);
                      tools.forEach((tool, index) => {
                        console.log(`   ${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
                      });
                      toolsList = tools;
                      toolsFound = true;
                      jsonBuffer = '';
                      break;
                    }
                  } catch (e) {
                    // Previous buffer was incomplete, continue
                  }
                }
                
                // Start new JSON accumulation
                jsonBuffer = line.substring(6); // Remove "data: "
              } 
              // Handle continuation lines that are part of the JSON
              else if (line.length > 0 && !line.startsWith('event:') && jsonBuffer.length > 0) {
                // This is a continuation of the JSON response
                jsonBuffer += line;
              }
              // Handle empty lines or event lines
              else if (line.trim() === '' || line.startsWith('event:')) {
                // If we have accumulated JSON, try to parse it
                if (jsonBuffer.length > 0) {
                  try {
                    const jsonResponse = JSON.parse(jsonBuffer);
                    
                    // Check if this is our tools/list response
                    if (jsonResponse.id === 2 && jsonResponse.result && jsonResponse.result.tools) {
                      const tools = jsonResponse.result.tools;
                      console.log(`🛠️  Found ${tools.length} available tools from Atlassian:`);
                      tools.forEach((tool, index) => {
                        console.log(`   ${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
                        if (tool.inputSchema && tool.inputSchema.properties) {
                          const propNames = Object.keys(tool.inputSchema.properties);
                          if (propNames.length > 0) {
                            console.log(`      Parameters: ${propNames.join(', ')}`);
                          }
                        }
                      });
                      
                      toolsList = tools;
                      toolsFound = true;
                      
                      log('getToolsList', 'SUCCESS', {
                        description: `Successfully retrieved ${tools.length} tools from Atlassian via SSE`,
                        tools: tools.map(t => ({ 
                          name: t.name, 
                          description: t.description,
                          hasInputSchema: !!t.inputSchema 
                        }))
                      });
                      
                      jsonBuffer = '';
                      break;
                    }
                  } catch (parseError) {
                    // JSON still incomplete, but reset buffer to prevent memory issues
                    if (jsonBuffer.length > 100000) {
                      console.log('⚠️  JSON buffer getting very large, resetting');
                      jsonBuffer = '';
                    }
                  }
                }
              }
            }
          } catch (readError) {
            console.log('⚠️  SSE read error:', readError.message);
            break;
          }
        }
        
        if (!toolsFound) {
          console.log('⏰ No tools response received within timeout period');
          console.log('💡 This might indicate the MCP session needs more time to initialize');
        }
      } catch (sseError) {
        console.log('⚠️  SSE listening failed:', sseError.message);
      }

      return { status: response.status, tools: toolsList, requestId: requestId };
    } else {
      log('getToolsList', 'FAIL', {
        description: 'Failed to queue tools/list request',
        status: response.status,
        response: responseData
      });
      return null;
    }

  } catch (error) {
    log('getToolsList', 'ERROR', {
      description: 'Error getting tools list',
      error: error.message
    });
    return null;
  }
}

async function callGetAccessibleResources(stepName = 'callGetAccessibleResources') {
  if (!accessToken) {
    log(stepName, 'SKIP', {
      description: 'No access token available'
    });
    return null;
  }

  if (!sessionEndpoint) {
    log(stepName, 'SKIP', {
      description: 'No session endpoint available (MCP not initialized)'
    });
    return null;
  }

  try {
    const requestId = generateRequestId(stepName);
    const toolCallPayload = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'getAccessibleAtlassianResources',
        arguments: {}
      }
    };

    logTraffic(requestId, 'atlassian-mcp-official', 'REQUEST', 'HTTP_REQUEST', {
      method: 'POST',
      url: sessionEndpoint,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: toolCallPayload,
      isStreaming: false
    });

    const response = await fetch(sessionEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolCallPayload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    logTraffic(requestId, 'atlassian-mcp-official', 'RESPONSE', 'HTTP_RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseData,
      isStreaming: false,
      contentType: response.headers.get('content-type')
    });

    if (response.status === 202) {
      log(stepName, 'PASS', {
        description: 'Successfully queued getAccessibleAtlassianResources call via SSE',
        status: response.status,
        note: 'Tool call response should come via SSE stream',
        requestId: requestId
      });
      return { status: response.status, requestId: requestId };
    } else if (response.status === 200 && responseData?.result) {
      const result = responseData.result;
      log(stepName, 'PASS', {
        description: 'Successfully called getAccessibleAtlassianResources',
        result_type: typeof result,
        has_content: !!result.content,
        content_length: result.content?.length || 0,
        is_error: result.isError,
        requestId: requestId
      });
      return { status: response.status, body: responseData, requestId: requestId };
    } else if (response.status === 401) {
      log(stepName, 'EXPECTED', {
        description: 'Token expired or invalid - received 401',
        status: response.status,
        error: responseData,
        requestId: requestId
      });
      return { status: response.status, body: responseData, requestId: requestId };
    } else {
      log(stepName, 'FAIL', {
        description: 'Failed to call getAccessibleAtlassianResources',
        status: response.status,
        error: responseData,
        requestId: requestId
      });
      return null;
    }
  } catch (error) {
    log(stepName, 'ERROR', {
      description: 'Error calling getAccessibleAtlassianResources',
      error: error.message
    });
    return null;
  }
}

async function waitForTokenExpiration() {
  if (!accessToken) {
    log('waitForTokenExpiration', 'SKIP', {
      description: 'No access token available to check expiration'
    });
    return;
  }

  if (!tokenExpirationTime) {
    log('waitForTokenExpiration', 'SKIP', {
      description: 'No token expiration time available (opaque token or missing expires_in)'
    });
    return;
  }

  try {
    const currentTime = Date.now();
    const timeUntilExpiration = tokenExpirationTime - currentTime;

    log('waitForTokenExpiration', 'INFO', {
      description: 'Token expiration analysis (using OAuth expires_in)',
      expiration_timestamp: Math.floor(tokenExpirationTime / 1000),
      expiration_date: new Date(tokenExpirationTime).toISOString(),
      current_time: new Date(currentTime).toISOString(),
      time_until_expiration_ms: timeUntilExpiration,
      time_until_expiration_minutes: Math.round(timeUntilExpiration / 60000),
      is_already_expired: timeUntilExpiration <= 0
    });

    if (timeUntilExpiration <= 0) {
      console.log('⚠️  Token is already expired!');
      log('waitForTokenExpiration', 'COMPLETE', {
        description: 'Token is already expired, no wait needed'
      });
      return;
    }

    // Always wait for actual token expiration
    console.log(`⏰ Token expires in ${Math.round(timeUntilExpiration / 60000)} minutes (${Math.round(timeUntilExpiration / 1000)} seconds)`);
    console.log(`⏳ Waiting ${Math.round(timeUntilExpiration / 1000)} seconds until token expires...`);
    
    log('waitForTokenExpiration', 'INFO', {
      description: 'Waiting for actual token expiration',
      wait_time_ms: timeUntilExpiration,
      wait_time_minutes: Math.round(timeUntilExpiration / 60000)
    });
    
    await sleep(timeUntilExpiration + 1000); // Wait 1 extra second to ensure expiration
    
    log('waitForTokenExpiration', 'COMPLETE', {
      description: 'Wait period completed'
    });

  } catch (error) {
    log('waitForTokenExpiration', 'ERROR', {
      description: 'Failed to calculate token expiration',
      error: error.message
    });
    
    // Fallback to fixed wait time
    const waitTime = 30000;
    console.log(`⚠️  Could not calculate expiration, using fallback wait time of ${waitTime/1000} seconds`);
    await sleep(waitTime);
  }
}

async function refreshAccessToken() {
  if (!refreshToken) {
    log('refreshAccessToken', 'SKIP', {
      description: 'No refresh token available'
    });
    return null;
  }

  if (!actualClientId) {
    log('refreshAccessToken', 'SKIP', {
      description: 'No actual client ID available (needed for refresh)'
    });
    return null;
  }

  try {
    const requestId = generateRequestId('refreshAccessToken');
    const refreshPayload = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: actualClientId // Use the actual client ID from PKCE flow
    };

    logTraffic(requestId, 'atlassian-mcp-official', 'REQUEST', 'HTTP_REQUEST', {
      method: 'POST',
      url: ATLASSIAN_MCP_TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: refreshPayload,
      isStreaming: false
    });

    const response = await fetch(ATLASSIAN_MCP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(refreshPayload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    logTraffic(requestId, 'atlassian-mcp-official', 'RESPONSE', 'HTTP_RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseData,
      isStreaming: false,
      contentType: response.headers.get('content-type')
    });

    if (response.ok && responseData.access_token) {
      // Update tokens
      accessToken = responseData.access_token;
      if (responseData.refresh_token) {
        refreshToken = responseData.refresh_token;
      }

      // Update token expiration time - handle both formats
      const expiresInSeconds = responseData.expires_in || responseData.expiresIn;
      if (expiresInSeconds) {
        tokenExpirationTime = Date.now() + (expiresInSeconds * 1000);
      }

      log('refreshAccessToken', 'PASS', {
        description: 'Successfully refreshed access token',
        token_type: responseData.token_type || responseData.tokenType,
        expires_in: expiresInSeconds,
        scope: responseData.scope,
        token_length: accessToken.length,
        has_new_refresh_token: !!responseData.refresh_token,
        expiration_time: tokenExpirationTime ? new Date(tokenExpirationTime).toISOString() : null
      });

      console.log('✅ Access token refreshed successfully');
      if (expiresInSeconds) {
        console.log(`   New token expires in: ${expiresInSeconds} seconds`);
        if (tokenExpirationTime) {
          console.log(`   New token expires at: ${new Date(tokenExpirationTime).toISOString()}`);
        }
      }

      return accessToken;
    } else {
      log('refreshAccessToken', 'FAIL', {
        description: 'Failed to refresh access token',
        status: response.status,
        error: responseData
      });

      console.log('❌ Failed to refresh access token');
      return null;
    }

  } catch (error) {
    log('refreshAccessToken', 'ERROR', {
      description: 'Error during token refresh',
      error: error.message
    });

    console.log('❌ Error during token refresh:', error.message);
    return null;
  }
}

async function runTokenLifecycleTest() {
  console.log('🚀 Starting Atlassian MCP Token Lifecycle Test...\n');
  
  // Log the traffic file name for real-time monitoring
  const trafficFile = `mcp-traffic-lifecycle-${logSessionId}.jsonl`;
  console.log(`📝 Traffic logs will be written to: ${trafficFile}`);
  console.log(`💡 Monitor in real-time with: tail -f ${trafficFile}\n`);

  // Step 1: Authorize with Atlassian
  console.log('📋 Step 1: Authorization');
  await authorizeWithAtlassian();

  if (!accessToken) {
    console.log('\n❌ Cannot proceed without access token');
    generateReport();
    return;
  }

  // TEMPORARY: Test refresh token immediately after authorization
  console.log('\n🔄 TEMPORARY: Testing refresh token immediately after authorization');
  const originalAccessToken = accessToken;
  const originalRefreshToken = refreshToken;
  await refreshAccessToken();
  
  if (accessToken && accessToken !== originalAccessToken) {
    console.log('✅ Refresh token worked - got new access token');
    console.log(`   Original token length: ${originalAccessToken?.length || 'N/A'}`);
    console.log(`   New token length: ${accessToken?.length || 'N/A'}`);
    console.log(`   Refresh token changed: ${refreshToken !== originalRefreshToken ? 'Yes' : 'No'}`);
  } else if (accessToken === originalAccessToken) {
    console.log('⚠️  Refresh returned same access token (unusual but possible)');
  } else {
    console.log('❌ Refresh token failed - no new access token');
  }

  // Step 2: Initialize MCP and get tools
  console.log('\n📋 Step 2: Initialize MCP Session');
  await initializeMCP();
  await getToolsList();

  // Wait for MCP session to be ready (simplified delay)
  console.log('\n⏳ Waiting for MCP session to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 3: Call getAccessibleAtlassianResources with fresh token
  console.log('\n📋 Step 3: Test getAccessibleAtlassianResources with fresh token');
  await callGetAccessibleResources('callGetAccessibleResources_fresh');

  // Step 4: Wait for potential token expiration
  console.log('\n📋 Step 4: Wait for token expiration');
  await waitForTokenExpiration();

  // Step 5: Try getAccessibleAtlassianResources with potentially expired token
  console.log('\n📋 Step 5: Test getAccessibleAtlassianResources after wait period');
  await callGetAccessibleResources('callGetAccessibleResources_after_wait');

  // Step 6: Try to re-initialize with same token
  console.log('\n📋 Step 6: Re-initialize with same token');
  const reinitResponse = await initializeMCP();

  // Step 7: Try refresh token after failed re-initialization  
  if (!reinitResponse || reinitResponse.status !== 200) {
    console.log('\n🔄 Step 7: Try refresh token');
    await refreshAccessToken();
    
    if (accessToken) {
      // Step 8: Re-initialize with refreshed token
      console.log('\n📋 Step 8: Re-initialize with refreshed token');
      const refreshedReinitResponse = await initializeMCP();
      
      if (refreshedReinitResponse?.status === 200) {
        // Step 9: Test getAccessibleAtlassianResources with refreshed token
        console.log('\n📋 Step 9: Test getAccessibleAtlassianResources with refreshed token');
        await callGetAccessibleResources('callGetAccessibleResources_after_refresh');
      } else {
        log('callGetAccessibleResources_after_refresh', 'SKIP', {
          description: 'Re-initialization with refreshed token failed, skipping tool call'
        });
      }
    } else {
      log('initializeMCP_after_refresh', 'SKIP', {
        description: 'Token refresh failed, skipping re-initialization'
      });
      log('callGetAccessibleResources_after_refresh', 'SKIP', {
        description: 'Token refresh failed, skipping tool call'
      });
    }
  } else {
    // Original re-init worked, try tool call
    console.log('\n📋 Step 7: Test getAccessibleAtlassianResources after re-initialization');
    await callGetAccessibleResources('callGetAccessibleResources_after_reinit');
    
    log('refreshAccessToken', 'SKIP', {
      description: 'Re-initialization with expired token succeeded, refresh not needed'
    });
    log('callGetAccessibleResources_after_refresh', 'SKIP', {
      description: 'Re-initialization with expired token succeeded, refresh not needed'
    });
  }

  generateReport();
}

function generateReport() {
  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  const skipped = results.filter(r => r.result === 'SKIP').length;
  const expected = results.filter(r => r.result === 'EXPECTED').length;
  const manual = results.filter(r => r.result === 'MANUAL').length;

  console.log('\n' + '='.repeat(70));
  console.log('ATLASSIAN MCP TOKEN LIFECYCLE TEST RESULTS (WITH REFRESH)');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`⚠️  Expected (Token Expiry): ${expected}`);
  console.log(`🔐 Manual Steps: ${manual}`);
  console.log(`📊 Total: ${results.length}`);
  console.log(`🔄 Refresh Token Available: ${refreshToken ? 'Yes' : 'No'}`);
  console.log(`🎯 Access Token Available: ${accessToken ? 'Yes' : 'No'}`);

  // Save detailed results
  const report = {
    test_type: 'token_lifecycle_with_refresh',
    summary: { passed, failed, skipped, expected, manual, total: results.length },
    timestamp: startTime.toISOString(),
    target_url: ATLASSIAN_MCP_URL,
    dynamic_client_id: actualClientId, // The dynamically registered client ID
    scope: JIRA_SCOPE,
    callback_url: CALLBACK_URL,
    access_token_provided: !!accessToken,
    refresh_token_provided: !!refreshToken,
    session_id: sessionId,
    tools_discovered: toolsList?.length || 0,
    results: results
  };

  const reportFile = path.join(process.cwd(), `token-lifecycle-results-${logSessionId}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  // Save traffic logs in JSONL format like the logger
  const trafficFile = path.join(process.cwd(), `mcp-traffic-lifecycle-${logSessionId}.jsonl`);
  const trafficContent = trafficLogs.map(entry => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(trafficFile, trafficContent);
  
  console.log(`📄 Test results saved to: ${reportFile}`);
  console.log(`📝 Traffic logs saved to: ${trafficFile}`);

  const duration = (new Date() - startTime) / 1000;
  console.log(`⏱️  Test duration: ${duration.toFixed(1)} seconds`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the details above.');
  } else if (manual > 0 || skipped > 0) {
    console.log('\n⚠️  Test completed with manual steps or skipped tests.');
  } else {
    console.log('\n✅ Token lifecycle test completed successfully!');
  }
}

// Run the token lifecycle test
runTokenLifecycleTest().catch(error => {
  console.error('Token lifecycle test failed:', error);
  
  // Log the error in traffic logs
  logTraffic('test-runner-error', 'atlassian-mcp-bridge', 'ERROR', 'TEST_RUNNER_ERROR', {
    error: 'TEST_RUNNER_FAILURE',
    message: error.message,
    stack: error.stack
  });
  
  generateReport();
  process.exit(1);
});
