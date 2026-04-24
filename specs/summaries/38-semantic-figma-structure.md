# 38-semantic-figma-structure.md

## Status
Implemented

## What it proposes
Enhance screen analysis by generating lightweight semantic XML from Figma node data and including it alongside images in analysis prompts. This allows the AI to identify interaction states, component variants, and functional relationships (e.g., hover tooltips, expanded states) that are invisible in static images alone.

## Architectural decisions made
- New module `server/providers/figma/semantic-xml-generator.ts` with `generateSemanticXml(nodeData)` function
- Component/instance names used as XML tags with properties as attributes (State, Property1, etc.)
- Interactive elements marked with `interactive="true"` attribute
- Semantic XML included in `prompt-screen-analysis.ts` analysis prompts when available
- Node data preserved beyond frame extraction step so it can be passed to the XML generator
- XML truncation via `truncateSemanticXml()` for large frames (>50KB)
- Used in `figma-ask-scope-questions-for-page` tool and `screen-analyses-workflow`

## What still needs implementing
Fully implemented.
