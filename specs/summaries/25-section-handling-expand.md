# 25-section-handling-expand.md

## Status
Implemented

## What it proposes
When a Figma SECTION node is linked in a Jira epic, expand it to its child FRAMEs rather than returning an empty result. Each child frame should be treated as a separate screen with filenames derived from the frame name and node ID, preserving section context in metadata.

## Architectural decisions made
- Treat SECTION nodes like CANVAS nodes — extract all child FRAMEs as individual screens
- Filename format: `{frame-slug}_{node-id}.analysis.md` (section name excluded from filename since it requires additional API calls)
- Store section context (`sectionName`, `sectionId`) in `screens.yaml` metadata fields rather than filenames
- Add `frameName` and `filename` fields to the screen metadata structure
- Let AI detect relationships between screens (e.g., responsive variants) rather than encoding it structurally
- Add a shared `extractFramesAndNotesFromChildren()` helper used by both CANVAS and SECTION handling
- Auto-expand nested SECTIONs inside CANVAS nodes

## What still needs implementing
Fully implemented.
