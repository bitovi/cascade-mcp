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
   * This could be epic context, issue context, or user-provided description.
   * Used to help the AI understand what features to focus on.
   */
  contextMarkdown?: string;
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

const DEFAULT_MAX_TOKENS = 2000;

const DEFAULT_SYSTEM_PROMPT = `You are a UI/UX documentation expert. Analyze the provided Figma screen and generate clear, developer-friendly documentation.

Focus on:
1. **Purpose**: What is this screen's main function in the application?
2. **Key Components**: List the main UI elements (buttons, forms, navigation, etc.)
3. **User Interactions**: What actions can users take on this screen?
4. **States**: Any visible states (loading, error, empty, etc.)
5. **Data Display**: What information is shown to the user?

Keep the analysis concise but comprehensive. Use markdown formatting.
If annotations or notes are provided, incorporate their context into your analysis.`;

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
  } = options;
  
  try {
    // Generate semantic XML from node tree
    const semanticXml = generateSemanticXml(nodeData);
    
    // Build the prompt (include context if provided)
    const userPrompt = buildAnalysisPrompt(frame, semanticXml, contextMarkdown);
    
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
 * to avoid overwhelming the LLM API.
 * 
 * @param inputs - Array of frame inputs to analyze
 * @param generateText - LLM text generation function
 * @param options - Analysis options
 * @param deps - Optional dependency overrides
 * @returns Array of analysis results
 */
export async function analyzeFrames(
  inputs: FrameAnalysisInput[],
  generateText: GenerateTextFn,
  options: ScreenAnalysisOptions = {},
  deps: ScreenAnalyzerDeps = {}
): Promise<FrameAnalysisOutput[]> {
  if (inputs.length === 0) {
    return [];
  }
  
  console.log(`Analyzing ${inputs.length} frames...`);
  
  // Process all frames (could add concurrency control here)
  const results = await Promise.all(
    inputs.map(input => analyzeFrame(input, generateText, options, deps))
  );
  
  const successCount = results.filter(r => r.success).length;
  console.log(`  ✅ Analyzed ${successCount}/${inputs.length} frames`);
  
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
 * @param contextMarkdown - Optional contextual markdown (epic/issue context)
 * @returns Formatted prompt string
 */
export function buildAnalysisPrompt(
  frame: AnalyzedFrame,
  semanticXml: string,
  contextMarkdown?: string
): string {
  const parts: string[] = [];
  
  // Frame identification
  parts.push(`## Screen: ${frame.frameName || frame.name}`);
  
  // Section context (if available)
  if (frame.sectionName) {
    parts.push(`\n**Section**: ${frame.sectionName}`);
  }
  
  // Epic/Issue context (if provided)
  if (contextMarkdown) {
    parts.push('\n### Context');
    parts.push(contextMarkdown);
  }
  
  // Annotations (if available)
  if (frame.annotations.length > 0) {
    parts.push('\n### Designer Notes');
    for (const annotation of frame.annotations) {
      const prefix = annotation.type === 'comment' 
        ? `Comment${annotation.author ? ` (${annotation.author})` : ''}`
        : 'Note';
      parts.push(`- **${prefix}**: ${annotation.content}`);
    }
  }
  
  // Semantic XML structure
  parts.push('\n### UI Structure (Semantic XML)');
  parts.push('```xml');
  parts.push(semanticXml);
  parts.push('```');
  
  // Analysis request
  parts.push('\n### Request');
  parts.push('Please analyze this screen and provide documentation following the format in your instructions.');
  
  return parts.join('\n');
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
