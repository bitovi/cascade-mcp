# 24-section-handling.md

## Status
Implemented

## What it proposes
When a Figma SECTION node is linked in a Jira epic, the tools (`analyze-feature-scope`, `write-shell-stories`) should handle it gracefully rather than returning zero screens. The spec proposes two options: expand SECTION child FRAMEs as individual screens (Option 1), or treat the whole SECTION as a composite single-screen analyzed with multiple images (Option 2, recommended).

## Architectural decisions made
- Option 1 (expand SECTION like CANVAS to individual child frames) was chosen over Option 2 (composite multi-image analysis)
- `getFramesAndNotesForNode()` in `figma-helpers.ts` was updated to handle `SECTION` type by calling `extractFramesAndNotesFromChildren()` — the same logic as CANVAS
- A helper `extractFramesAndNotesFromChildren()` was extracted to be shared between CANVAS and SECTION handling, with recursive SECTION expansion support
- The newer screen-analyses workflow (`frame-expander.ts`) also handles SECTION nodes via `expandSectionNode()`, propagating `sectionName` and `sectionId` context to child frames
- `FigmaFrameData` type in `types.ts` includes `sectionName` and `sectionId` fields for AI prompt context
- Screen analysis prompts include the section name to give the LLM context about the frame's grouping

## What still needs implementing
Fully implemented.
