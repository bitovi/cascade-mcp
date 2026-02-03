/**
 * Screen Analyzer Tests
 * 
 * Tests for AI-powered screen analysis.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  analyzeFrame,
  analyzeFrames,
  buildAnalysisPrompt,
  buildMessageContent,
  formatAnnotations,
  type FrameAnalysisInput,
} from './screen-analyzer.js';
import type { AnalyzedFrame, FrameAnnotation } from './types.js';
import type { DownloadedImage } from './image-downloader.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockFrame = (overrides: Partial<AnalyzedFrame> = {}): AnalyzedFrame => ({
  name: 'login-screen',
  nodeId: '123:456',
  url: 'https://figma.com/file/abc/Test?node-id=123:456',
  annotations: [],
  ...overrides,
});

const createMockNodeData = () => ({
  id: '123:456',
  name: 'Login Screen',
  type: 'FRAME',
  children: [
    { id: '123:457', name: 'Header', type: 'FRAME', visible: true },
    { id: '123:458', name: 'Login Button', type: 'INSTANCE', visible: true },
  ],
});

const createMockImage = (): DownloadedImage => ({
  nodeId: '123:456',
  base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  mimeType: 'image/png',
  byteSize: 68,
});

const createMockGenerateText = (responseText: string = 'Mock analysis'): GenerateTextFn => {
  return jest.fn().mockResolvedValue({
    text: responseText,
    metadata: { model: 'mock-model' },
  });
};

// ============================================================================
// analyzeFrame
// ============================================================================

describe('analyzeFrame', () => {
  it('should generate analysis for a frame', async () => {
    const mockGenerateText = createMockGenerateText('# Login Screen\n\nThis screen allows users to log in.');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen name="Login">...</Screen>');
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
    };
    
    const result = await analyzeFrame(
      input,
      mockGenerateText,
      {},
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    expect(result.success).toBe(true);
    expect(result.frame.analysis).toBe('# Login Screen\n\nThis screen allows users to log in.');
    expect(result.frame.cached).toBe(false);
    expect(result.semanticXml).toBe('<Screen name="Login">...</Screen>');
    expect(mockGenerateSemanticXml).toHaveBeenCalledWith(input.nodeData);
  });
  
  it('should include image in multimodal message', async () => {
    const mockGenerateText = createMockGenerateText('Analysis with image');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
      image: createMockImage(),
    };
    
    await analyzeFrame(
      input,
      mockGenerateText,
      { includeImage: true },
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    // Check that generateText was called with multimodal content
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image', data: expect.any(String) }),
              expect.objectContaining({ type: 'text' }),
            ]),
          }),
        ]),
      })
    );
  });
  
  it('should exclude image when includeImage is false', async () => {
    const mockGenerateText = createMockGenerateText('Text-only analysis');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
      image: createMockImage(),
    };
    
    await analyzeFrame(
      input,
      mockGenerateText,
      { includeImage: false },
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    // Check that generateText was called with text-only content
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.any(String), // String, not array
          }),
        ]),
      })
    );
  });
  
  it('should handle LLM errors gracefully', async () => {
    const mockGenerateText = jest.fn().mockRejectedValue(new Error('LLM API error'));
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
    };
    
    const result = await analyzeFrame(
      input,
      mockGenerateText,
      {},
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('LLM API error');
    expect(result.frame.analysis).toBeUndefined();
  });
  
  it('should use custom system prompt when provided', async () => {
    const mockGenerateText = createMockGenerateText('Custom analysis');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const customPrompt = 'You are a mobile app analyst.';
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
    };
    
    await analyzeFrame(
      input,
      mockGenerateText,
      { systemPrompt: customPrompt },
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: customPrompt,
          }),
        ]),
      })
    );
  });
  
  it('should pass contextMarkdown to prompt builder', async () => {
    const mockGenerateText = createMockGenerateText('Context-aware analysis');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const contextMarkdown = `## Epic Context\n\nThis is the login feature epic.`;
    
    const input: FrameAnalysisInput = {
      frame: createMockFrame(),
      nodeData: createMockNodeData(),
    };
    
    await analyzeFrame(
      input,
      mockGenerateText,
      { contextMarkdown },
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    // Check that the prompt includes the context
    const callArg = (mockGenerateText as jest.Mock).mock.calls[0][0];
    const userMessage = callArg.messages.find((m: any) => m.role === 'user');
    // Content could be string or array
    const textContent = typeof userMessage.content === 'string' 
      ? userMessage.content 
      : userMessage.content.find((c: any) => c.type === 'text')?.text;
    
    expect(textContent).toContain('## Feature Context & Priorities');
    expect(textContent).toContain('Epic Context');
  });
});

// ============================================================================
// analyzeFrames
// ============================================================================

describe('analyzeFrames', () => {
  it('should analyze multiple frames', async () => {
    const mockGenerateText = createMockGenerateText('Analysis');
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const inputs: FrameAnalysisInput[] = [
      { frame: createMockFrame({ name: 'screen-1', nodeId: '1:1' }), nodeData: createMockNodeData() },
      { frame: createMockFrame({ name: 'screen-2', nodeId: '2:2' }), nodeData: createMockNodeData() },
      { frame: createMockFrame({ name: 'screen-3', nodeId: '3:3' }), nodeData: createMockNodeData() },
    ];
    
    const results = await analyzeFrames(
      inputs,
      mockGenerateText,
      {},
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });
  
  it('should handle empty input', async () => {
    const mockGenerateText = createMockGenerateText('Analysis');
    
    const results = await analyzeFrames([], mockGenerateText);
    
    expect(results).toHaveLength(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
  
  it('should continue analyzing when one frame fails', async () => {
    let callCount = 0;
    const mockGenerateText = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error('Failed'));
      }
      return Promise.resolve({ text: 'Success' });
    });
    const mockGenerateSemanticXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    
    const inputs: FrameAnalysisInput[] = [
      { frame: createMockFrame({ name: 'screen-1' }), nodeData: createMockNodeData() },
      { frame: createMockFrame({ name: 'screen-2' }), nodeData: createMockNodeData() },
      { frame: createMockFrame({ name: 'screen-3' }), nodeData: createMockNodeData() },
    ];
    
    const results = await analyzeFrames(
      inputs,
      mockGenerateText,
      {},
      { generateSemanticXml: mockGenerateSemanticXml }
    );
    
    expect(results).toHaveLength(3);
    expect(results.filter(r => r.success)).toHaveLength(2);
    expect(results.filter(r => !r.success)).toHaveLength(1);
  });
});

// ============================================================================
// buildAnalysisPrompt
// ============================================================================

describe('buildAnalysisPrompt', () => {
  it('should include frame name', () => {
    const frame = createMockFrame({ frameName: 'Login Screen' });
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    expect(prompt).toContain('# Screen: Login Screen');
  });
  
  it('should fall back to sanitized name', () => {
    const frame = createMockFrame({ name: 'login-screen', frameName: undefined });
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    expect(prompt).toContain('# Screen: login-screen');
  });
  
  it('should include section context when available', () => {
    const frame = createMockFrame({ sectionName: 'Authentication Flow' });
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    expect(prompt).toContain('**Section**: Authentication Flow');
  });
  
  it('should include screen order when frame has order and totalFrames provided', () => {
    const frame = createMockFrame({ order: 2 }); // 0-indexed, so this is screen 3
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>', undefined, 5);
    
    expect(prompt).toContain('- **Screen Order:** 3 of 5');
  });
  
  it('should include screen order without total when totalFrames not provided', () => {
    const frame = createMockFrame({ order: 0 }); // First screen
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    // Should show "1" without " of X"
    expect(prompt).toContain('- **Screen Order:** 1\n');
  });
  
  it('should omit screen order when frame has no order', () => {
    const frame = createMockFrame({ order: undefined });
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    expect(prompt).not.toContain('Screen Order');
  });
  
  it('should include annotations when available', () => {
    const annotations: FrameAnnotation[] = [
      { type: 'note', content: 'This is the main login screen' },
      { type: 'comment', content: 'Add forgot password link', author: 'Designer' },
    ];
    const frame = createMockFrame({ annotations });
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    expect(prompt).toContain('## Design Notes & Annotations');
    expect(prompt).toContain('**Note**: This is the main login screen');
    expect(prompt).toContain('**Comment (Designer)**: Add forgot password link');
  });
  
  it('should include semantic XML', () => {
    const frame = createMockFrame();
    const xml = '<Screen name="Test"><Button>Click me</Button></Screen>';
    const prompt = buildAnalysisPrompt(frame, xml);
    
    expect(prompt).toContain('## Figma Semantic Structure');
    expect(prompt).toContain('```xml');
    expect(prompt).toContain(xml);
    expect(prompt).toContain('```');
  });
  
  it('should include contextMarkdown when provided', () => {
    const frame = createMockFrame();
    const contextMarkdown = `## Feature: Login Feature

This feature covers the authentication flow including:
- Login form
- Password reset
- OAuth integration`;
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>', contextMarkdown);
    
    expect(prompt).toContain('## Feature Context & Priorities');
    expect(prompt).toContain('## Feature: Login Feature');
    expect(prompt).toContain('OAuth integration');
  });
  
  it('should show no feature context message when contextMarkdown is undefined', () => {
    const frame = createMockFrame();
    const prompt = buildAnalysisPrompt(frame, '<Screen>...</Screen>');
    
    // The section header is always present, but shows fallback message
    expect(prompt).toContain('## Feature Context & Priorities');
    expect(prompt).toContain('No feature context provided for this analysis.');
  });
});

// ============================================================================
// buildMessageContent
// ============================================================================

describe('buildMessageContent', () => {
  it('should return string when no image', () => {
    const content = buildMessageContent('Hello world');
    
    expect(content).toBe('Hello world');
  });
  
  it('should return array with image and text when image provided', () => {
    const image = createMockImage();
    const content = buildMessageContent('Hello world', image);
    
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);
    expect((content as any[])[0]).toEqual({
      type: 'image',
      data: image.base64Data,
      mimeType: image.mimeType,
    });
    expect((content as any[])[1]).toEqual({
      type: 'text',
      text: 'Hello world',
    });
  });
});

// ============================================================================
// formatAnnotations
// ============================================================================

describe('formatAnnotations', () => {
  it('should format notes', () => {
    const annotations: FrameAnnotation[] = [
      { type: 'note', content: 'A note' },
    ];
    
    const formatted = formatAnnotations(annotations);
    expect(formatted).toBe('- Note: A note');
  });
  
  it('should format comments with author', () => {
    const annotations: FrameAnnotation[] = [
      { type: 'comment', content: 'A comment', author: 'John' },
    ];
    
    const formatted = formatAnnotations(annotations);
    expect(formatted).toBe('- Comment (John): A comment');
  });
  
  it('should format comments without author', () => {
    const annotations: FrameAnnotation[] = [
      { type: 'comment', content: 'Anonymous comment' },
    ];
    
    const formatted = formatAnnotations(annotations);
    expect(formatted).toBe('- Comment: Anonymous comment');
  });
  
  it('should handle empty array', () => {
    const formatted = formatAnnotations([]);
    expect(formatted).toBe('');
  });
  
  it('should handle multiple annotations', () => {
    const annotations: FrameAnnotation[] = [
      { type: 'note', content: 'Note 1' },
      { type: 'comment', content: 'Comment 1', author: 'Alice' },
      { type: 'note', content: 'Note 2' },
    ];
    
    const formatted = formatAnnotations(annotations);
    expect(formatted).toContain('- Note: Note 1');
    expect(formatted).toContain('- Comment (Alice): Comment 1');
    expect(formatted).toContain('- Note: Note 2');
  });
});
