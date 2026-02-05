/**
 * Scope Analysis Prompt
 * 
 * Generates comprehensive prompts for AI to analyze feature scope from screen analyses.
 * Features are grouped by user workflow and categorized as in-scope (✅), out-of-scope (❌),
 * or questions (❓).
 */

/**
 * System prompt for scope analysis
 * Sets the role and fundamental constraints for the AI
 */
export const FEATURE_IDENTIFICATION_SYSTEM_PROMPT = `You are an expert product analyst identifying and categorizing features from Figma screen analyses.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every feature (✅ ❌ ❓) MUST reference actual UI elements or functionality explicitly described in screen analyses
- Do NOT infer, assume, or speculate about features not shown in the screens
- If a UI element is visible but its purpose/behavior is unclear, list it as a ❓ question

CATEGORIZATION RULES:
- ☐ In-Scope: Features explicitly listed as in-scope in epic context, OR features with complete UI and clear implementation path (when epic context doesn't specify)
- ⏬ Low Priority: Features explicitly marked as "later", "phase 2", "nice to have", or similar - these WILL be built but at end of epic
- ❌ Out-of-Scope: Features explicitly declined by stakeholders ("None for now", "Not for now", "No", "Not needed"), OR features marked as future/optional in analyses
- ❓ Questions: Ambiguous behaviors, unclear requirements, missing information, or features that could be either in/out of scope
- **PRIORITY**: Epic context scope statements are primary source of truth and override screen analysis interpretations

NEGATIVE RESPONSE HANDLING:
- When a Q&A response declines a feature ("None for now", "Not for now", "No", "Not needed", etc.):
  → Include BOTH the answered question (💬) AND an explicit ❌ exclusion on the next line
  → "None for now" / "Not for now" = OUT OF SCOPE (not deferred/low priority)

CRITICAL DISTINCTION:
- "None for now" / "Not for now" / "No" → ❌ Out of Scope (do NOT build)
- "Later" / "Phase 2" / "Nice to have" → ⏬ Low Priority (build at end of epic)
- Unanswered questions → ❓ Questions (needs clarification)

GROUPING RULES:
- Group features by user workflow and functional areas (e.g., "Authentication Flow", "User Profile Management", "Data Entry Workflow")
- Focus on how users interact with features, not UI location or technical architecture
- Each feature area must list relevant Figma screen links
- A screen may appear in multiple feature areas if it contains multiple types of functionality
- Create "Remaining Questions" section for cross-cutting or general questions

FEATURE DESCRIPTION VERBOSITY:
- Use concise descriptions for obvious features (e.g., "Email/password login")
- Use detailed descriptions for complex features (e.g., "Multi-step form with validation, error handling, and progress indicators")
- Keep out-of-scope descriptions brief since they won't be implemented

QUESTION DEDUPLICATION:
- If a question is relevant to multiple areas, list it only in the first area where it appears
- Omit duplicate questions from subsequent areas
- Questions that can't be associated with a specific area go in "Remaining Questions"

OUTPUT REQUIREMENT:
- Output ONLY the markdown scope analysis in the specified format
- Do NOT include explanations, prefaces, or process notes`;

/**
 * Maximum tokens for scope analysis
 * Scope analysis is typically shorter than shell stories
 */
export const FEATURE_IDENTIFICATION_MAX_TOKENS = 8000;

/**
 * Generate scope analysis prompt
 * 
 * @param screensYaml - Content of screens.yaml file (screen ordering)
 * @param analysisFiles - Array of { screenName, content, url } for each analysis file
 * @param epicContext - Optional epic description content (excluding Scope Analysis section)
 * @returns Complete prompt for scope analysis
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
- Business constraints and requirements

**Epic context ALWAYS WINS:**
- If epic says a feature is out-of-scope, mark it ❌ even if UI exists
- If epic says a feature is in-scope, mark it ✅ even if implementation details are unclear
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
- Pay attention to notes about deferred/future features

**Step 3: Identify feature areas by workflow**
- Group related functionality by user workflow (e.g., "Authentication Flow", "Dashboard Interaction", "Settings Management")
- Focus on functional areas that represent how users accomplish tasks
- Aim for 3-8 feature areas (not too granular, not too broad)
- Each area should represent a cohesive set of related features from the user's perspective

**Step 4: Categorize features within each area**
- ✅ In-Scope: Epic context says it's in-scope, OR UI is present with clear behavior (when epic doesn't specify)
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step form with validation, error handling, and progress indicators"
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

- ✅ {In-scope feature - concise for obvious, detailed for complex}
- ✅ {Another in-scope feature}
- ❌ {Out-of-scope feature - brief description}
- ❌ {Another out-of-scope feature}
- ❓ {Question about this area - with context}
- ❓ {Another question}

### {Second Feature Area Name}

[Screen Name](figma-url)

- ✅ {In-scope feature}
- ❌ {Out-of-scope feature}
- ❓ {Question about this area}

### Remaining Questions

- ❓ {General question not specific to one area}
- ❓ {Another general question}
\`\`\`

**CRITICAL**: Output ONLY the markdown above. No prefaces, explanations, or additional text.
`;
}
