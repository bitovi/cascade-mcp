# Confluence Integration for Combined Tools

## Overview

This spec covers integrating Confluence page links embedded in Jira epics to provide additional context for the combined tools (`analyze-feature-scope`, `write-shell-stories`, `write-next-story`).

Jira epics may reference different types of Confluence documents:
- **Product Requirement Documents (PRDs)** - Requirements, user stories, acceptance criteria
- **Definition of Done (DoD)** - Quality gates, testing requirements
- **Architecture/Technical Decision Documentation** - System design, API contracts, data models
- **Project Context** - Background, constraints, dependencies

### Goals

1. **Extract Confluence links** from epic descriptions (similar to Figma URL extraction)
2. **Fetch and cache Confluence content** with timestamp-based validation (similar to Figma caching)
3. **Categorize documents** by relevance to each tool
4. **Summarize large documents** to stay within LLM token limits
5. **Provide context to AI** when generating scope analysis, shell stories, and full stories

### Non-Goals

- Modifying Confluence pages (read-only access)
- Supporting inline Confluence macros or complex formatting
- Real-time sync with Confluence edits during tool execution
- Confluence Server/Data Center support (Cloud only)
- Page attachments (future enhancement)
- Recursive child page fetching

---

## Architecture Pattern (Following Figma Implementation)

The implementation follows the established pattern from Figma integration:

### 1. URL Extraction from ADF
Similar to `extractFigmaUrlsFromADF()` in `figma-screen-setup.ts`:
- Parse ADF document structure
- Extract URLs from `inlineCard` nodes
- Extract URLs from `text` nodes with `link` marks
- Filter for Confluence domain patterns

### 2. Caching Strategy
Similar to Figma caching in `specs/13-caching.md`:
- Cache by Confluence page ID (not epic key)
- Store in `cache/confluence-pages/{pageId}/`
- Use timestamp-based validation via Confluence REST API
- Metadata file: `.confluence-metadata.json`

### 3. Helper Pattern
Create idempotent helper similar to Figma screen setup:
- `setupConfluenceContext()` - Main orchestration function
- Returns structured data including markdown content, metadata, categorization
- Can be called multiple times without side effects

---

## Implementation Plan

### Phase 0: Tool Summary Files

#### Step 0.1: Create Tool Summary Documents

**Files** (new, co-located with each tool):
- `server/providers/combined/tools/analyze-feature-scope/tool-summary.md`
- `server/providers/combined/tools/writing-shell-stories/tool-summary.md`
- `server/providers/combined/tools/write-next-story/tool-summary.md`

**Purpose**: Provide structured descriptions of what each tool does and what information it uses to make decisions. These summaries are used by the relevance scoring system to determine how useful a Confluence document is for each tool.

**Template**:
```markdown
# {Tool Name} Summary

## Purpose
{One sentence description of what the tool produces}

## Key Steps
1. {Step name}: {What it does}
2. {Step name}: {What it does}
...

## Decision Points
The following information influences the tool's output:

### {Decision Point 1}
- **What**: {Description}
- **Source**: {Where this info typically comes from}
- **Example**: {Concrete example}

### {Decision Point 2}
...

## Document Types That Help
- {Document type}: {Why it's useful}
- {Document type}: {Why it's useful}
```

**Example** (illustrative - actual content should reflect real tool behavior):
```markdown
# Analyze Feature Scope Summary

## Purpose
Breaks down an epic into discrete features/capabilities and identifies questions.

## Key Steps
1. Parse epic description and extract requirements
2. Identify distinct features/user capabilities
3. Group related features
4. Identify dependencies between features
5. Generate questions for ambiguous requirements

## Decision Points

### Feature Identification
- **What**: Determining what distinct capabilities the epic describes
- **Source**: Epic description, PRDs, user stories
- **Example**: "User can filter search results" is one feature

### Feature Grouping
- **What**: How to organize features into logical groups
- **Source**: User workflows, UI organization, domain boundaries
- **Example**: "Search" group contains filter, sort, and pagination features

### Dependency Mapping
- **What**: Which features depend on others
- **Source**: Technical architecture, data flow documentation
- **Example**: "Search filters" depends on "Search results display"

### Ambiguity Detection
- **What**: Identifying unclear or missing requirements
- **Source**: Gaps between PRD and epic, conflicting statements
- **Example**: "Support multiple formats" - which formats?

## Document Types That Help
- PRDs: Feature requirements, user stories, acceptance criteria
- Technical docs: API constraints, system boundaries
- Context docs: Business background, project constraints
```

**Note**: The actual tool summary files should be written by examining each tool's real implementation and decision-making process.

**Verification**:
- Each tool has a summary file
- Summaries follow consistent template
- Decision points are specific and actionable

---

### Phase 1: Confluence URL Extraction and API Helpers

#### Step 1.1: Create Confluence URL Extractor

**File**: `server/providers/atlassian/confluence-helpers.ts` (new file)

**Tasks**:
- Create `extractConfluenceUrlsFromADF(adf: ADFDocument): string[]` function
- Pattern matching for Confluence URLs:
  - `https://{siteName}.atlassian.net/wiki/spaces/{spaceKey}/pages/{pageId}/{pageTitle}`
  - `https://{siteName}.atlassian.net/wiki/x/{shortId}` (short links)
  - Inline card nodes with Confluence URLs
  - Text nodes with link marks to Confluence
- Parse URLs to extract: `siteName`, `pageId`, `spaceKey`
- Return deduplicated array of Confluence URLs

**Data structures**:
```typescript
export interface ConfluenceUrlInfo {
  url: string;
  siteName: string;
  pageId: string;
  spaceKey?: string;
}

export function parseConfluenceUrl(url: string): ConfluenceUrlInfo | null;
export function extractConfluenceUrlsFromADF(adf: ADFDocument): string[];
```

**Short link resolution**:
- Short links (`/wiki/x/{shortId}`) redirect to full page URLs
- Resolution approach: Make HEAD request to short URL, follow redirect, extract pageId from final URL
- Cache resolved URLs to avoid repeated redirects
- If resolution fails, skip the URL and log warning

**Verification**:
- Test with ADF containing various Confluence URL formats
- Verify short link resolution via redirect following
- Confirm deduplication works (including resolved short links)

---

#### Step 1.2: Create Confluence API Client Methods

**File**: `server/providers/atlassian/confluence-helpers.ts`

**Tasks**:
- Create `getConfluencePage()` function to fetch page content
- **Confluence Cloud only** - Endpoint: `GET /wiki/api/v2/pages/{pageId}?body-format=atlas_doc_format` 
  - **Format choice**: Use `atlas_doc_format` (ADF) instead of `storage` format
  - **Rationale**: Confluence v2 API supports both `storage` (HTML-like XML) and `atlas_doc_format` (ADF, same as Jira)
  - **Benefit**: Can reuse existing `convertAdfToMarkdown()` from `markdown-converter.ts` (no new converter needed)
- Handle authentication (OAuth bearer token or PAT basic auth)
- Parse response to extract:
  - Page title
  - **Page body (ADF format)** - Same structure as Jira descriptions
  - **Last modified timestamp**: `version.createdAt` (ISO 8601 string, e.g., "2024-12-11T10:30:00Z")
  - Version number: `version.number`
  - Space info: `spaceId`, `space.key` (if available)

**Data structures**:
```typescript
export interface ConfluencePageData {
  id: string;
  title: string;
  body: ADFDocument; // ✅ ADF format (same as Jira)
  version: {
    number: number;
    createdAt: string; // ISO 8601 timestamp (last modified)
    message?: string; // Optional version message
    minorEdit: boolean;
    authorId: string;
  };
  space: {
    id: string;
    key?: string;
  };
}

export async function getConfluencePage(
  client: AtlassianClient,
  siteName: string,
  pageId: string
): Promise<ConfluencePageData>;
```

**Verification**:
- Fetch test Confluence page successfully
- Verify ADF body is returned (not storage format)
- Confirm timestamp parsing
- Test reusing `convertAdfToMarkdown()` from `markdown-converter.ts`

---

### Phase 2: Caching Infrastructure

#### Step 2.1: Create Confluence Cache Directory Structure

**File**: `server/providers/atlassian/confluence-cache.ts` (new file)

**Tasks**:
- **Copy Figma cache pattern** from `figma-cache.ts` and adapt for Confluence
- Create cache directory helpers:
  - `getConfluencePageCachePath(pageId: string): string` - Returns `cache/confluence-pages/{pageId}/`
  - `getConfluenceMetadataPath(pageId: string): string` - Returns `cache/confluence-pages/{pageId}/.confluence-metadata.json`
- Cache structure: `cache/confluence-pages/{pageId}/`
  - `{pageId}.md` - Markdown content
  - `.confluence-metadata.json` - Timestamp and metadata

**Data structures**:
```typescript
export interface ConfluenceMetadata {
  pageId: string;
  title: string;
  spaceKey?: string;
  url: string;
  lastModified: string; // ISO 8601 from Confluence API (version.createdAt)
  cachedAt: string; // ISO 8601 when we cached
  versionNumber: number;
  markdownLength: number;
  
  // Relevance scoring
  relevance?: {
    documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
    toolScores: {
      toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';
      decisionPointScores: {
        decisionPointId: string;
        score: number;
        reasoning: string;
      }[];
      overallScore: number;
      summary: string;
    }[];
  };
}
```

**Verification**:
- Create cache directories successfully
- Write and read metadata files with full relevance data
- Verify JSON structure includes nested scores

---

#### Step 2.2: Implement Cache Validation

**File**: `server/providers/atlassian/confluence-cache.ts`

**Tasks**:
- **Mirror Figma cache validation logic** with Confluence-specific fields
- Create `isCacheValid(pageId: string, currentLastModified: string): Promise<boolean>`
  - Compare stored `lastModified` with current `version.createdAt` from Confluence API
  - Return `false` if timestamps differ (cache is stale)
  - Log cache status (similar to Figma: "♻️ Confluence page updated: ...")
- Create `clearConfluenceCache(pageId: string): Promise<void>` 
  - Delete entire `cache/confluence-pages/{pageId}/` directory
- Create `ensureValidCacheForConfluencePage(client, pageId)` 
  - Check if cache exists
  - If exists, validate timestamp
  - If stale, clear and recreate directory
  - If missing, create directory

**Verification**:
- Test cache hit (timestamps match)
- Test cache miss (timestamps differ)
- Verify cache clearing removes directory
- Confirm behavior matches Figma cache pattern

---

### Phase 3: Relevance Scoring

#### Step 3.1: Load Tool Summary Files

**File**: `server/providers/atlassian/confluence-relevance.ts` (new file)

**Tasks**:
- Create `loadToolSummaries()` function to read tool summary markdown files
- Cache loaded summaries in memory (they don't change at runtime)
- Return structured data for each tool's decision points

**Data structures**:
```typescript
export interface ToolSummary {
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';
  purpose: string;
  decisionPoints: {
    id: string;
    name: string;
    description: string;
  }[];
}

export async function loadToolSummaries(): Promise<ToolSummary[]>;
```

---

#### Step 3.2: Create Relevance Scoring System

**File**: `server/providers/atlassian/confluence-relevance.ts`

**Tasks**:
- Create `scoreDocumentRelevance()` function using LLM
- Takes full document markdown content and tool summaries
- Scores relevance to each decision point of each tool (0-10 scale)
- Aggregates decision point scores into overall tool relevance score
- Prompt template:
  ```
  You are evaluating how relevant a Confluence document is to software development tools.
  
  ## Document
  Title: {title}
  Content: {documentContent}
  
  ## Tools to Evaluate
  
  {for each tool}
  ### {tool.toolId}
  Purpose: {tool.purpose}
  
  Decision Points:
  {for each decisionPoint}
  - {decisionPoint.id}: {decisionPoint.description}
  {/for}
  {/for}
  
  ## Task
  For each tool, score how relevant this document is to each decision point.
  Use a 0-10 scale:
  - 0: No relevant information
  - 1-3: Tangentially related, minor context
  - 4-6: Moderately useful, some applicable information
  - 7-9: Highly relevant, directly addresses this decision point
  - 10: Essential, primary source for this decision point
  
  Output JSON:
  {
    "documentType": "requirements|technical|context|dod|unknown",
    "toolScores": [
      {
        "toolId": "analyze-feature-scope",
        "decisionPointScores": [
          { "decisionPointId": "feature-identification", "score": 8, "reasoning": "Contains user stories..." },
          { "decisionPointId": "complexity-estimation", "score": 3, "reasoning": "Limited technical detail..." }
        ],
        "overallScore": 5.5,
        "summary": "Useful for identifying features but lacks technical depth"
      }
    ]
  }
  ```

**Data structures**:
```typescript
export interface DecisionPointScore {
  decisionPointId: string;
  score: number; // 0-10
  reasoning: string;
}

export interface ToolRelevanceScore {
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';
  decisionPointScores: DecisionPointScore[];
  overallScore: number; // Average of decision point scores
  summary: string; // Brief explanation of relevance
}

export interface DocumentRelevance {
  documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
  toolScores: ToolRelevanceScore[];
}

export async function scoreDocumentRelevance(
  generateText: LLMClient,
  title: string,
  markdown: string, // Full document content
  toolSummaries: ToolSummary[]
): Promise<DocumentRelevance>;
```

**Verification**:
- PRD scores high for analyze-feature-scope's "feature-identification"
- Technical doc scores high for write-next-story's decision points
- DoD scores high for acceptance criteria decision points
- Scores are consistent across multiple runs

---

#### Step 3.3: Update Cache Metadata Structure

**File**: `server/providers/atlassian/confluence-cache.ts`

**Tasks**:
- Update `ConfluenceMetadata` to include relevance scores
- Store relevance data in cache for reuse

---

### Phase 4: Base Helper - Setup Confluence Context

#### Step 4.1: Create Main Setup Function

**File**: `server/providers/combined/tools/shared/confluence-setup.ts` (new file)

**Tasks**:
- Create `setupConfluenceContext()` orchestration function
- Similar structure to `setupFigmaScreens()` in `figma-screen-setup.ts`
- Steps:
  1. Extract Confluence URLs from epic ADF
  2. For each URL:
     - Check cache validity
     - Fetch page if cache is stale/missing
     - Convert ADF to markdown
     - Score relevance against tool summaries
     - Save to cache with metadata
  3. Return structured context data

**Data structures**:
```typescript
export interface ConfluenceDocument {
  pageId: string;
  title: string;
  url: string;
  markdown: string; // Full document content
  metadata: ConfluenceMetadata;
}

export interface ConfluenceContextResult {
  documents: ConfluenceDocument[];
  
  // Documents filtered and sorted by relevance score (descending)
  // Only includes documents with overallScore >= RELEVANCE_THRESHOLD (default: 3.0)
  byRelevance: {
    analyzeScope: ConfluenceDocument[];    // Sorted by analyze-feature-scope score
    writeStories: ConfluenceDocument[];    // Sorted by write-shell-stories score
    writeNextStory: ConfluenceDocument[];  // Sorted by write-next-story score
  };
  
  // Get relevance details for a specific tool
  getRelevanceForTool(doc: ConfluenceDocument, toolId: string): ToolRelevanceScore | undefined;
}

export async function setupConfluenceContext(params: {
  epicAdf: ADFDocument;
  atlassianClient: AtlassianClient;
  generateText?: LLMClient; // Required for relevance scoring and summarization; if omitted, large docs warn but don't fail
  siteName: string;
}): Promise<ConfluenceContextResult>;
```

**Error handling behavior**:
- Returns empty `documents` array if no Confluence URLs found (not an error)
- Returns empty `documents` array if ALL pages fail to load (logs warnings, doesn't throw)
- Partial success: Returns successfully loaded documents, logs warnings for failures
- Individual page errors (404, 403) are logged but don't stop processing
- Only throws on fatal errors (e.g., invalid atlassianClient, network completely down)
- Callers should check `documents.length` and handle empty context gracefully
- **Missing `generateText`**: Skips relevance scoring and summarization; logs warning for large documents

**Verification**:
- Test with epic containing Confluence links
- Verify cache is created on first run
- Verify cache is reused on second run
- Test with stale cache (should refetch)

---

### Phase 5: Integration with Analyze Feature Scope

#### Step 5.1: Add Confluence Context to Analyze Scope

**File**: `server/providers/combined/tools/analyze-feature-scope/core-logic.ts`

**Tasks**:
- Call `setupConfluenceContext()` early in execution
- Filter documents relevant to scope analysis (`byRelevance.analyzeScope`)
- Add document summaries to AI prompt context:
  ```
  ## Referenced Documentation
  
  ### {document.title}
  Type: {documentType}
  
  {document.summary or full markdown}
  ```
- Update feature analysis prompt to reference documentation
- Add Confluence links to generated feature sections (similar to Figma links)

**Verification**:
- Generate scope analysis with Confluence context
- Verify documentation is referenced in output
- Check that links are included in generated features

---

### Phase 6: Integration with Write Shell Stories

#### Step 6.1: Add Confluence Context to Write Shell Stories

**File**: `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

**Tasks**:
- Call `setupConfluenceContext()` after `setupFigmaScreens()`
- Filter documents relevant to story writing (`byRelevance.writeStories`)
- **Linking strategy**: Prefer linking over content duplication
  - Always include links to referenced documents
  - For documents spanning multiple stories (e.g., API architecture):
    - Link to the document in each relevant story
    - Explicitly call out what's in/out of scope for that specific story
  - For Definition of Done: Only link, don't duplicate content
- Add to shell story generation prompt:
  ```
  ## Referenced Documentation
  
  The following documents provide additional context:
  - [PRD Title](url) - Requirements and user stories
  - [Technical Architecture](url) - API specifications (relevant APIs: X, Y for this story)
  - [Definition of Done](url) - Quality gates and testing requirements
  
  For documents spanning multiple stories, ensure each story explicitly states:
  - What sections/APIs from the document apply to THIS story
  - What sections are out of scope for this story
  ```
- Add "Referenced Documentation" section to generated shell stories
- Link format: `- [Document Title](confluence-url) - Brief purpose and scope`
- **Conflict detection**: If multiple documents have conflicting info, add questions to epic

**Verification**:
- Generate shell stories with Confluence context
- Verify DoD influences acceptance criteria
- Check that documentation links are added

---

### Phase 7: Integration with Write Next Story

#### Step 7.1: Add Confluence Context to Write Next Story

**File**: `server/providers/combined/tools/write-next-story/core-logic.ts`

**Tasks**:
- Reuse `setupConfluenceContext()` from write-shell-stories setup
- Pass relevant documents to story detail generation
- **Apply scoped sections**: For documents spanning multiple stories, only include relevant sections
  - Example: API architecture doc → Story only describes APIs in scope for this story
  - Add "Out of Scope" section listing what from the doc is NOT included
- Add documentation references to created Jira story:
  - In story description: "## Reference Materials" section
  - Include links to relevant Confluence pages
  - For each link, specify: "Relevant sections: X, Y, Z"
  - Add note: "See linked documents for full context and requirements"
- Update dependency validation to check against technical docs
- **Don't duplicate DoD**: Only link to Definition of Done, don't copy content

**Verification**:
- Create story with Confluence context
- Verify story description includes doc references
- Check that technical constraints are considered

---

## Testing Strategy

### Unit Tests

**confluence-helpers.test.ts**:
- URL extraction from various ADF formats
- URL parsing (long form, short links)
- Short link resolution (redirect following)
- Confluence API response parsing
- ADF to markdown conversion (reuses existing `convertAdfToMarkdown()`)

**confluence-cache.test.ts**:
- Cache path generation
- Metadata read/write
- Cache validation logic
- Stale cache detection

**confluence-relevance.test.ts**:
- Tool summary file loading
- Relevance scoring with LLM
- Score aggregation

### Integration Tests

**confluence-setup.test.ts**:
- Full flow: extract URLs → fetch → convert → cache
- Cache reuse on second call
- Cache invalidation on Confluence update
- Multiple documents handling

**End-to-End Tests**:
- Analyze scope with Confluence context
- Write shell stories with PRD and DoD
- Write next story with technical docs
- Verify generated content references documentation

---

## Error Handling

### Common Scenarios

1. **Confluence page not found (404)**
   - Skip page and log warning
   - Continue processing other pages
   - Add note to tool output: "Note: Some linked pages could not be accessed"

2. **Permission denied (403)**
   - Skip page and log warning
   - Suggest checking permissions in error message

3. **Conversion failure**
   - Fall back to plain text extraction
   - Log warning with page ID
   - Continue with plain text version

4. **Summarization failure**
   - Use full markdown content instead
   - Log warning
   - Continue execution

5. **Large documents (>50KB)**
   - Automatically trigger summarization
   - Log size warning
   - Cache both full and summary versions

6. **Conflicting information across documents**
   - **Priority hierarchy**: Epic content > Referenced documents
   - If epic explicitly states something that conflicts with a document, use epic's information
   - If conflict is only between documents (not epic), detect and add questions
   - Add questions to epic description in a "## Confluence Document Questions" section
   - Format: "⚠️ Conflict detected: Doc A says X, but Doc B says Y. Which should we follow?"
   - Continue execution with both documents included
   - Log warning about detected conflicts

---

## Incremental Verification Steps

### Phase 1 Verification
- Extract Confluence URLs from test epic
- Fetch page via API successfully
- Convert ADF body to readable markdown (reusing existing converter)

### Phase 2 Verification
- Cache is created in correct directory
- Metadata includes all required fields
- Cache validation correctly detects stale data

### Phase 3 Verification
- Tool summary files are loaded correctly
- Relevance scores are generated for all three tools
- Decision point scores aggregate correctly to overall score
- PRD documents score high for feature-identification decision points
- Technical docs score high for implementation decision points

### Phase 4 Verification
- `setupConfluenceContext()` returns structured data
- Multiple documents are processed
- Cache is reused on subsequent calls

### Phase 5 Verification
- Scope analysis includes document context
- Generated features reference documentation
- Links are preserved in output

### Phase 6 Verification
- Shell stories reflect DoD requirements
- PRD content influences story structure
- Documentation links are added

### Phase 7 Verification
- Full stories include doc references with scoped sections
- Technical constraints are considered
- Story description has "Reference Materials" section
- DoD is linked but not duplicated
- "Out of Scope" sections are present when relevant

### Phase 8 Verification (Debug Tool)
- `confluence-analyze-page` tool provides useful debugging information
- Can be used independently of combined tools
- Environment flag correctly enables/disables tool

### Phase 9 Verification (Cache Cleanup)
- Cache cleanup runs on 7-day interval (same as Figma)
- Old Confluence page caches are removed correctly

### Phase 10 Verification (REST API)
- Confluence context works in REST API endpoints
- Same behavior as MCP tools
- PAT authentication handles Confluence access correctly

### Phase 11 Verification (Summarization)
- Large documents (>50KB) trigger summarization automatically
- Summary is cached alongside full document
- Subsequent calls reuse cached summary
- Tool prompts use summary when `useSummaryForContext: true`
- Output indicates when summary was used
- Missing LLM client logs warning but doesn't fail

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Platform support | Confluence Cloud only (no Server/Data Center) |
| Content format | ADF via `atlas_doc_format` (reuse existing converter) |
| Cache validation | Timestamp-based using `version.createdAt` |
| Cache retention | 7 days (shared with Figma) |
| Relevance scoring | LLM scores against tool decision points (0-10 scale) |
| Tool summaries | Co-located `tool-summary.md` files describe decision points |
| Linking strategy | Link to docs, don't duplicate content |
| Conflict resolution | Epic content > Referenced documents |
| Page fetching | Direct links only (no child pages) |
| Debug tooling | `confluence-analyze-page` behind env flag |
| Summarization | LLM-based for documents >50KB (configurable threshold) |

---

## Additional Implementation Tasks

### Phase 8: Confluence Analyze Page Tool (Debug Helper)

**File**: `server/providers/atlassian/tools/confluence-analyze-page.ts` (new file)

**Tasks**:
- Create MCP tool `confluence-analyze-page` for manual inspection
- Parameters: `pageUrl` or `pageId`
- Returns:
  - Page metadata (title, space, version, last modified)
  - Markdown conversion preview (first 2000 chars)
  - Document categorization (type, relevance)
  - Detected conflicts with other cached pages
  - Cache status (cached, stale, not cached)
- Optional: Gate behind `ENABLE_CONFLUENCE_DEBUG_TOOLS` environment variable
- **Note**: No AI suggestions for improving page structure (per Q11)

**Verification**:
- Tool provides useful debugging information
- Can be used independently of combined tools
- Environment flag correctly enables/disables tool

---

### Phase 9: Cache Cleanup Integration

**File**: `server/providers/combined/tools/writing-shell-stories/temp-directory-manager.ts` (update existing)

**Tasks**:
- Add `cleanupConfluenceCaches()` function (mirror `cleanupFigmaFileCaches()`)
- Remove Confluence caches older than 7 days (use same `CACHE_MAX_AGE_MS` constant)
- Call from existing `cleanupOldDirectories()` function
- Log cleanup statistics (pages removed, disk space freed)
- **Pattern**: Copy exact structure from `cleanupFigmaFileCaches()`:
  ```typescript
  async function cleanupConfluenceCaches(): Promise<void> {
    const baseCacheDir = getBaseCacheDir();
    if (!baseCacheDir) return;
    
    const confluenceCacheDir = path.join(baseCacheDir, 'confluence-pages');
    
    // Check if confluence-pages directory exists
    try {
      await fs.access(confluenceCacheDir);
    } catch {
      return;
    }
    
    const now = Date.now();
    const entries = await fs.readdir(confluenceCacheDir, { withFileTypes: true });
    let cleanedCount = 0;
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const cachePath = path.join(confluenceCacheDir, entry.name);
      const metadataPath = path.join(cachePath, '.confluence-metadata.json');
      
      try {
        const stats = await fs.stat(metadataPath);
        const age = now - stats.mtimeMs;
        
        if (age > CACHE_MAX_AGE_MS) {
          const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
          console.log(`  🗑️  Cleaning up stale Confluence cache: ${entry.name} (${daysOld} days old)`);
          await fs.rm(cachePath, { recursive: true, force: true });
          cleanedCount++;
        }
      } catch (error: any) {
        // Skip entries that can't be processed
      }
    }
  }
  ```

**Verification**:
- Old Confluence caches are removed after 7 days
- Cleanup runs on same schedule as Figma cleanup (single `cleanupOldDirectories()` call)
- No impact on active/recent caches
- Logs match Figma cleanup format

---

### Phase 10: REST API Integration

**Files**: 
- `server/api/analyze-feature-scope.ts`
- `server/api/write-shell-stories.ts`  
- `server/api/write-next-story.ts`

**Tasks**:
- Add Confluence context support to REST API endpoints
- Use PAT authentication for Confluence API access
- Reuse same `setupConfluenceContext()` helper
- Return Confluence document references in API responses
- Document new behavior in `docs/rest-api.md`

**Verification**:
- REST API calls include Confluence context
- PAT authentication works for Confluence pages
- Responses indicate which documents were used

---

### Phase 11: Document Summarization

#### Step 11.1: Create Summarization Function

**File**: `server/providers/atlassian/confluence-summarization.ts` (new file)

**Tasks**:
- Create `summarizeConfluenceDocument()` function using LLM
- Configurable size threshold via `CONFLUENCE_SUMMARIZE_THRESHOLD` environment variable (default: 50000 bytes / ~50KB)
- Generate concise summary preserving:
  - Key requirements and acceptance criteria
  - Technical constraints and API details
  - Document structure (headings, sections)
  - Links and references
- Target summary length: ~10% of original or max 5000 chars

**Data structures**:
```typescript
export interface DocumentSummary {
  originalLength: number;
  summaryLength: number;
  summary: string;
  keyTopics: string[]; // Main topics covered
  preservedSections: string[]; // Section headings that were kept
}

export async function summarizeConfluenceDocument(
  generateText: LLMClient,
  title: string,
  markdown: string,
  documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown'
): Promise<DocumentSummary>;

export function shouldSummarize(markdownLength: number): boolean;
```

**Prompt template**:
```
You are summarizing a Confluence document for use in software development tools.

## Document
Title: {title}
Type: {documentType}
Length: {originalLength} characters

## Content
{markdown}

## Task
Create a concise summary that preserves:
1. All specific requirements and acceptance criteria
2. Technical constraints, API details, and data models
3. Key decisions and their rationale
4. Dependencies and integration points

Format the summary with clear headings. Include exact values (API endpoints, field names, limits) rather than generalizations.

Target length: ~{targetLength} characters (approximately 10% of original)
```

---

#### Step 11.2: Update Cache Metadata for Summaries

**File**: `server/providers/atlassian/confluence-cache.ts`

**Tasks**:
- Extend `ConfluenceMetadata` to include summary data:
  ```typescript
  export interface ConfluenceMetadata {
    // ... existing fields ...
    
    // Summarization (only present if document was summarized)
    summary?: {
      text: string;
      originalLength: number;
      summaryLength: number;
      keyTopics: string[];
      generatedAt: string; // ISO 8601
    };
  }
  ```
- Store both full markdown and summary in cache
- Cache files:
  - `{pageId}.md` - Full markdown content
  - `{pageId}-summary.md` - Summary (if generated)

---

#### Step 11.3: Integrate Summarization into Setup Flow

**File**: `server/providers/combined/tools/shared/confluence-setup.ts`

**Tasks**:
- After fetching and converting document, check `shouldSummarize()`
- If document exceeds threshold:
  - Generate summary using LLM
  - Store both full and summary in cache
  - Use summary for relevance scoring (faster, cheaper)
- Update `ConfluenceDocument` to include summary:
  ```typescript
  export interface ConfluenceDocument {
    // ... existing fields ...
    summary?: string; // Present if document was summarized
    useSummaryForContext: boolean; // True if summary should be used in prompts
  }
  ```
- Update `setupConfluenceContext()` to use summaries when available

**Behavior**:
- `generateText` parameter becomes required when documents may need summarization
- If `generateText` is not provided and document exceeds threshold:
  - Log warning: "Large document detected but no LLM client provided for summarization"
  - Use full document (may cause token limit issues downstream)
  - Set `useSummaryForContext: false`

---

#### Step 11.4: Update Tool Integrations

**Files**:
- `server/providers/combined/tools/analyze-feature-scope/core-logic.ts`
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- `server/providers/combined/tools/write-next-story/core-logic.ts`

**Tasks**:
- When building prompts, check `useSummaryForContext`:
  - If true: Use `document.summary` in prompt
  - If false: Use `document.markdown` in prompt
- Add note to output when summary was used:
  ```
  Note: Document "{title}" was summarized due to size. See full document for complete details.
  ```

**Verification**:
- Large document (>50KB) triggers summarization
- Summary is cached and reused
- Tools use summary in prompts when available
- Output indicates when summary was used

---

## OAuth Scopes Required

When using OAuth authentication (MCP clients), the following Confluence scopes must be added to the Atlassian app configuration:

```
read:page:confluence        # Read page content
read:space:confluence       # Read space information (for space key resolution)
```

**Note**: These scopes are in addition to the existing Jira scopes. The app's OAuth configuration (`VITE_JIRA_SCOPE`) must be updated to include Confluence permissions.

**PAT Authentication**: Uses the same `X-Atlassian-Token` header as Jira. A single PAT with Confluence read permissions works for both Jira and Confluence APIs.

---

## Environment Variables

New environment variables for Confluence integration:

```bash
# Minimum relevance score (0-10) for a document to be included in tool context
CONFLUENCE_RELEVANCE_THRESHOLD=3.0

# Document size threshold (bytes) for triggering summarization (default: 50KB)
CONFLUENCE_SUMMARIZE_THRESHOLD=50000

# Enable debug tools (optional)
ENABLE_CONFLUENCE_DEBUG_TOOLS=true
```

**Note**: Cache retention uses the existing `CACHE_MAX_AGE_MS` constant (7 days) shared with Figma caching.

---

## Future Improvements

### Generic Cache System Refactor

Figma and Confluence caching share identical patterns - only metadata structure differs. A future refactor could create a shared `ResourceCache<TMetadata>` class in `server/utils/resource-cache.ts` to reduce code duplication. This is deferred since the individual cache implementations are small and the benefit doesn't justify the complexity for MVP.

---

## Summary

All questions (1-15) have been answered and incorporated into the spec. The implementation is ready to begin with:

- Clear architectural patterns (following Figma implementation)
- Detailed phase-by-phase tasks
- Comprehensive data structures
- Verification steps for each phase
- Error handling strategies
- Environment configuration
- Timestamp-based cache validation (confirmed via API research)

No additional questions remain. The spec is complete and actionable.