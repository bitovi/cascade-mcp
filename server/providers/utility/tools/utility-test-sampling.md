# utility-test-sampling

Quick prompt:

> ```
> MCP test sampling with prompt "What is 2 + 2?"
> ```

## Purpose

The `utility-test-sampling` tool tests MCP sampling functionality by sending prompts to the AI agent and returning the results. This is a development and testing tool used to verify that the MCP client supports sampling (the ability for MCP servers to make requests back to the AI agent).

**Primary use cases:**
- Verify that sampling is supported by the MCP client
- Test agent capabilities and responsiveness
- Debug inter-MCP tool communication
- Validate complex workflows that rely on sampling

**What problem it solves:**
- **Capability testing**: Quickly determine if the MCP client supports sampling (required for some tools)
- **Debugging aid**: Verify the request/response flow between MCP server and agent
- **Workflow validation**: Test that complex tools can successfully invoke the agent
- **Client compatibility**: Identify which MCP clients support advanced features

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `samplePrompt` | string | ✅ Yes | The prompt message to send to the agent. Examples: "What is 2 + 2?" or "List available MCP tools" |
| `systemPrompt` | string | ❌ Optional | Custom system prompt for the agent (default: "You are a helpful assistant.") |
| `maxTokens` | number | ❌ Optional | Maximum tokens for response (default: 10000) |

### Returns

The tool returns the agent's response to the prompt:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Success message with prompt and agent response
    }
  ]
}
```

**Success response format:**
```
✅ Sampling test successful!

Prompt: "What is 2 + 2?"

Response (45 characters):
2 + 2 equals 4.
```

**Error responses:**
- `❌ Sampling not supported by this MCP client` (ChatGPT and some other clients)
- Generic error messages for other failures

### Dependencies

**Required:**
- MCP client that supports sampling (VS Code Copilot supports it, ChatGPT does not)

**Important:** This tool will fail with clients that don't support sampling. Known limitations:
- ✅ **Supported**: VS Code Copilot, Claude Desktop (with SDK)
- ❌ **Not supported**: ChatGPT MCP client

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `utility-test-sampling` tool:

1. **"Test sampling with the prompt 'Hello world'"**
2. **"Check if sampling works"**
3. **"Test MCP sampling functionality"**

### Walkthrough: Core Use Case

**Scenario**: You want to verify that your MCP client supports sampling before using tools that require it (like `write-shell-stories`).

#### Step 1: Call the tool

Ask the AI agent:
```
"Test sampling with the prompt 'What is 2 + 2?'"
```

#### Step 2: Check the result

**If sampling is supported** (VS Code Copilot):
```
✅ Sampling test successful!

Prompt: "What is 2 + 2?"

Response (15 characters):
2 + 2 equals 4.
```

**If sampling is NOT supported** (ChatGPT):
```
❌ Sampling not supported by this MCP client

Error Code: -32600
Message: Sampling not supported
```

#### Step 3: Interpret results

- **Success**: You can use tools that require sampling (`write-shell-stories`, `write-epics-next-story`)
- **Failure**: Some advanced tools won't work with your current MCP client

### Setup Requirements

Before using this tool:
1. **Authentication is complete** (any provider, just for consistency)
2. **MCP client is connected** to the cascade-mcp server

### Related Tools

Tools that **require** sampling (won't work in ChatGPT):
- **`write-shell-stories`** - Uses sampling for AI screen analysis
- **`write-epics-next-story`** - Uses sampling for story content generation

Tools that **don't require** sampling (work in all clients):
- All Atlassian tools (`atlassian-get-issue`, `search`, `fetch`, etc.)
- All Figma tools (`figma-get-image-download`, `figma-get-layers-for-page`, etc.)

## Debugging & Limitations

### Common User-Facing Errors

#### Sampling Not Supported

**Error**: `"❌ Sampling not supported by this MCP client"`

**Explanation**: Your MCP client doesn't support the sampling capability.

**Solution**: This is expected for ChatGPT and some other clients. Use VS Code Copilot or Claude Desktop if you need sampling-dependent tools.

---

#### Generic Sampling Error

**Error**: `"❌ Sampling test failed: [error message]"`

**Explanation**: The sampling request failed for reasons other than lack of support.

**Solution**:
- Check that your MCP client is properly connected
- Try a simpler prompt (e.g., "Hello")
- Restart the MCP client connection

---

### Known Limitations

#### 1. Client Compatibility

**Limitation**: Not all MCP clients support sampling:
- ✅ **Supported**: VS Code Copilot, Claude Desktop
- ❌ **Not supported**: ChatGPT, some custom implementations

**Workaround**: Use a compatible client for sampling-dependent workflows.

---

#### 2. Development Tool Only

**Limitation**: This tool is primarily for testing and debugging. It doesn't provide useful functionality for end users.

**Workaround**: This is intentional - it's a developer/testing tool.

---

#### 3. Response Length

**Limitation**: Responses are limited by `maxTokens` parameter (default 10000).

**Workaround**: Increase `maxTokens` if you need longer responses, but note that very long responses may impact performance.

---

### Troubleshooting Tips

#### Tip 1: Check Client Capabilities

Before attempting complex workflows:
```
"Test sampling"
```

If it succeeds, you can use all tools. If it fails, you're limited to non-sampling tools.

#### Tip 2: Simple Prompts First

Start with very simple prompts:
- ✅ "Hello"
- ✅ "What is 2 + 2?"
- ❌ "Explain quantum computing in detail" (too complex for initial test)

#### Tip 3: VS Code Copilot Users

In VS Code Copilot, sampling should always work. If it doesn't:
- Check that Copilot is properly authenticated
- Restart VS Code
- Verify the MCP connection is active

#### Tip 4: Alternative Workflows

If sampling doesn't work in your client:
- Use direct API endpoints instead (`POST /api/write-shell-stories`)
- Switch to VS Code Copilot for advanced features
- Use only non-sampling tools (all basic Atlassian/Figma tools)
