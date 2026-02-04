/**
 * Analysis Orchestrator Tests
 * 
 * Tests for the main workflow orchestrator.
 * Uses dependency injection to test workflow coordination
 * without making real API calls.
 */

import {
  analyzeScreens,
  type AnalysisWorkflowOptions,
  type OrchestratorDeps,
} from './analysis-orchestrator.js';
import type { AnalyzedFrame } from './types.js';
import type { FigmaClient } from '../figma-api-client.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockFigmaClient = (): FigmaClient => ({
  getFile: jest.fn(),
  getFileNodes: jest.fn(),
  getFileComments: jest.fn(),
  getImages: jest.fn(),
  getFileVersions: jest.fn(),
} as any);

const createMockGenerateText = (): GenerateTextFn => 
  jest.fn().mockResolvedValue({
    text: 'Mock analysis',
    metadata: { model: 'mock-model' },
  });

const createMockFrame = (overrides: Partial<AnalyzedFrame> = {}): AnalyzedFrame => ({
  name: 'test-screen',
  nodeId: '123:456',
  url: 'https://figma.com/file/abc/Test?node-id=123:456',
  annotations: [],
  ...overrides,
});

const createMockDeps = (overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps => ({
  parseFigmaUrls: jest.fn().mockReturnValue({
    valid: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
    invalid: [],
  }),
  
  fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
    figmaFileKey: 'abc123',
    parsedUrls: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
    nodesDataMap: new Map([
      ['123:456', { id: '123:456', name: 'Test Screen', type: 'FRAME', children: [] }],
    ]),
    errors: [],
  }),
  
  expandNodes: jest.fn().mockReturnValue({
    frames: [{ id: '123:456', name: 'Test Screen', type: 'FRAME' }],
    notes: [],
    nodesDataMap: new Map([
      ['123:456', { id: '123:456', name: 'Test Screen', type: 'FRAME', children: [] }],
    ]),
  }),
  
  fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
    frames: [createMockFrame()],
    unassociatedNotes: [],
    unattachedComments: [],
    stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
  }),
  
  validateCache: jest.fn().mockResolvedValue({
    cachePath: './cache/abc123',
    wasInvalidated: true,
    lastTouchedAt: '2024-01-01T00:00:00Z',
    fileMetadata: { lastTouchedAt: '2024-01-01T00:00:00Z' },
  }),
  
  saveCacheMetadata: jest.fn().mockResolvedValue(undefined),
  
  downloadImages: jest.fn().mockResolvedValue({
    images: new Map([
      ['123:456', { nodeId: '123:456', base64Data: 'abc', mimeType: 'image/png', byteSize: 100 }],
    ]),
    failed: [],
    totalBytes: 100,
  }),
  
  analyzeFrames: jest.fn().mockResolvedValue([
    {
      frame: { ...createMockFrame(), analysis: 'Mock analysis', cached: false },
      semanticXml: '<Screen>...</Screen>',
      success: true,
    },
  ]),
  
  calculateFrameOrder: jest.fn().mockImplementation(frames => 
    frames.map((f: AnalyzedFrame, i: number) => ({ ...f, order: i + 1 }))
  ),
  
  ...overrides,
});

// ============================================================================
// analyzeScreens
// ============================================================================

describe('analyzeScreens', () => {
  it('should complete full workflow', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps();
    
    const result = await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      {},
      deps
    );
    
    expect(result.frames).toHaveLength(1);
    expect(result.figmaFileUrl).toBe('https://www.figma.com/file/abc123');
    
    // Verify workflow order
    expect(deps.parseFigmaUrls).toHaveBeenCalled();
    expect(deps.fetchFrameNodesFromUrls).toHaveBeenCalled();
    expect(deps.expandNodes).toHaveBeenCalled();
    expect(deps.downloadImages).toHaveBeenCalled();
    expect(deps.analyzeFrames).toHaveBeenCalled();
    expect(deps.calculateFrameOrder).toHaveBeenCalled();
  });
  
  it('should throw error for empty URLs', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps({
      parseFigmaUrls: jest.fn().mockReturnValue({ valid: [], invalid: [] }),
    });
    
    await expect(
      analyzeScreens([], figmaClient, generateText, {}, deps)
    ).rejects.toThrow('No valid Figma URLs provided');
  });
  
  it('should pass image options to download', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps();
    
    await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      { imageOptions: { format: 'jpg', scale: 2 } },
      deps
    );
    
    expect(deps.downloadImages).toHaveBeenCalledWith(
      figmaClient,
      'abc123',
      expect.any(Array),
      expect.objectContaining({ format: 'jpg', scale: 2 })
    );
  });
  
  it('should save cache metadata after cache invalidation', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const mockFileMetadata = { lastTouchedAt: '2024-01-01T00:00:00Z' };
    const deps = createMockDeps({
      validateCache: jest.fn().mockResolvedValue({
        cachePath: './cache/abc123',
        wasInvalidated: true,
        lastTouchedAt: '2024-01-01T00:00:00Z',
        fileMetadata: mockFileMetadata,
      }),
    });
    
    await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      {},
      deps
    );
    
    expect(deps.saveCacheMetadata).toHaveBeenCalledWith('abc123', mockFileMetadata);
  });
  
  it('should not save cache metadata when cache is valid', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps({
      validateCache: jest.fn().mockResolvedValue({
        cachePath: './cache/abc123',
        wasInvalidated: false,
        lastTouchedAt: '2024-01-01T00:00:00Z',
        fileMetadata: { lastTouchedAt: '2024-01-01T00:00:00Z' },
      }),
    });
    
    await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      {},
      deps
    );
    
    expect(deps.saveCacheMetadata).not.toHaveBeenCalled();
  });
  
  it('should handle multiple URLs from same file', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps({
      parseFigmaUrls: jest.fn().mockReturnValue({
        valid: [
          { url: 'url1', fileKey: 'abc123', nodeId: '1:1' },
          { url: 'url2', fileKey: 'abc123', nodeId: '2:2' },
          { url: 'url3', fileKey: 'abc123', nodeId: '3:3' },
        ],
        invalid: [],
      }),
      fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
        figmaFileKey: 'abc123',
        parsedUrls: [],
        nodesDataMap: new Map([
          ['1:1', { id: '1:1', name: 'Screen 1', type: 'FRAME' }],
          ['2:2', { id: '2:2', name: 'Screen 2', type: 'FRAME' }],
          ['3:3', { id: '3:3', name: 'Screen 3', type: 'FRAME' }],
        ]),
        errors: [],
      }),
      expandNodes: jest.fn().mockReturnValue({
        frames: [
          { id: '1:1', name: 'Screen 1', type: 'FRAME' },
          { id: '2:2', name: 'Screen 2', type: 'FRAME' },
          { id: '3:3', name: 'Screen 3', type: 'FRAME' },
        ],
        notes: [],
        nodesDataMap: new Map([
          ['1:1', { id: '1:1', name: 'Screen 1', type: 'FRAME', children: [] }],
          ['2:2', { id: '2:2', name: 'Screen 2', type: 'FRAME', children: [] }],
          ['3:3', { id: '3:3', name: 'Screen 3', type: 'FRAME', children: [] }],
        ]),
      }),
      fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
        frames: [
          createMockFrame({ name: 'screen-1', nodeId: '1:1' }),
          createMockFrame({ name: 'screen-2', nodeId: '2:2' }),
          createMockFrame({ name: 'screen-3', nodeId: '3:3' }),
        ],
        unassociatedNotes: [],
        unattachedComments: [],
        stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
      }),
      analyzeFrames: jest.fn().mockResolvedValue([
        { frame: createMockFrame({ name: 'screen-1', analysis: 'A1' }), success: true },
        { frame: createMockFrame({ name: 'screen-2', analysis: 'A2' }), success: true },
        { frame: createMockFrame({ name: 'screen-3', analysis: 'A3' }), success: true },
      ]),
    });
    
    const result = await analyzeScreens(
      [
        'https://figma.com/file/abc/Test?node-id=1-1',
        'https://figma.com/file/abc/Test?node-id=2-2',
        'https://figma.com/file/abc/Test?node-id=3-3',
      ],
      figmaClient,
      generateText,
      {},
      deps
    );
    
    expect(result.frames).toHaveLength(3);
  });
  
  it('should call notify callback at key workflow points', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps();
    const mockNotify = jest.fn().mockResolvedValue(undefined);
    
    await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      { notify: mockNotify },
      deps
    );
    
    // Should be called at least twice: once after expansion, once after analysis
    expect(mockNotify).toHaveBeenCalledTimes(2);
    
    // First call: screen count notification (should include comment threads matched/total)
    expect(mockNotify).toHaveBeenNthCalledWith(1, expect.stringContaining('🤖 Analyzing Figma:'));
    expect(mockNotify).toHaveBeenNthCalledWith(1, expect.stringContaining('1 screen(s)'));
    expect(mockNotify).toHaveBeenNthCalledWith(1, expect.stringMatching(/\d+ of \d+ comment thread\(s\)/));
    
    // Second call: analysis complete notification
    expect(mockNotify).toHaveBeenNthCalledWith(2, expect.stringContaining('Screen analysis complete:'));
  });
  
  it('should work without notify callback', async () => {
    const figmaClient = createMockFigmaClient();
    const generateText = createMockGenerateText();
    const deps = createMockDeps();
    
    // Should not throw when notify is undefined
    const result = await analyzeScreens(
      ['https://figma.com/file/abc/Test?node-id=123-456'],
      figmaClient,
      generateText,
      {}, // no notify callback
      deps
    );
    
    expect(result.frames).toHaveLength(1);
  });
});
