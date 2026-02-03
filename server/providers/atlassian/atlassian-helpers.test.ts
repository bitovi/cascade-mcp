/**
 * Unit tests for Atlassian helpers
 */

import { describe, test, expect } from '@jest/globals';
import { extractProjectKeyFromIssueKey } from './atlassian-helpers.js';

// ============================================================================
// extractProjectKeyFromIssueKey tests
// ============================================================================

describe('extractProjectKeyFromIssueKey', () => {
  test('extracts project key from standard issue key format', () => {
    expect(extractProjectKeyFromIssueKey('TF-101')).toBe('TF');
    expect(extractProjectKeyFromIssueKey('PROJ-1234')).toBe('PROJ');
    expect(extractProjectKeyFromIssueKey('ABC-1')).toBe('ABC');
  });

  test('handles multi-character project keys', () => {
    expect(extractProjectKeyFromIssueKey('LONGPROJECT-999')).toBe('LONGPROJECT');
  });

  test('handles issue keys with multiple hyphens', () => {
    // Should only take the first part before the first hyphen
    expect(extractProjectKeyFromIssueKey('PROJ-123-456')).toBe('PROJ');
  });

  test('throws error for invalid issue key without hyphen', () => {
    expect(() => extractProjectKeyFromIssueKey('INVALID')).toThrow(
      'Invalid issue key format: INVALID. Expected format: PROJECT-123'
    );
  });

  test('throws error for issue key that is just a hyphen', () => {
    expect(() => extractProjectKeyFromIssueKey('-')).toThrow(
      'Invalid issue key format: -. Expected format: PROJECT-123'
    );
  });

  test('throws error for empty string', () => {
    expect(() => extractProjectKeyFromIssueKey('')).toThrow(
      'Invalid issue key format: . Expected format: PROJECT-123'
    );
  });
});
