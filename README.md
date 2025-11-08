# Cascading MCP Tools

<img width="600" height="600" alt="cascade-mcp" src="https://github.com/user-attachments/assets/79a3f9d3-d323-4948-a563-e6788b32cda9" />


Cascading MCP Tools provides a collection of MCP (Model Context Protocol) capabilities for [Bitovi's Cascading AI Enablement](https://bitovi.atlassian.net/wiki/spaces/AIEnabledDevelopment/pages/1523351554/Cascading+v1+Desktop+AI+implements+Figma+and+Jira). This service enables AI agents to work with design and project management tools through OAuth-authenticated integrations.



**Key Capabilities:**

- **Jira Integration**: Fetch issues, attachments, and images from Jira work items with full OAuth authentication
- **Figma Integration**: Access Figma designs, download images, and analyze screen layouts
- **Combined Tools**: Generate user stories from Figma designs and write them directly to Jira epics
- **Multi-Provider OAuth**: Seamless authentication flow supporting both Atlassian and Figma
- **Session Management**: Per-session MCP servers with dynamic tool registration based on user permissions

## Use

### Copilot

In your project, create a `.vscode/mcp.json` file

> <img width="374" height="62" alt="Notification_Center" src="https://github.com/user-attachments/assets/03bfc108-097e-4481-948d-6c0ec948d728" />

Click the `Add Server...` button:

> <img width="999" height="484" alt="image" src="https://github.com/user-attachments/assets/c4ec1c76-2e2a-41d1-96e9-f02143c82254" />

Select the `HTTP` option:

> <img width="1293" height="534" alt="image" src="https://github.com/user-attachments/assets/9cc34977-1178-4a97-a4d7-0253a34d28bd" />

Paste the following URL and hit enter: `https://cascade.bitovi.com/mcp`

> <img width="867" height="130" alt="image" src="https://github.com/user-attachments/assets/38395afc-b03d-4aff-a7e3-9f74ed902563" />

Add `cascade-mcp` as the name and hit enter:

> <img width="866" height="124" alt="image" src="https://github.com/user-attachments/assets/6bb9be89-8521-48e1-97e5-8f0fc51b240f" />

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


