# Sample Testing Tool Specification

## Overview

Create an MCP tool that tests sampling functionality by sending prompts to the agent and logging the interaction process. Sampling allows the MCP service to make requests back to the agent (VS Code Copilot) for processing.

## Purpose

This tool enables testing of:
- **Basic agent capabilities**: Simple computations and queries
- **Inter-MCP tool communication**: Agent's ability to coordinate with other MCP services (e.g., Figma)

## Tool Definition

### Name
`test-sampling`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `samplePrompt` | string | Yes | The prompt message to send to the agent |
| `systemPrompt` | string | No | Custom system prompt (defaults to generic testing prompt) |
| `maxTokens` | number | No | Maximum tokens for response (defaults to 10000) |

### Example Prompts

**Basic capability test:**
```
Provide the answer to 1 + 2 + 3
```

**Inter-MCP tool test:**
```
Use your figma mcp service to write up a description of the image at http://figma.com
```

## Implementation Plan

### 1. Create Tool File
**File**: `server/jira-mcp/tool-sample-testing.ts`

**Structure:**
```typescript
import { z } from 'zod';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from './mcp-types.ts';
import { getAuthInfoSafe } from './auth-helpers.ts';

export function registerSampleTestingTool(mcp: McpServer): void {
  // Tool implementation
}
```

### 2. Tool Registration

Register with schema validation:
```typescript
mcp.registerTool(
  'test-sampling',
  {
    title: 'Test Sampling',
    description: 'Test sampling functionality by sending prompts to the agent and logging the interaction',
    inputSchema: {
      samplePrompt: z.string().describe('The prompt message to send to the agent'),
      systemPrompt: z.string().optional().describe('Custom system prompt for the agent'),
      maxTokens: z.number().optional().describe('Maximum tokens for response (default: 10000)')
    },
  },
  async ({ samplePrompt, systemPrompt, maxTokens }, context, extra) => {
    console.log('test-sampling called', { 
      promptLength: samplePrompt.length,
      hasSystemPrompt: !!systemPrompt,
      maxTokens: maxTokens || 10000
    });

    // Get auth info following standard pattern (even though not strictly needed for sampling)
    const authInfo = getAuthInfoSafe(context, 'test-sampling');
    
    // Implementation continues...
  }
);
```

### 3. Notification System

Send notifications at key interaction points using the MCP notification format:

```typescript
await extra.sendNotification({
  method: "notifications/message",
  params: {
    level: "info",
    data: "MESSAGE_CONTENT",
  },
});
```

**Notification points:**
1. **Before request**: "Sending sampling request to agent..."
2. **On success**: "Received response from agent (X characters): [full response content]"
3. **On error**: "Error during sampling: [full error object]"

### 4. Sampling Request Implementation

Send initial notification, then make the sampling request:

```typescript
// Notify before starting
await extra.sendNotification({
  method: "notifications/message",
  params: {
    level: "info",
    data: "Sending sampling request to agent...",
  },
});

// Make the sampling request
const samplingResponse = await mcp.server.request({
  "method": "sampling/createMessage",
  "params": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": samplePrompt
        }
      }
    ],
    "speedPriority": 0.5,
    "systemPrompt": systemPrompt || "You are a helpful assistant.",
    "maxTokens": maxTokens || 10000
  }
}, CreateMessageResultSchema);
```

### 5. Response Processing

Extract and validate response content, then send success notification:
```typescript
const responseText = samplingResponse.content?.text as string;
if (!responseText) {
  throw new Error('No content received from agent');
}

// Notify on success with full response
await extra.sendNotification({
  method: "notifications/message",
  params: {
    level: "info",
    data: `Received response from agent (${responseText.length} characters): ${responseText}`,
  },
});
```

### 6. Return Success Result

Return success message with full response and character count:
```typescript
return {
  content: [{
    type: 'text',
    text: `✅ Sampling test successful!\n\nPrompt: "${samplePrompt}"\n\nResponse (${responseText.length} characters):\n${responseText}`
  }]
};
```

### 7. Error Handling

Wrap execution in try-catch with full error logging:
```typescript
try {
  // Sampling logic
} catch (error: any) {
  const errorDetails = JSON.stringify(error, null, 2);
  
  await extra.sendNotification({
    method: "notifications/message",
    params: {
      level: "error",
      data: `Error during sampling: ${errorDetails}`,
    },
  });
  
  return {
    content: [{
      type: 'text',
      text: `❌ Sampling test failed:\n${errorDetails}`
    }]
  };
}
```

### 8. Register in Main Service

**File**: `server/jira-mcp/index.ts`

Add import and registration:
```typescript
import { registerSampleTestingTool } from './tool-sample-testing.ts';

// In initializeMcp function:
registerSampleTestingTool(mcp);
```

## Testing Strategy

### Test Case 1: Basic Math
```
Tool: test-sampling
Parameters:
  samplePrompt: "Provide the answer to 1 + 2 + 3"
  
Expected: Response containing "6"
```

### Test Case 2: Figma Integration
```
Tool: test-sampling
Parameters:
  samplePrompt: "Use your figma mcp service to list available commands"
  
Expected: Response showing Figma MCP tool list or appropriate error if not configured
```

### Test Case 3: Custom System Prompt
```
Tool: test-sampling
Parameters:
  samplePrompt: "What is the capital of France?"
  systemPrompt: "You are a geography expert. Provide concise answers."
  
Expected: Response containing "Paris"
```

## Implementation Checklist

- [ ] Create `tool-sample-testing.ts` file
- [ ] Implement tool registration with proper schema
- [ ] Add notification logging at all key points
- [ ] Implement sampling request with proper message structure
- [ ] Add error handling and response validation
- [ ] Register tool in `server/jira-mcp/index.ts`
- [ ] Test with basic math prompt
- [ ] Test with Figma MCP integration prompt
- [ ] Test error scenarios (invalid prompts, timeouts)
- [ ] Document usage in `server/readme.md`

## Code Structure

```
server/jira-mcp/tool-sample-testing.ts
├── Imports (z, CreateMessageResultSchema, McpServer, getAuthInfoSafe)
├── registerSampleTestingTool()
│   ├── Tool registration (name, schema, description)
│   └── Tool handler async function
│       ├── Console log with call details
│       ├── Get auth info (following standard pattern)
│       ├── Try block
│       │   ├── Send "starting" notification
│       │   ├── Make sampling request (speedPriority: 0.5)
│       │   ├── Validate response content
│       │   ├── Send "success" notification with full response
│       │   └── Return success response with character count
│       └── Catch block
│           ├── Serialize full error object
│           ├── Send "error" notification with full error
│           └── Return error response with full error details
```

## Design Decisions

Based on requirements review, the following design decisions were made:

1. **Tool naming**: `test-sampling` (clear and action-oriented)

2. **Notification frequency**: Only at the start and end (simpler, avoids spam)

3. **Response content logging**: Full response content (complete visibility for testing)

4. **Error response details**: Full error object using `JSON.stringify(error, null, 2)` (complete debugging information)

5. **System prompt**: Optional parameter, defaults to "You are a helpful assistant" (flexible but sensible default)

6. **Speed priority**: Fixed at 0.5 (balanced speed/quality, no need for configuration)

7. **Max tokens**: Optional parameter, defaults to 10000 (allows customization while providing reasonable default)

8. **Authentication**: Follow standard Jira tool pattern with `getAuthInfoSafe()` for consistency, even though sampling doesn't require Jira auth

9. **Multiple messages**: Single prompt only (keeps tool simple and focused on basic testing)

10. **Success criteria**: Return character count along with full response (provides quick metric while showing complete output)