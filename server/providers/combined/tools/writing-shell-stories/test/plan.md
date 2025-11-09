# Test Plan: executeWriteShellStories

## Overview

This document outlines the testing strategy for the `executeWriteShellStories` function, which orchestrates the entire shell story generation workflow.

## Function Under Test

**File**: `server/providers/combined/tools/writing-shell-stories/core-logic.ts`  
**Function**: `executeWriteShellStories(params, deps)`

## Test Architecture

### Test Type
Integration-style unit test that:
- Uses real file system operations (temp directories)
- Mocks all external API calls (Jira, Figma, LLM)
- Tests the full orchestration flow

### Test Structure

```
writing-shell-stories/test/
├── plan.md                           # This file
├── mocks/
│   ├── jira-responses.ts            # Mock Jira API responses
│   ├── figma-responses.ts           # Mock Figma API responses
│   ├── client-factory.ts            # Factory for creating mock clients
│   └── llm-responses.ts             # Mock LLM responses
└── execute-write-shell-stories.test.ts  # Main test file
```

## What Needs to be Mocked

### 1. Jira API Calls (atlassianClient.fetch)

#### GET Accessible Sites
- **URL Pattern**: `https://api.atlassian.com/oauth/token/accessible-resources`
- **Response**: List of Atlassian sites with cloudId and siteName
- **Mock Data**: Single test site with cloudId "test-cloud-id"

#### GET Epic Issue
- **URL Pattern**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue/{epicKey}`
- **Response**: Jira issue with ADF description containing Figma URL
- **Mock Data**: 
  - Epic key: "TEST-123"
  - Description: ADF document with Figma URL embedded
  - Project key: "TEST"

#### PUT Update Epic Description
- **URL Pattern**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue/{epicKey}`
- **Method**: PUT
- **Body**: Updated ADF with shell stories section
- **Response**: 204 No Content

### 2. Figma API Calls (figmaClient.fetch)

#### GET File Node (Page with Frames and Notes)
- **URL Pattern**: `https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId}`
- **Response**: Node tree with frames and sticky notes
- **Mock Data**:
  - File key: "abc123xyz"
  - Node ID: "0:1"
  - 2 FRAME children (Screen 1, Screen 2)
  - 1 STICKY child (Note about feature)

#### GET Frame Images (URLs)
- **URL Pattern**: `https://api.figma.com/v1/images/{fileKey}?ids={frameIds}&format=png&scale=1`
- **Response**: Map of frame IDs to image URLs
- **Mock Data**: URLs like `https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...`

#### GET Image Binary Data
- **URL Pattern**: `https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...`
- **Response**: PNG image data (base64 encoded)
- **Mock Data**: Small 1x1 PNG for each screen

### 3. LLM Calls (generateText)

#### Screen Analysis Calls (with images)
- **Call Count**: 2 (one per screen)
- **Input**: 
  - prompt: Screen analysis prompt with position info
  - image: Base64 PNG data
  - systemPrompt: SCREEN_ANALYSIS_SYSTEM_PROMPT
  - maxTokens: SCREEN_ANALYSIS_MAX_TOKENS
- **Output**: Analysis text distinguishing each screen
  - Screen 1: "Screen 1 analysis: This shows a login form..."
  - Screen 2: "Screen 2 analysis: This shows a dashboard..."

#### Shell Stories Generation Call (text only)
- **Call Count**: 1
- **Input**:
  - prompt: Shell stories prompt with all analyses
  - systemPrompt: SHELL_STORY_SYSTEM_PROMPT
  - maxTokens: SHELL_STORY_MAX_TOKENS
- **Output**: Markdown list of shell stories
  ```markdown
  - `st001` **Login Form** ⟩ User can log in with credentials
    * SCREENS: [Screen 1](figma-url)
    * DEPENDENCIES: none
    * ✅ Email input field
    * ✅ Password input field
    * ❌ Social login options
  
  - `st002` **Dashboard View** ⟩ User sees their dashboard after login
    * SCREENS: [Screen 2](figma-url)
    * DEPENDENCIES: st001
    * ✅ User greeting
    * ✅ Activity summary
  ```

### 4. Progress Notifications (notify)

- **Mock**: Simple no-op function `async () => {}`
- **Purpose**: Required by interface but not tested

## Mock Data Details

### Jira Epic ADF Description

The epic description must be valid ADF containing a Figma URL:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Design Reference" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Figma design: " },
        {
          "type": "text",
          "text": "View Design",
          "marks": [
            {
              "type": "link",
              "attrs": {
                "href": "https://www.figma.com/design/abc123xyz?node-id=0-1"
              }
            }
          ]
        }
      ]
    },
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Requirements" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This epic covers the main user flow." }
      ]
    }
  ]
}
```

### Figma Node Tree

The node tree must include frames (screens) and sticky notes:

```json
{
  "nodes": {
    "0:1": {
      "document": {
        "id": "0:1",
        "name": "Main Page",
        "type": "CANVAS",
        "children": [
          {
            "id": "123:456",
            "name": "Screen 1 - Login",
            "type": "FRAME",
            "visible": true,
            "locked": false,
            "absoluteBoundingBox": {
              "x": 0,
              "y": 0,
              "width": 375,
              "height": 812
            }
          },
          {
            "id": "123:789",
            "name": "Screen 2 - Dashboard",
            "type": "FRAME",
            "visible": true,
            "locked": false,
            "absoluteBoundingBox": {
              "x": 500,
              "y": 0,
              "width": 375,
              "height": 812
            }
          },
          {
            "id": "123:999",
            "name": "Note about authentication",
            "type": "STICKY",
            "visible": true,
            "locked": false,
            "absoluteBoundingBox": {
              "x": 50,
              "y": 900,
              "width": 200,
              "height": 100
            },
            "children": [
              {
                "id": "123:1000",
                "name": "text",
                "type": "TEXT",
                "characters": "Use OAuth 2.0 for authentication. Support Google and GitHub providers."
              }
            ]
          }
        ]
      }
    }
  }
}
```

### Figma Image URLs Response

```json
{
  "images": {
    "123:456": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/mock-screen-1.png",
    "123:789": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/mock-screen-2.png"
  }
}
```

### Mock PNG Image (Base64)

A minimal 1x1 transparent PNG for testing:
```
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
```

## Test Scenarios

### Test 1: Happy Path - Full Workflow

**Description**: Test the complete shell story generation workflow with 2 screens and 1 note.

**Setup**:
1. Mock Jira to return epic with Figma URL
2. Mock Figma to return node tree with 2 frames and 1 note
3. Mock Figma image endpoints to return image URLs and PNG data
4. Mock LLM to return distinct analyses for each screen
5. Mock LLM to return shell stories list

**Assertions**:
1. `result.success` is true
2. `result.storyCount` is 2
3. `result.screensAnalyzed` is 2
4. `result.tempDirPath` exists
5. Temp directory contains:
   - `screens.yaml`
   - `123:456.notes.md` (if note associated with Screen 1)
   - `123:456.png`
   - `123:456.analysis.md`
   - `123:789.png`
   - `123:789.analysis.md`
   - `shell-stories.md`
6. `atlassianClient.fetch` called with PUT to update epic
7. `generateText` called 3 times total (2 screens + 1 shell stories)

**Expected Flow**:
1. ✅ Create temp directory
2. ✅ Fetch epic from Jira
3. ✅ Extract Figma URL from ADF
4. ✅ Fetch Figma node tree
5. ✅ Associate note with nearby screen
6. ✅ Write screens.yaml
7. ✅ Write note files
8. ✅ Download Screen 1 image
9. ✅ Analyze Screen 1 with LLM
10. ✅ Download Screen 2 image
11. ✅ Analyze Screen 2 with LLM
12. ✅ Generate shell stories with LLM
13. ✅ Update epic description with shell stories
14. ✅ Return success result

### Test 2: Epic Without Figma URLs (Error Case)

**Description**: Verify error handling when epic has no Figma URLs.

**Setup**:
1. Mock Jira to return epic with description but no Figma URLs

**Expected Behavior**:
- Function throws error: "Please add Figma design URLs to the epic description"

### Test 3: Figma API Error Handling

**Description**: Verify graceful handling of Figma API errors.

**Setup**:
1. Mock Jira to return valid epic
2. Mock Figma node fetch to return 404

**Expected Behavior**:
- Function throws error with descriptive message about Figma node not found

### Test 4: LLM Generation Errors

**Description**: Verify handling when LLM fails to generate content.

**Setup**:
1. Mock all successful through screen analysis
2. Mock shell stories generation to throw error

**Expected Behavior**:
- Function throws error during Phase 5
- Temp directory still contains analysis files

### Test 5: Epic Update Failure (Non-Critical)

**Description**: Verify workflow continues if epic update fails.

**Setup**:
1. Mock all successful through shell stories generation
2. Mock epic update to return 403 Forbidden

**Expected Behavior**:
- Function completes successfully (update failure is non-critical)
- Console logs warning about update failure
- `result.success` is still true

## Implementation Notes

### Mock Client Factory Pattern

Create a factory that returns mock clients with controlled fetch behavior:

```typescript
function createMockAtlassianClient(fetchMock: jest.Mock): AtlassianClient {
  return {
    fetch: fetchMock,
    getJiraBaseUrl: (cloudId: string) => 
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`
  };
}
```

### Request Matching Strategy

Use URL pattern matching to return appropriate responses:

```typescript
mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
  if (url.includes('/oauth/token/accessible-resources')) {
    return createMockResponse(200, mockSites);
  }
  if (url.includes('/issue/TEST-123')) {
    return createMockResponse(200, mockEpic);
  }
  // ... more patterns
  throw new Error(`Unmocked URL: ${url}`);
});
```

### generateText Call Tracking

Track calls to distinguish screen analysis from shell stories generation:

```typescript
let analysisCallCount = 0;
mockGenerateText.mockImplementation(async (request) => {
  if (request.image) {
    // Screen analysis call
    analysisCallCount++;
    return {
      text: `Screen ${analysisCallCount} analysis: ...`,
      usage: { inputTokens: 1000, outputTokens: 500 }
    };
  } else {
    // Shell stories generation call
    return {
      text: mockShellStoriesMarkdown,
      usage: { inputTokens: 5000, outputTokens: 2000 }
    };
  }
});
```

### Temp Directory Cleanup

Ensure temp directories are cleaned up after each test:

```typescript
afterEach(async () => {
  if (tempDirPath) {
    await fs.rm(tempDirPath, { recursive: true, force: true });
  }
});
```

## File Size Estimates

- `test/mocks/jira-responses.ts`: ~200 lines
- `test/mocks/figma-responses.ts`: ~300 lines
- `test/mocks/client-factory.ts`: ~100 lines
- `test/mocks/llm-responses.ts`: ~100 lines
- `test/execute-write-shell-stories.test.ts`: ~400 lines

**Total**: ~1,100 lines of test code

## Success Criteria

- [x] Test plan documented
- [ ] All mock modules implemented
- [ ] Happy path test passing
- [ ] Error case tests passing
- [ ] 80%+ code coverage of core-logic.ts
- [ ] Tests run in < 5 seconds
- [ ] No external API calls made during tests
- [ ] All temp files cleaned up after tests

## Future Enhancements

1. Add tests for reusing existing temp directories
2. Test concurrent calls with same sessionId/epicKey
3. Test behavior with very large Figma files (many frames)
4. Test behavior with malformed Figma responses
5. Test shell story parsing edge cases
6. Performance tests for image download pipelining
