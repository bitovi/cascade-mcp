# Jira MCP Auth Bridge

<img width="256" alt="image" src="https://github.com/user-attachments/assets/25bf3e5e-390b-45e4-b5f5-dc8f38667547" />


Jira MCP Auth Bridge provides an MCP service that enables fetching images from a Jira work item.
Furthermore, it proxies Jira's authorization flow, enabling agents to be authorized through webpage redirects.

Jira already supports an [RPC service](https://www.atlassian.com/blog/announcements/remote-mcp-server).  However, it doesn't support all of Jira's capabilities. This is why we built this project.


## Use

### Copilot

In your project, create a `.vscode/mcp.json` file

> <img width="374" height="62" alt="Notification_Center" src="https://github.com/user-attachments/assets/03bfc108-097e-4481-948d-6c0ec948d728" />

Click the `Add Server...` button:

> <img width="999" height="484" alt="image" src="https://github.com/user-attachments/assets/c4ec1c76-2e2a-41d1-96e9-f02143c82254" />

Select the `HTTP` option:

> <img width="1293" height="534" alt="image" src="https://github.com/user-attachments/assets/9cc34977-1178-4a97-a4d7-0253a34d28bd" />

Paste the following URL and hit enter: `https://jira-mcp-auth-bridge.bitovi.com/mcp`

> <img width="867" height="130" alt="image" src="https://github.com/user-attachments/assets/38395afc-b03d-4aff-a7e3-9f74ed902563" />

Add `bitovi-jira-mcp` as the name and hit enter:

> <img width="866" height="124" alt="image" src="https://github.com/user-attachments/assets/6bb9be89-8521-48e1-97e5-8f0fc51b240f" />

You can use the following JSON too if the `Add Server` button did not work for you:

```json
{
    "servers": {
        "bitovi-jira-mcp": {
            "url": "https://jira-mcp-auth-bridge.bitovi.com/mcp"
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


