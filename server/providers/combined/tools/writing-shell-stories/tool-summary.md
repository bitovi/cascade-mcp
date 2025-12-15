# Write Shell Stories Summary

## Purpose
Generates a prioritized list of "shell stories" (lightweight story outlines) from scope analysis that organize features into an incremental delivery plan, where each story represents the smallest unit of functionality that delivers real user value.

## Key Steps
1. **Fetch Epic & Extract Context**: Retrieves epic description, extracts epic context and crucially the "## Scope Analysis" section (required prerequisite)
2. **Setup Figma Screens**: Extracts Figma URLs, fetches metadata, identifies screens
3. **Download & Analyze Screens**: Ensures all screen analysis files exist (regenerates if missing)
4. **Extract Scope Analysis**: Parses the Scope Analysis section from epic to use as primary input
5. **Generate Shell Stories**: AI maps scope analysis features to incremental stories with dependencies, deferrals, and questions
6. **Update Jira Epic**: Writes the generated "## Shell Stories" section to epic description

## Decision Points
The following information influences the tool's output:

### Scope Analysis Categories Drive Stories
- **What**: Mapping scope analysis symbols to story actions
- **Source**: Scope Analysis section in epic description
- **Example**: 
  - ☐ In-Scope → Create stories (normal priority)
  - ⏬ Low Priority → Create stories at end of epic
  - ❌ Out-of-Scope → Skip entirely (no stories)
  - ✅ Already Done → Skip (existing functionality)
  - ❓ Questions → Include in relevant story bullets

### Incremental Value Delivery
- **What**: Ordering stories for maximum customer value
- **Source**: Business priorities, user workflows, feature dependencies
- **Example**: Stories are ordered by customer value, dependencies, blockers, and risk; core features first, then enhancements

### Story Dependencies
- **What**: Determining which stories must be completed before others
- **Source**: Technical architecture, data flow, feature relationships
- **Example**: Stories reference other story IDs they depend on; dependency order determines execution sequence

### Deferred Features
- **What**: Tracking ⏬ features across stories
- **Source**: Scope Analysis ⏬ items, priority guidance
- **Example**: Features marked with ⏬ bullets must have corresponding implementation stories later; final story must have zero ⏬ bullets

### Story Size and Independence
- **What**: Right-sizing stories for implementation
- **Source**: Development best practices, sprint capacity
- **Example**: Each story must be independent, minimal, valuable, testable, and completable in 1-2 sprints

### Progressive Enhancement
- **What**: Building features incrementally
- **Source**: User experience best practices, risk management
- **Example**: Basic versions of many features before polishing any one; core features first, then enhancements

### Shared Components
- **What**: Introducing reusable UI components
- **Source**: UI patterns, component analysis from Figma
- **Example**: Shared components introduced within the first story that needs them (not duplicated)

## Document Types That Help
- **Scope Analysis Section**: Required prerequisite; provides categorized feature list (tool will fail without it)
- **PRDs**: Feature requirements, acceptance criteria - helps understand feature scope for story breakdown
- **Epic Context**: Business priorities, constraints, project goals
- **Technical Architecture**: API specifications, system design - helps identify dependencies and story ordering
- **Definition of Done**: Quality gates, testing requirements - influences story acceptance criteria
- **Dependency Context**: Understanding of what must be built before what
