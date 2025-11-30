# Cascading MCP Tools

<img width="600" height="600" alt="cascade-mcp" src="https://github.com/user-attachments/assets/79a3f9d3-d323-4948-a563-e6788b32cda9" />


Cascading MCP Tools provides a collection of MCP (Model Context Protocol) capabilities for [Bitovi's Cascading AI Enablement](https://bitovi.atlassian.net/wiki/spaces/AIEnabledDevelopment/pages/1520435217/Cascading+AI+Delivery). This service enables AI agents to work with design and project management tools through OAuth-authenticated integrations. It also exposes some tools as direct API calls for non-agents to call (ex: Jira automations).

Supported tools at the `https://cascade.bitovi.com/mcp` endpoint:

**Combined Tools** (Multi-provider workflows):
- **[`analyze-feature-scope`](./server/providers/combined/tools/analyze-feature-scope/README.md)** - Generate scope analysis from Figma designs linked in a Jira epic (identifies features, establishes scope boundaries, surfaces questions before implementation)
- **[`write-shell-stories`](./server/providers/combined/tools/writing-shell-stories/README.md)** - Generate shell stories from Figma designs linked in a Jira epic (analyzes screens, downloads assets, creates prioritized user stories using AI)
- **[`write-epics-next-story`](./server/providers/combined/tools/write-next-story/README.md)** - Write the next Jira story from shell stories in an epic (validates dependencies, generates full story content, creates Jira issue with acceptance criteria)

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

Read the [documentation](./docs/rest-api.md) on accessing the following REST apis:

- `POST /api/analyze-feature-scope`
- `POST /api/write-shell-stories`
- `POST /api/write-next-story`


## Use

### Copilot

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


