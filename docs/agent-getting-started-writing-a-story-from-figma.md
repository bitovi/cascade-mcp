# Agent Getting Started: Writing a Story from Figma

This guide shows how to use a skill-supporting coding agent (Claude or GitHub Copilot) with CascadeMCP to take a Figma design and write a Jira story.

Specifically, we will show how to take designs showing a `Like & Dislike` behavior on comments and turn them into a detailed Jira story — all by chatting with your agent.

> TODO: Add image showing Figma designs

And show how to turn them into stories that look like:

> TODO: Add image showing the resulting Jira story

There are 5 steps:

1. Preparing Figma
2. Connecting your agent to CascadeMCP
3. Asking clarifying questions via your agent
4. Creating a starter story that links to the Figma designs
5. Asking your agent to write the story

> [!NOTE]
> There are 4 ways to call CascadeMCP tools:
> - with a skill-supporting coding agent like Claude or Copilot — **this guide**
> - with the MiniMCP client using an Anthropic API key (see [Anthropic Key Getting Started](./anthropic-key-getting-started-writing-a-story-from-figma.md))
> - with any MCP-compatible client (Claude Desktop, VS Code MCP extension, etc.)
> - with the [REST API](./rest-api.md)


## Step 1: Preparing Figma

In order to build stories, CascadeMCP needs:

- To know which Figma frames to analyze
- To know what feature you want to build


### Selecting your frames to analyze

The easiest way is to create a Figma `page` for each feature you'd like to make a story. For example, putting all the frames that show off the `Like & Dislike` feature in a single page:

> TODO: Add image showing frames organized in a single Figma page

By doing this, you can simply give the page link as context instead of linking to individual frames.


### Specifying the Scope

It's important to tell the agent what feature to focus on. Include a Note component named exactly `Note` (case-sensitive) to clearly state what the story covers and what it excludes:

> TODO: Add image showing a Note component in Figma with scope description

Additional `Note` components or Figma comments can also be added to detail the behavior. Notes and comments will be associated with the closest Figma frame.

> TODO: Add image showing a Figma comment on a frame


## Step 2: Connecting your agent to CascadeMCP

### Claude

1. Open Claude and navigate to **Settings → Integrations**
2. Add a new MCP server pointing to `https://cascade.bitovi.com/mcp`
3. Authorize your Figma and Atlassian accounts when prompted

> TODO: Add image showing Claude MCP settings

### GitHub Copilot (VS Code)

1. Open VS Code and open the **Chat** panel
2. Switch to **Agent** mode
3. Click the **Tools** icon and select **Add MCP Server**
4. Enter `https://cascade.bitovi.com/mcp` as the server URL
5. Authorize your Figma and Atlassian accounts when prompted

> TODO: Add image showing VS Code Copilot MCP configuration

> [!TIP]
> The CascadeMCP plugin for VS Code Copilot can install these skills automatically. See [Cascade MCP Plugin](../plugins/cascade-mcp/README.md).


## Step 3: Ask clarifying questions via your agent

Even the most detailed Figma design will leave some behaviors under-specified. Use the `cascade-post-design-questions-to-figma` skill to analyze your Figma frames and post questions as Figma comments.

In your agent chat, say something like:

```
Post design questions to Figma for this page: <paste your Figma page URL>
```

The agent will use the `cascade-post-design-questions-to-figma` skill to:
1. Load and analyze all frames on the page
2. Generate behavior questions for anything that's unclear
3. Post each question as a comment pinned to the relevant Figma frame

> TODO: Add image showing questions posted in Figma as comments starting with "Cascade🤖"

> [!NOTE]
> To understand more about how this works, please read [Frame Analysis Workflow](https://github.com/bitovi/cascade-mcp/blob/main/server/providers/figma/screen-analyses-workflow/readme.md).


## Step 4: Answering Questions

After questions are posted, answer them by replying to the Figma comments and/or updating the designs with what's missing.

> [!TIP]
> Resolving comments doesn't matter to this AI workflow. Resolved comments are still loaded for context and treated the same as unresolved comments.


## Step 5: Creating a Starter Story

In Jira, create a story with a link to the Figma page from the previous steps:

> TODO: Add image showing a Jira story with a Figma link in the description

Make sure to click __Save__. This will likely be enough to write out the details of the story.

> [!TIP]
> You can add additional context if that helps. The additional context will be incorporated into the story:
>
> The additional context can be:
> - text
> - links to Google Drive and/or Confluence pages
> - Parent Jira tickets
> - Blocker Jira tickets


## Step 6: Write the Story with your agent

Finally, ask your agent to write the story. Say something like:

```
Write the Jira story for <paste your Jira issue URL>
```

The agent will use the `write-jira-story` skill to:
1. Load the Jira story and all linked resources (Figma, Confluence, Google Docs, parent epic)
2. Download and analyze Figma frames
3. Run a scope analysis
4. Write a comprehensive story with User Story Statement, Acceptance Criteria (Gherkin), NFRs, and Developer Notes

The process will take 1-3 minutes depending on the number of Figma frames.

When complete, refresh the Jira story. You'll find a _very_ detailed story, complete with `Acceptance Criteria`:

> TODO: Add image showing the completed Jira story


> [!WARNING]
> If your feature is too big and needs to be broken up into multiple stories, checkout [Getting Started Building Epics and Stories from Figma](./anthropic-key-getting-started-building-epics-and-stories-from-figma.md)

> [!NOTE]
> If you want to automate the development of this feature, checkout [Cloud AI implements Figma and Jira](https://wiki.at.bitovi.com/wiki/spaces/AIEnabledDevelopment/pages/1517289538/Cascading+v2+Cloud+AI+implements+Figma+and+Jira)
