This project https://github.com/southleft/figma-console-mcp

has the ability to write to figma.


I'd like to add this ability to this project.

But, I'd like to make it work remote AND still have the ability to write.


I'd like you to think about how to make the auth flow work.


My initial thought is that in the figma plugin (which we would have to make), we'd generate a unique key. When they would connect with their MCP client, we'd add another auth option called "local figma" which would ask a user for that key.  We'd then match the figma plugin's websocket to the MCP connection, allowing bi-directional communication.


