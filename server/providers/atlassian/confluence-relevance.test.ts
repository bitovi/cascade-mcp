/**
 * Confluence Relevance Scoring Tests
 * 
 * Tests for the document relevance scoring functions used by both
 * Confluence and Google Docs integration.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  scoreDocumentRelevance,
  getDocsRelevanceThreshold,
  getRelevanceThreshold,
  loadToolSummaries,
  clearToolSummariesCache,
  type RawToolSummary,
} from './confluence-relevance.js';
import type { GenerateTextFn } from '../../llm-client/types.js';
import type { DocumentRelevance } from './confluence-cache.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPRDContent = `
# Product Requirements Document: User Authentication

## Overview
This document outlines the requirements for the user authentication feature.

## User Stories
- As a user, I want to log in with my email and password
- As a user, I want to reset my password if I forget it
- As a user, I want to enable two-factor authentication

## Acceptance Criteria
- Login must complete within 3 seconds
- Password must meet complexity requirements
- 2FA must support TOTP apps

## Technical Requirements
- Use OAuth 2.0 for authentication
- Store passwords using bcrypt
- Support session tokens with 24-hour expiry
`;

const mockVacationScheduleContent = `
# Team Vacation Schedule - Q4 2024

| Team Member | Dates | Notes |
|-------------|-------|-------|
| Alice | Dec 20-31 | Holiday travel |
| Bob | Dec 23-27 | Family time |
| Charlie | Dec 24-25 | Short break |

Please update the shared calendar if plans change.
`;

/**
 * Create a mock generateText function that returns a specified relevance response
 */
function createMockGenerateText(response: DocumentRelevance): GenerateTextFn {
  return jest.fn(async () => ({
    text: JSON.stringify(response),
    tokenUsage: { promptTokens: 100, completionTokens: 50 },
  })) as unknown as GenerateTextFn;
}

// ============================================================================
// Tests: getDocsRelevanceThreshold()
// ============================================================================

describe('getDocsRelevanceThreshold', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default 3.0 when no env vars set', () => {
    delete process.env.DOCS_RELEVANCE_THRESHOLD;
    delete process.env.CONFLUENCE_RELEVANCE_THRESHOLD;
    
    expect(getDocsRelevanceThreshold()).toBe(3.0);
  });

  it('should use DOCS_RELEVANCE_THRESHOLD when set', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = '5.5';
    delete process.env.CONFLUENCE_RELEVANCE_THRESHOLD;
    
    expect(getDocsRelevanceThreshold()).toBe(5.5);
  });

  it('should fallback to CONFLUENCE_RELEVANCE_THRESHOLD when DOCS not set', () => {
    delete process.env.DOCS_RELEVANCE_THRESHOLD;
    process.env.CONFLUENCE_RELEVANCE_THRESHOLD = '4.0';
    
    expect(getDocsRelevanceThreshold()).toBe(4.0);
  });

  it('should prefer DOCS_RELEVANCE_THRESHOLD over CONFLUENCE when both set', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = '6.0';
    process.env.CONFLUENCE_RELEVANCE_THRESHOLD = '4.0';
    
    expect(getDocsRelevanceThreshold()).toBe(6.0);
  });

  it('should return default 3.0 when env var is invalid (NaN)', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = 'invalid';
    
    expect(getDocsRelevanceThreshold()).toBe(3.0);
  });

  it('should parse integer values correctly', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = '7';
    
    expect(getDocsRelevanceThreshold()).toBe(7);
  });

  it('should parse negative values (though unusual)', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = '-1';
    
    expect(getDocsRelevanceThreshold()).toBe(-1);
  });

  it('should be aliased by getRelevanceThreshold()', () => {
    process.env.DOCS_RELEVANCE_THRESHOLD = '8.5';
    
    expect(getRelevanceThreshold()).toBe(8.5);
    expect(getRelevanceThreshold()).toBe(getDocsRelevanceThreshold());
  });
});

// ============================================================================
// Tests: scoreDocumentRelevance()
// ============================================================================

describe('scoreDocumentRelevance', () => {
  beforeEach(() => {
    clearToolSummariesCache();
  });

  it('should score a high-relevance PRD document with high scores', async () => {
    const highScoreResponse: DocumentRelevance = {
      documentType: 'requirements',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 9.0, summary: 'Excellent feature requirements' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 8.5, summary: 'Clear user stories and ACs' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 8.0, summary: 'Good story source' },
      ],
    };

    const mockGenerateText = createMockGenerateText(highScoreResponse);
    
    const result = await scoreDocumentRelevance(
      mockGenerateText,
      'Product Requirements Document',
      mockPRDContent
    );

    expect(result.documentType).toBe('requirements');
    expect(result.toolScores).toHaveLength(3);
    
    const scopeScore = result.toolScores.find(t => t.toolId === 'analyze-feature-scope');
    expect(scopeScore?.overallScore).toBe(9.0);
    
    const storiesScore = result.toolScores.find(t => t.toolId === 'write-shell-stories');
    expect(storiesScore?.overallScore).toBe(8.5);
  });

  it('should score a low-relevance vacation doc with low scores', async () => {
    const lowScoreResponse: DocumentRelevance = {
      documentType: 'unknown',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 1.0, summary: 'Not related to features' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 0.5, summary: 'No story content' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 0.5, summary: 'No story content' },
      ],
    };

    const mockGenerateText = createMockGenerateText(lowScoreResponse);
    
    const result = await scoreDocumentRelevance(
      mockGenerateText,
      'Vacation Schedule',
      mockVacationScheduleContent
    );

    expect(result.documentType).toBe('unknown');
    
    const scopeScore = result.toolScores.find(t => t.toolId === 'analyze-feature-scope');
    expect(scopeScore?.overallScore).toBeLessThan(3);
    
    const storiesScore = result.toolScores.find(t => t.toolId === 'write-shell-stories');
    expect(storiesScore?.overallScore).toBeLessThan(3);
  });

  it('should call generateText with document content', async () => {
    const mockResponse: DocumentRelevance = {
      documentType: 'technical',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 5, summary: 'Test' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 5, summary: 'Test' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 5, summary: 'Test' },
      ],
    };

    const mockGenerateText = createMockGenerateText(mockResponse);
    
    await scoreDocumentRelevance(
      mockGenerateText,
      'Test Document',
      'Some test content'
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const mockFn = mockGenerateText as jest.MockedFunction<typeof mockGenerateText>;
    const call = mockFn.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(call.messages[0].content).toContain('Test Document');
    expect(call.messages[0].content).toContain('Some test content');
  });

  it('should handle malformed LLM response gracefully', async () => {
    // Mock that returns invalid JSON
    const mockGenerateText = jest.fn(async () => ({
      text: 'This is not valid JSON at all',
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    })) as unknown as GenerateTextFn;
    
    const result = await scoreDocumentRelevance(
      mockGenerateText,
      'Test Document',
      'Some content'
    );

    // Should return default values on parse error
    expect(result.documentType).toBe('unknown');
    expect(result.toolScores).toHaveLength(3);
    expect(result.toolScores[0].overallScore).toBe(5); // Default middle score
  });

  it('should truncate very long documents', async () => {
    const longContent = 'x'.repeat(50000); // 50KB of content
    
    const mockResponse: DocumentRelevance = {
      documentType: 'context',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 5, summary: 'Test' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 5, summary: 'Test' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 5, summary: 'Test' },
      ],
    };

    const mockGenerateText = createMockGenerateText(mockResponse);
    
    await scoreDocumentRelevance(
      mockGenerateText,
      'Very Long Document',
      longContent
    );

    const mockFn = mockGenerateText as jest.MockedFunction<typeof mockGenerateText>;
    const call = mockFn.mock.calls[0][0] as { messages: Array<{ content: string }> };
    // Content should contain truncation marker (30KB limit + prompt overhead)
    expect(call.messages[0].content).toContain('[Content truncated');
    // The actual content in the prompt should be less than original 50KB
    expect(call.messages[0].content.length).toBeLessThan(longContent.length + 15000);
  });

  it('should handle JSON response wrapped in markdown code blocks', async () => {
    // Mock that returns JSON wrapped in markdown code blocks
    const mockGenerateText = jest.fn(async () => ({
      text: '```json\n' + JSON.stringify({
        documentType: 'requirements',
        toolScores: [
          { toolId: 'analyze-feature-scope', overallScore: 8, summary: 'Good' },
          { toolId: 'write-shell-stories', overallScore: 7, summary: 'Good' },
          { toolId: 'write-next-story', overallScore: 6, summary: 'Good' },
        ],
      }) + '\n```',
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    })) as unknown as GenerateTextFn;
    
    const result = await scoreDocumentRelevance(
      mockGenerateText,
      'Test Document',
      'Some content'
    );

    expect(result.documentType).toBe('requirements');
    expect(result.toolScores.find(t => t.toolId === 'analyze-feature-scope')?.overallScore).toBe(8);
  });
});

// ============================================================================
// Tests: loadToolSummaries()
// ============================================================================

describe('loadToolSummaries', () => {
  beforeEach(() => {
    clearToolSummariesCache();
  });

  it('should load all three tool summaries', async () => {
    const summaries = await loadToolSummaries();
    
    expect(summaries).toHaveLength(3);
    
    const toolIds = summaries.map(s => s.toolId);
    expect(toolIds).toContain('analyze-feature-scope');
    expect(toolIds).toContain('write-shell-stories');
    expect(toolIds).toContain('write-next-story');
  });

  it('should return non-empty markdown for each tool', async () => {
    const summaries = await loadToolSummaries();
    
    for (const summary of summaries) {
      expect(summary.markdown).toBeTruthy();
      expect(summary.markdown.length).toBeGreaterThan(10);
    }
  });

  it('should cache summaries on subsequent calls', async () => {
    const firstCall = await loadToolSummaries();
    const secondCall = await loadToolSummaries();
    
    // Should be the same object reference (cached)
    expect(firstCall).toBe(secondCall);
  });
});

// ============================================================================
// Tests: Document Source Agnostic (Confluence vs Google Docs)
// ============================================================================

describe('scoreDocumentRelevance - Source Agnostic', () => {
  beforeEach(() => {
    clearToolSummariesCache();
  });

  it('should score Google Docs content the same as Confluence content', async () => {
    const response: DocumentRelevance = {
      documentType: 'requirements',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 8, summary: 'Good PRD' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 7, summary: 'Clear stories' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 7, summary: 'Useful' },
      ],
    };

    const mockGenerateText = createMockGenerateText(response);
    
    // Test with a Google Docs URL in title (simulating Google Docs source)
    const googleDocsResult = await scoreDocumentRelevance(
      mockGenerateText,
      'PRD: Feature Spec (from Google Docs)',
      mockPRDContent
    );

    // Reset mock
    (mockGenerateText as jest.Mock).mockClear();

    // Test with same content but Confluence title
    const confluenceResult = await scoreDocumentRelevance(
      mockGenerateText,
      'PRD: Feature Spec (from Confluence)',
      mockPRDContent
    );

    // Both should get the same scores (content-based, not source-based)
    expect(googleDocsResult.toolScores[0].overallScore).toBe(confluenceResult.toolScores[0].overallScore);
    expect(googleDocsResult.documentType).toBe(confluenceResult.documentType);
  });

  it('should work with markdown content converted from HTML (Google Docs pattern)', async () => {
    // Google Docs content is converted from HTML to markdown via Turndown
    const htmlConvertedContent = `
# Design Document

This is a design document that was originally in Google Docs.

## Key Points

- Point 1: Important feature
- Point 2: Technical constraint

> This is a blockquote that came from Google Docs formatting

**Bold text** and _italic text_ preserved from original formatting.
    `;

    const response: DocumentRelevance = {
      documentType: 'technical',
      toolScores: [
        { toolId: 'analyze-feature-scope', decisionPointScores: [], overallScore: 6, summary: 'Design context' },
        { toolId: 'write-shell-stories', decisionPointScores: [], overallScore: 5, summary: 'Some useful info' },
        { toolId: 'write-next-story', decisionPointScores: [], overallScore: 5, summary: 'Background info' },
      ],
    };

    const mockGenerateText = createMockGenerateText(response);
    
    const result = await scoreDocumentRelevance(
      mockGenerateText,
      'Design Document',
      htmlConvertedContent
    );

    expect(result.documentType).toBe('technical');
    expect(result.toolScores.find(t => t.toolId === 'analyze-feature-scope')?.overallScore).toBe(6);
  });
});
