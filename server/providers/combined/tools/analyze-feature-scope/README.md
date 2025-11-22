# Identify Features Tool

Analyzes Figma screen designs to generate a scope analysis document that categorizes features as in-scope (✅), out-of-scope (❌), or questions (❓), grouped by workflow-based feature areas.

## Purpose

Use this tool **before** generating shell stories to:
- Establish clear scope boundaries early in the planning process
- Identify ambiguities and questions that need clarification
- Group features logically by user workflow
- Link features to specific Figma screens for traceability
- Create alignment between stakeholders on what's in vs. out of scope

## Usage

### Via MCP (VS Code Copilot)

```
Please identify features for epic PROJ-123
```

### Via REST API

```bash
curl -X POST http://localhost:3000/api/identify-features \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: $(echo -n 'your-email@example.com:your-api-token' | base64)" \
  -H "X-Figma-Token: figd_YOUR_FIGMA_TOKEN" \
  -H "X-Anthropic-Token: sk-ant-YOUR_ANTHROPIC_KEY" \
  -d '{
    "epicKey": "PROJ-123"
  }'
```

**Optional parameters:**
- `cloudId`: Specific Atlassian cloud ID (auto-detected if not provided)
- `siteName`: Jira site name (e.g., "bitovi" from bitovi.atlassian.net)
- `sessionId`: Custom session ID for temp directory naming

## Output

The tool generates a "Scope Analysis" section in the epic description:

```markdown
## Scope Analysis

### Authentication Flow

[Login Screen](figma-url) [Signup Screen](figma-url)

- ✅ Email/password login
- ✅ Form validation with real-time feedback
- ❌ OAuth providers (Google, GitHub) - deferred to Phase 2
- ❌ Multi-factor authentication - future enhancement
- ❓ Should "Remember Me" persist across browser sessions?
- ❓ What is the password reset flow?

### User Profile Management

[Profile Settings](figma-url)

- ✅ Display and edit user information
- ✅ Avatar upload with preview
- ❌ Password change functionality - separate epic
- ❓ What image formats are supported for avatars?
- ❓ Maximum file size for uploads?

### Remaining Questions

- ❓ What is the overall error handling strategy?
- ❓ Are there any accessibility requirements (WCAG level)?
- ❓ What browsers need to be supported?
```

## Feature Categorization

### ✅ In-Scope
- Features explicitly listed as in-scope in epic context
- Features with complete UI and clear implementation path (when epic doesn't specify)
- **Epic context is primary source of truth**: If epic says it's in-scope, it's marked ✅

### ❌ Out-of-Scope
- Features explicitly mentioned in epic context as deferred or excluded
- Features marked as future/optional in screen analyses
- **Epic context always wins**: If epic says out-of-scope, it's marked ❌ regardless of UI

### ❓ Questions
- Behaviors that are unclear or ambiguous
- Requirements that need clarification
- Features that could be either in-scope or out-of-scope
- Missing information needed for implementation

## Feature Grouping

Features are organized by **user workflow**, not UI location or technical architecture:

**Good grouping (workflow-based):**
- "Authentication Flow" - How users log in and sign up
- "Dashboard Interaction" - How users view and interact with their dashboard
- "Settings Management" - How users configure their preferences

**Avoid (UI-based):**
- "Header Components"
- "Sidebar Elements"
- "Footer Links"

## Workflow

1. **Epic Setup**: Ensure epic description contains Figma design links
2. **Run Tool**: Execute `identify-features` on the epic
3. **Review Output**: Check scope analysis in epic description
4. **Answer Questions**: Update epic with clarifications and scope decisions
5. **Generate Stories**: Use `write-shell-stories` to create detailed implementation stories based on finalized scope

## Debug Artifacts

All tool execution creates debug files in a temp directory (shown in output):

- `scope-analysis.md` - Generated scope analysis markdown
- `scope-analysis-prompt.md` - Full prompt sent to AI (for debugging)
- `screens.yaml` - Screen ordering and metadata
- `*.analysis.md` - Individual screen analysis files
- `*.png` - Downloaded Figma screen images

**Temp directory location**: `/tmp/write-shell-stories-<sessionId>-<epicKey>/`
**Retention**: 24 hours (automatic cleanup)

## Comparison with Write-Shell-Stories

| Tool | Purpose | Output | When to Use |
|------|---------|--------|-------------|
| `identify-features` | Scope definition | Feature areas with ✅/❌/❓ | Beginning of project, scope questions exist |
| `write-shell-stories` | Implementation planning | Numbered shell stories with dependencies | After scope is clear, ready to create tickets |

**Typical workflow:**
1. Run `identify-features` to establish scope
2. Review and answer questions
3. Run `write-shell-stories` to generate implementation stories
4. Shell stories automatically respect scope boundaries

## Key Design Decisions

Based on [specs/feature-identifier.md](../../../specs/feature-identifier.md):

1. **Epic Context Priority**: Epic scope statements are primary source of truth and override screen analysis interpretations
2. **Workflow-Based Grouping**: Features grouped by user workflows, not UI location
3. **Mixed Verbosity**: Concise descriptions for obvious features, detailed for complex ones
4. **Question Deduplication**: Each question listed only once in first relevant area
5. **Ambiguous Features**: Marked as ❓ questions when unclear if in/out of scope
6. **Caching**: Screen analyses cached for 24 hours for performance

## Error Handling

Common errors and solutions:

### "No Figma links found in epic description"
- **Cause**: Epic description doesn't contain valid Figma design URLs
- **Solution**: Add Figma links to epic description in format: `https://www.figma.com/design/...`

### "Insufficient permissions to update epic"
- **Cause**: Authentication token lacks write permissions
- **Solution**: Verify Atlassian PAT has `write:jira-work` scope

### "Failed to convert scope analysis to ADF"
- **Cause**: Generated markdown has invalid ADF conversion
- **Solution**: Check `scope-analysis.md` in temp directory for malformed markdown

### "AI response was empty"
- **Cause**: AI service timeout, rate limit, or invalid prompt
- **Solution**: Wait a few minutes and retry, or check Anthropic API key

## Future Enhancements

Planned improvements (see [specs/feature-identifier.md](../../../specs/feature-identifier.md)):

1. **Integration with Write-Shell-Stories**: Automatically use scope analysis as input for story generation
2. **Parallel Execution**: Option to run both tools together in one command
3. **Structured JSON Output**: Alternative API response format for programmatic consumption
4. **Manual Review Checkpoint**: Allow user to review feature catalog before generating analysis

## Related Documentation

- [Main Server README](../../readme.md) - All available tools and APIs
- [REST API Documentation](../../../docs/rest-api.md) - API authentication and usage
- [Feature Identifier Spec](../../../specs/feature-identifier.md) - Detailed implementation plan
