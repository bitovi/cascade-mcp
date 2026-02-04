# Getting Started Building Epics and Stories from Figma

This guide will show how to take a Figma design and make a Jira epic with multiple stories.

Use this approach when your feature is too large for a single story and needs to be broken into multiple implementation tasks.

Specifically, we will show how to take designs showing a `Tasks` page that can list, create, edit, and view tasks associated to a case:

> <img width="1918" height="987" alt="image" src="https://github.com/user-attachments/assets/7d1f76f1-99fd-437a-8b99-2812a3594eb9" />

And show how to turn them into an epic with shell stories:

> TODO: Add image showing a Jira epic with multiple shell stories (e.g., "List Tasks", "Create Task", "Edit Task", "View Task")

And then write each story in detail:

> TODO: Add image showing a fully written story within the epic

There are 7 steps:

1. Preparing Figma
2. Asking clarifying questions with CascadeMCP
3. Answering questions posed by CascadeMCP
4. Creating a starter epic that links to the Figma designs
5. Asking CascadeMCP to write shell stories
6. Reviewing and editing shell stories
7. Writing each story in detail



## Step 1: Preparing Figma

In order to build stories, CascadeMCP needs:

- To know which Figma frames to analyze
- To know what feature you want to build


### Selecting your frames to analyze

While there are a variety of ways to do select your frames to analyze, the easist way is to create a Figma `page` for each feature you'd like to make a story. For example, putting all the 
frames that show off the `Tasks` feature in a single page:

> TODO: Add image showing Tasks feature frames organized in a single Figma page

By doing this, you can simply give the page link as context instead of having to link to a bunch of individual frames!


### Specifying the Scope

Next, is important to tell the AI agent what feature to focus on. For example, the `Tasks` designs above show many other features that are not part of the epic:

- Viewing case details
- Navigation and layout components

To ensure the AI agent focuses on the right work, include a Note component named exactly `Note` (case-sensitive). Use it to clearly state what the story covers and what it excludes as follows:

> <img width="1756" height="1068" alt="image" src="https://github.com/user-attachments/assets/39de5041-ab45-40d3-baa4-1777960c7292" />

Additional `Note` components or Figma comments can also be added to detail the behavior. Notes and comments will be associated with the closest Figma frame.

> <img width="743" height="547" alt="image" src="https://github.com/user-attachments/assets/a2fbf47d-66a0-4564-b292-ffbce1950088" />


## Step 2: Ask clarifying questions with CascadeMCP

Even the most detailed Figma design - full of notes and comments - will leave a few behaviors under-specified. Calling CascadeMCP's [figma-review-design](../server/providers/figma/tools/figma-review-design/README.md) will analyze your Figma frames, and ask you questions as Figma comments about what it sees.  


> [!NOTE]
> There are multiple ways to call CascadeMCP tools. Any [MCP](https://modelcontextprotocol.io/) AI Agent with [Sampling](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling) (like Copilot) can be configured to call CascadeMCP. However, for these guides, we will be using the MiniMCP client hosted on Cascade's homepage: [https://cascade.bitovi.com/](https://cascade.bitovi.com/). You will need an [Anthropic API Key](https://platform.claude.com/settings/keys).

To call `figma-review-design`, you need to:

1. Enter an anthropic API key and click __Connect__:
   <img width="906" height="283" alt="image" src="https://github.com/user-attachments/assets/304f7910-5667-425b-b973-8e382f3d5122" />

2. You only need to connect to __Figma__, but it's best to also connect to __Atlassian__ now too:
   <img width="666" height="722" alt="image" src="https://github.com/user-attachments/assets/59630822-e7d0-49b6-b42f-7861324777d6" />

3. Once connected to Figma and Atlassian, click __Done - Create Session__:

   <img width="647" height="651" alt="image" src="https://github.com/user-attachments/assets/9e5884f2-ee9f-469f-a88a-5639fa6b0ea8" />

4. Select the `figma-review-design` tool:

   <img width="915" height="586" alt="image" src="https://github.com/user-attachments/assets/de311f8c-c4a5-435d-9551-c42164af344a" />

5. In Figma, copy the link to your Figma page by right clicking the page and selecting __Copy link to page__:

   <img width="393" height="349" alt="image" src="https://github.com/user-attachments/assets/3640b75c-f36b-4653-8e02-b47db949c449" />

6. Back in the MiniMCP client, __paste__ the link url between quotes (`"`) in the `figmaUrls` field:

   <img width="924" height="711" alt="image" src="https://github.com/user-attachments/assets/ee2dabce-1a32-4341-a557-7bf53039fedd" />

7. Finally, click __Execute__:

   <img width="916" height="640" alt="image" src="https://github.com/user-attachments/assets/a472dbd1-8436-492f-90cc-5825c6338064" />

Once it starts, you'll see the __Progress Log__ show the tools progress as it works.  

Once everything is done, check your Figma design, you should see comments with questions across your pages. Those questions will start with `Cascade🤖`. 

<img width="1078" height="821" alt="image" src="https://github.com/user-attachments/assets/8d2d70d5-cd93-46b3-85f7-026752b9608a" />


> [!NOTE]
> To understand more about how this works, please read [Frame Analysis Workflow](https://github.com/bitovi/cascade-mcp/blob/main/server/providers/figma/screen-analyses-workflow/readme.md).

## Step 3: Answering Questions

After you see the questions, answer them and/or update the designs with what's missing. You can answer the questions by simply replying to them. 

> [!TIP]
> Resolving comments doesn't matter to this AI workflow. Resolved comments are still loaded for context and treated the same as unresolved comments.


## Step 4: Creating a Starter Epic

In Jira, create an **Epic** (not a Story) with a link to the Figma page from the previous steps:

> TODO: Add image showing creating a Jira epic with a Figma link in the description

Make sure to click __Save__. 

> [!TIP]
> You can add additional context if that helps. The additional context will be incorporated into all stories:
> 
> The additional context can be:
> - text describing the feature
> - links to Google Drive and/or Confluence pages with requirements
> - technical constraints or implementation notes


## Step 5: Write Shell Stories with CascadeMCP

Now ask CascadeMCP to analyze the epic and create "shell stories" - placeholder stories that outline the work to be done.

With the MiniMCP client, select the `write-shell-stories` tool. Given a url for your epic like: `https://bitovi.atlassian.net/browse/TF-100` you'll need to enter the __issueKey__ and __siteName__ like:

> TODO: Add image showing the write-shell-stories tool with issueKey and siteName filled in

Click __Execute__. The process will analyze your Figma designs and create multiple shell stories under your epic.

When complete, refresh the Jira epic. You'll find child stories have been created, each with:
- A descriptive title
- A brief summary of what the story covers
- Links back to the relevant Figma frames

> TODO: Add image showing the epic with shell stories created underneath it

> [!NOTE]
> Shell stories are intentionally brief. They define the scope and boundaries of each story, but don't contain full acceptance criteria yet. This allows you to review and adjust the breakdown before investing time in detailed specifications.


## Step 6: Reviewing and Editing Shell Stories

Before writing the full details, review the shell stories:

1. **Check the breakdown makes sense** - Are stories appropriately sized? Should any be combined or split further?

2. **Verify dependencies** - Are the stories in a logical order? Does each story build on previous work appropriately?

3. **Add clarifying notes** - If a shell story needs more context, edit it in Jira to add notes that will guide the detailed writing.

4. **Answer any questions** - Shell stories may include questions from CascadeMCP. Answer these directly in the story description or in Figma comments.

> TODO: Add image showing a shell story being edited in Jira

> [!TIP]
> You can delete, rename, or reorder shell stories before writing them in detail. CascadeMCP will work with whatever stories exist under the epic.


## Step 7: Writing Each Story in Detail

Once you're satisfied with the shell story breakdown, write each story in detail using the `write-next-story` tool.

With the MiniMCP client, select the `write-next-story` tool. Enter the same __issueKey__ (the epic) and __siteName__:

> TODO: Add image showing the write-next-story tool configuration

Click __Execute__. CascadeMCP will:
1. Find the first unwritten shell story under the epic
2. Analyze the relevant Figma frames
3. Write detailed acceptance criteria and specifications
4. Update the story in Jira

When complete, refresh Jira to see the fully written story:

> TODO: Add image showing a fully written story with acceptance criteria

### Writing Additional Stories

Repeat this process for each story. Simply run `write-next-story` again with the same epic - it will automatically find and write the next unwritten story.

> TODO: Add image showing progress through multiple stories (some written, some still shells)

> [!TIP]
> You can review and edit each story after it's written before moving to the next. This lets you course-correct if needed.

### When All Stories Are Written

Once all shell stories have been written in detail, running `write-next-story` will indicate there are no more stories to write. Your epic is now fully specified and ready for development!

> TODO: Add image showing a completed epic with all stories written


## Summary

| Step | Tool | Result |
|------|------|--------|
| 1-3 | Prepare Figma | Designs ready with scope notes and answered questions |
| 4 | Manual | Epic created in Jira with Figma link |
| 5 | `write-shell-stories` | Shell stories created under epic |
| 6 | Manual | Shell stories reviewed and adjusted |
| 7 | `write-next-story` (repeated) | Each story written in detail |

> [!NOTE]
> If you have a small feature that only needs one story, see [Getting Started Writing a Story from Figma](./getting-started-writing-a-story-from-figma.md) instead. 
