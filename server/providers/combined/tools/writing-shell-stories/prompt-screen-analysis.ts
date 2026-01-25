/**
 * Screen Analysis Prompt Generator
 * 
 * Creates AI prompts for analyzing UI screen designs.
 * This helper centralizes all screen analysis prompts for easy maintenance.
 * Based on: https://github.com/bitovi/ai-enablement-prompts/blob/main/writing-stories/from-figma/3-analyze-screens.md
 */

/**
 * Generate a screen analysis prompt for AI analysis
 * 
 * @param screenName - Name of the screen being analyzed
 * @param screenUrl - Figma URL for the screen
 * @param screenPosition - Position in the screen flow (e.g., "1 of 5")
 * @param notesContent - Optional markdown content from design notes
 * @param epicContext - Optional epic description content for context and priorities
 * @returns Formatted prompt for AI screen analysis
 */
export function generateScreenAnalysisPrompt(
  screenName: string,
  screenUrl: string,
  screenPosition: string,
  notesContent?: string,
  epicContext?: string,
  semanticXml?: string
): string {
  const hasNotes = !!notesContent;
  const hasEpicContext = !!(epicContext && epicContext.trim());
  const hasSemanticXml = !!semanticXml;
  
  return `You are a UX analyst tasked with creating detailed documentation of this screen design. Be exhaustive in documenting every visible element.

# Screen: ${screenName}

- **Figma Node URL:** ${screenUrl}
- **Screen Order:** ${screenPosition}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Epic Context:** ${hasEpicContext ? 'Yes' : 'No'}
- **Has Semantic Structure:** ${hasSemanticXml ? 'Yes' : 'No'}

**IMPORTANT:** If the screen name contains a breakpoint indicator (e.g., *-320px, *-768px, *-1024px, *-1440px), this is one view of a responsive design. Pay special attention to the "Layout Structure Analysis" section to precisely document the layout structure at this specific breakpoint.

## Design Notes & Annotations

${notesContent ? notesContent : 'No design notes available for this screen.'}

## Epic Context & Priorities

${hasEpicContext ? epicContext : 'No epic context available for this analysis.'}

**How to use epic context:**
- Categorize features using these emojis:
  - ☐ In-Scope: Features explicitly listed as in-scope in epic context (new work to be done)
  - ⏬ Low Priority: Features marked to "delay until end" or "implement last" (WILL be implemented later in this epic)
  - ✅ Already Done: Existing functionality mentioned in epic as already implemented (provides context but not new work)
  - ❌ Out-of-Scope: Features explicitly excluded or marked for future epics (will NOT be implemented in this epic)
  - ❓ Questions: Unclear behavior, ambiguous requirements, or features that could be either in/out of scope
- Flag contradictions and priorities:
  - ⚠️ SCOPE MISMATCH: When UI shows features marked as out of scope in epic (these will NOT be implemented)
  - ⏬ Low Priority: When features are marked to "delay until end" (these WILL be implemented in later stories)
- Example 1: "☐ Text search capability for filtering tasks by name"
- Example 2: "✅ Checkbox interaction to toggle task status (existing functionality)"
- Example 3: "❌ OAuth authentication (future epic)"
- Example 4: "⚠️ SCOPE MISMATCH: Admin panel visible but epic marks as out of scope"
- Example 5: "⏬ Low Priority: Pagination controls visible but epic explicitly delays until end"
- Example 6: "❓ Should filters persist across sessions? Not specified in epic or design notes"
- Note discrepancies between screen designs and epic priorities
- Reference epic constraints when documenting features
- Epic priorities take precedence over screen designs when there are contradictions
- Keep ☐ descriptions concise for obvious features, detailed for complex features
- IMPORTANT: Low priority features (⏬) should still be documented fully - they will be implemented later in this epic
- Keep ✅ and ❌ descriptions brief since they're not part of this epic's work

${hasSemanticXml ? `
## Figma Semantic Structure

The following XML represents the component hierarchy and semantic structure from Figma's design system. Use this to:
- **Identify component variants**: Look for \`State\` attributes (e.g., State="Hover", State="Open", State="Selected")
- **Detect interaction patterns**: Components with \`interactive="true"\` are clickable/hoverable
- **Understand functionality**: Component names reveal purpose (Hover-Card = tooltip, Text-Listing = list of items, Reaction-Statistics = vote display)
- **Compare similar components**: Multiple instances of the same component with different states show interaction behavior

**Important**: When you see similar visual elements (like multiple comments or cards), check their semantic structure to detect state differences that indicate interactions (hover states, expanded states, selected states, etc.).

\`\`\`xml
${semanticXml}
\`\`\`

` : ''}
## Page Structure

Document the overall page layout:
- **Header/Navigation:** Describe top-level navigation, branding, search, user controls
- **Page Title:** Main heading and any subtitle/description
- **Layout:** Overall page structure (sidebar, main content area, footer, etc.)

## Layout Structure Analysis

Analyze how content is organized on this screen:

1. **Scan the layout systematically (left-to-right, top-to-bottom):**
   - Identify all distinct visual sections/blocks
   - Count major content areas
   
2. **Identify the layout pattern(s):**
   - **If grid-based (elements align in rows AND columns):**
     **CRITICAL - Think like a developer implementing CSS Grid:**
     You are counting grid cells, not semantic sections. Text blocks, headings, cards, images, and forms all occupy grid cells equally.
     Do NOT separate elements by type (e.g., "heading area" + "content area") - they are all cells in the same grid.
     
     1. **Count columns:** Look at the TOP ROW from left to right. Count EVERY element sitting side-by-side, including headings, text blocks, cards, images - everything. That's your COLUMN count.
     2. **Count rows:** Look at the LEFTMOST COLUMN from top to bottom. Count EVERY element stacked vertically. That's your ROW count.
     3. **Your grid is:** [COLUMN count] columns × [ROW count] rows
     4. **Map EVERY element:** List what occupies each [column, row] position including headings, text, and cards (e.g., "Heading text block [1,1], Card 1 [2,1], Card 2 [3,1], Card 3 [1,2], Card 4 [2,2]...")
     5. **Check spanning:** Do any elements occupy multiple columns/rows?
     6. **VERIFY - Critical check:**
        - Count elements in TOP ROW again: ___
        - Count elements in LEFTMOST COLUMN again: ___
        - Does your grid "[X] columns × [Y] rows" match these counts?
        - If not, you made an error - recount treating ALL elements as equal grid cells.
     
   - **If single-column:** Describe the vertical stacking order
   - **If multiple distinct sections with different layouts:** Describe each section's layout separately (e.g., "Header: single row, Main: 3-column grid, Footer: 4-column grid")
   - **If freeform:** Describe spatial relationships (left/right, overlapping, absolute positioning)
   
3. **Note breakpoint context (if applicable):**
   - What is the viewport width? (often in filename like *-768px, *-1024px)
   - Is this one of multiple responsive variations?

4. **Check for consistency:**
   - Do all major elements follow the same grid/layout system?
   - Are there sections that break the pattern?

**Document the result as:**
- Primary layout pattern: "3-column grid" or "Single column flow" or "Mixed layout"
- If grid: "[X] columns × [Y] rows" with complete element mapping showing [column, row] positions for ALL elements
- If multiple grids: Describe each section separately
- If single column: Note the stacking order and major sections
- Responsive context: Breakpoint width if identifiable

## Primary UI Elements

Document every visible element with exact details:
- **Buttons:** List all buttons with their exact labels and visual states (primary, secondary, disabled, hover if visible)
- **Tabs/Filters:** Status filters, navigation tabs, toggle controls with their labels
- **Form Controls:** Inputs, dropdowns, checkboxes, radio buttons with labels and placeholder text
- **Navigation:** Pagination controls, breadcrumbs, back/forward buttons
- **Actions:** All clickable elements, hover states, interactive components

Include exact text labels, button copy, and all visible UI text.

**When comparing similar UI components:** If you see multiple instances of similar components (comments, cards, list items), compare them carefully. If they differ visually, describe what's different and explain what interaction or state change that difference might represent (e.g., hover state, selected state, active state with revealed information).

**If semantic structure is provided:** Cross-reference the visual differences with the Figma component structure. Look for State attributes or additional child components (like Hover-Card) that confirm what interaction is being shown.

## Data Display

Document how information is presented:
- **Table Structure:** Column headers (exact names), data types, sortable indicators (arrows, styling)
- **Data Fields:** All visible data columns and their content types (text, numbers, dates, etc.)
- **Visual Indicators:** Status badges, icons, color coding, state indicators
- **Empty States:** How missing/null data is displayed, placeholder text

## Interactive Behaviors (Implied)

Based on visual cues and any notes provided, document likely behaviors:
- **Clickable Elements:** What appears clickable and where it might lead (buttons, links, cards)
- **Sorting:** Which columns appear sortable based on visual indicators
- **Filtering:** How filters appear to work, filter options visible
- **State Changes:** Selected vs unselected states, active/inactive indicators
- **Progressive Disclosure:** Expandable sections, hover details, tooltips
- **Note-Specified Behaviors:** Any specific interactions described in design notes

Distinguish between what you observe visually vs. what is specified in design notes.

## Content & Data

Document the actual content shown:
- **Sample Data:** What type of information is displayed (user names, transaction amounts, etc.)
- **Data Patterns:** Formats for dates, names, statuses, currencies, phone numbers, etc.
- **Content Hierarchy:** Visual emphasis through typography, spacing, color

## Unique Features

- **Screen-Specific Elements:** Features that appear unique to this screen
- **Advanced Functionality:** Complex controls, specialized widgets, custom components
- **Differences:** How this screen differs from typical screens in this flow

## Technical Considerations

- **Responsive Indicators:** Any mobile/tablet view indicators or responsive design elements visible
- **Performance Implications:** Large data sets, infinite scroll, lazy loading indicators
- **Accessibility:** Visible accessibility features (alt text indicators, ARIA labels, focus states)
- **Loading States:** Spinners, skeletons, progress indicators
- **Error States:** Error messages, validation indicators, warning states

## Analysis Guidelines

- Read epic context and design notes first to understand priorities and scope
- **Analyze layout systematically based on the pattern you observe:**
  - **Grid layouts** (cards in rows/columns): Count columns, rows, map element positions
  - **Single-column layouts** (forms, articles): Describe vertical flow and sections
  - **Complex layouts** (multiple distinct areas): Break down each section separately
  - **Note responsive context** if screen name indicates breakpoint (*-768px, etc.)
- Be exhaustive in documenting every visible element
- Include exact labels, button text, column headers
- Note all visual states (active, hover, disabled, selected)
- Describe layout and spacing patterns
- Capture data types and formats shown
- Identify potential user workflows
- Note any error states or validation visible
- Document loading states or empty states shown
- Categorize features using epic context guidance:
  - ☐ In-Scope: New capabilities to be built (concise for obvious, detailed for complex)
  - ✅ Already Done: Existing functionality providing context (keep brief)
  - ⏬ Low Priority: Implement later in epic (keep brief with timing note)
  - ❌ Out-of-Scope: Excluded or future epic features (keep brief)
  - ❓ Questions: Unclear behavior or ambiguous requirements
- Flag contradictions and priorities:
  - ⚠️ SCOPE MISMATCH: When visible features contradict epic scope
  - ⏬ Low Priority: When features are marked to delay until end
- Clearly distinguish what comes from visual analysis vs. design notes vs. epic context`;
}

/**
 * System prompt for screen analysis
 */
export const SCREEN_ANALYSIS_SYSTEM_PROMPT = "You are a UX analyst creating detailed documentation of screen designs. Be exhaustive in documenting every visible element, include exact labels and text, note all visual states, and clearly distinguish between visual observations and design note specifications.";

/**
 * Default max tokens for screen analysis
 * Increased to accommodate comprehensive analysis with all sections
 */
export const SCREEN_ANALYSIS_MAX_TOKENS = 8000;
