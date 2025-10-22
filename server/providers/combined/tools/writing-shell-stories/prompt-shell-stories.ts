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
export const SHELL_STORY_SYSTEM_PROMPT = `You are an expert product manager creating shell stories from Figma screen analyses.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every story element (+ and - bullets) MUST reference actual UI elements, behaviors, or functionality explicitly described in the screen analysis files
- Do NOT infer, assume, or speculate about features that "should" exist
- If a UI element is visible but its behavior is not described, mark it as a ¿ question rather than implementing assumed functionality
- When in doubt, defer to ¿ questions rather than making assumptions

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
 * @param analysisFiles - Array of { screenName, content } for each analysis file
 * @param context - Optional project context, goals, or constraints
 * @returns Complete prompt for shell story generation
 */
export function generateShellStoryPrompt(
  screensYaml: string,
  analysisFiles: Array<{ screenName: string; content: string }>,
  context?: string
): string {
  const analysisSection = analysisFiles
    .map(({ screenName, content }) => {
      return `### ${screenName}.analysis.md\n\n${content}`;
    })
    .join('\n\n---\n\n');

  return `You are an expert product manager. When I give you screen analysis outputs (images and their detailed analysis files), think and work exactly as follows to produce a prioritized list of shell stories.

## GOAL

• Produce "shell stories": lightweight, rough outlines that describe scope and surface risks before creating tickets.
• Each shell story must explicitly link to its supporting images and analysis files.
• Stories should be incremental: the smallest units of functionality that deliver real user value.
• A single story may span multiple screens (if they are part of one flow), or a single screen may represent multiple incremental stories.
• The total number of stories is not fixed — there may be as few as 3 or as many as 20+, depending on the functionality and value breakdown.
• Shared components (like modals, spinners, error messages, headers) should be first introduced within the story that needs them, as + bullets. Do not duplicate them across stories unnecessarily.
• Output ONLY the markdown list described in OUTPUT FORMAT (no prefaces, no explanations).

## FUNDAMENTAL RULE: EVIDENCE-BASED ONLY

• Every story element (+ and - bullets) MUST reference actual UI elements, behaviors, or functionality explicitly described in the screen analysis files
• Do NOT infer, assume, or speculate about features that "should" exist
• If a UI element is visible but its behavior is not described, mark it as a ¿ question rather than implementing assumed functionality
• When in doubt, defer to ¿ questions rather than making assumptions

## INPUTS (provided below)

**SCREEN ORDERING (from screens.yaml):**
\`\`\`yaml
${screensYaml}
\`\`\`

**SCREEN ANALYSIS FILES:**

${analysisSection}

${context ? `**CONTEXT:**\n${context}\n\n` : ''}
## EVIDENCE VIOLATIONS (DO NOT DO)

❌ "Search functionality for finding applications" (when only search UI is visible)
❌ "Advanced filtering options" (when only basic filters are shown)
❌ "Real-time validation" (when form validation behavior isn't described)

## EVIDENCE-BASED CORRECTIONS

✅ "Search input field and search button (UI elements visible)"
✅ "Status dropdown filter (shows 'Active', 'Pending', 'Archived' options)"
✅ "Form submission (behavior not described - needs clarification)"


## PROCESS (follow in order)

1. **INITIAL STORY NAME LIST**
   • Get the list of screen names from screens.yaml to determine which analysis files to review.
   • Review all screen analysis files and screen images that can be loaded from the analysis file's Figma Image Url value.
   • Identify distinct user-visible flows and functionality.
   • Break them into incremental units of value — each story should represent the smallest useful slice a user could benefit from.
   • IMPORTANT: Prefer to not implement every UI element visible in a screen at once. Start with core functionality and defer advanced features like filtering, sorting, pagination to separate stories.
   • Group screens into candidate stories when they form part of the same flow (e.g., add form + success + error).
   • If one screen contains multiple incremental steps of value, split it into multiple stories.
   • Do NOT force a fixed count. The correct number of stories depends on the functionality — sometimes 3, sometimes 20+.

2. **PRIORITIZE**
   • Reorder stories by:
     - Customer/User Value (highest first)
     - Dependencies (sequence stories so that later ones build on earlier ones)
     - Blockers (unblock future stories early)
     - Risk (tackle high-risk elements earlier)

3. **CROSS-REFERENCE SCREENS & ANALYSIS (CRITICAL)**
   • For each story, collect all relevant screens and analysis files across the flow.
   • Add direct links:
     - ANALYSIS: All related \`{screen-name}.analysis.md\` files

4. **PARTIALLY REFINE THE FIRST STORY**
   • Add sub-bullets under the first story:
     - ANALYSIS: (links found in step 3)
     - DEPENDENCIES: Other story IDs this story depends on (or \`none\`)
     - + Items that MUST be included now (behaviors, functionality, flows, and any shared components required)
     - - Items explicitly excluded to defer
     - ¿ Open questions (scope, behavior, technical assumptions)

5. **PROMOTE MINUSES INTO CANDIDATE STORIES**
   • Turn meaningful - items into new top-level stories. Add them to the prioritized list.
   • CRITICAL: Only promote deferrals that reference actual UI elements or functionality visible in the screens. Do not create speculative stories for features that don't exist in the designs.

6. **UPDATE STORY TITLE**
   • Rewrite the story title to match the narrowed scope (e.g., "Add promotion to cart (basic success flow)" instead of "Add promotion").

7. **REPEAT**
   • For the next highest-priority story, repeat steps 3–6 until all major flows and incremental user-value slices are represented as shell stories.

8. **PRE-REVIEW EVIDENCE CHECK**
   • Before the systematic review, do a quick scan:
   • List all UI elements mentioned in each analysis file
   • List all interactive behaviors described in each analysis file
   • Verify every story bullet references something from these lists
   • Flag any bullets that seem to add functionality beyond what's documented

9. **REVIEW FOR INCREMENTAL CONSISTENCY (SYSTEMATIC VERIFICATION)**
   • MANDATORY: Create a systematic checklist and work through each story methodically. Do NOT skip this step or do a superficial review.

   A) Cross-check deferrals (feature-by-feature audit):
      • For EVERY feature implemented in any story st002+, verify there's a corresponding - bullet in an earlier story
      • Create a mapping: "st008 implements sorting" → "st001 must defer sorting"
      • If a deferral is missing, ADD it to the earlier story or justify why it's not needed
      • Example: If \`st008\` implements "sorting functionality", ensure \`st001\` has "- Sorting functionality (defer to st008)"

   B) Validate minimalism (first-screen audit):
      • For each screen's FIRST story, list ALL visible UI elements from the screen analysis
      • Verify only CORE elements are included in + bullets
      • Move non-essential elements to - bullets (advanced features, nice-to-haves, complex interactions)
      • Guideline: Ask "Could a user get value from this story if we ONLY implemented the + items?"

   C) Check progressive enhancement (dependency audit):
      • Verify story dependencies create a logical build order
      • Ensure no "big bang" stories that implement too much at once
      • Check that shared components are introduced in the first story that needs them, not duplicated

   D) Validate evidence basis (screen-evidence audit):
      • For EVERY + and - bullet in every story:
        ◦ Quote the specific text from the analysis file that supports this feature
        ◦ If you cannot find supporting evidence, remove the bullet entirely
        ◦ For visible UI elements without described behaviors, convert to ¿ questions
      • ANTI-PATTERN: Do not write "search functionality" if only "search bar" is described
      • CORRECT PATTERN: Write "search input field (UI element)" and ask "¿ What search behavior should this implement?"

   E) Add missing stories if needed:
      • IMPORTANT: Feel empowered to add new stories if the review reveals gaps
      • If an essential feature was missed or a story is too large, split it or add new ones
      • Re-number stories as needed to maintain logical progression
      • Update dependencies in existing stories to reference new story IDs

   F) Final consistency check:
      • Read through the entire story list as if you're a developer planning sprints
      • Verify each story can be completed independently in 1-2 sprints
      • Ensure the progression makes sense from a user value perspective

10. **REMOVE DRAFT SECTIONS**
    • Delete the "Initial Story Name List" section entirely
    • Delete the "Prioritized Stories (by Customer Value...)" section entirely
    • Verify only "Final Prioritized Stories" section remains

11. **VERIFY STORY NUMBERING**
    • Confirm all stories are numbered sequentially (st001, st002, st003...)
    • Update any dependency references to match final story IDs
    • Check that no story references a non-existent story ID

12. **FINAL STRUCTURE VALIDATION**
    • Confirm file contains exactly one story list
    • Verify each story has all required sub-bullets (ANALYSIS, DEPENDENCIES, +, -, ¿)
    • Ensure no incomplete or draft story entries remain

13. **FINAL EVIDENCE VERIFICATION**
    • Re-read each story as if you're a developer who only has the screen analysis files
    • Can you implement every + bullet based solely on the provided documentation?
    • If any bullet requires assumptions or guesswork, revise it or convert to a ¿ question
    • Ensure no story promises functionality that isn't clearly evidenced in the source material


## QUALITY RULES

• Always include ANALYSIS bullets linking to source files.
• A story may span multiple screens, or multiple stories may come from a single screen.
• Always focus on incremental user value: stories must represent the smallest useful functionality.
• Shared components must be introduced as + bullets inside the first story that needs them.
• Stories should follow progressive enhancement: start with the simplest valuable functionality, then add filters, pagination, advanced options, and polish in later stories.
• CRITICAL: Just because a UI element appears in a screen does not mean it must be implemented in the first story using that screen. Defer complex features to later stories even if they're visible in early designs.
• EVIDENCE-BASED ONLY: Every story bullet must cite specific text from screen analysis files. When UI elements are visible but behaviors aren't described, use ¿ questions instead of assumed functionality.
• NO SPECULATION: Do not implement features that "should" exist or "users would expect" unless explicitly documented in the analysis.
• DEFER ONLY VISIBLE FEATURES: Only defer functionality that is actually shown in screens but excluded from current scope. Don't defer imaginary features.
• FLEXIBLE STORY COUNT: The review process may reveal the need for additional stories. Feel free to add, split, or reorganize stories to achieve better incremental value delivery. Quality trumps hitting a specific story count.
• Do not ask clarifying questions; capture unknowns as ¿ bullets.
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
  ◦ \`st001\` Display Basic Applicant List – Show applicant names in a list (core data, no filtering)
  ◦ \`st002\` Add Status Filtering to Applicant List – Allow users to filter applicants by status
  ◦ \`st003\` Add Pagination to Applicant List – Add next/previous navigation for long lists
  ◦ \`st004\` Add Advanced Columns to Complete Status View – Show additional data columns for detailed analysis


## OUTPUT FORMAT (strict)

• Output ONLY the final prioritized stories with complete details
• Do NOT include the initial story list in the final output
• One top-level bullet per story: \`- \`st{story number}\` **{short descriptive title}** – {one sentence description of the story}\`
• Sub-bullets for each story (use proper markdown nested bullets with 2-space indentation and emoji symbols):
  * ANALYSIS: {links to all relevant analysis files}
  * DEPENDENCIES: {list of story IDs this story depends on, or \`none\`}
  * ✅ Included behavior and functionality (including shared components introduced here)
  * ❌ Deferred/excluded functionality
  * ❓ Open questions
• Replace the entire "Final Prioritized Stories" section when updating, do not append
• Ensure no duplicate or partial story lists remain in the output

## EXAMPLE OUTPUT

- \`st001\` **Add Promotion to Cart** – Allow users to apply a promotion code to their shopping cart
  * ANALYSIS: promo-add-form.analysis.md, promo-success.analysis.md, promo-error.analysis.md
  * DEPENDENCIES: none
  * ✅ User can enter a valid promotion code and apply it
  * ✅ Success state shows updated cart total with discount
  * ✅ Error modal component introduced for invalid codes
  * ❌ Support for stacking multiple promotions (defer)
  * ❌ Promotion auto-suggestions (defer)
  * ❓ What error messages should display for expired or invalid codes?

Now generate the shell stories following this process exactly.`;
}
