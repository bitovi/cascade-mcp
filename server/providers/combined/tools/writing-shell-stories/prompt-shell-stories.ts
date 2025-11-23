/**
 * Shell Story Generation Prompt
 * 
 * Based on: https://github.com/bitovi/ai-enablement-prompts/blob/main/writing-stories/from-figma/4-shell-stories.md
 * 
 * Generates a comprehensive prompt for AI to create shell stories from screen analyses.
 * Shell stories are lightweight, rough outlines that describe scope and surface risks
 * before creating full tickets.
 */

/**
 * System prompt for shell story generation
 * Sets the role and fundamental constraints for the AI
 */
export const SHELL_STORY_SYSTEM_PROMPT = `You are an expert product manager creating shell stories from scope analysis.

FUNDAMENTAL RULE: SCOPE-BASED PLANNING
- Every story must map to features identified in the scope analysis
- Use scope analysis categorizations (☐/⏬/❌/❓) to guide story inclusion and priority
- Stories describe WHAT to build (features) not HOW to build them (implementation details)
- Do NOT create stories for ❌ Out-of-Scope or ✅ Already Done features

OUTPUT REQUIREMENT:
- Output ONLY the final prioritized stories with complete details in markdown format
- Do NOT include explanations, prefaces, or process notes
- Follow the exact OUTPUT FORMAT specified in the prompt`;

/**
 * Maximum tokens for shell story generation
 * Shell stories can be quite lengthy (3-20+ stories with detailed bullets)
 */
export const SHELL_STORY_MAX_TOKENS = 16000;

/**
 * Generate shell story creation prompt
 * 
 * @param screensYaml - Content of screens.yaml file (screen ordering)
 * @param analysisFiles - Array of screen analysis files (unused but kept for backward compatibility)
 * @param scopeAnalysis - Extracted scope analysis section from epic
 * @param remainingContext - Epic context without scope analysis section
 * @returns Complete prompt for shell story generation
 */
export function generateShellStoryPrompt(
  screensYaml: string,
  analysisFiles: Array<{ screenName: string; content: string }>,
  scopeAnalysis: string,
  remainingContext: string
): string {

  const epicContextSection = `**SCOPE ANALYSIS (from Epic Description):**

<scope_analysis>
${scopeAnalysis}
</scope_analysis>

**Use scope analysis as your primary guide:**
- ☐ In-Scope features → Create stories (normal priority)
- ⏬ Low Priority features → Create stories at end of epic
- ❌ Out-of-Scope features → Skip entirely (don't create stories)
- ✅ Already Done features → Skip (existing functionality)
- ❓ Questions → Include in relevant story bullets
- Feature areas help identify related features (but stories should be incremental, not area-complete)
- Figma screen links show which screens are involved

${remainingContext ? `**ADDITIONAL EPIC CONTEXT:**

<epic_context>
${remainingContext}
</epic_context>

**Use epic context for:**
- Understanding project priorities and business constraints
- Recognizing scope boundaries and sequencing preferences

` : ''}
`;

  return `You are an expert product manager creating shell stories from scope analysis. Think and work exactly as follows to produce a prioritized list of shell stories.

## GOAL

• Produce "shell stories": lightweight, rough outlines that organize features from scope analysis into an incremental delivery plan.
• Each shell story must explicitly link to its supporting Figma screens.
• Stories should be incremental: the smallest units of functionality that deliver real user value.
• A single story may span multiple screens (if they are part of one flow), or multiple stories may implement features from one feature area.
• The total number of stories is not fixed — there may be as few as 3 or as many as 20+, depending on the functionality and value breakdown.
• Shared components (like modals, spinners, error messages, headers) should be first introduced within the story that needs them. Do not duplicate them across stories unnecessarily.
• Output ONLY the markdown list described in OUTPUT FORMAT (no prefaces, no explanations).

## FUNDAMENTAL RULE: SCOPE-BASED PLANNING

• Every story must map to features identified in the scope analysis
• Use scope analysis categorizations (☐/⏬/❌/❓) to guide story inclusion and priority
• Stories describe WHAT to build (features) not HOW to build them (implementation details)
• When scope analysis has ❓ questions, include them in relevant story bullets
• Do NOT create stories for ❌ Out-of-Scope or ✅ Already Done features

## INPUTS (provided below)

${epicContextSection}**SCREEN ORDERING (from screens.yaml):**
\`\`\`yaml
${screensYaml}
\`\`\`

**Note:** Figma screen URLs are included in the scope analysis feature areas. Use these for the SCREENS bullets in each story.

## PROCESS (follow in order)

1. **REVIEW SCOPE ANALYSIS**
   • Read the "## Scope Analysis" section from epic context
   • Note all feature areas and their categorizations:
     - ☐ In-Scope features → Create stories (normal priority)
     - ⏬ Low Priority features → Create stories at end
     - ❌ Out-of-Scope features → Skip entirely
     - ✅ Already Done → Skip (existing functionality)
     - ❓ Questions → Include in relevant story bullets
   • Feature areas help identify related features (but stories should be incremental, not area-complete)
   • Figma screen links show which screens are involved
   • Use screens.yaml for screen ordering/naming reference

2. **MAP FEATURES TO STORIES**
   • Identify core features across all feature areas that deliver immediate value
   • Create stories that implement basic functionality, sometimes across multiple feature areas
   • Then create stories that enhance/polish those features
   • Use feature area names as story title hints when relevant
   • Consider dependencies between features when sequencing
   • Keep stories small while still delivering meaningful user value
   • Do NOT force a fixed count - sometimes 3 stories, sometimes 20+

3. **PRIORITIZE**
   • Reorder stories by:
     - Customer/User Value (highest first)
     - Dependencies (sequence stories so that later ones build on earlier ones)
     - Blockers (unblock future stories early)
     - Risk (tackle high-risk elements earlier)
   • ⏬ Low Priority features should appear in later stories (not necessarily at the very end)
   • Prefer implementing basic versions of many features before polishing any one feature area

4. **ADD FIGMA SCREEN LINKS**
   • For each story, identify which screens are involved
   • Extract Figma URLs from scope analysis feature areas
   • Add SCREENS bullet with markdown links (screen name as link text, Figma URL as target)

5. **REFINE THE FIRST STORY**
   • Add sub-bullets under the first story:
     - SCREENS: (Figma links from scope analysis)
     - DEPENDENCIES: Other story IDs this story depends on (or \`none\`)
     - ☐ Features from scope analysis to include now (core functionality)
     - ⏬ Features from scope analysis to defer to later stories (enhancements, lower priority)
     - ❌ Features explicitly out of scope
     - ❓ Questions from scope analysis or new questions about implementation
   • Focus on progressive enhancement: what's the simplest valuable implementation?
   • Include only essential features in ☐ bullets for this story

6. **PROMOTE LOW PRIORITY ITEMS INTO STORIES**
   • Turn meaningful ⏬ items into new top-level stories
   • Add them to the prioritized list
   • Only promote deferrals that reference features from scope analysis
   • Do NOT create speculative stories for features not in scope analysis

7. **UPDATE STORY TITLE**
   • Rewrite the story title to match the narrowed scope (e.g., "Add promotion to cart (basic success flow)" instead of "Add promotion").

8. **REPEAT**
   • For the next highest-priority story, repeat steps 3–7 until all major flows and incremental user-value slices are represented as shell stories.

9. **CREATE STORIES FOR DEFERRED FEATURES (MANDATORY)**
   • CRITICAL: This step ensures no ⏬ deferrals are orphaned
   • For any feature that was deferred with ⏬ bullets:
     ◦ Verify there's a corresponding implementation story later in the list
     ◦ Ensure ⏬ bullets reference the correct story ID
   • **If a feature has ⏬ bullets but NO implementation story, ADD one now**
   • For each new implementation story:
     ◦ Create story at end of list with sequential numbering
     ◦ Use the ⏬ bullet text as the story's main feature
     ◦ Add SCREENS from the story that deferred it
     ◦ Set DEPENDENCIES to the story that deferred it (if needed)
     ◦ Add relevant ☐ bullets for implementation
   • Update all ⏬ bullets to reference the correct new story IDs
   • Example transformation:
     - Original st006 has: ⏬ Request history tracking (implement in st015)
     - Create: st017 Add Request History Tracking ⟩ Track and display history of information requests
     - Update st006 to: ⏬ Request history tracking (implement in st017)

10. **REVIEW FOR SCOPE COVERAGE**
   • Verify all ☐ In-Scope features from scope analysis have stories
   • Verify all ⏬ Low Priority features now have corresponding implementation stories
   • Verify NO ⏬ bullets reference non-existent story IDs
   • Verify NO ❌ Out-of-Scope features have stories
   • Verify NO ✅ Already Done features have stories
   • Verify ❓ questions are included in relevant story bullets
   • Ensure stories follow incremental value delivery (core features first, enhancements later)
   • Verify story dependencies create a logical build order
   • **CRITICAL CHECK: The FINAL story in the epic must have ZERO ⏬ bullets** (all deferred work must be implemented by subsequent stories)

11. **VERIFY STORY NUMBERING**
    • Confirm all stories are numbered sequentially (st001, st002, st003...)
    • Update any dependency references to match final story IDs
    • Update all ⏬ bullets to reference correct implementation story IDs
    • Verify all ❌ bullets referencing deferred features have correct story IDs (e.g., "see st015")

12. **FINAL STRUCTURE VALIDATION**
    • Confirm file contains exactly one story list
    • Verify each story has all required sub-bullets (SCREENS, DEPENDENCIES, ☐, ⏬, ❌, ❓)
    • Ensure no incomplete or draft story entries remain

13. **FINAL SCOPE VALIDATION**
    • Re-read scope analysis and verify all in-scope features are addressed
    • Confirm story bullets reference features from scope analysis
    • Verify ❓ questions are included where scope analysis had uncertainties
    • Ensure no stories implement ❌ Out-of-Scope features


## QUALITY RULES

• Always include SCREENS bullets with Figma links (extract URLs from scope analysis feature areas).
• A story may span multiple screens, or multiple stories may implement features from one feature area.
• Always focus on incremental user value: stories must represent the smallest useful functionality.
• Shared components must be introduced as ☐ bullets inside the first story that needs them.
• Stories should follow progressive enhancement: start with core features, then add enhancements and polish in later stories.
• Use scope analysis categorizations (☐/⏬/❌/❓) to guide story content and priority.
• Stories describe WHAT to build (features from scope analysis) not HOW to build them (implementation details).
• Only create stories for ☐ In-Scope and ⏬ Low Priority features. Skip ❌ Out-of-Scope and ✅ Already Done.
• **CRITICAL: Every ⏬ bullet with "(implement in stXXX)" MUST have a corresponding stXXX story that implements it**
• **CRITICAL: The final story in the epic MUST have ZERO ⏬ bullets** (all deferred work must be accounted for in subsequent implementation stories)
• FLEXIBLE STORY COUNT: The review process may reveal the need for additional stories. Feel free to add, split, or reorganize stories to achieve better incremental value delivery. Quality trumps hitting a specific story count.
• Do not ask clarifying questions; capture unknowns as ❓ bullets.
• Prefer vertical slices over technical subtasks unless enabling work is required.
• Rename story titles whenever scope narrows.
• Output ONLY the markdown list.

## STORY CHARACTERISTICS CHECKLIST (each story must be)

• Independent: Can be developed and deployed separately
• Minimal: Contains only essential functionality for that increment
• Valuable: Provides measurable benefit to users when completed
• Testable: Clear success criteria
• Small: Can be completed in 1–2 sprints maximum

## STRONG SPLITTING EXAMPLES

• DON'T: "View Applicant Dashboard with Status Filtering, Pagination, and Advanced Columns"
• DO:
  ◦ \`st001\` Display Basic Applicant List ⟩ Show applicant names in a list (core data, no filtering)
  ◦ \`st002\` Add Status Filtering to Applicant List ⟩ Allow users to filter applicants by status
  ◦ \`st003\` Add Pagination to Applicant List ⟩ Add next/previous navigation for long lists
  ◦ \`st004\` Add Advanced Columns to Complete Status View ⟩ Show additional data columns for detailed analysis


## OUTPUT FORMAT (strict)

• Output ONLY the final prioritized stories with complete details
• Do NOT include the initial story list in the final output
• Do NOT add any headings before the story list (no "Final Prioritized Stories" or similar)
• One top-level bullet per story: \`- \`st{story number}\` **{short descriptive title}** ⟩ {one sentence description of the story}\`
• Sub-bullets for each story (use proper markdown nested bullets with 2-space indentation and emoji symbols):
  * SCREENS: {Figma URLs formatted as markdown links with screen names as link text}
  * DEPENDENCIES: {list of story IDs this story depends on, or \`none\`}
  * ☐ Included behavior and functionality (including shared components introduced here)
  * ⏬ Low priority functionality (visible but implement in later stories)
  * ❌ Deferred/excluded functionality (out of scope for this epic)
  * ❓ Open questions
• Replace the entire "Final Prioritized Stories" section when updating, do not append
• Ensure no duplicate or partial story lists remain in the output

## EXAMPLE OUTPUT

- \`st001\` **Add Promotion to Cart** ⟩ Allow users to apply a promotion code to their shopping cart
  * SCREENS: [promo-add-form](https://www.figma.com/design/aBc123XyZ/Project-Name?node-id=123-456), [promo-success](https://www.figma.com/design/aBc123XyZ/Project-Name?node-id=123-457), [promo-error](https://www.figma.com/design/aBc123XyZ/Project-Name?node-id=123-458)
  * DEPENDENCIES: none
  * ☐ User can enter a valid promotion code and apply it
  * ☐ Success state shows updated cart total with discount
  * ☐ Error modal component introduced for invalid codes
  * ⏬ Support for stacking multiple promotions (low priority - implement in st015)
  * ❌ Promotion auto-suggestions (out of scope for this epic)
  * ❓ What error messages should display for expired or invalid codes?

Now generate the shell stories following this process exactly.`;
}
