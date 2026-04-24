# Handling Large Jira Descriptions (32KB Limit)

**Status:** Implemented

## What it proposes
When adding a `## Shell Stories` section to a Jira epic description would exceed Jira Cloud's 32,767-character ADF JSON limit, automatically move the existing `## Scope Analysis` section to a Jira comment before writing the new content. This ensures the Shell Stories (required by `write-next-story`) remain in the description while preserving the Scope Analysis as a comment.

## Architectural decisions made
- Shell Stories must stay in the description (actively used by `write-next-story`); Scope Analysis can move to comments.
- A 2KB safety margin is applied (effective limit: 30,767 chars).
- New helper file `size-helpers.ts` provides `calculateAdfSize()` and `wouldExceedLimit()`.
- `extractADFSection()` was added to `markdown-converter.ts` to extract and remove a named section from ADF content.

## What still needs implementing
<!-- Fully implemented -->
