# Write Next Story Summary

## Purpose
Finds the next unwritten shell story from an epic and generates a complete, detailed Jira story (subtask) with acceptance criteria, Gherkin scenarios, and proper formatting, then creates it in Jira with dependency links.

## Key Steps
1. **Setup Epic & Figma Screens**: Fetches epic, extracts shell stories section, sets up Figma screen metadata
2. **Parse Shell Stories**: Extracts all shell stories from epic ADF, including their IDs, titles, dependencies, screens, and completion status (jiraUrl presence)
3. **Find Next Unwritten Story**: Identifies the first shell story without a jiraUrl (completion marker)
4. **Validate Dependencies**: Recursively checks that all dependencies (and their dependencies) have been written to Jira
5. **Generate Story Content**: Loads screen analysis files for relevant screens, uses AI to generate complete Jira story with acceptance criteria
6. **Create Jira Issue**: Creates Story/Task as subtask of epic, adds "Blocks" links to dependency issues
7. **Update Epic with Completion Marker**: Adds jiraUrl link and timestamp to the shell story in epic description

## Decision Points
The following information influences the tool's output:

### Story Selection
- **What**: Determining which shell story to write next
- **Source**: Shell Stories section in epic description
- **Example**: First shell story in the list without a jiraUrl is selected; order in shell stories determines priority

### Dependency Validation
- **What**: Ensuring prerequisites are complete before writing a story
- **Source**: Shell story DEPENDS-ON references, existing Jira issues
- **Example**: Story cannot be written until ALL its dependencies (recursively) have been written; throws error if dependency is unwritten

### Screen Analysis Availability
- **What**: Ensuring UI specifications are available for story details
- **Source**: Figma screen analysis files, SCREENS references in shell story
- **Example**: Regenerates missing analysis files automatically if screens need analyzing

### Story Content from Shell Story Bullets
- **What**: Mapping shell story bullets to story sections
- **Source**: Shell story definition (☐/⏬/❌/❓ bullets)
- **Example**:
  - ☐ bullets → Included functionality (acceptance criteria)
  - ⏬ bullets → Out of Scope with reference to later story
  - ❌ bullets → Out of Scope section
  - ❓ bullets → Developer Notes (uncertainties)

### Evidence-Based Content
- **What**: Grounding story details in available information only
- **Source**: Shell story, screen analysis, dependency context
- **Example**: Story content must be based only on shell story, screen analysis, and dependency context; no assumed features or speculation

### Story Format
- **What**: Structuring the Jira story properly
- **Source**: Bitovi story writing guidelines
- **Example**: Uses nested Gherkin format, embedded Figma links (not images), bolded keywords (Given, When, Then)

### Issue Type Selection
- **What**: Choosing the correct Jira issue type
- **Source**: Project configuration, available issue types
- **Example**: Prefers "Story" issue type, falls back to "Task" if Story not available

### Dependency Links
- **What**: Creating proper Jira links between stories
- **Source**: Shell story DEPENDS-ON references
- **Example**: Creates "Blocks" link from each dependency issue to the new issue

## Document Types That Help
- **Shell Stories Section**: Required; provides the story to write with its scope (☐/⏬/❌/❓ bullets)
- **PRDs**: Feature requirements - helps flesh out acceptance criteria details
- **Technical Architecture**: API specifications, data models - helps write detailed technical acceptance criteria
- **Definition of Done**: Quality gates, testing requirements - referenced but not duplicated in story
- **Screen Analysis Files**: Provide detailed UI specifications for acceptance criteria
- **Dependency Stories**: Provide context about prerequisite functionality already implemented
- **Epic Context**: Background understanding (but doesn't expand story scope beyond shell story definition)
