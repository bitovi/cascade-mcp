# Handling Large Jira Descriptions (32KB Limit)

## Problem Statement

Jira Cloud has a character limit for description fields set by `jira.text.field.character.limit` (default: 32,767 characters). This limit applies to the entire JSON representation of the ADF (Atlassian Document Format) document, not just the visible text.

When tools like `write-shell-stories` add a `## Shell Stories` section to an epic that already has a `## Scope Analysis` section, the combined content can exceed this limit, resulting in a `CONTENT_LIMIT_EXCEEDED` error.

### Current Behavior

1. `analyze-feature-scope` adds a `## Scope Analysis` section to the epic description
2. `write-shell-stories` adds a `## Shell Stories` section to the epic description
3. If the combined size exceeds 32,767 characters, Jira rejects the update with error:
   ```json
   {"errors": {"description": "CONTENT_LIMIT_EXCEEDED"}}
   ```

### Desired Behavior

When adding `## Shell Stories` would exceed the 32KB limit:
1. Move the existing `## Scope Analysis` section to a Jira comment
2. Add the `## Shell Stories` section to the description
3. This preserves both pieces of content while keeping the description within limits

**Rationale**: Shell Stories are actively used by the `write-next-story` tool to create individual Jira stories, so they need to be in the description. Scope Analysis is reference material that can be stored in comments.

## Implementation Plan

### Step 1: Add Size Prediction Function

Create a helper function to predict the final ADF size before attempting the update.

**File**: `server/providers/combined/tools/writing-shell-stories/size-helpers.ts` (new file)

```typescript
import type { ADFDocument, ADFNode } from '../../../atlassian/markdown-converter.js';

/**
 * Calculate the JSON string size of an ADF document
 */
export function calculateAdfSize(adfDoc: ADFDocument): number {
  return JSON.stringify(adfDoc).length;
}

/**
 * Check if adding new content would exceed Jira's 32KB limit
 * Leaves a 2KB safety margin
 */
export function wouldExceedLimit(
  existingContent: ADFNode[],
  newContentAdf: ADFDocument
): boolean {
  const JIRA_LIMIT = 32767;
  const SAFETY_MARGIN = 2000;
  const effectiveLimit = JIRA_LIMIT - SAFETY_MARGIN;
  
  const combinedDoc: ADFDocument = {
    version: 1,
    type: 'doc',
    content: [...existingContent, ...newContentAdf.content]
  };
  
  const totalSize = calculateAdfSize(combinedDoc);
  
  return totalSize > effectiveLimit;
}
```

**Verification**: 
- Create unit tests with known ADF documents
- Verify calculations match `JSON.stringify().length`

### Step 2: Add Section Extraction Function

**Status**: ✅ Already exists in `server/providers/atlassian/markdown-converter.ts`

We already have `removeADFSectionByHeading()` which removes a section and returns the remaining content. We need to create a complementary function that extracts the section (returns both the section AND the remaining content).

**File**: `server/providers/atlassian/markdown-converter.ts`

Add new function:

```typescript
/**
 * Extract a section from ADF content by heading text
 * Returns both the extracted section and the remaining content
 * 
 * @param content - Array of ADF nodes to search
 * @param headingText - Text to search for in headings (case-insensitive)
 * @returns Object with section nodes and remaining content
 */
export function extractADFSection(
  content: ADFNode[],
  headingText: string
): {
  section: ADFNode[];
  remainingContent: ADFNode[];
} {
  // Look for heading node with matching text (reuse logic from removeADFSectionByHeading)
  let sectionStartIndex = -1;
  let sectionLevel = -1;
  
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    
    if (node.type === 'heading') {
      const hasMatchingText = node.content?.some((contentNode: ADFNode) => 
        contentNode.type === 'text' && 
        contentNode.text?.toLowerCase().includes(headingText.toLowerCase())
      );
      
      if (hasMatchingText) {
        sectionStartIndex = i;
        sectionLevel = node.attrs?.level || 2;
        logger.info(`Found "${headingText}" section for extraction`, { 
          index: i, 
          level: sectionLevel 
        });
        break;
      }
    }
  }
  
  // If section not found, return empty section and all content as remaining
  if (sectionStartIndex === -1) {
    logger.info(`Section "${headingText}" not found, returning all as remaining content`);
    return {
      section: [],
      remainingContent: content
    };
  }
  
  // Find where the section ends
  let sectionEndIndex = content.length;
  
  for (let i = sectionStartIndex + 1; i < content.length; i++) {
    const node = content[i];
    
    if (node.type === 'heading') {
      const headingLevel = node.attrs?.level || 2;
      
      if (headingLevel <= sectionLevel) {
        sectionEndIndex = i;
        logger.info(`"${headingText}" section ends at index ${i}`);
        break;
      }
    }
  }
  
  // Extract section and remaining content
  const section = content.slice(sectionStartIndex, sectionEndIndex);
  const remainingContent = [
    ...content.slice(0, sectionStartIndex),
    ...content.slice(sectionEndIndex)
  ];
  
  logger.info(`Extracted "${headingText}" section`, {
    sectionNodes: section.length,
    remainingNodes: remainingContent.length
  });
  
  return {
    section,
    remainingContent
  };
}
```

**Verification**:
- Add unit tests in `markdown-converter.test.ts`
- Test with sample ADF containing multiple sections
- Verify "Scope Analysis" is correctly extracted
- Verify remaining content doesn't include the section
- Compare with `removeADFSectionByHeading()` behavior

### Step 3: ADF-to-Markdown Conversion

**Status**: ✅ Already exists in `server/providers/atlassian/markdown-converter.ts`

We already have a comprehensive `convertAdfToMarkdown()` function that handles:
- Paragraphs, headings, lists (bullet and ordered)
- Code blocks, tables, blockquotes
- Inline formatting (bold, italic, code, links, etc.)
- Mentions, emojis, inline cards

This function takes an `ADFDocument` as input. We can use it by wrapping the extracted section nodes:

```typescript
// Wrap section nodes in a document structure
const sectionDoc: ADFDocument = {
  version: 1,
  type: 'doc',
  content: sectionNodes
};

// Convert to markdown
const markdown = convertAdfToMarkdown(sectionDoc);
```

**No additional work needed** - we'll use the existing function.

**Verification**:
- Test with actual "Scope Analysis" section from epic
- Verify markdown output preserves formatting

### Step 4: Update `writing-shell-stories` Core Logic

Modify `updateEpicWithShellStories` to detect size issues and move Scope Analysis to a comment.

**File**: `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

**Changes**:

1. Add imports at top of file:
```typescript
import { 
  convertMarkdownToAdf, 
  validateAdf,
  extractADFSection,
  convertAdfToMarkdown,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { addIssueComment } from '../../../atlassian/atlassian-helpers.js';
```

2. Import size helper:
```typescript
import { calculateAdfSize, wouldExceedLimit } from './size-helpers.js';
```

3. Modify `updateEpicWithShellStories` function (insert after line 356, right after `validateAdf` check):

```typescript
// After: console.log('    ✅ Shell stories converted to ADF');

// Check if combined size would exceed Jira's limit
const wouldExceed = wouldExceedLimit(contentWithoutShellStories, shellStoriesAdf);

let finalContent = contentWithoutShellStories;

if (wouldExceed) {
  // Extract Scope Analysis section from content
  const { section: scopeAnalysisSection, remainingContent } = extractADFSection(
    contentWithoutShellStories,
    'Scope Analysis'
  );
  
  if (scopeAnalysisSection.length > 0) {
    console.log('  ⚠️ Moving Scope Analysis to comment (content would exceed 32KB limit)');
    await notify('⚠️ Moving Scope Analysis to comment to stay within 32KB limit...');
    
    // Wrap in document structure for conversion
    const scopeAnalysisDoc: ADFDocument = {
      version: 1,
      type: 'doc',
      content: scopeAnalysisSection
    };
    
    // Convert to markdown
    const scopeAnalysisMarkdown = convertAdfToMarkdown(scopeAnalysisDoc);
    
    // Post as comment
    try {
      await addIssueComment(
        atlassianClient,
        cloudId,
        epicKey,
        `**Note**: The Scope Analysis section was moved to this comment due to description size limits (32KB max).\n\n---\n\n${scopeAnalysisMarkdown}`
      );
    } catch (err: any) {
      console.log(`    ⚠️ Failed to post comment: ${err.message}`);
      // Continue anyway - we'll still update the description
    }
    
    // Use remaining content (without Scope Analysis)
    finalContent = remainingContent;
  }
}

// Combine final content with new shell stories section
const updatedDescription: ADFDocument = {
  version: 1,
  type: 'doc',
  content: [
    ...finalContent,
    ...shellStoriesAdf.content
  ]
};

// Rest of update logic remains the same...
```

**Verification**:
- Create test epic with large Scope Analysis section
- Run `write-shell-stories` on it
- Verify comment is created with Scope Analysis
- Verify description contains only remaining content + Shell Stories
- Verify total size is under 32KB

### Step 5: Add Safety Checks and Edge Cases

Handle edge cases:

1. **No Scope Analysis section exists**: No action needed, proceed normally
2. **Comment posting fails**: Log warning and continue with description update (per Q2 answer)
3. **Still too large after moving Scope Analysis**: Throw clear error
4. **Multiple sections exceed limit**: Out of scope for now (future enhancement)

**File**: `server/providers/combined/tools/writing-shell-stories/core-logic.ts`

```typescript
// After moving Scope Analysis, check size again
const finalDoc: ADFDocument = {
  version: 1,
  type: 'doc',
  content: [...finalContent, ...shellStoriesAdf.content]
};

const JIRA_LIMIT = 32767;
const SAFETY_MARGIN = 2000;
const finalSize = calculateAdfSize(finalDoc);

if (finalSize > (JIRA_LIMIT - SAFETY_MARGIN)) {
  throw new Error(`Epic description would be ${finalSize} characters, which exceeds Jira's 32KB limit even after moving Scope Analysis to a comment. Consider splitting into multiple epics.`);
}
```

**Verification**:
- Test with epic that's too large even after moving Scope Analysis
- Verify clear error message guides user to split epic

### Step 6: Update Documentation

**Files to update**:
- `server/readme.md` - Add section about size limits and automatic handling
- Tool JSDoc comments - Document the behavior

**Content**:
```markdown
### Content Size Limits

Jira Cloud has a 32,767 character limit for description fields. When tools add content that would exceed this limit:

1. **Automatic Section Moving**: The `write-shell-stories` tool automatically moves the `## Scope Analysis` section to a comment if needed
2. **Priority**: Shell Stories remain in the description (required by `write-next-story` tool)
3. **Preservation**: Scope Analysis is preserved in a comment with a note explaining the move
```

**Verification**:
- Review documentation for clarity
- Ensure examples match actual behavior

## Summary of Existing vs New Code

### Already Implemented ✅

1. **`removeADFSectionByHeading()`** in `markdown-converter.ts`
   - Removes a section by heading and returns remaining content
   - Has unit tests in `markdown-converter.test.ts`
   - Used by `writing-shell-stories` to remove old Shell Stories before adding new ones

2. **`convertAdfToMarkdown()`** in `markdown-converter.ts`
   - Comprehensive ADF to Markdown conversion
   - Handles all node types (paragraphs, headings, lists, tables, code blocks, etc.)
   - Preserves formatting (bold, italic, links, etc.)
   - Already tested and production-ready

3. **`addIssueComment()`** in `atlassian-helpers.ts`
   - Posts markdown comments to Jira issues
   - Handles ADF conversion automatically
   - Has error handling and logging

### New Code Required 🆕

1. **`extractADFSection()`** in `markdown-converter.ts`
   - Extract section (returns both section AND remaining content)
   - Similar to `removeADFSectionByHeading()` but returns the section too
   - Needs unit tests

2. **`calculateAdfSize()` and `wouldExceedLimit()`** in `size-helpers.ts` (new file)
   - Size calculation and limit checking
   - Needs unit tests

3. **Size checking logic** in `writing-shell-stories/core-logic.ts`
   - Integration of size checking before epic update
   - Conditional logic to move Scope Analysis to comment
   - Enhanced logging

This means we have **less new code to write** than originally planned!

### Unit Tests

Create tests for new helper functions:

**File**: `server/providers/combined/tools/writing-shell-stories/__tests__/size-helpers.test.ts`

```typescript
import { calculateAdfSize, wouldExceedLimit } from '../size-helpers.js';
import type { ADFDocument, ADFNode } from '../../../../providers/atlassian/markdown-converter.js';

describe('size-helpers', () => {
  describe('calculateAdfSize', () => {
    it('should calculate size of simple ADF document', () => {
      const doc: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }]
        }]
      };
      
      const size = calculateAdfSize(doc);
      expect(size).toBe(JSON.stringify(doc).length);
    });
  });
  
  describe('wouldExceedLimit', () => {
    it('should return false for small content', () => {
      const existing: ADFNode[] = [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Small content' }]
      }];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'More content' }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(false);
    });
    
    it('should return true for content near limit', () => {
      // Create large content that would exceed 30KB
      const largeText = 'x'.repeat(15000);
      
      const existing: ADFNode[] = [{
        type: 'paragraph',
        content: [{ type: 'text', text: largeText }]
      }];
      
      const newContent: ADFDocument = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: largeText }]
        }]
      };
      
      expect(wouldExceedLimit(existing, newContent)).toBe(true);
    });
  });
});
```

**File**: `server/providers/atlassian/__tests__/markdown-converter.test.ts` (add to existing tests)

```typescript
describe('extractADFSection', () => {
  it('should extract section by heading', () => {
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Introduction' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Intro text' }]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Scope Analysis' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Scope text' }]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Next Section' }]
      }
    ];
    
    const { section, remainingContent } = extractADFSection(content, 'Scope Analysis');
    
    expect(section).toHaveLength(2); // Heading + paragraph
    expect(section[0].type).toBe('heading');
    expect(remainingContent).toHaveLength(3); // Introduction + intro text + Next Section
  });
  
  it('should handle missing section', () => {
    const content: ADFNode[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Introduction' }]
      }
    ];
    
    const { section, remainingContent } = extractADFSection(content, 'Nonexistent');
    
    expect(section).toHaveLength(0);
    expect(remainingContent).toEqual(content);
  });
});
```

### Integration Tests

Test the full workflow with real Jira API:

1. **Test Setup**:
   - Create test epic with large Scope Analysis
   - Run `write-shell-stories` tool
   
2. **Verify Results**:
   - Epic description contains Shell Stories
   - Epic description does NOT contain Scope Analysis
   - Epic has a comment containing Scope Analysis
   - Description size is under 32KB
   - All content is preserved

3. **Test Edge Cases**:
   - Epic without Scope Analysis section
   - Epic with small Scope Analysis (doesn't need moving)
   - Epic that's too large even after moving Scope Analysis

## Rollout Plan

### Phase 1: Development and Testing
- Implement all helper functions with unit tests
- Update core logic with size checking
- Test with sample epics

### Phase 2: Staging Validation
- Deploy to staging environment
- Run against real epics with various sizes
- Monitor logs for size calculations
- Verify comments are created correctly

### Phase 3: Production Deployment
- Deploy to production
- Monitor first few runs closely
- Check for any unexpected errors
- Verify user experience (comment notifications, content preservation)

### Phase 4: Monitoring
- Add metrics for:
  - How often size limit is hit
  - Average content sizes
  - Success rate of comment posting
- Use data to determine if other optimizations needed

## Questions

1. **Should we add a user notification when Scope Analysis is moved to a comment?**
   - Currently planned: No, just a single console.log with ⚠️ emoji
   - Alternative: Also call `notify()` function to send progress update to client
   - Your preference: ?

   Yes, do a notify()

2. **What if posting the comment fails (network error, permissions, etc.)?**
   - Currently planned: Log warning and continue with description update
   - Alternative: Fail the entire operation and don't update description
   - Your preference: ?

   Log warning and continue with description update.

3. **Should we store the original position of Scope Analysis so it can be restored later?**
   - Currently planned: No, just move to comment
   - Alternative: Add metadata to track it was moved programmatically
   - Your preference: ?

   No. 

4. **What if the epic already has a comment with "Scope Analysis"? Should we update it or create a new one?**
   - Currently planned: Always create new comment
   - Alternative: Search for existing comment and update
   - Your preference: ?

   I'm not sure what you mean.  

   **✅ Clarified**: The description can only have one `## Scope Analysis` section. When we move it to a comment, we're moving the single instance from the description. Each time `write-shell-stories` runs, if the content would exceed limits, it would move the current Scope Analysis section (if present) to a NEW comment. We always create new comments (not searching for/updating existing ones).

5. **Should we implement this same logic for `analyze-feature-scope` tool when it adds Scope Analysis?**
   - Currently planned: No, only in `write-shell-stories`
   - Rationale: `analyze-feature-scope` runs first, unlikely to have size issues
   - Alternative: Implement in both for consistency
   - Your preference: ?

   Analyze-feature-scope shouldn't need this.  However, can you check if it will replace old `## Scope Analysis` sections if they exist.

   **✅ Verified**: Yes, `analyze-feature-scope` properly replaces old Scope Analysis sections. It uses `removeADFSectionByHeading(content, 'Scope Analysis')` via the shared `setupFigmaScreens()` function in `figma-screen-setup.ts` before adding new analysis.

6. **What's the maximum size we should support before suggesting the user split their epic?**
   - Currently planned: If still too large after moving Scope Analysis, throw error
   - Alternative: Move other sections (Features, Questions, etc.)
   - Your preference: ?

   lets not worry about this right now.

   **✅ Decision**: Throw a clear error if still too large after moving Scope Analysis. Error message suggests splitting into multiple epics. Can enhance later if needed.

7. **Should the ADF-to-Markdown conversion be more sophisticated?**
   - Currently planned: Simple conversion (headings, paragraphs, lists)
   - Alternative: Full conversion supporting all ADF node types
   - Trade-off: Complexity vs. accuracy
   - Your preference: ?

   **✅ Already resolved**: We're using the existing `convertAdfToMarkdown()` function which handles all ADF node types comprehensively (paragraphs, headings, lists, tables, code blocks, inline formatting, links, mentions, emojis, etc.). No additional work needed.
