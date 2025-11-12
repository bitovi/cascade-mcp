# API Error Handling with Jira Comments

## Overview
Improve error handling for the two REST API endpoints (`/api/write-shell-stories` and `/api/write-next-story`) by automatically posting descriptive error comments to the Jira epic when failures occur during processing. This provides visibility into failures directly in Jira where teams are working.

Error commenting can only post comments once we've successfully validated the epic exists and have valid authentication. Errors that occur before this point (missing tokens, malformed requests, epic doesn't exist, authentication failures) will only return HTTP error responses.

## Goals
1. When a recoverable error occurs **after epic validation**, post a detailed comment to the Jira epic explaining what failed and how to fix it
2. For pre-validation errors (epic doesn't exist, invalid tokens, no permissions), return HTTP error responses without attempting to comment
3. Provide actionable error messages that help users resolve issues quickly
4. Ensure comment posting failures don't break the original error response

## Questions

**Q: Should we comment on every error, or only certain types?**
A: Any error that we can comment on.  If the epic doesn't exist, or our atlassian token isn't valid, we won't be able to add a comment.

**Q: What level of detail should we include in comments (stack traces, debug info)?**
A: What the error was and any additional information that might be useful for a user to correct the problem.  Not stack traces.

**Q: Should we include timestamps or unique error IDs in comments for tracking?**
A: No

**Q: Should we rate-limit comment posting to avoid spam if the same error repeats?**
A: No

**Q: Should comments be formatted with markdown/ADF, or plain text?**
A: Comments will be provided as **markdown-formatted strings** and converted to ADF (Atlassian Document Format) before posting. The Jira REST API requires the `body` field to be in ADF format (same as issue descriptions).

We already have `convertMarkdownToAdf()` in `server/providers/atlassian/markdown-converter.ts` that we can reuse.

**Example comment structure:**
```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [
          {
            "type": "text",
            "text": "Error message text here"
          }
        ]
      }
    ]
  }
}
```

**Q: Who should the comment appear to be from (service account name)?**
A: It likely has to appear from the token used to initiate the request.

**Q: How should we track processing context (phase tracking) to know when commenting is possible?**
A: Track context at the handler level only. Store `epicKey`, `cloudId`, and `atlassianClient` after clients are created but before calling `executeXxx()`. This keeps the change localized to the API handlers without modifying core-logic function signatures. 

**Q: How do we detect and classify different error types (Figma API failures vs auth failures vs LLM errors)?**
A: We don't need to classify errors. All errors thrown from `executeWriteShellStories()` and `executeWriteNextStory()` will have their `error.message` posted as markdown comments to Jira (if `commentContext` exists). The only exception is `InvalidTokenError` which indicates auth failure - these should not be commented since auth failure means we can't comment anyway. 

**Q: What happens if cloudId is not provided in request and must be auto-detected inside core-logic? Will it be available for commenting?**
A: The API handler will resolve cloudId before calling `executeXxx()` and always pass it in. This ensures we always have cloudId available for commenting. Use `resolveCloudId()` from `server/providers/atlassian/atlassian-helpers.ts` to resolve siteName → cloudId.

**Q: What should happen if multiple concurrent requests to the same epic both fail? Will duplicate error comments be acceptable?**
A: Yes, each failed request will post its own error comment. This provides per-request visibility and is simpler than implementing deduplication.

**Q: Are there character limits for Jira comments that we need to handle?**
A: No

**Q: Should we retry comment posting if it fails (e.g., rate limits, temporary network issues)?**
A: No

**Q: Should there be a way to disable error commenting via environment variable?**
A: No

**Q: What happens if the epic is deleted between validation and error occurrence (404 on comment post)?**
A: The API response errors, nothing else we can do

---

## Implementation Plan

### Step 1: Create Jira Comment Helper Function
**Goal**: Add a new function to `atlassian-helpers.ts` that can post comments to Jira issues.

**Implementation**:
- Add `addIssueComment()` function to `server/providers/atlassian/atlassian-helpers.ts`
- Function signature: `addIssueComment(client: AtlassianClient, cloudId: string, issueKey: string, markdownText: string): Promise<Response>`
- Internally converts markdown to ADF using existing `convertMarkdownToAdf()` function
- Uses Jira REST API endpoint: `POST /rest/api/3/issue/{issueKey}/comment`
- Use `client.getJiraBaseUrl(cloudId)` to construct full URL (handles OAuth vs PAT differences)
- Request body format:
  ```json
  {
    "body": {
      "type": "doc",
      "version": 1,
      "content": [/* ADF nodes from converted markdown */]
    }
  }
  ```
- Include proper error handling with `handleJiraAuthError()`
- Log comment posting attempts for debugging

**Verification**:
- Write a manual test script (`scripts/test-add-comment.ts` or `server/providers/atlassian/manual-tests/test-add-comment.ts`) that posts a comment to a test issue
- Test with markdown formatting: bold, italic, lists, code blocks, links
- Verify comment appears in Jira with correct formatting
- Test with both OAuth and PAT authentication
- Verify error handling (404 for non-existent issue, 401 for invalid token)

**Reference**: 
- [Jira Cloud REST API - Add comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-post)
- Existing `convertMarkdownToAdf()` in `server/providers/atlassian/markdown-converter.ts`

---

### Step 2: Add Error Context Tracking
**Goal**: Track what context we need so we know whether commenting is possible.

**Implementation**:
- Add context tracking to both API handlers at the handler level
- Store `cloudId`, `epicKey`, and `atlassianClient` once clients are created (needed for commenting)
- Resolve `cloudId` from `siteName` before calling `executeXxx()` to ensure it's always available
- Wrap `executeXxx()` call in try-catch to access context in error handler
- **Implementation pattern**:
  ```typescript
  // In handler, after creating clients:
  let commentContext: { epicKey: string; cloudId: string; client: AtlassianClient } | null = null;
  
  try {
    const atlassianClient = createAtlassianClientFn(atlassianToken);
    // ... other clients
    
    // Resolve cloudId if needed (BEFORE calling execute)
    const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
    
    // Set context AFTER clients created and cloudId resolved (can now comment)
    commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
    
    const result = await executeWriteShellStoriesFn({ epicKey, cloudId: resolvedCloudId, ... }, ...);
    
  } catch (error: any) {
    // Skip commenting for auth errors
    if (error.constructor.name === 'InvalidTokenError') {
      return res.status(401).json({ success: false, error: error.message });
    }
    
    // If commentContext exists, try to post error.message as markdown
    if (commentContext) {
      try {
        await addIssueComment(
          commentContext.client,
          commentContext.cloudId,
          commentContext.epicKey,
          error.message  // Already markdown-formatted!
        );
        logger.info('Posted error comment', { epicKey: commentContext.epicKey });
      } catch (commentError) {
        logger.error('Failed to post error comment', { epicKey: commentContext.epicKey, error: commentError.message });
        // Don't fail the original error response
      }
    }
    
    return res.status(500).json({ success: false, error: error.message });
  }
  ```
- **No changes to core-logic.ts**: This approach keeps all comment-related logic in the API handlers

**Verification**:
- Add logging to track when context is set
- Verify context is available in catch blocks
- Test that commenting works when clients are created
- Test that no commenting attempts occur for `InvalidTokenError`
- Test that cloudId is always resolved before execution

---

### Step 3: Convert Error Messages to Markdown Format
**Goal**: Ensure all errors thrown from `executeWriteShellStories()` and `executeWriteNextStory()` have markdown-formatted messages that work well in Jira comments, MCP tool responses, and API responses.

**Implementation**:
- Review all `throw new Error()` statements in:
  - `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
  - `server/providers/combined/tools/write-next-story/core-logic.ts`
- Convert error messages to markdown format with:
  - Clear headline with emoji (e.g., `🚨 **Operation Failed**`)
  - **What happened:** section with specific details
  - **Possible causes:** bulleted list
  - **How to fix:** numbered steps with links to documentation
  - **Technical details:** relevant debugging info (no sensitive data)

**Examples of markdown error messages**:
```typescript
// Bad - plain text
throw new Error('Failed to fetch Figma file');

// Good - markdown formatted
throw new Error(`
🚨 **Failed to Fetch Figma File**

**What happened:**
Could not retrieve design from ${figmaUrl}

**Possible causes:**
- Figma token may have expired or been revoked
- The file may have been deleted or made private
- Network connectivity issues

**How to fix:**
1. Verify the Figma URL is correct and file still exists
2. Generate a new Figma Personal Access Token: https://help.figma.com/hc/en-us/articles/8085703771159
3. Ensure your Figma account has access to the file
4. Retry the operation

**Technical details:**
- Status: ${response.status} ${response.statusText}
- File URL: ${figmaUrl}
`);
```

**More examples**:
```typescript
// LLM failure
throw new Error(`
🤖 **AI Generation Failed**

**What happened:**
No shell stories content received from AI for epic ${epicKey}

**Possible causes:**
- AI service timeout or rate limit
- Invalid prompt or context
- Network connectivity issues

**How to fix:**
1. Wait a few minutes and retry
2. Check your Anthropic API key is valid
3. Verify the epic description contains valid Figma links

**Technical details:**
- Epic: ${epicKey}
- Response was empty or malformed
`);

// Image download failure
throw new Error(`
📷 **Image Download Failed**

**What happened:**
Could not download Figma design image for analysis

**Possible causes:**
- Figma file permissions changed
- Network timeout
- Image URL expired

**How to fix:**
1. Verify file permissions in Figma
2. Check network connectivity
3. Retry the operation

**Technical details:**
- Image URL: ${imageUrl}
- Error: ${downloadError.message}
`);
```

**Guidelines**:
- Use clear, non-technical language in "What happened" and "How to fix"
- Include direct links to relevant documentation
- Always include specific identifiers (epicKey, URLs, status codes)
- NO sensitive data (tokens, credentials, full stack traces)
- Keep formatting consistent across all errors

**Verification**:
- Review each error in core-logic files
- Test that markdown renders correctly in Jira (via `convertMarkdownToAdf()`)
- Verify errors are helpful when displayed in MCP tool responses
- Verify no sensitive data in error messages
- Test with real scenarios (expired tokens, missing files, API failures)

**Note on Error Message Variables**:
When converting existing error messages to markdown, ensure all variables used in template literals are in scope at the throw site. Use available context like `epicKey`, `status`, `statusText`, etc.

---

### Step 4: Refactor "All Stories Complete" Case
**Goal**: Fix the core-logic to return success instead of throwing when all stories are complete.

**Implementation**:
- Modify `server/providers/combined/tools/write-next-story/core-logic.ts`
- Change the "all stories complete" case from throwing an error to returning a special success result
- Update `ExecuteWriteNextStoryResult` type to support completion status:
  ```typescript
  export interface ExecuteWriteNextStoryResult {
    success: boolean;
    complete?: boolean;  // New field
    message?: string;    // New field for completion message
    issueKey?: string;   // Make optional (not present when complete)
    issueSelf?: string;  // Make optional
    storyTitle?: string; // Make optional
    epicKey: string;
  }
  ```
- When `findNextUnwrittenStory()` returns null, return:
  ```typescript
  return {
    success: true,
    complete: true,
    message: `All stories in epic ${epicKey} have been written! 🎉\n\nTotal stories: ${shellStories.length}`,
    epicKey
  };
  ```
- Update API handler to check for `complete` flag and respond appropriately

**Verification**:
- Test that completion returns success response
- Verify MCP tool handles completion gracefully
- Test that API endpoint returns correct response
- Ensure no error is thrown or commented for completion

---

### Step 5: Update write-shell-stories Handler
**Goal**: Integrate error commenting into the `/api/write-shell-stories` endpoint.

**Implementation**:
- Modify `server/api/write-shell-stories.ts`
- Implement the context tracking pattern from Step 2
- Resolve cloudId before calling `executeWriteShellStories()`
- Post `error.message` as markdown comment for all errors except `InvalidTokenError`
- Add try-catch around comment posting (don't fail the error response if commenting fails)

**Code pattern**:
```typescript
let commentContext: { epicKey: string; cloudId: string; client: AtlassianClient } | null = null;

try {
  // ... token validation
  
  const atlassianClient = createAtlassianClientFn(atlassianToken);
  const figmaClient = createFigmaClientFn(figmaToken);
  const generateText = createAnthropicLLMClientFn(anthropicApiKey);
  
  // Resolve cloudId BEFORE calling execute
  const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
  
  // Set context (can now comment if error occurs)
  commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
  
  const toolDeps = { atlassianClient, figmaClient, generateText, notify: createRestProgressNotifier() };
  
  const result = await executeWriteShellStoriesFn(
    { epicKey, cloudId: resolvedCloudId, siteName, sessionId },
    toolDeps
  );
  
  res.json({ ...result, epicKey });
  
} catch (error: any) {
  console.error('REST API: write-shell-stories failed:', error);
  
  // Handle auth errors (no comment)
  if (error.constructor.name === 'InvalidTokenError') {
    return res.status(401).json({
      success: false,
      error: error.message
    });
  }
  
  // Try to post error comment to Jira
  if (commentContext) {
    try {
      await addIssueComment(
        commentContext.client,
        commentContext.cloudId,
        commentContext.epicKey,
        error.message  // Already markdown-formatted!
      );
      logger.info('Posted error comment', { epicKey: commentContext.epicKey });
    } catch (commentError: any) {
      if (commentError.status === 404) {
        logger.warn('Could not comment - epic may have been deleted', { epicKey: commentContext.epicKey });
      } else {
        logger.error('Failed to post error comment', { epicKey: commentContext.epicKey, error: commentError.message });
      }
      // Don't fail the original error response
    }
  }
  
  // Return error response
  res.status(500).json({
    success: false,
    error: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
}
}
```

**Verification**:
- Test with various error scenarios (invalid Figma token, bad URL, LLM failure)
- Verify comments appear in Jira for processing errors
- Verify no comments for preflight errors (missing tokens, etc.)
- Test that comment posting failures don't break error responses

---

### Step 5: Update write-next-story Handler
**Goal**: Apply same error commenting pattern to `/api/write-next-story` endpoint.

**Implementation**:
- Modify `server/api/write-next-story.ts`
- Apply same error handling pattern as write-shell-stories (from Step 4)
- Resolve cloudId before calling `executeWriteNextStory()`
- Post `error.message` as markdown comment for all errors except `InvalidTokenError`

**Code pattern** (same as Step 4):
```typescript
let commentContext: { epicKey: string; cloudId: string; client: AtlassianClient } | null = null;

try {
  // ... token validation and client creation
  
  const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
  commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
  
  const result = await executeWriteNextStoryFn(
    { epicKey, cloudId: resolvedCloudId, siteName, sessionId },
    toolDeps
  );
  
  res.json({ ...result, epicKey });
  
} catch (error: any) {
  // Handle auth errors (no comment)
  if (error.constructor.name === 'InvalidTokenError') {
    return res.status(401).json({ success: false, error: error.message });
  }
  
  // Try to post error comment
  if (commentContext) {
    try {
      await addIssueComment(
        commentContext.client,
        commentContext.cloudId,
        commentContext.epicKey,
        error.message
      );
      logger.info('Posted error comment', { epicKey: commentContext.epicKey });
    } catch (commentError: any) {
      if (commentError.status === 404) {
        logger.warn('Could not comment - epic may have been deleted', { epicKey: commentContext.epicKey });
      } else {
        logger.error('Failed to post error comment', { epicKey: commentContext.epicKey, error: commentError.message });
      }
    }
  }
  
  // Return error response
  res.status(500).json({ success: false, error: error.message });
}
```

**Verification**:
- Test with various error scenarios specific to story writing
- Verify comments appear correctly
- Test consistency with write-shell-stories error handling

---

### Step 7: Add Logging and Monitoring
**Goal**: Track error rates and comment posting success for observability.

**Implementation**:
- Add structured logging for:
  - Comment posting attempts (success/failure)  
  - cloudId resolution
  - Error types encountered
- Use existing logger from `server/observability/logger.ts`

**Example**:
```typescript
logger.info('Attempting to post error comment', { 
  epicKey: commentContext.epicKey,
  cloudId: commentContext.cloudId,
  errorType: error.constructor.name
});

logger.info('Successfully posted error comment', { epicKey });
// or
logger.error('Failed to post error comment', { epicKey, error: commentError.message });
```

**Verification**:
- Generate test errors and verify logs are captured
- Check log structure is parseable for monitoring
- Verify sensitive data (tokens) is not logged

---

### Step 8: Update Documentation
**Goal**: Document the new error handling behavior.

**Implementation**:
- Update `docs/rest-api.md` with:
  - Description of automatic error commenting
  - Explanation that errors are posted as markdown comments to Jira
  - Note about `InvalidTokenError` not being commented (auth failures)
  - Example of what error comments look like in Jira
- Update `server/readme.md` with architecture notes about error handling flow

**Verification**:
- Review docs with stakeholders
- Verify examples are accurate
- Test that users can understand the error commenting behavior

---

### Step 9: Add Integration Tests
**Goal**: Ensure error handling works end-to-end.

**Implementation**:
- Create test cases in `server/api/` for:
  - Preflight errors (no commentContext, no comment)
  - `InvalidTokenError` (no comment)
  - Processing errors (with comment)
  - Comment posting failures (graceful degradation)
  - cloudId resolution
- Mock Atlassian/Figma APIs to simulate errors
- Verify HTTP responses and comment posting
- **Specific test scenarios**:
  ```typescript
  describe('API Error Handling', () => {
    it('should NOT comment when token is missing (preflight)', ...);
    it('should NOT comment when epic does not exist (404)', ...);
    it('should NOT comment when Atlassian auth fails (401)', ...);
    it('should comment when Figma API fails (processing)', ...);
    it('should comment when LLM returns empty response', ...);
    it('should comment when image download fails', ...);
    it('should handle comment posting failure gracefully', ...);
    it('should handle cloudId resolution for commenting', ...);
    it('should handle epic deleted mid-processing (404 on comment)', ...);
  });
  ```

**Verification**:
- Run test suite and verify all cases pass
- Check code coverage includes error paths
- Test with real APIs in staging environment

---

## Success Criteria
- [ ] `addIssueComment()` helper function added to `atlassian-helpers.ts`
- [ ] All errors in core-logic files converted to markdown format with clear sections
- [ ] Both API handlers resolve cloudId and track comment context
- [ ] Error comments automatically posted to Jira for processing errors
- [ ] `InvalidTokenError` does not trigger commenting (auth failures)
- [ ] Comment posting failures don't break original error responses
- [ ] Error messages work well in Jira comments, MCP responses, and API responses
- [ ] All changes covered by tests
- [ ] Documentation updated