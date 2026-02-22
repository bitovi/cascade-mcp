/**
 * Screen Analyzer
 * 
 * Generates AI-powered analysis documentation for Figma frames.
 * Combines semantic XML structure with images and annotations to
 * produce comprehensive screen documentation.
 */

import type { GenerateTextFn, LLMRequest } from '../../../llm-client/types.js';
import { generateSemanticXml as defaultGenerateSemanticXml } from '../semantic-xml-generator.js';
import type { AnalyzedFrame, FrameAnnotation } from './types.js';
import type { DownloadedImage } from './image-downloader.js';
import { loadAnalysisFromCache } from './cache-validator.js';
import { getFigmaFileCachePath } from './figma-cache.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Frame data needed for analysis
 */
export interface FrameAnalysisInput {
  /** Frame metadata from expansion */
  frame: AnalyzedFrame;
  
  /** Full Figma node tree (with children) for semantic XML generation */
  nodeData: any;
  
  /** Downloaded image data (if available) */
  image?: DownloadedImage;
}

/**
 * Result of analyzing a single frame
 */
export interface FrameAnalysisOutput {
  /** Frame with analysis populated */
  frame: AnalyzedFrame;
  
  /** Semantic XML generated for this frame */
  semanticXml: string;
  
  /** Whether analysis was successful */
  success: boolean;
  
  /** Error message if analysis failed */
  error?: string;
}

/**
 * Options for screen analysis
 */
export interface ScreenAnalysisOptions {
  /** Include image in the analysis prompt */
  includeImage?: boolean;
  
  /** Custom system prompt (override default) */
  systemPrompt?: string;
  
  /** Max tokens for LLM response */
  maxTokens?: number;
  
  /** 
   * Contextual markdown to include in analysis prompt.
   * This could be feature context, issue context, or user-provided description.
   * Used to help the AI understand what features to focus on.
   */
  contextMarkdown?: string;
  
  /** Total number of frames being analyzed (for screen order display) */
  totalFrames?: number;
}

/**
 * Dependencies for screen analysis
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface ScreenAnalyzerDeps {
  generateSemanticXml?: typeof defaultGenerateSemanticXml;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TOKENS = 8000;

const DEFAULT_SYSTEM_PROMPT = `You are a UX analyst creating detailed documentation of screen designs. Be exhaustive in documenting every visible element, include exact labels and text, note all visual states, and clearly distinguish between visual observations and design note specifications.`;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Analyze a single frame using AI
 * 
 * Generates semantic XML from the frame's node tree, combines with
 * image and annotations, and sends to LLM for analysis.
 * 
 * @param input - Frame data including node tree and optional image
 * @param generateText - LLM text generation function
 * @param options - Analysis options
 * @param deps - Optional dependency overrides for testing
 * @returns Frame with analysis populated
 */
export async function analyzeFrame(
  input: FrameAnalysisInput,
  generateText: GenerateTextFn,
  options: ScreenAnalysisOptions = {},
  {
    generateSemanticXml = defaultGenerateSemanticXml,
  }: ScreenAnalyzerDeps = {}
): Promise<FrameAnalysisOutput> {
  const { frame, nodeData, image } = input;
  const {
    includeImage = true,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTokens = DEFAULT_MAX_TOKENS,
    contextMarkdown,
    totalFrames,
  } = options;
  
  try {
    // Generate semantic XML from node tree
    const semanticXml = generateSemanticXml(nodeData);
    
    // Build the prompt (include context if provided)
    const userPrompt = buildAnalysisPrompt(frame, semanticXml, contextMarkdown, totalFrames);
    
    // Build message content (text or multimodal)
    const messageContent = buildMessageContent(
      userPrompt,
      includeImage ? image : undefined
    );
    
    // Create LLM request
    const request: LLMRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent },
      ],
      maxTokens,
    };
    
    // Generate analysis
    const response = await generateText(request);
    
    // Return frame with analysis
    return {
      frame: {
        ...frame,
        analysis: response.text,
        cached: false,
      },
      semanticXml,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`  ❌ Failed to analyze frame ${frame.name}: ${message}`);
    
    return {
      frame: {
        ...frame,
        analysis: undefined,
        cached: false,
      },
      semanticXml: '',
      success: false,
      error: message,
    };
  }
}

/**
 * Analyze multiple frames in parallel
 * 
 * Processes frames concurrently with a configurable concurrency limit
 * to avoid overwhelming the LLM API. Checks cache first and only re-analyzes
 * frames that are missing from cache or invalidated by new comments.
 * 
 * @param inputs - Array of frame inputs to analyze
 * @param generateText - LLM text generation function
 * @param options - Analysis options with cache control
 * @param deps - Optional dependency overrides
 * @returns Array of analysis results
 */
export async function analyzeFrames(
  inputs: FrameAnalysisInput[],
  generateText: GenerateTextFn,
  options: ScreenAnalysisOptions & { fileKey?: string; invalidatedFrameIds?: string[] } = {},
  deps: ScreenAnalyzerDeps = {}
): Promise<FrameAnalysisOutput[]> {
  if (inputs.length === 0) {
    return [];
  }
  
  const { fileKey, invalidatedFrameIds = [] } = options;
  
  // Set totalFrames from input array length if not provided
  const optionsWithTotal: typeof options = {
    ...options,
    totalFrames: options.totalFrames ?? inputs.length,
  };
  
  // Check cache for each frame
  const results: FrameAnalysisOutput[] = [];
  const framesToAnalyze: FrameAnalysisInput[] = [];
  
  if (fileKey) {
    const cachePath = getFigmaFileCachePath(fileKey);
    
    for (const input of inputs) {
      const filename = input.frame.cacheFilename || input.frame.name;
      const isInvalidated = invalidatedFrameIds.includes(input.frame.nodeId);
      
      // Try to load from cache if not invalidated
      if (!isInvalidated) {
        const cachedAnalysis = await loadAnalysisFromCache(cachePath, filename);
        
        if (cachedAnalysis) {
          results.push({
            frame: {
              ...input.frame,
              analysis: cachedAnalysis,
              cached: true,
            },
            semanticXml: '', // Not needed for cached results
            success: true,
          });
          continue;
        }
      }
      
      // Cache miss or invalidated - need to analyze
      framesToAnalyze.push(input);
    }
  } else {
    // No fileKey provided, analyze all frames
    framesToAnalyze.push(...inputs);
  }
  
  // Analyze frames that need it
  if (framesToAnalyze.length > 0) {
    const freshResults = await Promise.all(
      framesToAnalyze.map(input => analyzeFrame(input, generateText, optionsWithTotal, deps))
    );
    results.push(...freshResults);
  }
  
  return results;
}

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

/**
 * Build the user prompt for frame analysis
 * 
 * Combines frame name, section context, annotations, and semantic XML
 * into a structured prompt for the LLM.
 * 
 * @param frame - Frame metadata
 * @param semanticXml - Generated semantic XML
 * @param contextMarkdown - Optional contextual markdown (feature/issue context)
 * @param totalFrames - Optional total number of frames for screen order display
 * @returns Formatted prompt string
 */
export function buildAnalysisPrompt(
  frame: AnalyzedFrame,
  semanticXml: string,
  contextMarkdown?: string,
  totalFrames?: number
): string {
  const screenName = frame.frameName || frame.name;
  const hasNotes = frame.annotations.length > 0;
  const hasFeatureContext = !!(contextMarkdown && contextMarkdown.trim());
  const hasSemanticXml = !!semanticXml;
  
  // Format screen order if available
  const screenOrder = typeof frame.order === 'number'
    ? `${frame.order + 1}${totalFrames ? ` of ${totalFrames}` : ''}`
    : undefined;
  
  // Format annotations as markdown
  const notesContent = hasNotes
    ? frame.annotations.map(annotation => {
        const prefix = annotation.type === 'comment' 
          ? `Comment${annotation.author ? ` (${annotation.author})` : ''}`
          : 'Note';
        return `- **${prefix}**: ${annotation.content}`;
      }).join('\n')
    : '';

  return `You are a UX analyst tasked with creating detailed documentation of this screen design. Be exhaustive in documenting every visible element.

# Screen: ${screenName}

- **Figma Node URL:** ${frame.url}
${screenOrder ? `- **Screen Order:** ${screenOrder}` : ''}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Feature Context:** ${hasFeatureContext ? 'Yes' : 'No'}
- **Has Semantic Structure:** ${hasSemanticXml ? 'Yes' : 'No'}
${frame.sectionName ? `- **Section**: ${frame.sectionName}` : ''}

**IMPORTANT:** If the screen name contains a breakpoint indicator (e.g., *-320px, *-768px, *-1024px, *-1440px), this is one view of a responsive design. Pay special attention to the "Layout Structure Analysis" section to precisely document the layout structure at this specific breakpoint.

## Design Notes & Annotations

${notesContent || 'No design notes available for this screen.'}

**CRITICAL - Scope Limiting Notes:**
If any note specifies scope limitations (e.g., "This is for X only", "Ignore Y", "Focus on Z"), treat these as AUTHORITATIVE constraints:
- Only document features within the specified scope as in-scope (☐)
- Features outside the specified scope should be marked as out-of-scope (❌) or already done (✅)
- The note's scope guidance OVERRIDES what is visible in the UI

## Feature Context & Priorities

${hasFeatureContext ? contextMarkdown : 'No feature context provided for this analysis.'}

**How to use feature context:**
- Categorize features using these emojis:
  - ☐ In-Scope: Features explicitly listed as in-scope in the feature context (new work to be done)
  - ⏬ Low Priority: Features marked to "delay until end" or "implement last" (WILL be implemented later in this feature)
  - ✅ Already Done: Existing functionality mentioned as already implemented (provides context but not new work)
  - ❌ Out-of-Scope: Features explicitly excluded or marked for future work (will NOT be implemented in this feature)
  - ❓ Questions: Unclear behavior, ambiguous requirements, or features that could be either in/out of scope
  - 💬 Answered: Questions answered by design notes, comments, or feature context
- Flag contradictions and priorities:
  - ⚠️ SCOPE MISMATCH: When UI shows features marked as out of scope in the feature context (these will NOT be implemented)
  - ⏬ Low Priority: When features are marked to "delay until end" (these WILL be implemented in later stories)
- Example 1: "☐ Text search capability for filtering tasks by name"
- Example 2: "✅ Checkbox interaction to toggle task status (existing functionality)"
- Example 3: "❌ OAuth authentication (future work)"
- Example 4: "⚠️ SCOPE MISMATCH: Admin panel visible but feature context marks as out of scope"
- Example 5: "⏬ Low Priority: Pagination controls visible but feature context explicitly delays until end"
- Example 6: "❓ Should filters persist across sessions? Not specified in feature context or design notes"
- Example 7: "💬 How are errors displayed? → Toast notifications (per design note)"
- Note discrepancies between screen designs and feature priorities
- Reference feature constraints when documenting features
- Feature priorities take precedence over screen designs when there are contradictions
- Keep ☐ descriptions concise for obvious features, detailed for complex features
- IMPORTANT: Low priority features (⏬) should still be documented fully - they will be implemented later in this feature
- Keep ✅ and ❌ descriptions brief since they're not part of this feature's work

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

Document **visible** technical UI elements only. DO NOT speculate about implementation, backend systems, or data storage.

- **Responsive Design:** Mobile/tablet view indicators, breakpoint-specific layouts (if screen name shows breakpoint)
- **Performance UI Elements:** Visible loading indicators, skeleton screens, progress bars, pagination controls, "Load more" buttons
- **Accessibility Features:** Visible focus states, screen reader text indicators, keyboard navigation cues, ARIA label hints
- **Loading States:** Spinners, skeletons, progress indicators shown in the UI
- **Error States:** Error messages, validation indicators, warning banners visible on screen

## Analysis Guidelines

- Read feature context and design notes first to understand priorities and scope
- **If notes specify scope limitations, ONLY document features within that scope as ☐ In-Scope**
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
- Categorize features using feature context guidance:
  - ☐ In-Scope: New capabilities to be built (concise for obvious, detailed for complex)
  - ✅ Already Done: Existing functionality providing context (keep brief)
  - ⏬ Low Priority: Implement later in feature (keep brief with timing note)
  - ❌ Out-of-Scope: Excluded or future epic features (keep brief)
  - ❓ Questions: Unclear behavior or ambiguous requirements
  - 💬 Answered: Questions clarified by notes, comments, or context
- Flag contradictions and priorities:
  - ⚠️ SCOPE MISMATCH: When visible features contradict feature scope
  - ⏬ Low Priority: When features are marked to delay until end
- Clearly distinguish what comes from visual analysis vs. design notes vs. feature context`;
}

/**
 * Build message content for LLM request
 * 
 * Creates either a simple text message or multimodal message
 * including the frame image.
 * 
 * @param textPrompt - The text prompt
 * @param image - Optional image to include
 * @returns Message content (string or array)
 */
export function buildMessageContent(
  textPrompt: string,
  image?: DownloadedImage
): string | Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> {
  if (!image) {
    return textPrompt;
  }
  
  return [
    { type: 'image', data: image.base64Data, mimeType: image.mimeType },
    { type: 'text', text: textPrompt },
  ];
}

/**
 * Format annotations for display in analysis
 * 
 * @param annotations - Array of annotations
 * @returns Formatted string
 */
export function formatAnnotations(annotations: FrameAnnotation[]): string {
  if (annotations.length === 0) {
    return '';
  }
  
  return annotations
    .map(a => {
      const prefix = a.type === 'comment'
        ? `Comment${a.author ? ` (${a.author})` : ''}`
        : 'Note';
      return `- ${prefix}: ${a.content}`;
    })
    .join('\n');
}
