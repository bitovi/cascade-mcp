l context description for AI */
  contextDescription?: string;
}
```

### Tool Output

```typescript
/**
 * Output from analyze-figma-scope tool
 */
export interface AnalyzeFigmaScopeOutput {
  /** Markdown scope analysis */
  analysis: string;
  
  /** All generated questions */
  questions: GeneratedQuestion[];
  
  /** Posting results (if posting was attempted) */
  postingResults?: PostCommentResult[];
  
  /** Human-readable posting summary */
  postingSummary?: string;
  
  /** Non-fatal errors encountered */
  errors?: string[];
}

/**
 * A question generated during analysis
 */
export interface GeneratedQuestion {
  /** Question text */
  text: string;
  
  /** Target frame node ID (if frame-specific) */
  frameNodeId?: string;
  
  /** Target frame name */
  frameName?: string;
  
  /** Question category */
  category?: 'interaction' | 'state' | 'edge-case' | 'accessibility' | 'general';
}
```

## Error Types

```typescript
/**
 * Figma API error
 */
export class FigmaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public fileKey?: string
  );
}

/**
 * Rate limit exceeded after retries
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number,
    public partialResults?: PostCommentResult[]
  );
}

/**
 * Missing required OAuth scope
 */
export class MissingScopeError extends Error {
  constructor(
    public requiredScope: string,
    public message: string
  );
}
```

## Sequence Diagram: Full Workflow

```mermaid
sequenceDiagram
    participant User
    participant MCP as MCP Tool / REST API
    participant Core as Core Logic
    participant Utils as Comment Utils
    participant Client as FigmaClient
    participant Figma as Figma API
    participant LLM as LLM Provider

    User->>MCP: analyze-figma-scope(urls)
    MCP->>Core: executeAnalyzeFigmaScope(input, deps)
    
    Core->>Core: parseFigmaUrls(urls)
    
    loop For each file
        Core->>Utils: fetchCommentsForFile(fileKey)
        Utils->>Client: getComments(fileKey)
        Client->>Figma: GET /v1/files/:key/comments
        Figma-->>Client: comments[]
        Client-->>Utils: comments[]
        Utils->>Utils: groupCommentsIntoThreads()
        Utils-->>Core: CommentThread[]
        
        Core->>Utils: associateCommentsWithFrames(threads, frames)
        Utils-->>Core: ScreenComments
        
        Core->>Utils: formatCommentsForContext(screenComments)
        Utils-->>Core: markdownContext
    end
    
    Core->>LLM: analyze(screens + commentContext)
    LLM-->>Core: analysis + questions[]
    
    Core->>Utils: postQuestionsToFigma(questions, fileKey)
    loop For each question (rate limited)
        Utils->>Client: postComment(fileKey, request)
        Client->>Figma: POST /v1/files/:key/comments
        Figma-->>Client: comment
    end
    Utils-->>Core: PostCommentResult[]
    
    Core-->>MCP: AnalyzeFigmaScopeOutput
    MCP-->>User: analysis + questions + results
```

## Rate Limit Handling Flow

```mermaid
flowchart TD
    Start[questions array] --> Count{Count questions}
    
    Count -->|≤25| Individual[Post individually]
    Count -->|>25| Consolidate[Consolidate per frame]
    
    Individual --> PostLoop[Post each question]
    Consolidate --> ConsolidateLoop[Group by frame]
    ConsolidateLoop --> CountConsolidated{Count consolidated}
    
    CountConsolidated -->|≤25| PostConsolidated[Post consolidated]
    CountConsolidated -->|>25| FailWithQuestions[Return error + all questions]
    
    PostLoop --> CheckRate{Rate limited?}
    PostConsolidated --> CheckRate
    
    CheckRate -->|No| Success[Continue posting]
    CheckRate -->|Yes, retries left| Retry[Wait Retry-After, retry]
    CheckRate -->|Yes, no retries| PartialResult[Return partial + remaining questions]
    
    Retry --> PostLoop
    Success --> Done[All posted]
    
    Done --> Return[Return results]
    PartialResult --> Return
    FailWithQuestions --> Return
```
