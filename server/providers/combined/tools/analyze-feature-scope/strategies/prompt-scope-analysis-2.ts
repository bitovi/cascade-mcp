/**
 * Scope Analysis Prompt (Strategy 2)
 * 
 * Generates comprehensive prompts for AI to analyze feature scope from screen analyses.
 * Features are grouped by user workflow and categorized as in-scope (☐), already done (✅),
 * low priority (⏬), out-of-scope (❌), or questions (❓).
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
- ☐ In-Scope: Features explicitly listed as in-scope in epic context AND not listed as existing/out-of-scope/low-priority
  - Only mark features ☐ if they are new capabilities being added at normal priority
  - When epic provides scope context, existing UI elements may be shown for context but aren't new features
  - If epic mentions a feature under "Out of Scope" or describes it as existing, do NOT mark it ☐
  - If epic says "delay X until end" or "implement X later", do NOT mark it ☐ (use ⏬ instead)
- ✅ Already Done: Existing functionality mentioned in epic context that provides context but isn't new work
  - These features are visible in screens but explicitly stated as already implemented
  - Keep descriptions brief since they're not part of new work
- ⏬ Low Priority: Features explicitly mentioned in epic to implement later/at the end (in scope but lower priority)
  - Epic says "delay until end", "do at the end", "implement last", "lower priority"
  - These WILL be implemented in this epic, just after core features
  - Keep brief, note when they'll be implemented: "Status filters (low priority - delay until end per epic)"
  - If visible in screens but not mentioned in epic, assume ☐ In-Scope instead
- ❌ Out-of-Scope: Features explicitly excluded from epic OR marked for future epics
  - Epic says "out of scope", "not included", "future epic", "exclude", "won't implement"
  - These will NOT be implemented in this epic
  - Keep brief: "OAuth authentication (future epic)"
  - NO LONGER includes features to be "deferred" within this epic (use ⏬ for those)
- ❓ Questions: Ambiguous behaviors, unclear requirements, missing information
  - Mark ambiguous features as questions rather than guessing
  - Include enough context for the question
- **PRIORITY**: Epic context scope statements are primary source of truth and override screen analysis interpretations

GROUPING RULES:
- Group features by user workflow and functional areas (e.g., "Authentication Flow", "User Profile Management", "Data Entry Workflow")
- Focus on how users interact with features, not UI location or technical architecture
- Each feature area must list relevant Figma screen links
- A screen may appear in multiple feature areas if it contains multiple types of functionality
- Create "Remaining Questions" section for cross-cutting or general questions

FEATURE DESCRIPTION VERBOSITY:
- ☐ In-Scope: Concise for obvious features (e.g., "Email/password login"), detailed for complex features (e.g., "Multi-step form with validation, error handling, and progress indicators")
- ⏬ Low Priority: Same detail level as ☐ In-Scope (concise for obvious, detailed for complex), plus timing note (e.g., "Status filters with dropdown options for Active/Pending/Complete (low priority - delay until end per epic)")
- ✅ Already Done: Keep brief since they're not part of new work (e.g., "Checkbox interaction to toggle task status")
- ❌ Out-of-Scope: Keep brief since they won't be implemented in this epic (e.g., "OAuth authentication (future epic)")

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
 * Confluence document for prompt context
 */
export interface ConfluenceDocumentContext {
  title: string;
  url: string;
  markdown: string;
  documentType?: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
  relevanceScore?: number;
  summary?: string;
}

/**
 * Generate feature identification prompt
 * 
 * @param screensYaml - Content of screens.yaml file (screen ordering)
 * @param analysisFiles - Array of { screenName, content, url } for each analysis file
 * @param epicContext - Optional epic description content (excluding Scope Analysis section)
 * @param confluenceDocs - Optional array of relevant Confluence documents
 * @returns Complete prompt for feature identification
 */
export function generateFeatureIdentificationPrompt(
  screensYaml: string,
  analysisFiles: Array<{ screenName: string; content: string; url: string }>,
  epicContext?: string,
  confluenceDocs?: ConfluenceDocumentContext[]
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
- Identifying low priority features within this epic (⏬)
- Recognizing features excluded entirely or moved to future epics (❌)
- Distinguishing between "existing", "low priority", and "out-of-scope":
  - If epic says "We already have X", that's EXISTING functionality (mark ✅)
  - If epic says "delay X until end" or "do X last", that's LOW PRIORITY (mark ⏬)
  - If epic says "Future epic: X" or "Not included: X", that's OUT OF SCOPE (mark ❌)
  - Existing features visible in screens provide context but aren't new work
  - Low priority features WILL be implemented in this epic, just later
  - Out-of-scope features will NOT be implemented in this epic
- Business constraints and requirements

**CRITICAL: Low Priority ≠ Out of Scope**
- If epic says "delay X until end" → X is IN SCOPE, mark ⏬ (implement later this epic)
- If epic says "X out of scope" → X is NOT in scope, mark ❌ (won't implement this epic)
- When in doubt, check if epic discusses HOW to implement the feature (even if "later")
  - If yes → probably ⏬ Low Priority
  - If no → probably ❌ Out of Scope or ❓ Question

**Epic context ALWAYS WINS:**
- If epic says a feature is existing, mark it ✅ even if UI is prominent
- If epic says "delay until end", mark it ⏬ even if UI shows it as primary
- If epic says a feature is out-of-scope, mark it ❌ even if UI exists
- If epic says a feature is in-scope, mark it ☐ even if implementation details are unclear
- When in doubt about scope, refer to epic context first

`
    : '';

  // Build Confluence documentation section if provided
  const confluenceSection = confluenceDocs && confluenceDocs.length > 0
    ? `**REFERENCED DOCUMENTATION (from Confluence):**

The following linked documents provide additional context for scope decisions:

${confluenceDocs.map(doc => {
  const typeLabel = doc.documentType && doc.documentType !== 'unknown' 
    ? ` (${doc.documentType})` 
    : '';
  return `<confluence_doc title="${doc.title}"${typeLabel}>

**Document**: [${doc.title}](${doc.url})
**Type**: ${doc.documentType || 'unknown'}

${doc.summary || doc.markdown}

</confluence_doc>`;
}).join('\n\n')}

**Use referenced documentation for:**
- Additional requirements not covered in epic description
- Technical constraints and architecture decisions
- Definition of Done criteria (quality gates, testing requirements)
- Cross-cutting concerns (security, accessibility, performance)

**When epic context and documentation conflict:**
- Epic description takes precedence for scope decisions
- Add a ❓ question if the conflict is significant

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

${epicContextSection}${confluenceSection}**SCREEN ORDERING (from screens.yaml):**
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
  - ⏬ Low Priority features (implement later in epic)
  - ✅ Already Done features (existing functionality)
  - ❌ Out-of-Scope features (excluded from epic)
  - ❓ Questions (unclear requirements)
  - ⚠️ SCOPE MISMATCH flags (UI contradicts epic scope)
- Use these categorizations as initial signals, but verify against epic context
- Pay attention to notes about low priority vs out-of-scope features

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
- ☐ In-Scope: Epic context says it's in-scope AND not listed as existing/out-of-scope/low-priority
  - Only mark features ☐ if they are new capabilities being added at normal priority
  - If visible in screens but not mentioned in epic, assume ☐ In-Scope
  - Concise for obvious features: "Email/password login"
  - Detailed for complex features: "Multi-step form with validation, error handling, and progress indicators"
- ✅ Already Done: Epic mentions this as existing functionality
  - Keep brief: "Checkbox interaction to toggle task status"
  - These provide context but aren't part of new work
- ⏬ Low Priority: Epic says "delay until end", "implement last", "lower priority"
  - These WILL be implemented in this epic, just later
  - Same detail level as ☐ In-Scope: concise for obvious, detailed for complex
  - Add timing note: "Status filters with dropdown for Active/Pending/Complete (low priority - delay until end per epic)"
  - Do NOT ask questions about whether to remove/hide/disable low priority features
  - Do NOT ask questions about incremental implementation strategies
  - Only ask questions if the feature itself is unclear (same as ☐ features)
- ❌ Out-of-Scope: Epic says "out of scope", "not included", "future epic"
  - These will NOT be implemented in this epic
  - Keep brief: "OAuth authentication (future epic)"
- ❓ Questions: Feature behavior unclear, requirements ambiguous, missing specifications
  - Mark ambiguous features as questions rather than guessing
  - Include enough context: "Should filters persist across sessions?"
  - Do NOT ask about implementation timing or phasing (that's determined by ☐ vs ⏬)
  - Do NOT ask whether low priority features should be removed/hidden

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
- ⏬ {Low priority feature - in scope but implement at end}
- ✅ {Existing functionality - already implemented, brief description}
- ❌ {Out-of-scope feature - not part of this epic, brief description}
- ❓ {Question about this area - with context}
- ❓ {Another question}

### {Second Feature Area Name}

[Screen Name](figma-url)

- ☐ {In-scope feature}
- ⏬ {Low priority feature}
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
