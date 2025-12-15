# Analyze Feature Scope Summary

## Purpose
Generates a structured "Scope Analysis" document that categorizes all features visible in Figma designs into in-scope (☐), already done (✅), low priority (⏬), out-of-scope (❌), and questions (❓), grouped by user workflow areas.

## Key Steps
1. **Fetch Epic & Extract Context**: Retrieves the Jira epic description and extracts existing content (excluding any prior Scope Analysis section)
2. **Setup Figma Screens**: Extracts Figma URLs from epic, fetches file metadata, and identifies all screens/frames to analyze
3. **Download & Analyze Screens**: Downloads screen images and uses AI to analyze each screen's UI elements, features, and behaviors
4. **Generate Scope Analysis**: AI analyzes all screen analyses against epic context to produce categorized feature list grouped by workflow areas
5. **Update Jira Epic**: Writes the generated "## Scope Analysis" section back to the epic description

## Decision Points
The following information influences the tool's output:

### Epic Context as Primary Source
- **What**: Epic description determines what's in-scope vs out-of-scope
- **Source**: Jira epic description, PRDs, requirements documents
- **Example**: Features explicitly mentioned as "out of scope" or "future epic" → ❌; Features mentioned as "delay until end" → ⏬

### Feature Categorization
- **What**: Assigning the correct status symbol to each feature
- **Source**: Epic description language, business constraints, existing functionality notes
- **Example**: 
  - ☐ In-Scope: New work, not mentioned as existing/out-of-scope/low-priority
  - ✅ Already Done: Epic mentions as existing functionality
  - ⏬ Low Priority: Epic says "delay until end" or "implement later"
  - ❌ Out-of-Scope: Epic says "not included", "future epic", "exclude"
  - ❓ Questions: Unclear requirements, ambiguous behavior

### Feature Grouping
- **What**: How to organize features into logical groups
- **Source**: User workflows, UI organization, domain boundaries
- **Example**: "Login Form" and "Password Reset Link" are separate areas even if on same screen; features grouped by independent user workflows/capabilities

### Granularity Preference
- **What**: Deciding how fine-grained features should be
- **Source**: Implementation independence, user value boundaries
- **Example**: Prefers more granular feature areas; features should be separate if they can be implemented independently

### Screen Analysis Evidence
- **What**: Grounding features in actual UI elements
- **Source**: Figma screen analyses, UI element descriptions
- **Example**: Every feature must reference actual UI elements from screen analyses; no speculation allowed

## Document Types That Help
- **PRDs**: Feature requirements, user stories, acceptance criteria - helps determine what's in-scope
- **Epic Description**: Primary source for scope decisions, business constraints, what's in/out of scope
- **Existing Functionality Notes**: Information about what's already built (→ ✅)
- **Priority Guidance**: Notes about what to delay or defer (→ ⏬)
- **Scope Boundaries**: Explicit exclusions or "future epic" notes (→ ❌)
- **Technical Architecture**: API constraints, system boundaries - helps identify technical feasibility questions
