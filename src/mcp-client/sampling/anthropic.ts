/**
 * Anthropic Sampling Provider
 * 
 * Handles MCP sampling requests by calling the Anthropic API directly from the browser.
 * Requires the user to provide their own API key.
 */

import type { 
  SamplingProvider, 
  CreateMessageRequest, 
  CreateMessageResult,
  SamplingMessage 
} from './types.js';

/**
 * Convert MCP sampling messages to Anthropic API format
 */
function convertMessages(messages: SamplingMessage[]): Array<{
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;
}> {
  return messages.map(msg => {
    if (msg.content.type === 'text') {
      return {
        role: msg.role,
        content: msg.content.text,
      };
    } else if (msg.content.type === 'image') {
      return {
        role: msg.role,
        content: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: msg.content.mimeType,
            data: msg.content.data,
          },
        }],
      };
    }
    return {
      role: msg.role,
      content: '',
    };
  });
}

/**
 * Anthropic API Sampling Provider
 * 
 * Note: Requires `anthropic-dangerous-direct-browser-access: true` header
 * because we're calling from the browser with user-provided API keys.
 */
export class AnthropicSamplingProvider implements SamplingProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    // Determine model from request preferences or use default
    let model = this.model;
    if (request.modelPreferences?.hints) {
      for (const hint of request.modelPreferences.hints) {
        if (hint.name?.includes('claude')) {
          model = hint.name;
          break;
        }
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for browser access - user is providing their own key
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens || 8192,
        system: request.systemPrompt,
        messages: convertMessages(request.messages),
        temperature: request.temperature,
        stop_sequences: request.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Extract text from response
    const textContent = data.content.find((c: any) => c.type === 'text');
    const text = textContent?.text || '';

    return {
      role: 'assistant',
      content: {
        type: 'text',
        text,
      },
      model: data.model,
      stopReason: data.stop_reason === 'end_turn' ? 'endTurn' : data.stop_reason,
    };
  }
}
