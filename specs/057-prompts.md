# Prompts and Agent Workflow: figma-review-design and write-story

This document catalogs all the LLM prompts used across the `figma-review-design` and `write-story` tools, including their purposes, locations, and how they fit into the overall workflow.

## Overview

Both tools follow a multi-stage LLM workflow, where each stage has its own specialized prompt. The stages are:

1. **Screen Analysis** - Analyze individual Figma screens
2. **Scope Analysis** - Synthesize features across screens
3. **Question Generation** (figma-review-design only) - Generate questions per screen
4. **Story Content Generation** (write-story only) - Write the complete story

## Common Prompts (Used by Both Tools)

### 1. Screen Analysis Prompt

**What it does:** Analyzes individual Figma screens to document UI elements, layout, and functionality.

**Location:** `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts`

**Inputs:**
- Figma screen image (multimodal)
- Semantic XML of Figma components
- Design notes and annotations
- Feature context (epic description)

**Output:** Detailed screen documentation with categorized features (☐ ✅ ⏬ ❌ ❓ 💬)

**Max Tokens:** 8000

---

### 2. Scope Analysis Prompt (Feature Identification)

**What it does:** Synthesizes screen analyses into features grouped by workflow areas with scope categorization.

**Location:** `server/providers/combined/tools/analyze-feature-scope/strategies/prompt-scope-analysis-2.ts`

**Inputs:**
- Screen analyses from all screens
- Epic context (primary scope source)
- Referenced documentation (Confluence, Google Docs)
- Figma comments from stakeholders
- Previous scope analysis (for regeneration)

**Output:** Features grouped by workflow areas with markers (☐ ✅ ⏬ ❌ ❓ 💬) and "Remaining Questions" section

**Max Tokens:** 8000

**Used By:** Both `figma-review-design` and `write-story` tools

---

## figma-review-design Specific Prompts

### 3. Question Generation Prompt

**What it does:** Generates questions organized by frame for posting to Figma as comments. Uses cross-screen awareness to avoid duplicate questions.

**Location:** `server/providers/figma/tools/figma-review-design/prompt-figma-questions.ts`

**Inputs:**
- Screen analyses with node IDs
- Context description (scope guidance)
- Existing Figma comments and notes
- Scope analysis (to avoid redundancy)

**Output:** Questions grouped by frame with node IDs for comment posting. Only includes screens that have questions.

**Max Tokens:** 8000

---

## write-story Specific Prompts

### 4. Story Content Generation Prompt

**What it does:** Generates or refines a complete Jira story with proper formatting, acceptance criteria, and scope analysis.

**Location:** `server/providers/combined/tools/write-story/prompt-story-content.ts`

**Inputs:**
- Pre-generated scope analysis (optional)
- Existing story content (for subsequent runs)
- Parent hierarchy and blockers
- Jira comments
- Figma screens and comments
- Confluence and Google Docs
- Referenced issues and project context

**Output:** Complete Jira story with sections: User Story Statement, Supporting Artifacts, Scope Analysis, Acceptance Criteria (with Figma links), optional NFRs and Developer Notes

**Max Tokens:** 8000

**Key Features:** Handles first/subsequent runs, flips answered ❓ to 💬, preserves all links, enforces ❓ only in Scope Analysis

---

## Workflow Diagrams

### figma-review-design Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ figma-review-design Tool                                        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Screen Analysis (per screen)                          │
│ Prompt: Screen Analysis Prompt (screen-analyzer.ts)            │
│ Input:  Figma screen image + semantic XML + annotations        │
│ Output: Detailed screen documentation with ☐ ✅ ❌ ❓ markers   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Scope Analysis (cross-screen synthesis)               │
│ Prompt: Feature Identification Prompt (prompt-scope-analysis-2)│
│ Input:  All screen analyses + epic context + comments          │
│ Output: Features grouped by workflow areas with markers        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: Question Generation (per screen)                      │
│ Prompt: Question Generation Prompt (prompt-figma-questions)    │
│ Input:  Screen analyses + scope analysis + context             │
│ Output: Questions organized by frame for Figma comments        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Post questions to Figma as comments on specific frames         │
└─────────────────────────────────────────────────────────────────┘
```

### write-story Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ write-story Tool                                                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Screen Analysis (if Figma links present)              │
│ Prompt: Screen Analysis Prompt (screen-analyzer.ts)            │
│ Input:  Figma screens linked in issue                          │
│ Output: Screen documentation (via context-loader)              │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Scope Analysis (optional)                             │
│ Prompt: Feature Identification Prompt (prompt-scope-analysis-2)│
│ Input:  Screen analyses + epic context + docs + comments       │
│ Output: Pre-generated scope analysis for two-phase approach    │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: Story Content Generation                              │
│ Prompt: Story Content Prompt (prompt-story-content)            │
│ Input:  All context + scope analysis + existing story          │
│ Output: Complete story in Jira format with ACs                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Update Jira issue description with timestamp marker            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prompt Characteristics Comparison

| Prompt | Max Tokens | Multimodal | Context Sources | Primary Output |
|--------|-----------|------------|-----------------|----------------|
| Screen Analysis | 8000 | ✅ Yes (image + text) | Figma screen, annotations, feature context | Screen documentation |
| Scope Analysis | 8000 | ❌ No | Screen analyses, epic, docs, comments | Feature areas with markers |
| Question Generation | 8000 | ❌ No | Screen analyses, scope analysis, context | Questions by frame |
| Story Content | 8000 | ❌ No | All loaded context, hierarchy, comments | Complete Jira story |

---

## Key Design Patterns

1. **Evidence-Based:** Only document what's visible in screens or explicit in context
2. **Context Hierarchy:** Epic context → Design notes → Documentation → Visual analysis
3. **Consistent Markers:** ☐ ⏬ ✅ ❌ ❓ 💬 used uniformly across all prompts
4. **Question Lifecycle:** ❓ (generated) → check context → 💬 (answered) or stay ❓
5. **Progressive Enhancement:** Each prompt builds on previous stage outputs

---

## Maintenance Notes

- **Screen Analysis** changes affect both tools
- **Scope Analysis** changes affect both tools  
- **Question Generation** only affects figma-review-design
- **Story Content** only affects write-story
- Always test both tools when updating shared prompts
