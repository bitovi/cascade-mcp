export const CHECK_STORY_CHANGES_MAX_TOKENS = 4000;

export const CHECK_STORY_CHANGES_SYSTEM_PROMPT = 
          `You are a technical project analyst specializing in software requirements analysis. 
          
          You will receive a parent epic description and a child story description for analysis. 
          
          Provide precise, actionable insights about requirement divergences.
          
          IMPORTANT: Keep your response concise to fit within Jira comment size limits (~8KB markdown max).
          - Use brief, clear language
          - Limit context excerpts to 1-2 sentences max
          - Focus on the most significant items
          - Avoid redundant explanations
          
          Return your response in markdown format with proper structure and formatting.`;

export const generateCheckWhatChangedPrompt = (parentKey: string, storyKey: string, parentContext: string, childContext: string) => {
  return `
  You have Shell Stories from a parent epic (or full description if Shell Stories section not found) and the full child story description.
  
  <jira-epic-key>${parentKey}</jira-epic-key>
  
  <jira-child-key>${storyKey}</jira-child-key>
  
  <jira-epic-shell-stories>
  ${parentContext}
  </jira-epic-shell-stories>
  
  <jira-child-description>
  ${childContext}
  </jira-child-description>
  
  
  Analyze these two sections, identifying both aligned and diverging points between the child story and parent epic's shell stories.
  
  Note: In agile methodology, it's expected that child stories contain more specific implementation details while parent epics remain generic and high-level. This is normal and should not be flagged as a divergence unless the specifics conflict with or contradict the epic's intent.
  
  Focus on:
  1. Conflicting requirements or specifications that contradict the parent epic's shell stories
  2. Additional features or scope in the child that go beyond the parent's intended boundaries
  3. Different interpretations that misalign with the parent's objectives
  4. Missing critical context that should be aligned with the parent
  5. Aligned requirements that properly implement the epic's intent
  
  Do NOT flag as divergences:
  - Implementation details that naturally expand on generic epic requirements
  - Technical specifications that realize the epic's high-level goals
  - Specific acceptance criteria that implement broader epic outcomes
  
  Structure your analysis with clear markdown formatting:
  
  \`\`\`markdown
  Summary: [One-sentence summary of overall alignment]
  
  Findings:
  
  1. ✅ Aligned: [Brief Title]
     - Context: Child implements "[brief quote]" from epic's "[brief quote]"

  2. ⚠️ Conflict: [Brief Title]
      - Child: "[1-2 sentence quote]"
      - Parent: "[1-2 sentence quote or 'Not mentioned']"
  
  3. ➕ Addition: [Brief Title]
      - Child: "[1-2 sentence quote]"
      - Parent: "[1-2 sentence quote or 'Not mentioned']"
  
  4. ➖ Missing: [Brief Title]
      - Child: "[1-2 sentence quote]"
      - Parent: "[1-2 sentence quote]"
  
  5. 🔄 Interpretation: [Brief Title]
      - Child: "[1-2 sentence quote]"
      - Parent: "[1-2 sentence quote]"
  
  _(List all findings - both aligned and divergent items in a single numbered list)_
  \`\`\`
  
  Remember: 
  - Keep all quotes brief (1-2 sentences max) and focus on clarity over detail
  - Include both aligned items (✅) and divergences (⚠️➕➖🔄) in the same numbered list
  - Categories: ✅ aligned | ⚠️ conflict | ➕ addition | ➖ missing | 🔄 interpretation
  `;
}