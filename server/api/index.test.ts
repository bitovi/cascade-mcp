/**
 * REST API Handler Tests
 * 
 * Tests that handlers correctly pass parameters to core logic WITHOUT tokens.
 * This validates the key architectural constraint: tokens should never reach core logic,
 * only pre-configured clients with tokens baked into closures.
 */

import type { Request, Response } from 'express';
import { handleWriteNextStory } from './write-next-story.js';

describe('REST API Handler - Token Isolation', () => {
  it('should call executeWriteNextStory with params that do NOT contain tokens', async () => {
    // Create a mock for executeWriteNextStory to capture what it's called with
    const mockExecute = jest.fn().mockResolvedValue({
      issueKey: 'PROJ-124',
      issueSelf: 'https://test.atlassian.net/rest/api/3/issue/124',
      storyTitle: 'Test Story'
    });

    // Create mock request
    const mockReq = {
      headers: {
        'x-atlassian-token': 'atlassian-token',
        'x-figma-token': 'figma-token'
      },
      body: {
        epicKey: 'PROJ-456',
        cloudId: 'cloud-456',
        siteName: 'my-site'
      }
    } as Partial<Request> as Request;

    // Create mock response
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;

    // Call the REAL handler with injected mock dependencies
    await handleWriteNextStory(mockReq, mockRes, {
      executeWriteNextStory: mockExecute,
      createAtlassianClient: jest.fn().mockReturnValue({ fetch: jest.fn() }),
      createFigmaClient: jest.fn().mockReturnValue({ fetch: jest.fn() }),
      // createLLMClient is now imported directly from llm-client
    });

    // Verify response was sent
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        issueKey: 'PROJ-124',
        epicKey: 'PROJ-456'
      })
    );
    
    // Verify executeWriteNextStory was called
    expect(mockExecute).toHaveBeenCalledTimes(1);
    
    // **KEY ASSERTION**: Verify params passed to core logic do NOT contain tokens!
    const [params, deps] = mockExecute.mock.calls[0];
    
    // Params should only have business data, never auth tokens
    expect(params).toEqual({
      epicKey: 'PROJ-456',
      cloudId: 'cloud-456',
      siteName: 'my-site',
      sessionId: undefined
    });
    expect(params).not.toHaveProperty('atlassianToken');
    expect(params).not.toHaveProperty('figmaToken');
    expect(params).not.toHaveProperty('anthropicApiKey');
    
    // Deps should contain pre-configured clients (with tokens in closures), not raw tokens
    expect(deps).toHaveProperty('atlassianClient');
    expect(deps).toHaveProperty('figmaClient');
    expect(deps).toHaveProperty('generateText');
    expect(deps).toHaveProperty('notify');
    expect(deps).not.toHaveProperty('atlassianToken');
    expect(deps).not.toHaveProperty('figmaToken');
    expect(deps).not.toHaveProperty('anthropicApiKey');
  });
});
