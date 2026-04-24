# 625-story-to-shell-story.md

## Status
Not Implemented

## What it proposes
A new MCP tool (`update-shell-stories-from-story`) that takes a completed Jira story key, summarizes it back into shell story format using an LLM, and updates the corresponding shell story entry in the parent epic's description. This closes the feedback loop between detailed story implementation and the shell story planning layer.

## Architectural decisions made
- Tool lives at `server/providers/combined/tools/update-shell-stories-from-story/` with files: `index.ts`, `update-shell-stories.ts`, `core-logic.ts`, `story-to-shell-summarizer.ts`, `shell-story-updater.ts`
- Reuses `parseShellStories` from the existing `write-next-story` shell story parser
- Reuses `resolveCloudId`, `getJiraIssue`, `convertAdfToMarkdown`, and `handleJiraAuthError` from atlassian helpers
- LLM summarization via `generateText` (supports both MCP sampling and `X-Anthropic-Token` header)
- Impact analysis on other shell stories is explicitly deferred to a future enhancement (Phase 7 skipped)
- Follows dual MCP + REST API interface pattern used by other combined tools

## What still needs implementing
- Create the entire `update-shell-stories-from-story/` tool folder (does not exist)
- `index.ts` — export registration function
- `update-shell-stories.ts` — MCP tool registration handler
- `core-logic.ts` — `executeUpdateShellStoriesFromStory()` orchestration function
- `story-to-shell-summarizer.ts` — LLM summarization helper (`summarizeStoryToShell`)
- `shell-story-updater.ts` — epic description update helper (`updateShellStoryInEpic`)
- Prompt file (`prompt-story-to-shell.ts`) with system prompt and `generateStoryToShellPrompt()`
- REST API endpoint at `server/api/` mirroring the MCP tool
- Registration of the tool in the MCP server provider setup
- Documentation update in `server/readme.md`
