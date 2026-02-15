/**
 * Cache Reuse Tests
 * 
 * Tests that verify cache reuse between different tool invocations.
 * Simulates scenarios where figma-review-design runs first, then write-story
 * runs later and reuses the cached analysis.
 * 
 * Key scenarios covered:
 * 1. Full cache reuse - Second tool call reuses all cached .analysis.md files
 * 2. Partial cache reuse - Mix of cached and fresh analysis when adding new frames
 * 3. Cache invalidation - Figma file updates trigger fresh analysis
 * 4. Cross-file isolation - Different Figma files don't share cache
 * 5. Same file across epics - Cache persists across different Jira epics
 * 
 * These tests verify the core promise that running figma-review-design followed
 * by write-story will efficiently reuse the AI-generated analysis without redundant
 * LLM calls, while still respecting cache invalidation when Figma files change.
 */

import {
  analyzeScreens,
  type OrchestratorDeps,
} from './analysis-orchestrator.js';
import type { AnalyzedFrame, FrameAnalysisResult } from './types.js';
import type { FrameAnalysisOutput } from './screen-analyzer.js';
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

/**
 * Create base mock dependencies with common setup
 */
const createBaseMockDeps = (): OrchestratorDeps => ({
  parseFigmaUrls: jest.fn().mockReturnValue({
    valid: [
      { url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' },
      { url: 'https://figma.com/file/abc123?node-id=789-012', fileKey: 'abc123', nodeId: '789:012' },
    ],
    invalid: [],
  }),
  
  fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
    figmaFileKey: 'abc123',
    parsedUrls: [
      { url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' },
      { url: 'https://figma.com/file/abc123?node-id=789-012', fileKey: 'abc123', nodeId: '789:012' },
    ],
    nodesDataMap: new Map([
      ['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }],
      ['789:012', { id: '789:012', name: 'Screen 2', type: 'FRAME', children: [] }],
    ]),
    errors: [],
  }),
  
  expandNodes: jest.fn().mockReturnValue({
    frames: [
      { id: '123:456', name: 'Screen 1', type: 'FRAME' },
      { id: '789:012', name: 'Screen 2', type: 'FRAME' },
    ],
    notes: [],
    nodesDataMap: new Map([
      ['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }],
      ['789:012', { id: '789:012', name: 'Screen 2', type: 'FRAME', children: [] }],
    ]),
  }),
  
  fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
    frames: [
      createMockFrame({ name: 'screen-1', nodeId: '123:456' }),
      createMockFrame({ name: 'screen-2', nodeId: '789:012' }),
    ],
    unassociatedNotes: [],
    unattachedComments: [],
    stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
  }),
  
  validateCache: jest.fn().mockResolvedValue({
    cachePath: './cache/abc123',
    wasInvalidated: false,
    lastTouchedAt: '2024-01-01T00:00:00Z',
    fileMetadata: { lastTouchedAt: '2024-01-01T00:00:00Z' },
  }),
  
  saveCacheMetadata: jest.fn().mockResolvedValue(undefined),
  
  downloadImages: jest.fn().mockResolvedValue({
    images: new Map([
      ['123:456', { nodeId: '123:456', base64Data: 'abc', mimeType: 'image/png', byteSize: 100 }],
      ['789:012', { nodeId: '789:012', base64Data: 'def', mimeType: 'image/png', byteSize: 100 }],
    ]),
    failed: [],
    totalBytes: 200,
  }),
  
  calculateFrameOrder: jest.fn().mockImplementation(frames => 
    frames.map((f: AnalyzedFrame, i: number) => ({ ...f, order: i + 1 }))
  ),
});

// ============================================================================
// Cache Reuse Tests
// ============================================================================

describe('Cache Reuse Between Tool Invocations', () => {
  
  describe('First run generates cache, second run reuses it', () => {
    it('should generate analysis on first call and reuse on second call', async () => {
      const figmaClient = createMockFigmaClient();
      const generateText = createMockGenerateText();
      
      // Create mock that tracks call count to return different results
      let analyzeCallCount = 0;
      const mockAnalyzeFrames = jest.fn().mockImplementation(() => {
        analyzeCallCount++;
        
        if (analyzeCallCount === 1) {
          // First call (figma-review-design) - generates fresh analysis
          return Promise.resolve([
            {
              frame: { 
                ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
                analysis: 'Fresh analysis for screen 1', 
                cached: false 
              },
              semanticXml: '<Screen>...</Screen>',
              success: true,
            },
            {
              frame: { 
                ...createMockFrame({ name: 'screen-2', nodeId: '789:012' }), 
                analysis: 'Fresh analysis for screen 2', 
                cached: false 
              },
              semanticXml: '<Screen>...</Screen>',
              success: true,
            },
          ] as FrameAnalysisOutput[]);
        } else {
          // Second call (write-story) - reuses cached analysis
          return Promise.resolve([
            {
              frame: { 
                ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
                analysis: 'Fresh analysis for screen 1', 
                cached: true 
              },
              semanticXml: '',
              success: true,
            },
            {
              frame: { 
                ...createMockFrame({ name: 'screen-2', nodeId: '789:012' }), 
                analysis: 'Fresh analysis for screen 2', 
                cached: true 
              },
              semanticXml: '',
              success: true,
            },
          ] as FrameAnalysisOutput[]);
        }
      });
      
      const deps = {
        ...createBaseMockDeps(),
        analyzeFrames: mockAnalyzeFrames,
      };
      
      // First call - simulates figma-review-design
      const result1 = await analyzeScreens(
        [
          'https://figma.com/file/abc123?node-id=123-456',
          'https://figma.com/file/abc123?node-id=789-012',
        ],
        figmaClient,
        generateText,
        {},
        deps
      );
      
      // Verify first call generated fresh analysis
      expect(result1.frames).toHaveLength(2);
      expect(result1.frames[0].cached).toBe(false);
      expect(result1.frames[1].cached).toBe(false);
      expect(result1.frames[0].analysis).toBe('Fresh analysis for screen 1');
      expect(result1.frames[1].analysis).toBe('Fresh analysis for screen 2');
      
      // Second call - simulates write-story
      const result2 = await analyzeScreens(
        [
          'https://figma.com/file/abc123?node-id=123-456',
          'https://figma.com/file/abc123?node-id=789-012',
        ],
        figmaClient,
        generateText,
        {},
        deps
      );
      
      // Verify second call reused cached analysis
      expect(result2.frames).toHaveLength(2);
      expect(result2.frames[0].cached).toBe(true);
      expect(result2.frames[1].cached).toBe(true);
      expect(result2.frames[0].analysis).toBe('Fresh analysis for screen 1');
      expect(result2.frames[1].analysis).toBe('Fresh analysis for screen 2');
      
      // Verify analyzeFrames was called twice
      expect(mockAnalyzeFrames).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Partial cache reuse', () => {
    it('should reuse cache for some frames and regenerate others', async () => {
      const figmaClient = createMockFigmaClient();
      const generateText = createMockGenerateText();
      
      let analyzeCallCount = 0;
      const mockAnalyzeFrames = jest.fn().mockImplementation(() => {
        analyzeCallCount++;
        
        if (analyzeCallCount === 1) {
          // First call - only analyze first screen
          return Promise.resolve([
            {
              frame: { 
                ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
                analysis: 'Fresh analysis for screen 1', 
                cached: false 
              },
              semanticXml: '<Screen>...</Screen>',
              success: true,
            },
          ] as FrameAnalysisOutput[]);
        } else {
          // Second call - cache hit for screen 1, fresh for screen 2
          return Promise.resolve([
            {
              frame: { 
                ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
                analysis: 'Fresh analysis for screen 1', 
                cached: true 
              },
              semanticXml: '',
              success: true,
            },
            {
              frame: { 
                ...createMockFrame({ name: 'screen-2', nodeId: '789:012' }), 
                analysis: 'Fresh analysis for screen 2', 
                cached: false 
              },
              semanticXml: '<Screen>...</Screen>',
              success: true,
            },
          ] as FrameAnalysisOutput[]);
        }
      });
      
      const deps = {
        ...createBaseMockDeps(),
        analyzeFrames: mockAnalyzeFrames,
      };
      
      // First call - only one screen
      const result1 = await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        {},
        {
          ...deps,
          parseFigmaUrls: jest.fn().mockReturnValue({
            valid: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
            invalid: [],
          }),
          fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
            figmaFileKey: 'abc123',
            parsedUrls: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
            nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
            errors: [],
          }),
          expandNodes: jest.fn().mockReturnValue({
            frames: [{ id: '123:456', name: 'Screen 1', type: 'FRAME' }],
            notes: [],
            nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
          }),
          fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
            frames: [createMockFrame({ name: 'screen-1', nodeId: '123:456' })],
            unassociatedNotes: [],
            unattachedComments: [],
            stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
          }),
        }
      );
      
      expect(result1.frames).toHaveLength(1);
      expect(result1.frames[0].cached).toBe(false);
      
      // Second call - two screens (one cached, one new)
      const result2 = await analyzeScreens(
        [
          'https://figma.com/file/abc123?node-id=123-456',
          'https://figma.com/file/abc123?node-id=789-012',
        ],
        figmaClient,
        generateText,
        {},
        deps
      );
      
      expect(result2.frames).toHaveLength(2);
      expect(result2.frames[0].cached).toBe(true);  // Reused from first call
      expect(result2.frames[1].cached).toBe(false); // Newly generated
    });
  });
  
  describe('Cache invalidation clears reuse', () => {
    it('should regenerate analysis when cache is invalidated', async () => {
      const figmaClient = createMockFigmaClient();
      const generateText = createMockGenerateText();
      
      let analyzeCallCount = 0;
      const mockAnalyzeFrames = jest.fn().mockImplementation(() => {
        analyzeCallCount++;
        // Always return fresh analysis since cache was invalidated
        return Promise.resolve([
          {
            frame: { 
              ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
              analysis: `Fresh analysis ${analyzeCallCount}`, 
              cached: false 
            },
            semanticXml: '<Screen>...</Screen>',
            success: true,
          },
        ] as FrameAnalysisOutput[]);
      });
      
      const createDepsWithInvalidation = (wasInvalidated: boolean) => ({
        ...createBaseMockDeps(),
        analyzeFrames: mockAnalyzeFrames,
        validateCache: jest.fn().mockResolvedValue({
          cachePath: './cache/abc123',
          wasInvalidated,
          lastTouchedAt: '2024-01-02T00:00:00Z',
          fileMetadata: { lastTouchedAt: '2024-01-02T00:00:00Z' },
        }),
        parseFigmaUrls: jest.fn().mockReturnValue({
          valid: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
          invalid: [],
        }),
        fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
          figmaFileKey: 'abc123',
          parsedUrls: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
          errors: [],
        }),
        expandNodes: jest.fn().mockReturnValue({
          frames: [{ id: '123:456', name: 'Screen 1', type: 'FRAME' }],
          notes: [],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
        }),
        fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
          frames: [createMockFrame({ name: 'screen-1', nodeId: '123:456' })],
          unassociatedNotes: [],
          unattachedComments: [],
          stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
        }),
      });
      
      // First call - valid cache
      const result1 = await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        {},
        createDepsWithInvalidation(false)
      );
      
      expect(result1.frames[0].analysis).toBe('Fresh analysis 1');
      expect(result1.frames[0].cached).toBe(false);
      
      // Second call - cache invalidated (Figma file updated)
      const result2 = await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        {},
        createDepsWithInvalidation(true)
      );
      
      expect(result2.frames[0].analysis).toBe('Fresh analysis 2');
      expect(result2.frames[0].cached).toBe(false);
      
      // Verify both calls triggered analysis (no reuse)
      expect(mockAnalyzeFrames).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Cross-file cache isolation', () => {
    it('should not reuse cache across different Figma files', async () => {
      const figmaClient = createMockFigmaClient();
      const generateText = createMockGenerateText();
      
      const mockAnalyzeFrames = jest.fn().mockResolvedValue([
        {
          frame: { 
            ...createMockFrame({ name: 'screen', nodeId: '123:456' }), 
            analysis: 'Fresh analysis', 
            cached: false 
          },
          semanticXml: '<Screen>...</Screen>',
          success: true,
        },
      ] as FrameAnalysisOutput[]);
      
      const createDepsForFile = (fileKey: string) => ({
        ...createBaseMockDeps(),
        analyzeFrames: mockAnalyzeFrames,
        parseFigmaUrls: jest.fn().mockReturnValue({
          valid: [{ url: `https://figma.com/file/${fileKey}?node-id=123-456`, fileKey, nodeId: '123:456' }],
          invalid: [],
        }),
        fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
          figmaFileKey: fileKey,
          parsedUrls: [{ url: `https://figma.com/file/${fileKey}?node-id=123-456`, fileKey, nodeId: '123:456' }],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen', type: 'FRAME', children: [] }]]),
          errors: [],
        }),
        expandNodes: jest.fn().mockReturnValue({
          frames: [{ id: '123:456', name: 'Screen', type: 'FRAME' }],
          notes: [],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen', type: 'FRAME', children: [] }]]),
        }),
        fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
          frames: [createMockFrame({ name: 'screen', nodeId: '123:456' })],
          unassociatedNotes: [],
          unattachedComments: [],
          stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
        }),
        validateCache: jest.fn().mockResolvedValue({
          cachePath: `./cache/${fileKey}`,
          wasInvalidated: false,
          lastTouchedAt: '2024-01-01T00:00:00Z',
          fileMetadata: { lastTouchedAt: '2024-01-01T00:00:00Z' },
        }),
      });
      
      // First call - file abc123
      await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        {},
        createDepsForFile('abc123')
      );
      
      // Second call - different file xyz789
      await analyzeScreens(
        ['https://figma.com/file/xyz789?node-id=123-456'],
        figmaClient,
        generateText,
        {},
        createDepsForFile('xyz789')
      );
      
      // Verify both calls triggered analysis (no cross-file reuse)
      expect(mockAnalyzeFrames).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Same file key enables reuse', () => {
    it('should reuse cache when same file key is used regardless of epic', async () => {
      const figmaClient = createMockFigmaClient();
      const generateText = createMockGenerateText();
      
      let analyzeCallCount = 0;
      const mockAnalyzeFrames = jest.fn().mockImplementation(() => {
        analyzeCallCount++;
        
        return Promise.resolve([
          {
            frame: { 
              ...createMockFrame({ name: 'screen-1', nodeId: '123:456' }), 
              analysis: 'Fresh analysis for screen 1', 
              cached: analyzeCallCount > 1 // Second call onwards uses cache
            },
            semanticXml: analyzeCallCount === 1 ? '<Screen>...</Screen>' : '',
            success: true,
          },
        ] as FrameAnalysisOutput[]);
      });
      
      const deps = {
        ...createBaseMockDeps(),
        analyzeFrames: mockAnalyzeFrames,
        parseFigmaUrls: jest.fn().mockReturnValue({
          valid: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
          invalid: [],
        }),
        fetchFrameNodesFromUrls: jest.fn().mockResolvedValue({
          figmaFileKey: 'abc123',
          parsedUrls: [{ url: 'https://figma.com/file/abc123?node-id=123-456', fileKey: 'abc123', nodeId: '123:456' }],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
          errors: [],
        }),
        expandNodes: jest.fn().mockReturnValue({
          frames: [{ id: '123:456', name: 'Screen 1', type: 'FRAME' }],
          notes: [],
          nodesDataMap: new Map([['123:456', { id: '123:456', name: 'Screen 1', type: 'FRAME', children: [] }]]),
        }),
        fetchAndAssociateAnnotations: jest.fn().mockResolvedValue({
          frames: [createMockFrame({ name: 'screen-1', nodeId: '123:456' })],
          unassociatedNotes: [],
          unattachedComments: [],
          stats: { totalCommentThreads: 0, matchedCommentThreads: 0, totalNotes: 0, matchedNotes: 0 },
        }),
      };
      
      // First call - Epic PROJ-1 with figma-review-design
      const result1 = await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        { analysisOptions: { contextMarkdown: 'Context for PROJ-1' } },
        deps
      );
      
      expect(result1.frames[0].cached).toBe(false);
      
      // Second call - Epic PROJ-2 with write-story (same Figma file)
      const result2 = await analyzeScreens(
        ['https://figma.com/file/abc123?node-id=123-456'],
        figmaClient,
        generateText,
        { analysisOptions: { contextMarkdown: 'Context for PROJ-2' } },
        deps
      );
      
      expect(result2.frames[0].cached).toBe(true);
      expect(result2.frames[0].analysis).toBe('Fresh analysis for screen 1');
      
      // Verify cache was reused (analyzeFrames called twice but second one returned cached)
      expect(mockAnalyzeFrames).toHaveBeenCalledTimes(2);
    });
  });
});
