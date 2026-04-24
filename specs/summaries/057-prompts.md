# 057-prompts.md

## Status
Implemented

## What it proposes
A reference catalog of all LLM prompts used across the `figma-review-design` and `write-story` tools, documenting their purposes, locations, inputs/outputs, and how they compose into multi-stage workflows. It establishes consistent conventions (markers ☐ ✅ ⏬ ❌ ❓ 💬, 8000 max tokens, evidence-based writing) shared across all prompts.

## Architectural decisions made
- Four distinct prompt stages: Screen Analysis → Scope Analysis → (Question Generation or Story Content Generation)
- Screen Analysis prompt is multimodal (image + semantic XML); all others are text-only
- All prompts use 8000 max tokens
- Consistent marker system (☐ ✅ ⏬ ❌ ❓ 💬) applied uniformly across prompts
- Question lifecycle: ❓ generated → answered context check → 💬 or stays ❓
- Scope Analysis prompt is shared by both `figma-review-design` and `write-story` workflows
- Progressive enhancement: each stage builds on prior stage outputs

## What still needs implementing
Fully implemented.
- Screen Analysis: [server/providers/figma/screen-analyses-workflow/screen-analyzer.ts](../server/providers/figma/screen-analyses-workflow/screen-analyzer.ts)
- Scope Analysis: [server/providers/combined/tools/analyze-feature-scope/strategies/prompt-scope-analysis-2.ts](../server/providers/combined/tools/analyze-feature-scope/strategies/prompt-scope-analysis-2.ts)
- Question Generation: [server/providers/figma/tools/figma-review-design/prompt-figma-questions.ts](../server/providers/figma/tools/figma-review-design/prompt-figma-questions.ts)
- Story Content: [server/providers/combined/tools/write-story/prompt-story-content.ts](../server/providers/combined/tools/write-story/prompt-story-content.ts)
