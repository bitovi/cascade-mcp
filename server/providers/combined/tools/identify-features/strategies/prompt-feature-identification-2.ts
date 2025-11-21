/**
 * Feature Identification Prompt
 * 
 * Generates comprehensive prompts for AI to identify and categorize features from screen analyses.
 * Features are grouped by user workflow and categorized as in-scope (✅), out-of-scope (❌),
 * or questions (❓).
 */

/**
 * System prompt for feature identification
 * Sets the role and fundamental constraints for the AI
 */
export const FEATURE_IDENTIFICATION_SYSTEM_PROMPT = `You are an expert product analyst identifying and categorizing features from Figma screen analyses.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every feature (☐ ✅ ❌ ❓) MUST reference actual UI elements or functionality explicitly described in screen analyses
- Do NOT infer, assume, or speculate about features not shown in the screens
- If a UI element is visible but its purpose/behavior is unclear, list it as a ❓ question

CATEGORIZATION RULES:
- ☐ In-Scope: Features explicitly listed as in-scope in epic context AND not listed as existing/out-of-scope
  - Only mark features ☐ if they are new capabilities being added
  - When epic provides scope context, existing UI elements may be shown for context but aren't new features
  - If epic mentions a feature under "Out of Scope" or describes it as existing, do NOT mark it ☐
- ✅ Already Done: Existing functionality mentioned in epic context that provides context but isn't new work
  - These features are visible in screens but explicitly stated as already implemented
  - Keep descriptions brief since they're not part of new work
- ❌ Out-of-Scope: Features explicitly mentioned in epic context as deferred/excluded, OR features marked as future/optional in analyses
- ❓ Questions: Ambiguous behaviors, unclear requirements, missing information, or features that could be either in/out of scope
- **PRIORITY**: Epic context scope statements are primary source of truth and override screen analysis interpretations

GROUPING RULES:
- Group features by user workflow and functional areas (e.g., "Authentication Flow", "User Profile Management", "Data Entry Workflow")
- Focus on how users interact with features, not UI location or technical architecture
- Each feature area must list relevant Figma screen links
- A screen may appear in multiple feature areas if it contains multiple types of functionality
- Create "Remaining Questions" section for cross-cutting or general questions

FEATURE DESCRIPTION VERBOSITY:
- ☐ In-Scope: Concise for obvious features (e.g., "Email/password login"), detailed for complex features (e.g., "Multi-step form with validation, error handling, and progress indicators")
- ✅ Already Done: Keep brief since they're not part of new work (e.g., "Checkbox interaction to toggle task status")
- ❌ Out-of-Scope: Keep brief since they won't be implemented (e.g., "OAuth authentication (deferred)")

QUESTION DEDUPLICATION:
- If a question is relevant to multiple areas, list it only in the first area where it appears
- Omit duplicate questions from subsequent areas
- Questions that can't be associated with a specific area go in "Remaining Questions"

OUTPUT REQUIREMENT:
- Output ONLY the markdown scope analysis in the specified format
- Do NOT include explanations, prefaces, or process notes`;

/**
 * Maximum tokens for feature identification
 * Scope analysis is typically shorter than shell stories
 */
export const FEATURE_IDENTIFICATION_MAX_TOKENS = 8000;

/**
 * Generate feature identification prompt
 * 
 * @param screensYaml - Content of screens.yaml file (screen ordering)
 * @param analysisFiles - Array of { screenName, content, url } for each analysis file
 * @param epicContext - Optional epic description content (excluding Scope Analysis section)
 * @returns Complete prompt for feature identification
 */
export function generateFeatureIdentificationPrompt(
  screensYaml: string,
  analysisFiles: Array<{ screenName: string; content: string; url: string }>,
  epicContext?: string
): string {
  // Build epic context section if provided
  const epicContextSection = epicContext?.trim()
    ? `**EPIC CONTEXT (from Epic Description):**

<epic_context>
${epicContext}
</epic_context>

**Use epic context as primary source of truth for:**
- Identifying features explicitly marked as in-scope or out-of-scope
- Understanding project priorities and goals
- Recognizing features deferred to future phases
- Distinguishing between "out-of-scope = existing" vs "out-of-scope = future work"
  - If epic says "We already have X" under out-of-scope, that's EXISTING functionality (mark ✅)
  - If epic says "Future: X" or "Not included: X" under out-of-scope, that's DEFERRED functionality (mark ❌)
  - Existing features visible in screens provide context but aren't new work
  - Deferred features might not be visible yet or marked as "future phase" in analyses
- Business constraints and requirements

**Epic context ALWAYS WINS:**
- If epic says a feature is out-of-scope and existing, mark it ✅ even if UI is prominent
- If epic says a feature is out-of-scope and deferred, mark it ❌ even if UI exists
- If epic says a feature is in-scope, mark it ☐ even if implementation details are unclear
- When in doubt about scope, refer to epic context first

`
    : '';

  // Build analysis section with URLs
  const analysisSection = analysisFiles
    .map(({ screenName, content, url }) => {
      return `### ${screenName}

**Figma URL**: ${url}

${content}`;
    })
    .join('\n\n---\n\n');

  return `You are analyzing Figma screen designs to identify and categorize features.

## GOAL

Produce a scope analysis document that:
- Groups features by user workflow and functional areas
- Categorizes each feature as in-scope (✅), out-of-scope (❌), or a question (❓)
- Links each feature area to relevant Figma screens
- Surfaces all ambiguities and questions

## INPUTS

${epicContextSection}**SCREEN ORDERING (from screens.yaml):**
\`\`\`yaml
${screensYaml}
\`\`\`

**SCREEN ANALYSES:**

${analysisSection}

## INSTRUCTIONS

**Step 1: Review epic context for scope guidance**
- Read epic context completely to understand what's explicitly in-scope vs out-of-scope
- Note any features mentioned as deferred, future, or excluded
- Epic context is your primary source of truth for categorization

**Step 2: Review all screen analyses**
- Read through each analysis file completely
- Note all UI elements, features, and behaviors described
- Screen analyses may contain preliminary categorizations using:
  - ☐ In-Scope features (new work identified from epic context)
  - ✅ Already Done features (existing functionality)
  - ❌ Out-of-Scope features (deferred/excluded)
  - ❓ Questions (unclear requirements)
  - ⚠️ SCOPE MISMATCH flags (UI contradicts epic scope)
  - ⏸️ DEFERRED flags (delayed features)
- Use these categorizations as initial signals, but verify against epic context
- Pay attention to notes about deferred/future features

**Step 3: Identify feature areas by independent capabilities**
- Split features into separate areas if they can be implemented independently
- Features should be separate areas even if they appear in the same screen location
- Key criteria for splitting:
  - Different user interactions (typing vs clicking, selecting vs toggling)
  - Different technical implementations (client-side vs server-side, different API calls)
  - Could be developed by different developers in parallel
  - Could be completed in different iterations
- Examples of proper splitting (these should be SEPARATE areas):
  - "Login Form" + "Password Reset Link" (different flows, different screens)
  - "Sort Controls" + "Pagination Controls" (different UI, different data operations)
  - "Export Button" + "Import Button" (opposite operations, different validation)
  - "Dark Mode Toggle" + "Language Selector" (different settings, unrelated implementations)
  - "Text Search Input" + "Filter Dropdown" (different controls and behaviors)
  - "Registration Form" + "Login Form" (different forms and flows)
- Create as many feature areas as needed based on independent capabilities
- Prefer more granular areas over broad groupings

**Step 4: Categorize features within each area**
- ☐ In-Scope: Epic context says it's in-scope AND not listed as existing/out-of-scope
  - Only mark features ☐ if they are new capabilities being added
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step form with validation, error handling, and progress indicators"
- ✅ Already Done: Epic mentions this as existing functionality (e.g., under "Out of Scope: We already have X")
  - Keep brief: "Checkbox interaction to toggle task status"
  - These provide context but aren't part of new work
- ❌ Out-of-Scope: Epic context says it's deferred/excluded, OR marked as future in analyses
  - Keep brief: "OAuth authentication (deferred)"
- ❓ Questions: Behavior unclear, requirements ambiguous, or could be either in/out of scope
  - Mark ambiguous features as questions rather than guessing
  - Include enough context: "Should filters persist across sessions?"

**Step 5: Link screens to feature areas**
- For each feature area, list all Figma screen URLs that contain related UI
- Use markdown link format: [Screen Name](url)
- A screen may appear in multiple areas if it has multiple types of functionality

**Step 6: Collect and deduplicate questions**
- List questions relevant to each area under that area
- If same question applies to multiple areas, list only in the first occurrence
- Cross-cutting concerns go in "Remaining Questions"
- Include questions about error handling, accessibility, browser support, etc.

## OUTPUT FORMAT

\`\`\`markdown
## Scope Analysis

### {Feature Area Name}

[Screen Name](figma-url) [Another Screen](figma-url)

- ☐ {In-scope feature - work to be done, concise for obvious, detailed for complex}
- ☐ {Another in-scope feature}
- ✅ {Existing functionality - already implemented, brief description}
- ❌ {Out-of-scope feature - deferred, brief description}
- ❓ {Question about this area - with context}
- ❓ {Another question}

### {Second Feature Area Name}

[Screen Name](figma-url)

- ☐ {In-scope feature}
- ✅ {Existing functionality}
- ❌ {Out-of-scope feature}
- ❓ {Question about this area}

### Remaining Questions

- ❓ {General question not specific to one area}
- ❓ {Another general question}
\`\`\`

**CRITICAL**: Output ONLY the markdown above. No prefaces, explanations, or additional text.
`;
}
