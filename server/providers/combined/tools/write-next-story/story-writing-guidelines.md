# Bitovi Story Writing Guidelines

> Source: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/401113200/Story+Writing

## Complete Story Example

Here is the exact format expected for a complete story:

```markdown
As a shopper, 
- __I want__ to add items to a wishlist, 
- __so that__ I can purchase them later.

## Supporting Artifacts

- [Wishlist Feature Design](https://www.figma.com/design/abc123/Wishlist)

## ❌ Out of Scope

- Sharing wishlists with other users
- Wishlist notifications or reminders
- Moving items between multiple wishlists

## Non-Functional Requirements

- Wishlist data must persist across sessions
- Add to wishlist action should complete within 500ms
- Maximum 100 items per wishlist

## Developer Notes

- Use the existing `UserPreferences` API to store wishlist data
- Wishlist items are stored as product IDs, not full product objects
- The wishlist icon in the header needs to show item count (see story st002 for badge component)

## Acceptance Criteria

**GIVEN** the user is viewing the product list page:

[View product list in Figma](https://www.figma.com/design/abc123/Product-List)

- **WHEN** the user clicks the heart icon on a product, **THEN**
  - The heart icon fills with color to indicate the item is wishlisted
  - A toast notification appears: "Added to wishlist"
  - The wishlist count in the header increments by 1
  
  [View wishlisted state in Figma](https://www.figma.com/design/abc123/Product-Wishlisted)

**GIVEN** the user has items in their wishlist:

- **WHEN** the user clicks the wishlist icon in the header, **THEN**
  - The user navigates to the wishlist page
  - All wishlisted items are displayed with product image, name, and price
  
  [View wishlist page in Figma](https://www.figma.com/design/abc123/Wishlist-Page)
  
  - **WHEN** the user clicks the "Remove" button on a wishlist item, **THEN**
    - The item is removed from the wishlist
    - The wishlist count in the header decrements by 1
    - If the wishlist becomes empty, an empty state message is shown: "Your wishlist is empty"
```

## Story Template Structure

A refined user story includes the following sections in order:

### 1. User Story Statement

A short description of a feature from the user's perspective:

**Format**: "As a [user/role], __I want__ [feature/action], __so that__ [benefit/value]."

**Example**: 
- "As a shopper, __I want__ to add items to a wishlist, __so that__ I can purchase them later."
- "As a job seeker, __I want__ to upload my resume, __so that__ I can apply for multiple jobs quickly."

### 2. Supporting Artifacts

Links to other resources related to the user story.

**Guidelines**:
- Include Figma design links for visual reference
- Provide context: Briefly describe what the resource is and how it relates
- Highlight key sections if referencing larger documents
- Keep references up-to-date and versioned correctly

**Example**:
```markdown
## Supporting Artifacts

- [Wishlist Feature Design](https://www.figma.com/design/abc123/Wishlist)
- [API Documentation: User Preferences](https://docs.example.com/api/preferences)
```

**Note**: Figma allows direct linking to specific nodes. Use Figma plugins to embed images in Jira when helpful.

### 3. Out-of-Scope Requirements

Explicitly state what is NOT included in this story to prevent scope creep.

**Guidelines**:
- Be explicit about excluded features or scenarios
- Link to future work if out-of-scope items will be handled later
- Only mention items that could reasonably be assumed to be part of the story

**Purpose**: Particularly important when partially implementing designs.

### 4. Remaining Questions (if applicable)

Any unresolved questions or ambiguities from the shell story that need clarification.

**Guidelines**:
- Source these from the ❓ bullets in the shell story
- List specific questions that need answers before or during implementation
- Reference relevant designs or documentation where applicable
- Flag dependencies on other teams or decisions
- Include only questions that directly impact this story's implementation

**Example**:
```markdown
## ❓ Remaining Questions

- Should the wishlist icon badge show a maximum count (e.g., "99+") or unlimited?
- What happens to wishlist items if a product is discontinued?
- Should users receive a notification when a wishlisted item goes on sale?
```

### 5. Non-Functional Requirements

Requirements a user would not directly see (performance, security, technical constraints).

**Guidelines**:
- Specify measurable criteria where possible (e.g., response time in seconds)
- Align with organizational standards (security, compliance)
- Keep it relevant to the specific story
- Avoid repeating team-wide standards (those belong in Definition of Done)

### 6. Developer Notes

Information useful during implementation.

**Guidelines**:
- Highlight potential constraints/dependencies (APIs, libraries, infrastructure)
- Capture known risks (performance bottlenecks, legacy system considerations)
- Detail data structures/interactions if critical to implementation
- Include technical dependencies from other stories

### 6. Acceptance Criteria

Concise, specific statements describing minimum requirements for the story to be "done."

**Guidelines**:
- Make them testable and verifiable
- Use clear, specific language (avoid vague terms like "fast" or "user-friendly")
- Consider multiple scenarios including edge cases
- Written in Given/When/Then format (see below)

## Nested Gherkin Format for Acceptance Criteria

Use **Nested Gherkin** format for acceptance criteria. This format allows states and outcomes to be nested using bullet points.

### Syntax

```
GIVEN [initial state or context]:

[View initial state in Figma](https://www.figma.com/design/...)

- WHEN [user action], THEN
  - [expected result 1]
  - [expected result 2]
    
    [View intermediate state in Figma](https://www.figma.com/design/...)

  - WHEN [subsequent action], THEN
    - [expected result]

      [View final state in Figma](https://www.figma.com/design/...)
```

### Gherkin Keywords

- **GIVEN**: The context or initial state
- **WHEN**: The user action or event that causes a state change
- **THEN**: The expected outcome

**Important**: Bold all Gherkin keywords (**GIVEN**, **WHEN**, **THEN**)

### Nested Structure Rules

- States and THEN clauses can be nested using bullet points
- Each level of nesting represents a progression through the user flow
- Figma links should be embedded inline with relevant acceptance criteria as regular markdown links
- Links should point to the screen that best shows the state being described at that point in the flow

## Critical Constraints

**Evidence-Based Requirements**:
- Base acceptance criteria ONLY on visible designs and provided analysis files
- Do NOT add speculative features or assumed functionality
- Do NOT infer behavior that isn't explicitly documented
- If uncertain about functionality, document as a question rather than implementing

**Styling and Design**:
- AVOID generic styling criteria (spacing, fonts, colors, contrast)
- Developers will match the designs - no need to specify basic visual matching
- Focus acceptance criteria on functional behavior and user interactions

**Figma Links**:
- Include Figma links inline with relevant acceptance criteria as regular markdown links
- Link to the screen that best shows the state being described
- Use descriptive link text like "View state in Figma" or "See design"
- Links help reviewers and developers reference the exact design being implemented

## Story Quality Standards (I.N.V.E.S.T.)

Good stories follow I.N.V.E.S.T. criteria:

- **I**ndependent: Self-contained, can progress without external dependencies
- **N**egotiable: Leaves room for discussion on optimal implementation  
- **V**aluable: Clear value delivery to stakeholders
- **E**stimable: Can be sized relative to other stories
- **S**mall: Small enough to estimate accurately and complete in a sprint
- **T**estable: Clear acceptance criteria allow verification

## Summary

Every story must include all 6 sections in this exact format:

1. **User Story Statement** (no heading, just the text)
2. **## Supporting Artifacts**
3. **## Out of Scope**
4. **## Non-Functional Requirements**
5. **## Developer Notes**
6. **## Acceptance Criteria**

**Important formatting rules**:
- Do NOT include the story title in the description (it's already in the Jira summary field)
- Do NOT number the sections (1., 2., etc.)
- Do NOT use horizontal rules (---) between sections
- Do NOT use ## heading for the User Story Statement (it's plain text at the top)
- All other sections use ## heading format
- Use regular markdown links `[text](url)` for Figma references, NOT images

Keep stories focused on evidence from designs and analysis files. Avoid speculation and unnecessary detail about visual styling.
