/**
 * REST API Handler Tests
 * 
 * Tests that handlers correctly pass parameters to core logic WITHOUT tokens.
 * This validates the key architectural constraint: tokens should never reach core logic,
 * only pre-configured clients with tokens baked into closures.
 */

import type { Request, Response } from 'express';
import { handleWriteNextStory } from './write-next-story.js';
import { handleCheckStoryChanges } from './check-story-changes.js';

// Mock the Atlassian helpers to prevent actual API calls
jest.mock('../providers/atlassian/atlassian-helpers.js', () => ({
  ...jest.requireActual('../providers/atlassian/atlassian-helpers.js'),
  addIssueComment: jest.fn().mockResolvedValue({
    commentId: 'mock-comment-id',
    response: { ok: true }
  }),
  updateIssueComment: jest.fn().mockResolvedValue({ ok: true }),
  resolveCloudId: jest.fn().mockResolvedValue({ cloudId: 'cloud-456', siteName: 'my-site' })
}));

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
        'x-figma-token': 'figma-token',
        'x-anthropic-key': 'test-anthropic-key-for-unit-test'
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
      createAtlassianClient: jest.fn().mockReturnValue({ 
        fetch: jest.fn(),
        getJiraBaseUrl: jest.fn().mockReturnValue('https://test.atlassian.net')
      }),
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
      cloudId: 'cloud-456',  // resolvedCloudId
      siteName: 'my-site'
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

  it('should call executeCheckStoryChanges with params that do NOT contain tokens', async () => {
    // Create a mock for executeCheckStoryChanges to capture what it's called with
    const mockExecute = jest.fn().mockResolvedValue({
      success: true,
      analysis: '# Divergence Analysis\n\nNo conflicts found.',
      metadata: {
        parentKey: 'PROJ-100',
        childKey: 'PROJ-124',
        tokensUsed: 500
      }
    });

    // Create mock request
    const mockReq = {
      headers: {
        'x-atlassian-token': 'atlassian-token',
        'x-anthropic-key': 'test-anthropic-key-for-unit-test'
      },
      body: {
        storyKey: 'PROJ-124',
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
    await handleCheckStoryChanges(mockReq, mockRes, {
      executeCheckStoryChanges: mockExecute,
      createAtlassianClient: jest.fn().mockReturnValue({ 
        fetch: jest.fn(),
        getJiraBaseUrl: jest.fn().mockReturnValue('https://test.atlassian.net')
      }),
      // createLLMClient is now imported directly from llm-client
    });

    // Verify response was sent
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        analysis: expect.stringContaining('Divergence Analysis')
      })
    );
    
    // Verify executeCheckStoryChanges was called
    expect(mockExecute).toHaveBeenCalledTimes(1);
    
    // **KEY ASSERTION**: Verify params passed to core logic do NOT contain tokens!
    const [params, deps] = mockExecute.mock.calls[0];
    
    // Params should only have business data, never auth tokens
    expect(params).toEqual({
      storyKey: 'PROJ-124',
      cloudId: 'cloud-456',  // resolvedCloudId
      siteName: 'my-site'
    });
    expect(params).not.toHaveProperty('atlassianToken');
    expect(params).not.toHaveProperty('anthropicApiKey');
    
    // Deps should contain pre-configured clients (with tokens in closures), not raw tokens
    expect(deps).toHaveProperty('atlassianClient');
    expect(deps).toHaveProperty('figmaClient');
    expect(deps).toHaveProperty('generateText');
    expect(deps).toHaveProperty('notify');
    expect(deps).not.toHaveProperty('atlassianToken');
    expect(deps).not.toHaveProperty('anthropicApiKey');
  });

  it('should handle missing storyKey in check-story-changes request', async () => {
    // Create mock request without storyKey
    const mockReq = {
      headers: {
        'x-atlassian-token': 'atlassian-token',
        'x-anthropic-key': 'test-anthropic-key-for-unit-test'
      },
      body: {
        cloudId: 'cloud-456',
        siteName: 'my-site'
        // Missing storyKey
      }
    } as Partial<Request> as Request;

    // Create mock response
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;

    // Call handler
    await handleCheckStoryChanges(mockReq, mockRes);

    // Should return 400 error for missing storyKey
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required field: storyKey'
    });
  });

  it('should handle missing Atlassian token in check-story-changes request', async () => {
    // Create mock request without Atlassian token
    const mockReq = {
      headers: {
        'x-anthropic-key': 'test-anthropic-key-for-unit-test'
        // Missing x-atlassian-token
      },
      body: {
        storyKey: 'PROJ-124',
        cloudId: 'cloud-456',
        siteName: 'my-site'
      }
    } as Partial<Request> as Request;

    // Create mock response
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;

    // Call handler
    await handleCheckStoryChanges(mockReq, mockRes);

    // Should return 401 error for missing auth token
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required header: X-Atlassian-Token'
    });
  });

  it('should handle InvalidTokenError in check-story-changes', async () => {
    // Create a mock that throws InvalidTokenError
    const mockExecute = jest.fn().mockRejectedValue(
      Object.assign(new Error('Token expired'), { constructor: { name: 'InvalidTokenError' } })
    );

    // Create mock request
    const mockReq = {
      headers: {
        'x-atlassian-token': 'atlassian-token',
        'x-anthropic-key': 'test-anthropic-key-for-unit-test'
      },
      body: {
        storyKey: 'PROJ-124',
        cloudId: 'cloud-456',
        siteName: 'my-site'
      }
    } as Partial<Request> as Request;

    // Create mock response
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;

    // Call handler with mock that throws InvalidTokenError
    await handleCheckStoryChanges(mockReq, mockRes, {
      executeCheckStoryChanges: mockExecute,
      createAtlassianClient: jest.fn().mockReturnValue({ 
        fetch: jest.fn(),
        getJiraBaseUrl: jest.fn().mockReturnValue('https://test.atlassian.net')
      }),
    });

    // Should return 401 for auth errors (no comment)
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token expired'
    });
  });
});
