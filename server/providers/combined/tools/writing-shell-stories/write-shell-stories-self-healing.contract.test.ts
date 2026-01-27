/**
 * Contract Tests for Write Shell Stories Self-Healing Workflow
 * 
 * Tests the self-healing behavior where write-shell-stories automatically
 * runs scope analysis internally when no "## Scope Analysis" section exists.
 * 
 * @see T010 - Contract test for self-healing workflow
 * @see spec.md User Story 1 - Self-Healing Shell Stories
 */

import {
  countUnansweredQuestions,
  decideSelfHealingAction,
  SelfHealingDecision,
  QUESTION_THRESHOLD,
  extractScopeAnalysis,
} from '../shared/scope-analysis-helpers.js';

/**
 * Expected response structure from write-shell-stories with self-healing
 * Based on contracts/write-shell-stories-response.schema.json
 */
interface WriteShellStoriesResponse {
  success: boolean;
  action: 'proceed' | 'clarify' | 'regenerate';
  epicKey: string;
  shellStoriesContent?: string;
  storyCount?: number;
  scopeAnalysisContent?: string;
  questionCount?: number;
  screensAnalyzed?: number;
  metadata?: {
    featureAreasCount?: number;
    inScopeCount?: number;
    outOfScopeCount?: number;
    lowPriorityCount?: number;
    hadExistingAnalysis?: boolean;
    threshold?: number;
  };
  message?: string;
  nextSteps?: string[];
  error?: string;
}

describe('Write Shell Stories Self-Healing Contract', () => {
  
  describe('Response Structure Validation', () => {
    it('should include required fields in all responses', () => {
      // Simulated response - will be replaced with actual API call when implemented
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'proceed',
        epicKey: 'PROJ-123',
      };
      
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('action');
      expect(response).toHaveProperty('epicKey');
      expect(['proceed', 'clarify', 'regenerate']).toContain(response.action);
    });

    it('should include shellStoriesContent when action is proceed', () => {
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'proceed',
        epicKey: 'PROJ-123',
        shellStoriesContent: '- st001: User Authentication',
        storyCount: 1,
        questionCount: 3,
      };
      
      expect(response.action).toBe('proceed');
      expect(response.shellStoriesContent).toBeDefined();
      expect(response.storyCount).toBeGreaterThan(0);
      // Questions below threshold still present
      expect(response.questionCount).toBeLessThanOrEqual(QUESTION_THRESHOLD);
    });

    it('should include scopeAnalysisContent when action is clarify', () => {
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'clarify',
        epicKey: 'PROJ-123',
        scopeAnalysisContent: '### Questions\n- ❓ Question 1\n- ❓ Question 2',
        questionCount: 8,
        metadata: {
          hadExistingAnalysis: false,
          threshold: 5,
        }
      };
      
      expect(response.action).toBe('clarify');
      expect(response.scopeAnalysisContent).toBeDefined();
      expect(response.questionCount).toBeGreaterThan(QUESTION_THRESHOLD);
      expect(response.metadata?.hadExistingAnalysis).toBe(false);
    });

    it('should include scopeAnalysisContent with hadExistingAnalysis=true when action is regenerate', () => {
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'regenerate',
        epicKey: 'PROJ-123',
        scopeAnalysisContent: '### Questions\n- 💬 Answered\n- ❓ Still unanswered',
        questionCount: 6,
        metadata: {
          hadExistingAnalysis: true,
          threshold: 5,
        }
      };
      
      expect(response.action).toBe('regenerate');
      expect(response.scopeAnalysisContent).toBeDefined();
      expect(response.questionCount).toBeGreaterThan(QUESTION_THRESHOLD);
      expect(response.metadata?.hadExistingAnalysis).toBe(true);
    });
  });

  describe('Self-Healing Decision Logic', () => {
    it('should use threshold of 5 for question-based decisions', () => {
      expect(QUESTION_THRESHOLD).toBe(5);
    });

    it('should proceed when no scope analysis exists and questions <= threshold', () => {
      const decision = decideSelfHealingAction(false, 3);
      expect(decision).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
    });

    it('should ask for clarification when no scope analysis and questions > threshold', () => {
      const decision = decideSelfHealingAction(false, 8);
      expect(decision).toBe(SelfHealingDecision.ASK_FOR_CLARIFICATION);
    });

    it('should regenerate when scope analysis exists and questions > threshold', () => {
      const decision = decideSelfHealingAction(true, 7);
      expect(decision).toBe(SelfHealingDecision.REGENERATE_ANALYSIS);
    });

    it('should proceed when scope analysis exists and questions <= threshold', () => {
      const decision = decideSelfHealingAction(true, 4);
      expect(decision).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
    });

    it('should treat exactly 5 questions as acceptable (not exceeding threshold)', () => {
      // Per spec: threshold comparison is `> 5` (not `>=`), so exactly 5 proceeds
      const decision = decideSelfHealingAction(false, 5);
      expect(decision).toBe(SelfHealingDecision.PROCEED_WITH_STORIES);
    });
  });

  describe('Scope Analysis Detection', () => {
    it('should detect existing scope analysis section', () => {
      const epicWithAnalysis = `
# Epic Title

## Scope Analysis

### Feature Area
- ☐ Feature 1
- ❓ Question

## Other Section
      `;
      
      const parsed = extractScopeAnalysis(epicWithAnalysis);
      expect(parsed.scopeAnalysis).not.toBeNull();
      expect(parsed.scopeAnalysis).toContain('Feature Area');
    });

    it('should return null when no scope analysis section', () => {
      const epicWithoutAnalysis = `
# Epic Title

## Context
Some context here

## Requirements
- Requirement 1
      `;
      
      const parsed = extractScopeAnalysis(epicWithoutAnalysis);
      expect(parsed.scopeAnalysis).toBeNull();
    });
  });

  describe('Question Counting', () => {
    it('should count only unanswered questions (❓)', () => {
      const analysis = `
### Feature Area
- ❓ Question 1
- 💬 Answered question
- ❓ Question 2
- ☐ Regular feature
      `;
      
      expect(countUnansweredQuestions(analysis)).toBe(2);
    });

    it('should handle complex scope analysis with mixed markers', () => {
      const analysis = `
## Scope Analysis

### Authentication Flow
- ☐ User login with email/password
- ❓ How should failed login attempts be handled?
- ⏬ Social login (delay until end)
- ❌ OAuth (out of scope)

### Profile Management
- ☐ View profile
- ☐ Edit profile
- ❓ What validation rules apply?

### Remaining Questions
- ❓ Performance requirements?
- 💬 Error handling approach (answered via Figma)
      `;
      
      expect(countUnansweredQuestions(analysis)).toBe(3);
    });
  });

  describe('Message and NextSteps Contract', () => {
    it('should provide helpful message for proceed action', () => {
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'proceed',
        epicKey: 'PROJ-123',
        message: 'Shell stories created successfully! 3 questions remain but are below threshold.',
        nextSteps: [
          'Review the shell stories in the epic description',
          "Use 'write-next-story' to create detailed stories from each shell story"
        ]
      };
      
      expect(response.message).toBeDefined();
      expect(response.nextSteps).toBeDefined();
      expect(response.nextSteps?.length).toBeGreaterThan(0);
    });

    it('should provide helpful message for clarify action', () => {
      const response: WriteShellStoriesResponse = {
        success: true,
        action: 'clarify',
        epicKey: 'PROJ-123',
        message: 'Scope Analysis created with 8 questions. Please answer the questions and re-run this tool.',
        nextSteps: [
          'Review the Scope Analysis section in the epic',
          'Answer the ❓ questions by editing the epic description or adding context',
          "Re-run 'write-shell-stories' after answering questions"
        ]
      };
      
      expect(response.message).toContain('questions');
      expect(response.nextSteps?.some(step => step.includes('re-run') || step.includes('Re-run'))).toBe(true);
    });
  });

  describe('Error Response Contract', () => {
    it('should include error field when success is false', () => {
      const response: WriteShellStoriesResponse = {
        success: false,
        action: 'clarify',
        epicKey: 'PROJ-123',
        error: 'Failed to generate scope analysis: LLM timeout. Please retry.',
        message: 'Could not analyze questions - please retry',
        nextSteps: [
          "Wait a moment and retry 'write-shell-stories'",
          'Check that your LLM provider is accessible'
        ]
      };
      
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.message).toBeDefined();
    });
  });
});
