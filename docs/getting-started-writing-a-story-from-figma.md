# Getting Started Writing Stories from Figma

> This is a work in progress. It should be done Feb 10th.

This guide will show how to take a Figma design and make Jira stories.

Specifically, we will show how to take these designs showing a `Like & Dislike` behavior on comments:

> <img width="1438" height="708" alt="image" src="https://github.com/user-attachments/assets/ec3caaa4-fca7-433c-a3ea-654d581d39ea" />

And show how to turn them into stories that look like:

> <img width="920" height="787" alt="image" src="https://github.com/user-attachments/assets/6186272c-c6cd-4762-8395-5bd7cec4bce3" />

There are 4 steps:

1. Preparing Figma
2. Asking clarifying questions with CascadeMCP
3. Answering questions posed by CascadeMCP
4. Creating a starter story that links to the Figma designs
5. Asking CascadeMCP to write the story



## Step 1: Preparing Figma

In order to build stories, CascadeMCP needs:

- To know which Figma frames to analyze
- To know what feature you want to build


### Selecting your frames to analyze

While there are a variety of ways to do select your frames to analyze, the easist way is to create a Figma `page` for each feature you'd like to make a story. For example, putting all the 
frames that show off the `Like & Dislike` in a single page:

> <img width="1460" height="928" alt="image" src="https://github.com/user-attachments/assets/45b81ae2-cad8-44d0-9f35-684029bb601f" />

By doing this, you can simply give the page link as context instead of having to link to a bunch of individual frames!


### Specifying the Scope

Next, is important to tell the AI agent what feature to focus on. For example, the `Like & Dislike` designs above show many other features that are not part of the story:

- Listing and viewing a _case_
- Listing and creating _comments_

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


## Step 4: Creating a Starter Story

In Jira, create a story with a link to the Figma page from the previous steps:

<img width="872" height="429" alt="image" src="https://github.com/user-attachments/assets/97103f71-d1fb-4d3d-82a9-48d42e75d5bd" />

Make sure to click __Save__. This will likely be enough to write out the details of the story.  

> [!TIP]
> You can add additional context if that helps. The additional context will be incorporated into story:
> <img width="871" height="486" alt="image" src="https://github.com/user-attachments/assets/0f8e081f-a5ae-449e-afe0-3b28a53c14ba" />
> 
> The additional context can be:
> - text, or
> - links to Google Drive and/or Confluence pages
> - Parent Jira tickets
> - Blocker Jira tickets

## Step 5: Write the Story with CascadeMCP

Finally, ask CascadeMCP to write a story. With the MiniMCP client, you need to select the `write-story` tool. And given a url for your story like: `https://bitovi.atlassian.net/browse/TF-102` you'll need to enter the __issueKey__ and __siteName__ like:

<img width="921" height="874" alt="image" src="https://github.com/user-attachments/assets/c95ae376-6469-4e31-907e-86bc4f38fe31" />

Click __Execute__. The process will take 1-2 minuites to complete.

When complete, refresh the Jira story. You'll find a _very_ detailed story, complete with `Acceptance Criteria`: 

> <img width="713" height="798" alt="image" src="https://github.com/user-attachments/assets/4216055a-243b-4c31-bc74-a17ae27abd2d" />


> [!WARNING]
> If your feature is too big and needs to be broken up into multiple stories, checkout [Getting Started Building Epics and Stories from Figma](./getting-started-building-epics-and-stories-from-figma.md)

> [!NOTE]
> If you want to automate the development of this feature, checkout [Cloud AI implements Figma and Jira](https://wiki.at.bitovi.com/wiki/spaces/AIEnabledDevelopment/pages/1517289538/Cascading+v2+Cloud+AI+implements+Figma+and+Jira)














