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
  epicContext?: string
): string {
  const hasNotes = !!notesContent;
  const hasEpicContext = !!(epicContext && epicContext.trim());
  
  return `You are a UX analyst tasked with creating detailed documentation of this screen design. Be exhaustive in documenting every visible element.

# Screen: ${screenName}

- **Figma Node URL:** ${screenUrl}
- **Screen Order:** ${screenPosition}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Epic Context:** ${hasEpicContext ? 'Yes' : 'No'}

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

## Page Structure

Document the overall page layout:
- **Header/Navigation:** Describe top-level navigation, branding, search, user controls
- **Page Title:** Main heading and any subtitle/description
- **Layout:** Overall page structure (sidebar, main content area, footer, etc.)

## Primary UI Elements

Document every visible element with exact details:
- **Buttons:** List all buttons with their exact labels and visual states (primary, secondary, disabled, hover if visible)
- **Tabs/Filters:** Status filters, navigation tabs, toggle controls with their labels
- **Form Controls:** Inputs, dropdowns, checkboxes, radio buttons with labels and placeholder text
- **Navigation:** Pagination controls, breadcrumbs, back/forward buttons
- **Actions:** All clickable elements, hover states, interactive components

Include exact text labels, button copy, and all visible UI text.

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
