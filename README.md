# Cascade MCP

<img width="60" height="60" alt="cascade-mcp" src="https://github.com/user-attachments/assets/79a3f9d3-d323-4948-a563-e6788b32cda9" align="left" /> Cascade MCP helps you analyze Figma, Google Docs and Confluence, and write Jira tickets with AI! This open source project provides a collection of MCP (Model Context Protocol) capabilities for [Bitovi's Cascading AI Enablement Initiative](https://wiki.at.bitovi.com/wiki/spaces/AIEnabledDevelopment/pages/1520435217/Cascading+AI+Delivery). 

<br />

<br clear="all" />

Checkout our introduction video to understand what it can do:

[![Watch the video](https://img.youtube.com/vi/MK0tdwDBTmc/0.jpg)](https://www.youtube.com/watch?v=MK0tdwDBTmc)

👉 Btw, Bitovi can help you integrate this into your own SDLC workflow: [AI for Software Teams](https://www.bitovi.com/ai-for-software-teams)

## Getting Started

Read our [Getting Started Writing a Story from Figma](./docs/getting-started-writing-a-story-from-figma.md) on how to set up your Figma designs and Jira story for best results.

Read our [Getting Started Building Epics and Stories from Figma](./docs/getting-started-building-epics-and-stories-from-figma.md) on how to set up your Figma designs and Jira story for best results.





## Supported Tools 

Supported tools at the `https://cascade.bitovi.com/mcp` endpoint:

**Combined Tools** (Multi-provider workflows):
- **[`analyze-feature-scope`](./server/providers/combined/tools/analyze-feature-scope/README.md)** - Generate scope analysis from Figma designs linked in a Jira epic (identifies features, establishes scope boundaries, surfaces questions before implementation)
- **[`write-shell-stories`](./server/providers/combined/tools/writing-shell-stories/README.md)** - Generate shell stories from Figma designs linked in a Jira epic (analyzes screens, downloads assets, creates prioritized user stories using AI)
- **[`write-epics-next-story`](./server/providers/combined/tools/write-next-story/README.md)** - Write the next Jira story from shell stories in an epic (validates dependencies, generates full story content, creates Jira issue with acceptance criteria)
- **[`review-work-item`](./server/providers/combined/tools/review-work-item/README.md)** - Review a Jira work item and generate questions identifying gaps, ambiguities, and missing information (posts review as Jira comment)

**Atlassian/Jira Tools**:
- **[`atlassian-get-sites`](./server/providers/atlassian/tools/atlassian-get-sites.md)** - Get list of accessible Atlassian sites for the authenticated user
- **[`atlassian-get-issue`](./server/providers/atlassian/tools/atlassian-get-issue.md)** - Retrieve complete details of a Jira issue by ID or key, including description, attachments, comments, and full field data
- **[`atlassian-get-attachments`](./server/providers/atlassian/tools/atlassian-get-attachments.md)** - Fetch Jira attachments by attachment ID (returns base64-encoded content)
- **[`atlassian-update-issue-description`](./server/providers/atlassian/tools/atlassian-update-issue-description.md)** - Update a Jira issue description with markdown content (automatically converted to ADF)
- **[`search`](./server/providers/atlassian/tools/atlassian-search.md)** - Search Jira issues using JQL (Jira Query Language) with standardized document format output
- **[`fetch`](./server/providers/atlassian/tools/atlassian-fetch.md)** - Fetch Jira issue details by issue key/ID in standardized document format (ChatGPT-compatible)

**Figma Tools**:
- **[`figma-get-user`](./server/providers/figma/tools/figma-get-user.md)** - Get information about the authenticated Figma user (test tool for OAuth validation)
- **[`figma-get-image-download`](./server/providers/figma/tools/figma-get-image-download.md)** - Download images from Figma design URLs (returns base64-encoded image and metadata)
- **[`figma-get-metadata-for-layer`](./server/providers/figma/tools/figma-get-metadata-for-layer.md)** - Get detailed metadata for a specific Figma layer including positioning and visual properties
- **[`figma-get-layers-for-page`](./server/providers/figma/tools/figma-get-layers-for-page.md)** - List all top-level layers from a Figma page with layer IDs, names, types, and download URLs

**Utility Tools**:
- **[`utility-test-sampling`](./server/providers/utility/tools/utility-test-sampling.md)** - Test sampling functionality by sending prompts to the agent and logging the interaction (enables testing of agent capabilities and inter-MCP tool communication)

Read the [REST API documentation](./docs/rest-api.md) for accessing these endpoints:

- `POST /api/analyze-feature-scope`
- `POST /api/write-shell-stories`
- `POST /api/write-next-story`

### LLM Client Support

The API supports 8 major LLM clients (Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, xAI). Users choose their LLM client and supply credentials via request headers.

See the **[LLM Provider Guide](./server/llm-client/README.md)** for complete documentation.


## Use

There are two main ways to use CascadeMCP:

- With the mini MCP client hosted at [https://cascade.bitovi.com/](https://cascade.bitovi.com/)
- With an MCP client that has sampling capabilities (like VSCode Copilot), shown below.
- With a Jira automation, shown [here](https://bitovi.atlassian.net/wiki/spaces/AIEnabledDevelopment/pages/1734148141/Jira+Automation+Setup).

If you're just trying to see it work, we recommend using the mini MCP client.

#### Prerequisites

If you want to do the story writing workflow, you'll need:

- Figma design(s) for some functionality that will need stories
- Access to a Jira instance. [Here's a video showing how to create a new Jira instance](https://www.youtube.com/watch?v=Wcv92pAlryk)
- A Jira epic with links to the figma designs and any additional context about what's in and out of scope for the epic


### Mini MCP Client

In this example, you'll use the mini MCP client hosted at [https://cascade.bitovi.com/](https://cascade-staging.bitovi.com/) to create stories from a Jira epic.

In order to use the mini MCP client, you'll need an Anthropic SDK API token. 

1. Go to [https://cascade.bitovi.com/](https://cascade-staging.bitovi.com/)
2. Enter your Anthropic SDK API (this isn't sent to the server, but if anyone asks you to share a key like this, make sure you give one you can delete after).
3. Click connect
4. Authorize Jira and Figma



### VSCode Copilot

In this example, we will use VSCode to connect to CascadeMCP and ask CascadeMCP to analyze some Figma images, write shell stories, and the write a story.

Before using the tool, you'll need the following:


- Visual Studio Code with Github Copilot [Download here](https://code.visualstudio.com/)


In your project, create a `.vscode/mcp.json` file

> <img width="374" height="62" alt="Notification_Center" src="https://github.com/user-attachments/assets/03bfc108-097e-4481-948d-6c0ec948d728" />

Click the `Add Server...` button:

> <img width="999" height="484" alt="image" src="https://github.com/user-attachments/assets/c4ec1c76-2e2a-41d1-96e9-f02143c82254" />

Select the `HTTP` option:

> <img width="1293" height="534" alt="image" src="https://github.com/user-attachments/assets/9cc34977-1178-4a97-a4d7-0253a34d28bd" />

Paste the following URL and hit enter: `https://cascade.bitovi.com/mcp`.
Then, add `cascade-mcp` as the name and hit enter.


You can use the following JSON too if the `Add Server` button did not work for you:

```json
{
    "servers": {
        "cascade-mcp": {
            "url": "https://cascade.bitovi.com/mcp"
        }
    }
}
```


This will kick off the authentication:

> <img width="259" height="230" alt="image" src="https://github.com/user-attachments/assets/9bbfb5f3-6a0d-433c-921d-970b352a4806" />

When complete, you should be able to set your copilot chat in Agent mode and ask the question:

> MCP: what tools do I have available?

This should tell you you have the Jira MCP tool available:

<img width="655" height="998" alt="image" src="https://github.com/user-attachments/assets/15f2600b-e9c8-49e2-9758-139d867a06c1" />


