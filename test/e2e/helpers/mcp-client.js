/**
 * MCP SDK Client Helper
 * 
 * Real MCP SDK client utilities for integration testing.
 * Tests how actual MCP clients interact with the bridge server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Create an authenticated MCP SDK client
 * @param {string} baseUrl - Base URL of the MCP server
 * @param {string} accessToken - JWT access token for authentication
 * @returns {Promise<Client>} Initialized MCP client
 */
export async function createAuthenticatedMCPClient(baseUrl, accessToken) {
  console.log('🥚 Initializing MCP SDK client...');
  
  // Create MCP client with SSE transport
  const client = new Client({
    name: 'test-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {},
      sampling: {}
    }
  });

  // Create SSE transport with authentication
  const transport = new SSEClientTransport(new URL('/mcp', baseUrl), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'mcp-sdk-test-client'
    }
  });

  // Connect the transport
  await client.connect(transport);
  
  console.log('✅ MCP SDK client connected and initialized');
  return client;
}

/**
 * Create an unauthenticated MCP SDK client (for testing auth discovery)
 * @param {string} baseUrl - Base URL of the MCP server
 * @returns {Promise<Client>} MCP client (not connected)
 */
export async function createUnauthenticatedMCPClient(baseUrl) {
  console.log('🥚 Creating unauthenticated MCP SDK client...');
  
  const client = new Client({
    name: 'test-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {},
      sampling: {}
    }
  });

  const transport = new SSEClientTransport(new URL('/mcp', baseUrl));
  
  // Return both client and transport - let caller handle connection
  return { client, transport };
}

/**
 * Call a tool using the MCP SDK client
 * @param {Client} client - Authenticated MCP client
 * @param {string} toolName - Name of the tool to call
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool execution result
 */
export async function callMCPTool(client, toolName, args = {}) {
  console.log(`🔧 Calling tool: ${toolName}`);
  
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    console.log(`  ✅ Tool ${toolName} succeeded`);
    return result;
  } catch (error) {
    console.log(`  ❌ Tool ${toolName} failed:`, error.message);
    throw error;
  }
}

/**
 * List available tools using MCP SDK
 * @param {Client} client - Authenticated MCP client
 * @returns {Promise<Array>} List of available tools
 */
export async function listMCPTools(client) {
  console.log('📋 Listing available tools...');
  
  const result = await client.listTools();
  console.log(`  Found ${result.tools.length} tools:`, result.tools.map(t => t.name));
  
  return result.tools;
}

/**
 * Close MCP client connection
 * @param {Client} client - MCP client to close
 */
export async function closeMCPClient(client) {
  if (client && typeof client.close === 'function') {
    console.log('🔌 Closing MCP client connection...');
    await client.close();
    console.log('  ✅ MCP client connection closed');
  }
}
