# Comment Progress Updates for REST API

## Spec Review Status
✅ **Ready for Implementation** with minor clarifications noted below

---

## Spec Review Notes

### ✅ Strengths
1. **Clear goal and scope**: Well-defined problem and desired outcome
2. **Thorough Q&A**: All edge cases addressed with specific answers
3. **Step-by-step plan**: Logical progression with verification criteria
4. **Error handling**: Robust fallback strategy (3 failures → console-only mode)
5. **Integration strategy**: Clear coordination with existing error comment system

### ⚠️ Issues Found & Fixed
1. **RESOLVED**: Inconsistency between Q10 answer ("append error") and Step 2 description ("replace with error")
   - **Fix Applied**: Clarified that errors append a final list item + full error details after the list
   - Updated interface comments, format examples, and implementation notes
   
2. **RESOLVED**: Ambiguous error format in Step 2 examples
   - **Fix Applied**: Error format has two parts:
     - Final numbered list item: `N. ❌ **Operation Failed**`
     - Full error details appended after the list (not as list item)

3. **IDENTIFIED**: Breaking change to `addIssueComment()` return type
   - **Fix Applied**: Added note about existing callers that need updates:
     - `server/api/api-error-helpers.ts` (line 75)
     - `scripts/test-add-comment.ts` (multiple calls)

### 📋 Implementation Checklist
- [ ] Step 1: Update `addIssueComment()` return type and add `updateIssueComment()`
  - [ ] Update existing callers in `api-error-helpers.ts`
  - [ ] Update existing callers in `scripts/test-add-comment.ts`
- [ ] Step 2: Create `ProgressCommentManager` class
- [ ] Step 3: Integrate into `write-shell-stories` handler
- [ ] Step 4: Integrate into `write-next-story` handler  
- [ ] Step 5: Add graceful failure handling with 3-failure cutoff
- [ ] Step 6: Add structured logging
- [ ] Step 7: Update documentation
- [ ] Step 8: Add integration tests

### 💡 Technical Recommendations

1. **Comment Update Strategy**:
   - Store `messages: string[]` array for list items in manager state
   - Store `errorDetails: string | null` for full error content (if error occurs)
   - On each `notify()`, append to messages array and rebuild entire comment
   - On `appendError()` (called from catch block), add final list item + append error details after list
   - Comment format: header + numbered list + (optional) separator + error details
   - This ensures consistent formatting and proper error display

2. **Error Message Format**:
   - Error comment has two parts:
     1. Final list item: `N. ❌ **Operation Failed**`
     2. Full error details appended after the list (preserve existing error markdown from `api-error-helpers.ts`)
   - Don't truncate error messages - they go after the list, not in it
   - Users can expand comment in Jira to see full details

3. **Testing Priority**:
   - Focus integration tests on Step 3 & 4 (handler integration)
   - Unit test the manager in isolation (Step 2)
   - Use existing `scripts/test-add-comment.ts` pattern for manual testing

4. **Backward Compatibility**:
   - The old error comment system remains as fallback
   - Existing API consumers see no breaking changes (just better UX)

### 🎯 Definition of Done
All items in "Success Criteria" section must be completed, plus:
- No TypeScript compilation errors
- All existing tests pass
- New integration tests pass
- Manual testing with real Jira epic successful
- Documentation updated and reviewed

---

## Overview
Change the REST API's progress notification behavior from logging to console (no-op) to posting and continuously updating a Jira comment on the epic with progress updates. This provides visibility into long-running operations directly in Jira where teams are working.

## Goals
1. When REST API endpoints (`/api/write-shell-stories`, `/api/write-next-story`) are called, create a progress tracking comment on the epic
2. Continuously update the same comment by appending progress messages as the operation proceeds
3. If an error occurs, replace the comment content with the error message (don't create a new comment)
4. Provide real-time visibility into operation status within Jira

## Current Behavior
- REST API handlers use `createRestProgressNotifier()` which only logs to console
- No visibility into operation progress from Jira UI
- Users must check API response or server logs to see what happened

## Desired Behavior
- Progress comment created on epic when operation starts
- Comment continuously updated with progress messages (appended as list items)
- Final comment shows either success message or error details
- Comment persists in Jira for audit trail

## Questions

**Q: Should the comment be posted immediately when the operation starts, or only when first progress notification is sent?**
A: Comment is created lazily on the first progress notification.

**Q: What should the comment title/header be?**
A: The name of the action and "progress" (example: Write Shell Stories Progress)

**Q: Should we delete the comment on success, or leave it with final success message?**
A: Leave it with final success message.

**Q: How should we format the progress updates (list, timestamps, etc.)?**
A: A simple ordered list of the notification messages.

**Q: Should we include timestamps for each progress message or in the header?**
A: No timestamps at all.

**Q: Should there be a maximum comment size limit to prevent extremely large comments?**
A: No. Don't worry about this.

**Q: What should happen if updating the comment fails (network error, permissions issue)?**
A: Log an error on the server but continue silently. Fall back to console logging transparently to the caller.

**Q: Should the initial comment indicate which API endpoint was called?**
A: The title/header will do that.

**Q: How should we handle concurrent API calls to the same epic (multiple progress comments)?**
A: Ignore that for now.

**Q: When an error occurs, should we update the progress comment or create a separate error comment?**
A: Update the progress comment by appending the error details after the existing progress list. Do NOT create a separate error comment. The handler's catch block calls `progressManager.appendError(error.message)`.

**Q: What happens to the existing error comment system (api-error-helpers.ts)?**
A: When progress commenting is active, skip the separate error comment functionality to avoid duplication.

**Q: How does error handling work with the notify function?**
A: The core logic throws exceptions (as it currently does). The API handler catches these exceptions and calls `progressManager.appendError(error.message)` to update the progress comment with error details. There is NO `notifyError()` function passed to core logic - errors propagate via standard exception throwing.

**⚠️ IMPLEMENTATION NOTE**: Error handling appends a final list item indicating failure, followed by the full error content. The numbered list shows "Operation Failed" and the detailed error message/stack is appended after the list. See corrected format examples in Step 2.

**Visual Example of Error Format**:
```
┌─────────────────────────────────────────────┐
│ 🔄 **Write Shell Stories Progress**        │  ← Header
│                                             │
│ 1. Starting shell story generation...      │  ← Progress list items
│ 2. Fetching epic and Figma metadata...     │
│ 3. ❌ **Operation Failed**                 │  ← Final list item (error indicator)
│                                             │
│ ---                                         │  ← Separator
│                                             │
│ ## ❌ Error Details                        │  ← Full error content starts here
│                                             │
│ **Error**: Failed to fetch Figma file      │     (not part of numbered list)
│                                             │
│ **Troubleshooting**:                        │
│ - Check Figma token permissions             │
│ - Verify file URL                           │
│                                             │
│ **Technical Details**:                      │
│ ```                                         │
│ FigmaApiError: File not found              │
│   at line 123...                            │
│ ```                                         │
└─────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Update Comment Helper Functions
**Goal**: Modify `addIssueComment()` to return comment ID and add `updateIssueComment()` function.

**Implementation**:
- **Modify** `addIssueComment()` in `server/providers/atlassian/atlassian-helpers.ts` to parse response JSON and return `{ commentId: string; response: Response }`
  - **Current callers to update**: `server/api/api-error-helpers.ts` (line 75), `scripts/test-add-comment.ts` (multiple calls)
  - Change return type from `Promise<Response>` to `Promise<CommentResult>`
  - Parse response body to extract comment ID from JSON
- **Add** `updateIssueComment()` function to same file
- Function signature: `updateIssueComment(client: AtlassianClient, cloudId: string, issueKey: string, commentId: string, markdownText: string): Promise<Response>`
- Converts markdown to ADF using existing `convertMarkdownToAdf()` function
- Uses Jira REST API endpoint: `PUT /rest/api/3/issue/{issueKey}/comment/{commentId}`
- Request body format:
  ```json
  {
    "body": {
      "type": "doc",
      "version": 1,
      "content": [/* ADF nodes */]
    }
  }
  ```
- Include proper error handling with `handleJiraAuthError()`
- Log update attempts for debugging

**Return value from addIssueComment**:
```typescript
interface CommentResult {
  commentId: string;
  response: Response;
}
```

**Jira API Response Format** (from POST `/rest/api/3/issue/{issueIdOrKey}/comment`):
```json
{
  "id": "10000",
  "self": "https://your-domain.atlassian.net/rest/api/3/issue/10010/comment/10000",
  "author": {
    "accountId": "5b10a2844c20165700ede21g",
    "displayName": "Mia Krystof",
    "self": "https://your-domain.atlassian.net/rest/api/3/user?accountId=5b10a2844c20165700ede21g"
  },
  "body": { ... ADF content ... },
  "created": "2021-01-17T12:34:00.000+0000",
  "updated": "2021-01-18T23:45:00.000+0000"
}
```

**Extraction logic**:
```typescript
const responseJson = await response.json();
const commentId = responseJson.id; // String like "10000"
```

**Verification**:
- Update existing `scripts/test-add-comment.ts` to verify comment ID is returned
- Test creating a comment and extracting its ID
- Test updating the same comment with new markdown content
- Verify updated comment appears correctly in Jira
- Test with both OAuth and PAT authentication
- Verify error handling (404 for non-existent comment/issue, 401 for invalid token)

**Reference**: 
- [Jira Cloud REST API - Add comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-post)
- [Jira Cloud REST API - Update comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-id-put)

---

### Step 2: Create Progress Comment Manager
**Goal**: Build a stateful progress comment manager that handles creating, updating, and error handling for progress comments.

**Implementation**:
- Create new file: `server/api/progress-comment-manager.ts`
- Export `ProgressCommentManager` class or factory function
- Key functionality:
  - **Initialize**: Create initial comment on first progress notification (lazy)
  - **Append progress**: Add new messages to comment as numbered list items
  - **Append errors**: Add final list item indicating failure, then append full error details after the list
  - **State tracking**: Store commentId, accumulated messages, client context
  
**Interface design**:
```typescript
export interface ProgressCommentContext {
  epicKey: string;
  cloudId: string;
  client: AtlassianClient;
  operationName: string; // e.g., "Write Shell Stories"
}

export interface ProgressCommentManager {
  // Notify progress - creates comment on first call, updates thereafter
  // Progress and success messages are appended as numbered list items
  notify(message: string): Promise<void>;
  
  // Internal method to append error details to comment (called from catch block)
  // Adds final list item + full error details after list
  appendError(errorMarkdown: string): Promise<void>;
  
  // Get the notify function to pass to core logic
  getNotifyFunction(): (message: string) => Promise<void>;
}

export function createProgressCommentManager(
  context: ProgressCommentContext
): ProgressCommentManager;
```

**Internal state**:
- `commentId: string | null` - Set after first comment created (lazy initialization)
- `messages: string[]` - Accumulated progress messages (numbered list items only)
- `errorDetails: string | null` - Full error content to append after list (if error occurs)
- `commentContext: ProgressCommentContext` - Client and epic info
- `isCommentingDisabled: boolean` - Set to true after multiple failures (fallback to console)

**Comment format** (no timestamps):
```markdown
🔄 **Write Shell Stories Progress**

1. Starting shell story generation for epic PROJ-123...
2. Phase 1-3: Fetching epic and Figma metadata...
3. Phase 4: Starting analysis of 8 screens...
4. Analyzing screen: Login (1/8)
```

**Error format** (appends to progress list as new item):
```markdown
🔄 **Write Shell Stories Progress**

1. Starting shell story generation for epic PROJ-123...
2. Phase 1-3: Fetching epic and Figma metadata...
3. ❌ **Operation Failed**

---

## ❌ Error Details

**Error**: Failed to fetch Figma file

**Troubleshooting**:
- Verify the Figma file URL is correct
- Check that the Figma token has read access
- Ensure the file hasn't been deleted

**Technical Details**:
```
FigmaApiError: File not found (404)
  at FigmaClient.fetch (figma-client.ts:123)
  at executeWriteShellStories (write-shell-stories.ts:456)
```


**Success format** (appends completion as new item):
```markdown
🔄 **Write Shell Stories Progress**

1. Starting shell story generation for epic PROJ-123...
2. Phase 1-3: Fetching epic and Figma metadata...
3. Phase 4: Starting analysis of 8 screens...
4. Analyzing screen: Login (1/8)
5. Analyzing screen: Dashboard (2/8)
...
12. ✅ Successfully generated 12 shell stories
```

**Verification**:
- Unit tests for `ProgressCommentManager`
- Test comment creation on first notify (lazy initialization)
- Test appending multiple progress messages as numbered list items
- Test error handling via `appendError()`:
  - Adds final list item: `N. ❌ **Operation Failed**`
  - Appends full error details after the list
  - Preserves existing error markdown format from `api-error-helpers.ts`
- Test success completion appending (adds new list item)
- Test fallback to console logging on comment failures
- Mock `addIssueComment` and `updateIssueComment` calls
- Verify commenting disabled after multiple failures

**Implementation notes**:
- The `notify()` method handles regular progress and success messages (list items)
- The `appendError()` method handles errors with two-part format (called from catch block):
  1. Adds `N. ❌ **Operation Failed**` to the numbered list
  2. Appends `---\n\n` separator and full error content after the list
- **Error flow**: Core logic throws → handler catches → handler calls `appendError()` → handler sends error response
- Error content uses the same markdown formatting as `api-error-helpers.ts` error comments
- If comment creation/update fails, fall back to console.log() transparently
- After 3 consecutive failures, disable commenting and only use console.log()

---

### Step 3: Integrate Progress Manager into write-shell-stories Handler
**Goal**: Replace console-logging notifier with progress comment manager and coordinate with existing error handling.

**Implementation**:
- Modify `server/api/write-shell-stories.ts`
- Create progress manager after `commentContext` is ready (clients created, cloudId resolved)
- Pass manager's notify function to core logic in `toolDeps`
- **Modify error handling**: When progress manager exists, use it for error notification and skip separate error comment
- Call `notify()` with success message on completion

**Code pattern**:
```typescript
// After resolving cloudId and setting commentContext
let progressManager: ProgressCommentManager | null = null;

try {
  // Set comment context
  commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
  
  // Create progress comment manager
  progressManager = createProgressCommentManager({
    ...commentContext,
    operationName: 'Write Shell Stories'  // Display name
  });
  
  // Prepare dependencies with progress comment notifier
  const toolDeps = {
    atlassianClient,
    figmaClient,
    generateText,
    notify: progressManager.getNotifyFunction()
  };
  
  const result = await executeWriteShellStoriesFn({ ... }, toolDeps);
  
  // Notify success
  await progressManager.notify(`✅ Successfully generated ${result.storyCount} shell stories`);
  
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
  
  // If progress manager exists, append error to progress comment
  // This replaces the separate error comment functionality
  if (progressManager) {
    // error.message already contains markdown-formatted error from core logic
    await progressManager.appendError(error.message);
  } else if (commentContext) {
    // Fallback: If manager wasn't created yet, use old error comment system
    await tryPostErrorComment(error, commentContext);
  }
  
  // Return error response
  res.status(500).json({
    success: false,
    error: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
}
```

**Key changes**:
- Progress manager appends errors via `appendError()` method (called from catch block)
- Error format: Final list item + separator + full error details after list
- No separate error comment when progress manager is active
- Falls back to old system only if progress manager wasn't created
- Error content preserves the existing markdown format from `api-error-helpers.ts`
- **Important**: Core logic throws exceptions → handler catches → handler calls `appendError()` with error message

**Verification**:
- Manual test with real Jira epic
- Verify comment created when first progress notification is sent
- Check progress updates appear as numbered list with sequential numbering
- Test error handling flow (throw → catch → `appendError()`):
  - Test error handling via `appendError()` (called from catch block):
  - Verify final list item shows "❌ **Operation Failed**"
  - Verify full error content appears after the list (after separator)
  - Verify no separate error comment is created
- Verify success completion message appends as new list item
- Test that auth errors (InvalidTokenError) don't attempt commenting
- Verify only ONE comment per operation (progress comment only, no separate error comment)

---

### Step 4: Integrate Progress Manager into write-next-story Handler
**Goal**: Apply same pattern to `/api/write-next-story` endpoint.

**Implementation**:
- Modify `server/api/write-next-story.ts`
- Apply identical pattern as write-shell-stories (from Step 3)
- Create progress manager with `operationName: 'Write Next Story'`
- Wire up notify function to core logic
- Handle errors via `appendError()` method in catch block (appends to progress comment)
- Append success/completion message via `notify()` method

**Code pattern**: Same as Step 3, with operation name change

**Verification**:
- Manual test with real Jira epic
- Verify progress comment behavior matches write-shell-stories
- Test all error scenarios
- Test completion scenarios (story created, all complete)
- Verify only ONE comment per operation (no separate error comments)

---

### Step 5: Handle Comment Failures Gracefully
**Goal**: Ensure progress comment failures don't break the operation or error response.

**Implementation**:
- Wrap all `addIssueComment()` and `updateIssueComment()` calls in try-catch inside manager implementation
- Log comment posting failures but don't throw
- If comment creation fails on first notify, fall back to console logging (transparent to caller)
- Track consecutive failures and stop attempting if it keeps failing

**Implementation details**:
- Add internal `_consecutiveFailures` counter to ProgressCommentManager
- Add internal `_isCommentingDisabled` flag
- After 3 consecutive failures, set `_isCommentingDisabled = true`
- When disabled, `notify()` just calls `console.log()` instead of posting to Jira
- Log warning when switching to fallback mode
- Reset failure counter on successful comment operation

**Fallback behavior**:
```typescript
async notify(message: string): Promise<void> {
  // Always log to console as backup
  console.log(`[Progress] ${message}`);
  
  // If commenting is disabled, return early
  if (this._isCommentingDisabled) {
    return;
  }
  
  try {
    // Try to create/update comment
    // ... comment logic ...
    
    // Success - reset failure counter
    this._consecutiveFailures = 0;
  } catch (error) {
    this._consecutiveFailures++;
    logger.error('Failed to post progress comment', { error, failureCount: this._consecutiveFailures });
    
    if (this._consecutiveFailures >= 3) {
      this._isCommentingDisabled = true;
      logger.warn('Progress commenting disabled after consecutive failures', { 
        epicKey: this.context.epicKey 
      });
    }
    // Don't throw - continue operation
  }
}
```

**Verification**:
- Test with invalid cloudId (should fall back gracefully after 3 attempts)
- Test with expired token (should catch and log, not crash)
- Test with 404 epic (should fall back gracefully after 3 attempts)
- Verify operation completes successfully even if commenting fails
- Verify error responses still work when commenting fails
- Verify console.log() is always called (backup for monitoring)

---

### Step 6: Add Logging and Observability
**Goal**: Track progress comment behavior for debugging and monitoring.

**Implementation**:
- Add structured logging to `ProgressCommentManager`:
  - Comment creation attempts and results
  - Update attempts and results
  - Fallback to console-only mode
  - Comment operation timings
- Use existing logger from `server/observability/logger.ts`

**Log examples**:
```typescript
logger.info('Creating progress comment', { epicKey, operationName });
logger.info('Progress comment created', { epicKey, commentId, duration });
logger.info('Updated progress comment', { epicKey, commentId, messageCount, duration });
logger.warn('Progress commenting disabled after failures', { epicKey, failureCount });
logger.error('Failed to update progress comment', { epicKey, commentId, error });
```

**Verification**:
- Generate test errors and verify logs captured
- Check log structure is parseable for monitoring
- Verify no sensitive data (tokens) in logs

---

### Step 7: Update Documentation
**Goal**: Document the new progress commenting behavior for API users.

**Implementation**:
- Update `docs/rest-api.md` to describe progress commenting:
  - How progress is tracked via Jira comments
  - Comment format and structure
  - What happens on errors vs success
  - Note that comments persist for audit trail
- Update `server/readme.md` with architecture notes about progress comment manager

**Content to add**:
```markdown
### Progress Tracking

When using the REST API endpoints, progress is tracked via Jira comments on the epic:

1. A progress comment is created on the epic when the operation starts
2. The comment is updated in real-time as the operation proceeds
3. On success, the comment shows the final success message
4. On error, the comment is replaced with error details
5. Comments persist in Jira for audit trail and debugging

**Comment format:**
- Initial comment includes operation name and start time
- Progress messages listed with checkmarks
- Errors shown with clear formatting and troubleshooting steps
```

**Verification**:
- Review docs with stakeholders
- Verify examples are accurate
- Test that users can understand the behavior

---

### Step 8: Add Integration Tests
**Goal**: Ensure progress commenting works end-to-end with API endpoints.

**Implementation**:
- Add tests to `server/api/` directory
- Test scenarios:
  - Successful operation creates and updates comment
  - Error operation creates comment, then appends final list item + error details after list
  - Auth errors don't attempt commenting
  - Comment failures don't break operation
  - Multiple progress messages accumulated correctly
  
**Test structure**:
```typescript
describe('Progress Comment Integration', () => {
  it('should create progress comment on first notify', async () => { ... });
  it('should append progress messages to comment', async () => { ... });
  it('should append error with two-part format (list item + details)', async () => { ... });
  it('should complete with success message', async () => { ... });
  it('should handle comment creation failures gracefully', async () => { ... });
  it('should not comment for auth errors', async () => { ... });
});
```

**Verification**:
- Run test suite and verify all cases pass
- Check code coverage includes progress comment paths
- Mock Jira API calls to avoid real API usage in tests

---

## Success Criteria
- [ ] `updateIssueComment()` helper function added to `atlassian-helpers.ts`
- [ ] `ProgressCommentManager` created and tested in `server/api/progress-comment-manager.ts`
- [ ] Both API handlers use progress comment manager instead of console logging
- [ ] Progress comments appear in Jira in real-time during operations
- [ ] Errors append final list item + full error details after list (two-part format)
- [ ] Success operations show final completion message
- [ ] Comment failures handled gracefully (operation continues, logs warning)
- [ ] Auth errors don't attempt commenting
- [ ] Documentation updated with progress commenting behavior
- [ ] Integration tests cover progress commenting scenarios
- [ ] All existing tests still pass