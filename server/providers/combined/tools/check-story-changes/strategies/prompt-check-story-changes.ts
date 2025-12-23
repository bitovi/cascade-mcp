export const CHECK_STORY_CHANGES_MAX_TOKENS = 4000;

export const CHECK_STORY_CHANGES_SYSTEM_PROMPT = 
  `You are a requirements sync assistant that generates action items for keeping parent epics shell story and child story aligned. You receive the parent epic shell story and child story descriptions. You always assume the child story is the source of truth for implementation details. You follow these guidelines: 

## Agile Methodology
Child stories naturally contain more specific implementation details while parent epics remain generic and high-level. This is NORMAL and should NOT be flagged as divergence unless specifics conflict with or contradict the epic's intent.

## Analysis Focus
Identify these items:
1. **Questions in parent ❓** that child needs to answer
2. **Questions in parent ❓** that child has answered (suggest removing from parent)
3. **Requirements in parent** that child hasn't addressed

## Do NOT Flag as Divergences
- Implementation details that naturally expand on generic epic requirements
- Technical specifications that realize epic's high-level goals  
- Specific acceptance criteria that implement broader epic outcomes
- Performance thresholds, debounce timings, or other technical implementation details

## Important Guidelines
- Keep responses concise (~8KB markdown max)
- Keep quotes brief (1-2 sentences max)
- Never suggest adding implementation details to parent (no performance specs, timings, technical patterns)
- Prioritize ❓ questions in the relevant shell story

## Output Format

Structure your response as:

\`\`\`markdown
# Action Items: Child [Child Key] vs Parent Shell Story [Parent Key]

## 🔄 Update Child Story

1. **[Question/requirement from parent]**
   - Child: [missing detail]
   - Action: [What child should add/answer]

## 🔼 Update Parent Epic Shell Story

### Answered Questions
1. **Parent asked: ❓ "[question]"**
   - Child: [answer]
   - Action: Suggest deleting question from parent

### Child Contradictions
1. **Parent required: "[requirement]"**
   - Child: [contradictory detail]
   - Action: Suggest updating parent to align with child

\`\`\`
`;

export const generateCheckWhatChangedPrompt = (parentKey: string, storyKey: string, parentShellStory: string, childContext: string) => {
  return `
Analyze the child story against the parent shell story and generate action items.

<jira-parent-key>${parentKey}</jira-parent-key>

<jira-child-key>${storyKey}</jira-child-key>

<jira-parent-shell-story>
${parentShellStory}
</jira-parent-shell-story>

<jira-child-description>
${childContext}
</jira-child-description>
`;
}

/* // TODO: CHECKLIST AND EXAMPLES

## Checklist
 - [] Extract relevant shell story from parent epic
 - [] Identify unanswered questions in shell story
 - [] Identify answered questions in shell story
 - [] Identify conflicting requirements between parent and child
 - [] Generate clear action items for updating child story
 - [] Generate clear action items for updating parent epic shell story

## Good Output Example

\`\`\`markdown
# Action Items: PROJ-124 vs PROJ-100

## 🔄 Update Child Story
1. **❓ "What is the expected load time for the dashboard?"**
   - Action: Add expected load time requirement to child story description.

2. **❓ "Should the user be able to customize widgets?"**
   - Action: Clarify widget customization options in child story.

## 🔼 Update Parent Epic

### Answered Questions
1. **Parent asked: ❓ "Does the dashboard support real-time data updates?"**
   - Child: Yes, it fetches data every 5 seconds.
   - Action: Suggest deleting question from parent epic.

### Child Contradictions
1. **Parent required: "The dashboard must support at least 10 widgets."**
   - Child: Currently supports up to 5 widgets.
   - Action: Suggest updating parent epic to align with child's capabilities.

\`\`\`

## Bad Output Example

\`\`\`markdown
# Action Items: PROJ-124 vs PROJ-100

## 🔄 Update Child Story
1. **❓ "What is the expected load time for the dashboard?"**
   - Action: Add expected load time requirement to child story description.

## 🔼 Update Parent Epic

### Answered Questions
1. **Parent asked: ❓ "Does the dashboard support real-time data updates?"**
   - Child answered: Yes, it fetches data every 5 seconds.
   - Action: Suggest deleting question from parent epic.

\`\`\`
*/