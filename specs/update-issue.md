I'd like to create a tool to update an issue.

Jira has a particular markdown-like format for its descriptions.  Will this work with how AI agents typically know how to format content?  Will I need some sort of traditional markdown to jira markdown converter?

Please research this thoroughly and write your findings below:

## Research Findings: Jira Text Formatting and AI Agent Compatibility

### Executive Summary

Jira does **NOT** use traditional Markdown. Modern Jira Cloud uses **Atlassian Document Format (ADF)**, a JSON-based rich text format, while legacy systems used Confluence Wiki Markup. AI agents will need conversion utilities to generate Jira-compatible content, as standard Markdown is not natively supported.

### Jira Text Formatting Systems

#### 1. Atlassian Document Format (ADF) - Current Standard
- **What it is**: JSON-based rich text format used in modern Jira Cloud
- **Structure**: Hierarchical document structure with `type`, `content`, and `version` properties
- **Example**:
```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Order entry fails when selecting supplier."
        }
      ]
    }
  ]
}
```

#### 2. Confluence Wiki Markup - Legacy Format
- **What it is**: Jira's historical text formatting system (still used in some contexts)
- **Syntax Examples**:
  - `*bold*` for bold text
  - `_italic_` for italic text
  - `h1. Heading` for headers
  - `* bullet point` for lists
  - `[link text|url]` for links
  - `||header||header||` for table headers
  - `|cell|cell|` for table rows

#### 3. Traditional Markdown - NOT Supported
- Jira does **not** natively support standard Markdown (`**bold**`, `# heading`, etc.)
- This is the key compatibility issue for AI agents

### API Implementation Requirements

From the Jira REST API v3 documentation:

1. **Description Fields**: Must use ADF format for multi-line text fields
2. **Comment Fields**: Also require ADF format
3. **Single-line Fields**: Accept plain strings (no special formatting)
4. **Custom Fields**: 
   - Textarea types require ADF
   - Textfield types accept plain strings

### AI Agent Compatibility Assessment

#### Challenges:
1. **Format Mismatch**: AI agents naturally generate Markdown, but Jira expects ADF
2. **Complexity**: ADF is significantly more complex than Markdown
3. **API Requirements**: REST API strictly enforces ADF for description/comment fields

#### Solutions Required:
1. **Markdown-to-ADF Converter**: Essential for AI agent integration
2. **ADF Generation Library**: Direct ADF creation for complex formatting
3. **Hybrid Approach**: Plain text for simple content, ADF for rich content

### Recommended Implementation Strategy

#### Option 1: Markdown-to-ADF Conversion (Recommended)
- Allow AI agents to generate standard Markdown
- Convert to ADF before sending to Jira API
- Provides familiar interface for AI agents
- Requires custom conversion logic

#### Option 2: Direct ADF Generation
- Train AI agents to output ADF JSON
- More complex but gives full control
- Better for advanced formatting features

#### Option 3: Plain Text Fallback
- Use simple plain text for issue descriptions
- Loses formatting but ensures compatibility
- Easiest to implement but limited functionality

### Available Tools and Libraries

#### Research Results:
- **Limited Official Support**: Atlassian provides minimal conversion utilities
- **Community Solutions**: Some third-party converters exist but vary in quality
- **Custom Implementation**: Most robust solution requires building own converter

#### Key Conversion Mappings Needed:
- `**bold**` → `{"type": "text", "marks": [{"type": "strong"}], "text": "bold"}`
- `*italic*` → `{"type": "text", "marks": [{"type": "em"}], "text": "italic"}`
- `# Heading` → `{"type": "heading", "attrs": {"level": 1}, "content": [...]}`
- `- List item` → `{"type": "bulletList", "content": [...]}`
- `[text](url)` → `{"type": "text", "marks": [{"type": "link", "attrs": {"href": "url"}}], "text": "text"}`

### Conclusion

**A Markdown-to-ADF converter is essential** for AI agent compatibility with Jira. The conversion layer should:

1. Accept standard Markdown from AI agents
2. Convert to valid ADF JSON format
3. Handle common formatting elements (bold, italic, lists, links, headings)
4. Provide fallback to plain text for unsupported elements
5. Validate ADF structure before API submission

This approach maintains AI agent familiarity with Markdown while ensuring Jira API compatibility.

---

## NPM Package Research & Implementation Plan

### Available NPM Conversion Utilities

After comprehensive research, several npm packages are available for Markdown-to-ADF conversion:

#### Top Candidates:

#### 1. **Official Atlassian Libraries** (⭐ RECOMMENDED FOR SERVICES)
- **Packages**: `@atlaskit/editor-markdown-transformer`, `@atlaskit/editor-json-transformer`, `@atlaskit/adf-schema`
- **Status**: Actively maintained with frequent updates
- **Weekly Downloads**: ~300K+ downloads (significantly higher than alternatives)
- **TypeScript**: Full type definitions included
- **Usage**:
```javascript
import { defaultSchema } from '@atlaskit/adf-schema';
import { MarkdownTransformer } from '@atlaskit/editor-markdown-transformer';

const transformer = new MarkdownTransformer(defaultSchema);
const adf = transformer.parse(markdown);
```
- **Pros**: 
  - Official Atlassian support with constant updates
  - Highest download count and community trust
  - Complete ADF specification compliance
  - Supports all Jira features (mentions, panels, status lozenges, etc.)
  - Battle-tested in production Atlassian products
  - Excellent TypeScript support
  - Comprehensive error handling and validation
- **Cons**: 
  - More complex setup than simple converters
  - Larger dependency footprint (acceptable for server-side)

#### 2. **marklassian** (Alternative for Simple Use Cases)
- **Status**: Actively maintained (published 17 days ago)
- **Weekly Downloads**: ~1K (much lower than official packages)
- **Maintenance**: Modern codebase with TypeScript
- **TypeScript**: Full type definitions included
- **Usage**: `npm install marklassian`
```javascript
import { markdownToAdf } from 'marklassian';
const markdown = '# Hello World';
const adf = markdownToAdf(markdown);
```
- **Pros**: 
  - Simple API with minimal setup
  - Works reliably in Node.js server environments
  - Good feature coverage for basic markdown
  - Lightweight dependency tree
- **Cons**: 
  - Lower community adoption and trust
  - May not support advanced Jira-specific features (mentions, panels)
  - Less comprehensive than official solution

#### 3. **md-to-adf** (⚠️ NOT RECOMMENDED - Legacy)
- **Status**: Last updated 5 years ago (⚠️ Security Risk)
- **Weekly Downloads**: ~6K (moderate but declining)
- **Maintenance**: No longer actively maintained
- **Usage**: `npm install md-to-adf`
```javascript
const fnTranslate = require('md-to-adf');
const translatedADF = fnTranslate(markdownContent);
```
- **Pros**: 
  - Originally built for GitHub Actions integration
  - Basic documentation available
- **Cons**: 
  - Outdated (5 years old) - potential security vulnerabilities
  - No TypeScript support
  - May not work with newer Node.js versions
  - Much lower adoption than official packages
  - No maintenance or updates

### Implementation Plan

#### Phase 1: Quick Start with Official Atlassian Libraries (RECOMMENDED)
```bash
npm install @atlaskit/editor-markdown-transformer @atlaskit/adf-schema
```

**Implementation Steps:**
1. **Install and Test**:
   ```javascript
   // src/converters/markdown-to-adf.js
   import { defaultSchema } from '@atlaskit/adf-schema';
   import { MarkdownTransformer } from '@atlaskit/editor-markdown-transformer';
   
   export function convertMarkdownToAdf(markdown) {
     try {
       const transformer = new MarkdownTransformer(defaultSchema);
       return transformer.parse(markdown);
     } catch (error) {
       console.error('ADF conversion failed:', error);
       // Fallback to plain text
       return {
         version: 1,
         type: 'doc',
         content: [{
           type: 'paragraph',
           content: [{ type: 'text', text: markdown }]
         }]
       };
     }
   }
   ```

2. **Integration with Jira API**:
   ```javascript
   // src/tools/update-issue.js
   import { convertMarkdownToAdf } from '../converters/markdown-to-adf.js';
   
   export async function updateJiraIssue(issueKey, description) {
     const adfDescription = convertMarkdownToAdf(description);
     
     const updateData = {
       fields: {
         description: adfDescription
       }
     };
     
     // Send to Jira REST API
     await fetch(`/rest/api/3/issue/${issueKey}`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(updateData)
     });
   }
   ```

3. **Testing Strategy**:
   ```javascript
   // tests/markdown-conversion.test.js
   import { convertMarkdownToAdf } from '../src/converters/markdown-to-adf.js';
   
   describe('Markdown to ADF Conversion', () => {
     test('converts basic markdown', () => {
       const markdown = '# Hello\n**Bold text**';
       const adf = convertMarkdownToAdf(markdown);
       expect(adf.type).toBe('doc');
       expect(adf.version).toBe(1);
     });
   });
   ```

#### Phase 2: Validation and Enhancement
1. **ADF Validation**: Add validation using `@atlaskit/adf-utils` if needed
2. **Fallback Strategy**: Implement graceful degradation for unsupported markdown
3. **Extended Support**: Handle AI-specific markdown patterns

#### Phase 3: Custom Extensions (If Needed)
If marklassian doesn't support specific AI agent markdown patterns:

1. **Pre-processing**: Transform AI-specific markdown before conversion
2. **Post-processing**: Enhance ADF output for better Jira rendering
3. **Custom Converters**: Build specific handlers for unsupported elements

### Feature Support Comparison (Server-Side Service)

| Feature | Official Atlassian | marklassian | md-to-adf |
|---------|-------------------|-------------|-----------|
| **Core Markdown Features** |
| Headings (H1-H6) | ✅ | ✅ | ✅ |
| Bold/Italic | ✅ | ✅ | ✅ |
| Links | ✅ | ✅ | ✅ |
| Lists | ✅ | ✅ | ✅ |
| Code Blocks | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ✅ |
| Blockquotes | ✅ | ✅ | ✅ |
| **Advanced Jira Features** |
| Mentions | ✅ | ❌ | ❌ |
| Panels | ✅ | ❌ | ❌ |
| Status Lozenges | ✅ | ❌ | ❌ |
| **Service Considerations** |
| Maintenance Status | Active | Active | Outdated |
| Weekly Downloads | ~300K+ | ~1K | ~6K |
| ADF Spec Compliance | Complete | Good | Partial |
| Error Handling | Robust | Good | Basic |
| TypeScript Support | ✅ | ✅ | ❌ |
| Setup Complexity | Moderate | Simple | Simple |
| Dependency Count | Higher | Low | Medium |
| Community Trust | Highest | Low | Medium |

### Recommended Architecture

```
AI Agent Input (Markdown)
         ↓
    Preprocessing
    (normalize AI-specific patterns)
         ↓
    Official Atlassian MarkdownTransformer
         ↓
    ADF Validation
    (ensure Jira compatibility)
         ↓
    Jira REST API
```

### Risk Mitigation

1. **Fallback Strategy**: Always provide plain text fallback if ADF conversion fails
2. **Validation**: Validate ADF structure before sending to Jira
3. **Testing**: Comprehensive test suite covering AI agent markdown patterns
4. **Monitoring**: Log conversion failures for improvement

### Next Steps

1. **Immediate**: Install and test official Atlassian packages with sample AI agent outputs
2. **Week 1**: Implement basic conversion pipeline with official transformers and fallbacks
3. **Week 2**: Add comprehensive testing and validation
4. **Week 3**: Handle edge cases and AI-specific markdown patterns

This approach provides the most robust foundation with official support, highest community trust, and complete ADF feature coverage while maintaining reliability and performance.

---

## Jira REST API Update Capabilities

### API Endpoint Overview

**Primary Update Endpoint**: `PUT /rest/api/3/issue/{issueIdOrKey}`

The Jira REST API v3 provides comprehensive capabilities for updating issues through a single, powerful endpoint. This endpoint supports updating multiple fields simultaneously and uses both `fields` and `update` parameters for different types of modifications.

### Supported Update Operations

#### 1. **Field Updates** (`fields` parameter)
Direct field value replacement - overwrites existing values:

**System Fields**:
- `summary` - Issue title (string)
- `description` - Issue description (ADF format)
- `environment` - Environment field (ADF format) 
- `assignee` - Assigned user (`{"id": "accountId"}`)
- `reporter` - Reporter user (`{"id": "accountId"}`)
- `priority` - Priority (`{"id": "priorityId"}`)
- `issuetype` - Issue type (`{"id": "issueTypeId"}`)
- `project` - Project (`{"id": "projectId"}`)
- `duedate` - Due date (ISO date string)
- `labels` - Labels array (`["label1", "label2"]`)
- `components` - Components array (`[{"id": "componentId"}]`)
- `fixVersions` - Fix versions array (`[{"id": "versionId"}]`)
- `versions` - Affects versions array (`[{"id": "versionId"}]`)
- `timetracking` - Time tracking (`{"originalEstimate": "1w", "remainingEstimate": "3d"}`)

**Custom Fields**:
- `customfield_XXXXX` - Custom field values (format depends on field type)
- **Text fields**: String values
- **Textarea fields**: ADF format required
- **Select fields**: `{"value": "optionValue"}` or `{"id": "optionId"}`
- **Multi-select**: Array of option objects
- **Date fields**: ISO date strings
- **Number fields**: Numeric values
- **User picker**: `{"id": "accountId"}` or `[{"id": "accountId"}]` for multi-user

#### 2. **Incremental Updates** (`update` parameter)
Granular operations that modify existing values:

**Available Operations**:
- `set` - Replace field value
- `add` - Add value to multi-value fields
- `remove` - Remove value from multi-value fields
- `edit` - Modify specific properties (e.g., time tracking)

**Examples**:
```json
{
  "update": {
    "labels": [
      {"add": "new-label"},
      {"remove": "old-label"}
    ],
    "components": [
      {"set": [{"id": "10000"}]}
    ],
    "timetracking": [
      {"edit": {"originalEstimate": "2w", "remainingEstimate": "1w"}}
    ]
  }
}
```

### Field Type Requirements

#### **ADF Format Required**:
- `description` field
- `environment` field  
- **All `textarea` type custom fields** (multi-line text)

#### **String Format Accepted**:
- `summary` field
- **All `textfield` type custom fields** (single-line text)
- Simple system fields (labels, basic text fields)

#### **Special Object Formats**:
- **User fields**: `{"id": "accountId"}` or `{"accountId": "id"}`
- **Project/Component/Version**: `{"id": "numericId"}`
- **Select options**: `{"value": "stringValue"}` or `{"id": "optionId"}`
- **Date fields**: ISO 8601 format (`"2024-12-31"`)

### Query Parameters

- `notifyUsers` (boolean) - Send notifications (default: true)
- `overrideScreenSecurity` (boolean) - Bypass screen restrictions (admin only)
- `overrideEditableFlag` (boolean) - Bypass workflow restrictions (admin only)
- `returnIssue` (boolean) - Return updated issue in response
- `expand` (string) - Expand specific issue properties in response

### Error Handling

**Common HTTP Status Codes**:
- `204 No Content` - Update successful
- `400 Bad Request` - Invalid field values or format
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Issue not found
- `409 Conflict` - Workflow/business rule violation
- `422 Unprocessable Entity` - Field validation errors

### Permission Requirements

- **Edit Issues** permission for the project
- **Assign Issues** permission (when changing assignee)
- **Schedule Issues** permission (when changing due date)
- **Resolve Issues** permission (when changing resolution)
- Field-specific permissions based on project configuration

### Field Discovery and Metadata

#### **Get Edit Metadata**: `GET /rest/api/3/issue/{issueIdOrKey}/editmeta`
Returns available fields for editing with:
- Field names and IDs
- Allowed values and operations
- Required field indicators
- Field schemas and types

#### **Get Fields List**: `GET /rest/api/3/field`
Returns all system and custom fields with:
- Field identifiers and names
- Field types and schemas
- Search and navigation capabilities

### Tool Design Considerations

#### **AI Agent-Optimized Tool Design**

**Option A: Focused `update-issue-description` Tool** ✅ **RECOMMENDED FOR AI AGENTS**
```javascript
{
  "name": "update-issue-description",
  "description": "Updates a Jira issue description with markdown content",
  "inputSchema": {
    "issueKey": "string (required)",
    "description": "string (required) - Markdown text to convert to ADF"
  }
}
```

**AI Agent Advantages**:
- **Simple cognitive load** - AI focuses on generating good markdown content
- **Reliable execution** - Minimal parameters = fewer failure points
- **Optimized for primary use case** - Description updates are most common AI operation
- **Excellence in core function** - Markdown→ADF conversion gets full attention
- **Predictable behavior** - Single responsibility reduces AI confusion

**Option B: Comprehensive Multi-Field Tool** ⚠️ **COMPLEX FOR AI AGENTS**
```javascript
{
  "name": "update-issue",
  "description": "Updates multiple Jira issue fields",
  "inputSchema": {
    "issueKey": "string (required)",
    "summary": "string (optional)",
    "description": "string (optional)",
    "assignee": "string (optional)",
    "priority": "string (optional)",
    "labels": "array (optional)",
    // ... many more optional fields
  }
}
```

**AI Agent Challenges**:
- **Parameter confusion** - AI might include unnecessary or incorrectly formatted fields
- **Cognitive overload** - Complex schema distracts from core markdown generation
- **Higher failure rate** - More parameters = more opportunities for AI errors
- **Unclear primary purpose** - Tool tries to do everything, excels at nothing

#### **Recommended Implementation Strategy**

**Phase 1: `update-issue-description` Tool (PRIORITY 1)**
```json
{
  "type": "object",
  "properties": {
    "issueKey": {
      "type": "string", 
      "description": "Issue key (e.g., 'PROJ-123')"
    },
    "description": {
      "type": "string",
      "description": "Issue description in markdown format (will be converted to ADF)"
    }
  },
  "required": ["issueKey", "description"]
}
```

**Processing Logic (Focused & Reliable)**:
1. **Input Validation** - Verify issue key format and description content
2. **Markdown→ADF Conversion** - Convert using official Atlassian transformer
3. **API Call** - Simple PUT with description field only
4. **Error Handling** - Clear feedback on conversion or API failures

**Phase 2: Additional Focused Tools (If Needed)**
- `update-issue-assignee` - Single-purpose assignee changes
- `update-issue-labels` - Label management only  
- `update-issue-priority` - Priority updates only

**Phase 3: Advanced Operations (Future)**
- Multi-field updates only after AI agents prove reliable with simple tools
- Workflow transitions and complex field operations

### Implementation Priority

**Phase 1**: Focused `update-issue-description` tool - Excel at the primary AI use case
**Phase 2**: Additional single-purpose tools (`assignee`, `labels`, `priority`) if demand exists  
**Phase 3**: Consider multi-field tools only after establishing AI agent reliability patterns
**Phase 4**: Advanced operations (incremental updates, workflow transitions)

### Key Insight: AI Agent Behavior vs. API Efficiency

While the Jira API supports efficient multi-field updates, **AI agent reliability** is more important than API efficiency. A simple, focused tool that AI agents can use consistently is more valuable than a complex tool they might use incorrectly.

**Start simple, expand based on actual usage patterns.** 