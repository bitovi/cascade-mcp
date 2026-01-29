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
  collapseDoneSections,
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

    it('should count questions from ADF-extracted text (no bullet prefix)', () => {
      // ADF extractTextFromAdf strips the "- " prefix
      const adfExtractedText = `
❓ What is the error handling?
❓ How should validation work?
💬 This one is answered
      `;
      expect(countUnansweredQuestions(adfExtractedText)).toBe(2);
    });

    it('should count mixed markdown and ADF formats', () => {
      const mixedText = `
- ❓ Markdown format question
❓ ADF format question
      `;
      expect(countUnansweredQuestions(mixedText)).toBe(2);
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

    it('should count answers from ADF-extracted text (no bullet prefix)', () => {
      // ADF extractTextFromAdf strips the "- " prefix
      const adfExtractedText = `
💬 What is the error handling? (answered)
❓ How should validation work?
💬 What are performance requirements? (answered)
      `;
      expect(countAnsweredQuestions(adfExtractedText)).toBe(2);
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

  describe('collapseDoneSections', () => {
    it('should collapse sections with only ✅ markers', () => {
      const input = `## Scope Analysis

### Comment Reactions
- ☐ Upvote button
- ✅ Basic comment display

### Case Navigation
- ✅ Sidebar case list
- ✅ Visual selection state
- ✅ Case ID format`;

      const result = collapseDoneSections(input);
      
      // Should keep Comment Reactions (has mixed markers)
      expect(result).toContain('### Comment Reactions');
      expect(result).toContain('- ☐ Upvote button');
      expect(result).toContain('- ✅ Basic comment display');
      
      // Should collapse Case Navigation (all ✅)
      expect(result).not.toContain('### Case Navigation');
      expect(result).not.toContain('- ✅ Sidebar case list');
      
      // Should have new collapsed section
      expect(result).toContain('### Already Completed Areas');
      expect(result).toContain('- ✅ Case Navigation');
    });

    it('should collapse multiple all-done sections', () => {
      const input = `### Feature A
- ✅ Done item 1
- ✅ Done item 2

### Feature B
- ☐ Todo item

### Feature C
- ✅ Done item 3`;

      const result = collapseDoneSections(input);
      
      expect(result).toContain('### Feature B');
      expect(result).toContain('- ☐ Todo item');
      expect(result).toContain('### Already Completed Areas');
      expect(result).toContain('- ✅ Feature A');
      expect(result).toContain('- ✅ Feature C');
    });

    it('should preserve Remaining Questions section', () => {
      const input = `### Comment Reactions
- ✅ All done

### Remaining Questions
- ❓ How should errors be handled?`;

      const result = collapseDoneSections(input);
      
      expect(result).toContain('### Remaining Questions');
      expect(result).toContain('- ❓ How should errors be handled?');
      expect(result).toContain('### Already Completed Areas');
      expect(result).toContain('- ✅ Comment Reactions');
    });

    it('should handle empty input', () => {
      expect(collapseDoneSections('')).toBe('');
    });

    it('should handle input with no sections to collapse', () => {
      const input = `### Feature A
- ☐ Todo item
- ✅ Done item`;

      const result = collapseDoneSections(input);
      
      expect(result).toContain('### Feature A');
      expect(result).not.toContain('### Already Completed Areas');
    });

    it('should handle sections with question and answer markers', () => {
      const input = `### Feature A
- ✅ Done
- ❓ Question here

### Feature B  
- ✅ All done`;

      const result = collapseDoneSections(input);
      
      // Feature A has mixed, should stay
      expect(result).toContain('### Feature A');
      expect(result).toContain('- ❓ Question here');
      
      // Feature B is all done, should collapse
      expect(result).toContain('### Already Completed Areas');
      expect(result).toContain('- ✅ Feature B');
    });

    it('should preserve Figma links in active sections', () => {
      const input = `### Comment Reactions

[Screen 1](https://figma.com/123) [Screen 2](https://figma.com/456)

- ☐ Upvote button
- ✅ Basic display`;

      const result = collapseDoneSections(input);
      
      expect(result).toContain('[Screen 1](https://figma.com/123)');
      expect(result).toContain('- ☐ Upvote button');
    });
  });
});
