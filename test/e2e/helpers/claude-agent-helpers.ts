/**
 * Claude Agent SDK Helpers for E2E Testing
 * 
 * Provides utilities for:
 * - Creating unsigned test JWTs with PAT credentials
 * - Configuring MCP server connections for the Claude Agent SDK
 * - Running the design review workflow and extracting results
 */

import { query, type SDKMessage, type SDKResultMessage, type SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Verbose Logging Toggle
// ============================================================================

/**
 * Set to `true` to enable detailed logging of Claude's messages, tool calls,
 * tool inputs, and tool results during the E2E workflow.
 */
export let VERBOSE_LOGGING = false;

/** Programmatically enable/disable verbose logging. */
export function setVerboseLogging(enabled: boolean) {
  VERBOSE_LOGGING = enabled;
}

function verboseLog(...args: any[]) {
  if (!VERBOSE_LOGGING) return;
  console.log(...args);
}

function truncate(text: string, max = 500): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `... [truncated, ${text.length} chars total]`;
}

// ============================================================================
// JWT Helpers
// ============================================================================

/**
 * Create an unsigned JWT containing PAT credentials.
 * 
 * Works because our server's `parseJWT()` only base64url-decodes the payload
 * without verifying signatures. This lets us embed Figma/Atlassian PAT tokens
 * in the same AuthContext shape the server expects from OAuth JWTs.
 */
export function createTestJwt(tokens: {
  figmaPat?: string;
  atlassianPat?: string;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  
  const payload: Record<string, any> = {
    iat: now,
    exp: now + 3600, // 1 hour
  };
  
  if (tokens.figmaPat) {
    payload.figma = {
      access_token: tokens.figmaPat,
      refresh_token: '',
      expires_at: now + 86400,
    };
  }
  
  if (tokens.atlassianPat) {
    payload.atlassian = {
      access_token: tokens.atlassianPat,
      refresh_token: '',
      expires_at: now + 86400,
    };
  }
  
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${payloadB64}.`; // Empty signature
}

// ============================================================================
// MCP Server Config
// ============================================================================

/**
 * Create MCP server configuration for the Claude Agent SDK.
 * Points to our local test server with JWT auth.
 */
export function createMcpServerConfig(options: {
  serverUrl: string;
  testJwt: string;
}) {
  return {
    cascade: {
      type: 'http' as const,
      url: `${options.serverUrl}/mcp`,
      headers: {
        'Authorization': `Bearer ${options.testJwt}`,
      },
    },
  };
}

// ============================================================================
// Workflow Runner
// ============================================================================

export interface DesignReviewResult {
  messages: SDKMessage[];
  resultMessage: SDKResultMessage | null;
  questions: string[];
  errors: string[];
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
}

/**
 * Run the design review workflow using the Claude Agent SDK.
 * 
 * Connects to our MCP server, prompts Claude to call
 * `figma-ask-scope-questions-for-page`, follow embedded workflow instructions,
 * and produce scope questions.
 */
export async function runDesignReviewWorkflow(
  figmaUrl: string,
  options: {
    serverUrl: string;
    testJwt: string;
    maxTurns?: number;
    cwd?: string;
  }
): Promise<DesignReviewResult> {
  const mcpServers = createMcpServerConfig({
    serverUrl: options.serverUrl,
    testJwt: options.testJwt,
  });

  const prompt = `Can you ask scope questions for this page: ${figmaUrl}

Follow all workflow instructions returned by the tool. Save analyses to the paths specified. Present the final questions at the end. Do NOT ask me for permission — just proceed.`;

  const q = query({
    prompt,
    options: {
      mcpServers,
      allowedTools: [
        // MCP tools (cascade server)
        'mcp__cascade__figma-ask-scope-questions-for-page',
        'mcp__cascade__figma-frame-analysis',
        // Built-in tools the agent needs
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'LS',
        'Task',
        'MultiEdit',
      ],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: options.maxTurns ?? 50,
      model: 'claude-sonnet-4-20250514',
      cwd: options.cwd ?? process.cwd(),
      persistSession: false,
    },
  });

  const messages: SDKMessage[] = [];
  let resultMessage: SDKResultMessage | null = null;

  let turnCount = 0;

  for await (const message of q) {
    messages.push(message);

    if (message.type === 'result') {
      resultMessage = message as SDKResultMessage;
      verboseLog(`\n${'═'.repeat(60)}`);
      verboseLog(`✅ RESULT (subtype: ${resultMessage.subtype})`);
      if ((resultMessage as any).result) {
        verboseLog(truncate((resultMessage as any).result, 1000));
      }
      verboseLog(`${'═'.repeat(60)}\n`);
    }

    if (message.type === 'assistant') {
      turnCount++;
      const assistantMsg = message as SDKAssistantMessage;
      const content = assistantMsg.message?.content || [];

      verboseLog(`\n${'─'.repeat(60)}`);
      verboseLog(`🤖 ASSISTANT (turn ${turnCount})`);
      verboseLog(`${'─'.repeat(60)}`);

      for (const block of content) {
        const b = block as any;
        if (b.type === 'text') {
          verboseLog(`  💬 Text:\n${truncate(b.text, 2000).split('\n').map((l: string) => `     ${l}`).join('\n')}`);
        } else if (b.type === 'tool_use') {
          verboseLog(`  🔧 Tool call: ${b.name}`);
          verboseLog(`     Input: ${truncate(JSON.stringify(b.input), 1500)}`);
        } else if (b.type === 'tool_result') {
          const resultContent = Array.isArray(b.content)
            ? b.content.map((item: any) => {
                if (item.type === 'text') return item.text;
                if (item.type === 'image') return '[image data]';
                return JSON.stringify(item);
              }).join('\n')
            : typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
          verboseLog(`  📦 Tool result (${b.tool_use_id?.slice(-8) || 'unknown'}):`);
          verboseLog(`     ${truncate(resultContent || '(empty)', 600).split('\n').map((l: string) => `     ${l}`).join('\n')}`);
        } else {
          verboseLog(`  📎 Block type: ${b.type}`);
        }
      }
    }

    // Log other message types when verbose
    if (message.type !== 'assistant' && message.type !== 'result') {
      verboseLog(`  📨 Message type: ${message.type}${(message as any).subtype ? ` (${(message as any).subtype})` : ''}`);
    }
  }

  // Extract questions from the result
  const questions = parseQuestionsFromResult(messages);
  const errors: string[] = [];

  if (resultMessage) {
    if (resultMessage.subtype !== 'success') {
      errors.push(...(resultMessage as any).errors || []);
    }
  }

  return {
    messages,
    resultMessage,
    questions,
    errors,
    numTurns: resultMessage ? (resultMessage as any).num_turns || 0 : 0,
    totalCostUsd: resultMessage ? (resultMessage as any).total_cost_usd || 0 : 0,
    durationMs: resultMessage ? (resultMessage as any).duration_ms || 0 : 0,
  };
}

// ============================================================================
// Result Parsing
// ============================================================================

/**
 * Extract questions from the agent's messages.
 * 
 * Looks for question patterns in assistant messages:
 * - Numbered questions (1. ..., 2. ...)
 * - Lines starting with "?" or "- "
 * - Content in the final result text
 */
export function parseQuestionsFromResult(messages: SDKMessage[]): string[] {
  const questions: string[] = [];
  const questionPatterns = [
    /^\s*\d+\.\s+(.+\?)\s*$/gm,   // "1. What is...?"
    /^\s*[-•]\s+(.+\?)\s*$/gm,     // "- What is...?"
    /^\s*\*\*Q\d*[:.]?\*\*\s*(.+\?)\s*$/gm, // "**Q1:** What...?"
  ];

  // Check result message first
  const resultMsg = messages.find(m => m.type === 'result' && m.subtype === 'success') as any;
  if (resultMsg?.result) {
    for (const pattern of questionPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(resultMsg.result)) !== null) {
        questions.push(match[1].trim());
      }
    }
  }

  // Also check assistant messages for questions if none found in result
  if (questions.length === 0) {
    const assistantMessages = messages.filter(m => m.type === 'assistant') as SDKAssistantMessage[];
    for (const msg of assistantMessages) {
      const textBlocks = msg.message?.content?.filter((c: any) => c.type === 'text') || [];
      for (const block of textBlocks) {
        const text = (block as any).text || '';
        for (const pattern of questionPatterns) {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(text)) !== null) {
            questions.push(match[1].trim());
          }
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(questions)];
}

// ============================================================================
// Output Saving
// ============================================================================

/**
 * Save test output to temp/ for post-run inspection.
 */
export function saveTestOutput(
  result: DesignReviewResult,
  outputDir?: string
): string {
  const dir = outputDir || path.join(process.cwd(), 'temp');
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `claude-agent-review-design-${timestamp}.json`;
  const filepath = path.join(dir, filename);

  // Strip large binary data from messages to keep file size reasonable
  const sanitizedMessages = result.messages.map(msg => {
    if (msg.type === 'assistant') {
      const aMsg = msg as SDKAssistantMessage;
      return {
        ...msg,
        message: {
          ...aMsg.message,
          content: aMsg.message?.content?.map((c: any) => {
            if (c.type === 'tool_result' && Array.isArray(c.content)) {
              return {
                ...c,
                content: c.content.map((item: any) => {
                  if (item.type === 'image') {
                    return { type: 'image', data: '[base64 truncated]', mimeType: item.mimeType };
                  }
                  return item;
                }),
              };
            }
            return c;
          }),
        },
      };
    }
    return msg;
  });

  const output = {
    timestamp: new Date().toISOString(),
    numTurns: result.numTurns,
    totalCostUsd: result.totalCostUsd,
    durationMs: result.durationMs,
    questionsFound: result.questions.length,
    questions: result.questions,
    errors: result.errors,
    resultSubtype: result.resultMessage?.subtype,
    messageCount: result.messages.length,
    messages: sanitizedMessages,
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`📄 Test output saved to: ${filepath}`);
  return filepath;
}
