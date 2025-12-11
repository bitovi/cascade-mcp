export const CHECK_STORY_CHANGES_MAX_TOKENS = 4000;

export const CHECK_STORY_CHANGES_SYSTEM_PROMPT = 
          `You are a technical project analyst specializing in software requirements analysis. 
          
          You will receive a JSON object with parent and child descriptions. 
          
          Provide precise, actionable insights about requirement divergences. 
          
          Return ONLY valid JSON without markdown code blocks.`;

export const generateCheckWhatChangedPrompt = (parentKey: string, storyKey: string, parentDescription: string, childDescription: string) => {
  return `
  You have 2 Jira issue descriptions: one for a parent epic and one for a child story.
  
  <jira-epic-key>${parentKey}</jira-epic-key>
  
  <jira-child-key>${storyKey}</jira-child-key>
  
  <jira-epic-description>
  ${parentDescription}
  </jira-epic-description>
  
  <jira-child-description>
  ${childDescription}
  </jira-child-description>
  
  
  Analyze these two Jira issue descriptions and identify any diverging points where the child story deviates from or adds information not present in the parent epic. Focus on:
  1. Conflicting requirements or specifications
  2. Additional features or details in the child not mentioned in the parent
  3. Different interpretations or implementations
  4. Missing context that should be aligned
  
  Return your analysis in a structured JSON format:
  \`\`\`json
  {
    "hasDivergences": boolean,
    "divergences": [
      {
        "category": "conflict" | "addition" | "missing" | "interpretation",
        "description": "Clear description of the divergence",
        "childContext": "Relevant excerpt from child story",
        "parentContext": "Relevant excerpt from parent epic (or null if not applicable)"
      }
    ],
    "summary": "Brief summary of alignment status"
  }
  \`\`\`
  `;
}