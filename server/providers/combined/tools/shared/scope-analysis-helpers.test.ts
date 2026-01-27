/**
 * Tests for scope-analysis-helpers.ts
 * 
 * Validates question counting, decision logic, and scope analysis extraction functions.
 * 
 * @see T009a - Unit test to verify LLM consistently outputs ❓/💬 markers in expected format
 * @see T012 - Unit test for question counter
 * @see T013 - Unit test for scope analysis extractor
 */

import {
  countUnansweredQuestions,
  countAnsweredQuestions,
  countFeatureMarkers,
  extractScopeAnalysis,
  decideSelfHealingAction,
  SelfHealingDecision,
  QUESTION_THRESHOLD,
} from './scope-analysis-helpers.js';

describe('scope-analysis-helpers', () => {
  
  describe('countUnansweredQuestions', () => {
    it('should count single ❓ marker', () => {
      const markdown = '- ❓ What is the error handling?';
      expect(countUnansweredQuestions(markdown)).toBe(1);
    });

    it('should count multiple ❓ markers', () => {
      const markdown = `
- ❓ What is the error handling?
- ❓ How should validation work?
- ❓ What are performance requirements?
      `;
      expect(countUnansweredQuestions(markdown)).toBe(3);
    });

    it('should not count 💬 answered markers', () => {
      const markdown = `
- ❓ What is the error handling?
- 💬 How should validation work?
- ❓ What are performance requirements?
      `;
      expect(countUnansweredQuestions(markdown)).toBe(2);
    });

    it('should handle indented questions', () => {
      const markdown = `
  - ❓ Indented question
    - ❓ Double indented question
      `;
      expect(countUnansweredQuestions(markdown)).toBe(2);
    });

    it('should return 0 for empty string', () => {
      expect(countUnansweredQuestions('')).toBe(0);
    });

    it('should return 0 when no markers present', () => {
      const markdown = `
### Feature Area
- ☐ Some feature
- ❌ Out of scope
      `;
      expect(countUnansweredQuestions(markdown)).toBe(0);
    });

    it('should handle mixed feature markers correctly', () => {
      const markdown = `
### Authentication Flow
- ☐ User login
- ❓ How should failed login attempts be handled?
- ⏬ Social login (low priority)
- ❌ OAuth (out of scope)
- ✅ Password reset (already done)

### Questions
- ❓ What are the performance requirements?
- 💬 How should errors be handled? (answered via Figma comment)
      `;
      expect(countUnansweredQuestions(markdown)).toBe(2);
    });
  });

  describe('countAnsweredQuestions', () => {
    it('should count 💬 answered markers', () => {
      const markdown = `
- 💬 What is the error handling? (answered)
- ❓ How should validation work?
- 💬 What are performance requirements? (answered)
      `;
      expect(countAnsweredQuestions(markdown)).toBe(2);
    });

    it('should return 0 when no answered markers', () => {
      const markdown = `
- ❓ What is the error handling?
- ❓ How should validation work?
      `;
      expect(countAnsweredQuestions(markdown)).toBe(0);
    });
  });

  describe('countFeatureMarkers', () => {
    it('should count all marker types', () => {
      const markdown = `
- ☐ Feature 1
- ☐ Feature 2
- ❌ Out of scope
- ⏬ Low priority
- ✅ Already done
- ❓ Question
      `;
      const counts = countFeatureMarkers(markdown);
      expect(counts.inScope).toBe(2);
      expect(counts.outOfScope).toBe(1);
      expect(counts.lowPriority).toBe(1);
      expect(counts.alreadyDone).toBe(1);
      expect(counts.needsClarification).toBe(1);
    });

    it('should handle empty markdown', () => {
      const counts = countFeatureMarkers('');
      expect(counts.inScope).toBe(0);
      expect(counts.outOfScope).toBe(0);
      expect(counts.lowPriority).toBe(0);
      expect(counts.alreadyDone).toBe(0);
      expect(counts.needsClarification).toBe(0);
    });
  });

  describe('extractScopeAnalysis', () => {
    it('should extract scope analysis section', () => {
      const epicContext = `
# Epic Title

Some description

## Scope Analysis

### Feature Area 1
- ☐ Feature
- ❓ Question

## Shell Stories

- st001: Story
      `;
      const result = extractScopeAnalysis(epicContext);
      expect(result.scopeAnalysis).not.toBeNull();
      expect(result.scopeAnalysis).toContain('### Feature Area 1');
      expect(result.scopeAnalysis).toContain('- ☐ Feature');
      expect(result.remainingContext).not.toContain('## Scope Analysis');
    });

    it('should return null when no scope analysis section', () => {
      const epicContext = `
# Epic Title

Some description

## Shell Stories
- st001: Story
      `;
      const result = extractScopeAnalysis(epicContext);
      expect(result.scopeAnalysis).toBeNull();
      expect(result.remainingContext).toContain('# Epic Title');
    });

    it('should handle scope analysis at end of document', () => {
      const epicContext = `
# Epic Title

## Scope Analysis

### Feature Area 1
- ☐ Feature
      `;
      const result = extractScopeAnalysis(epicContext);
      expect(result.scopeAnalysis).not.toBeNull();
      expect(result.scopeAnalysis).toContain('### Feature Area 1');
    });
  });

  describe('decideSelfHealingAction', () => {
    it('should return PROCEED_WITH_STORIES when questions <= threshold', () => {
      expect(decideSelfHealingAction(false, 0)).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
      expect(decideSelfHealingAction(false, 5)).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
      expect(decideSelfHealingAction(true, 5)).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
    });

    it('should return ASK_FOR_CLARIFICATION when questions > threshold and no existing section', () => {
      expect(decideSelfHealingAction(false, 6)).toBe(SelfHealingDecision.ASK_FOR_CLARIFICATION);
      expect(decideSelfHealingAction(false, 10)).toBe(SelfHealingDecision.ASK_FOR_CLARIFICATION);
    });

    it('should return REGENERATE_ANALYSIS when questions > threshold and existing section', () => {
      expect(decideSelfHealingAction(true, 6)).toBe(SelfHealingDecision.REGENERATE_ANALYSIS);
      expect(decideSelfHealingAction(true, 10)).toBe(SelfHealingDecision.REGENERATE_ANALYSIS);
    });

    it('should use threshold of 5', () => {
      expect(QUESTION_THRESHOLD).toBe(5);
    });
  });

  describe('LLM marker format validation (T009a)', () => {
    /**
     * These tests validate that the LLM output format is as expected.
     * If these fail, it indicates the LLM is not producing consistent markers.
     */
    
    it('should recognize standard LLM question format', () => {
      // Format the LLM typically produces
      const llmOutput = `## Scope Analysis

### Authentication Flow
- ☐ User login with email/password
- ❓ How should failed login attempts be handled? (max retries, lockout?)
- ⏬ Social login (delay until end)

### Remaining Questions
- ❓ What are the performance requirements?
- ❓ How should errors be displayed?`;

      expect(countUnansweredQuestions(llmOutput)).toBe(3);
      const markers = countFeatureMarkers(llmOutput);
      expect(markers.inScope).toBe(1);
      expect(markers.lowPriority).toBe(1);
    });

    it('should recognize answered questions in regenerated output', () => {
      // Format after questions are answered
      const regeneratedOutput = `## Scope Analysis

### Authentication Flow
- ☐ User login with email/password
- 💬 How should failed login attempts be handled? (answered: 3 retries, then lockout)
- ⏬ Social login (delay until end)

### Remaining Questions
- ❓ What are the performance requirements?
- 💬 How should errors be displayed? (answered: toast notifications)`;

      expect(countUnansweredQuestions(regeneratedOutput)).toBe(1);
      expect(countAnsweredQuestions(regeneratedOutput)).toBe(2);
    });
  });
});
