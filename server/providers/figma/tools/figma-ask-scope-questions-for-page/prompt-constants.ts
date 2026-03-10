/**
 * Shared Prompt Text Constants
 * 
 * Single source of truth for prompt text used by both:
 * - Embedded resources in figma-ask-scope-questions-for-page tool responses
 * - Standalone MCP resources (prompt://frame-analysis, etc.)
 * 
 * Keeping these as importable constants avoids duplication between the
 * two delivery mechanisms (spec 063).
 */

import { SCREEN_ANALYSIS_SYSTEM_PROMPT } from '../../screen-analyses-workflow/screen-analyzer.js';
import { FIGMA_QUESTIONS_SYSTEM_PROMPT } from '../figma-review-design/prompt-figma-questions.js';

/**
 * Frame analysis prompt text — instructions for analyzing a single Figma frame.
 * 
 * NOTE: The embedded resource version may append a "Feature Context" section
 * via buildFrameAnalysisPromptResource(). This constant is the base text.
 */
export const FRAME_ANALYSIS_PROMPT_TEXT = `# Frame Analysis Instructions

**System Prompt:** ${SCREEN_ANALYSIS_SYSTEM_PROMPT}

## How To Analyze Each Frame

For each frame in the manifest:

1. **Find the frame's data** in this response:
   - Each frame starts with a text label: **"## Frame: {name} ({id})"**
   - Image: the **ImageContent block** immediately after the frame label — the visual screenshot
   - Context: \`context://frame/{frameId}\` — comments, notes, connections
   - Structure: \`structure://frame/{frameId}\` — semantic XML component tree

2. **Analyze the frame** following these guidelines:
   - Document every visible UI element with exact labels
   - Categorize features using scope markers: ☐ In-Scope, ✅ Already Done, ❌ Out-of-Scope, ❓ Questions
   - Note all visual states (active, hover, disabled, selected)
   - Describe layout patterns (grid, single-column, mixed)
   - Cross-reference visual elements with semantic XML for component names and variants
   - Use context markdown for designer intent and scope guidance

3. **Output format** — Produce a detailed markdown analysis for each frame. Include sections for:
   - Page Structure (header, navigation, layout)
   - Layout Structure Analysis (grid dimensions, element mapping)
   - Primary UI Elements (buttons, forms, tabs with exact labels)
   - Data Display (tables, lists, visual indicators)
   - Interactive Behaviors (clickable elements, state changes)
   - Scope Assessment (☐/✅/❌/❓ categorization)
   - Technical Considerations (responsive, accessibility, loading states)

**Important:** Analyze frames in parallel when possible — they are independent of each other.

## Settings
- **Max Tokens:** 8000 per frame
- **Temperature:** 0.3 (analytical)
`;

/**
 * Scope synthesis prompt text — instructions for combining frame analyses
 * into a cross-screen scope analysis.
 */
export const SCOPE_SYNTHESIS_PROMPT_TEXT = `# Scope Synthesis Instructions

## Your Task

Combine all individual frame analyses into a comprehensive cross-screen scope analysis.

## Input
- All frame analysis results from the previous step

## What to Produce

Synthesize the analyses into a single document covering:

1. **Feature Overview** — High-level description of what the page/flow does
2. **User Journeys** — Key paths users take through the screens
3. **Feature Inventory** — Complete list of features with scope markers:
   - ☐ In-Scope: New work to implement
   - ✅ Already Done: Existing functionality
   - ❌ Out-of-Scope: Excluded features
   - ⏬ Low Priority: Implement later
   - ❓ Open Questions: Ambiguous requirements
4. **Cross-Screen Patterns** — Shared components, consistent behaviors, design system usage
5. **Technical Scope** — APIs, data models, component architecture
6. **Implementation Notes** — Architecture considerations, dependencies

## Rules
- Reference specific frames by name when features span multiple screens
- Group features by workflow area, not by screen
- Flag contradictions between screens
- Note features visible in designs but marked out-of-scope

## Settings
- **Max Tokens:** 8000
- **Temperature:** 0.3 (analytical)
`;

/**
 * Questions generation prompt text — instructions for generating
 * frame-specific clarifying questions from analyses.
 */
export const QUESTIONS_GENERATION_PROMPT_TEXT = `# Questions Generation Instructions

**System Prompt:** ${FIGMA_QUESTIONS_SYSTEM_PROMPT}

## Your Task

Using the frame analyses and scope synthesis, generate frame-specific clarifying questions.

## Input
- All frame analysis results
- The scope synthesis document

## Critical Filtering Rules

1. **Cross-Screen Awareness**: If ANY screen shows a behavior (component style, position, interaction), that's DEFINED → don't ask
2. **Scope Markers**: Only ask about ☐ (in-scope) features, skip ✅ (already done) and ❌ (out-of-scope)
3. **Context First**: If context says a feature is out-of-scope or existing, skip all questions about it
4. **No Duplicates**: Don't repeat questions from existing comments (check \`context://frame/{id}\` resources)

## Question Assignment
- Every question assigned to the MOST RELEVANT screen
- NO general/cross-cutting category (pick closest screen)
- Screens with no questions are omitted

## Output Format

\`\`\`markdown
# Design Review Questions

## [Frame: Screen Name (nodeId: xxx:xxx)](https://www.figma.com/design/{fileKey}?node-id=xxx-xxx)

1. [Specific question about this screen]?
2. [Another question]?

## [Frame: Another Screen Name (nodeId: yyy:yyy)](https://www.figma.com/design/{fileKey}?node-id=yyy-yyy)

1. [Question for this screen]?
\`\`\`

**Important:**
- Each frame heading must be a markdown link to the Figma frame URL
- Use the frame's URL from the manifest (url field passed to figma-frame-analysis)
- The node-id in the URL uses hyphens not colons: "123:456" → "node-id=123-456"
- Include the exact nodeId in the heading text (format: "123:456")
- Only include frames that have questions
- Each question should be numbered within its frame section

## Settings
- **Max Tokens:** 8000
- **Temperature:** 0.3 (analytical)
`;
