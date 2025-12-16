# Mini MCP Client

In this example, you'll use the mini MCP client hosted at [https://cascade.bitovi.com/](https://cascade.bitovi.com/) to:

- Verify the Figma connection works
- Verify the Jira connection works
- Analyze the scope of an epic with Figma links (needs an anthropic API key)

## Verify the Figma connection works

1. Go to [https://cascade.bitovi.com/](https://cascade.bitovi.com/)
2. Click `Connect`:
   > <img width="900" height="388" alt="CascadeMCP_Client" src="https://github.com/user-attachments/assets/0a0a3865-3757-4806-bee2-4268ef82ad66" />
3. Click `Connect Figma`
   > <img width="636" height="572" alt="image" src="https://github.com/user-attachments/assets/0e9d78f9-45a1-46e3-9f7e-d5acdee33a52" />
4. Authorize Cascade MCP to access your figma account.
5. Click `Done - Create Session`
   > <img width="634" height="529" alt="image" src="https://github.com/user-attachments/assets/77789fba-12c6-4f31-a1b4-03763b437836" />
6. Select the `figma-get-user` tool and click `Execute`:
   > <img width="862" height="480" alt="image" src="https://github.com/user-attachments/assets/a9cb30d8-b45e-4b5e-95b0-06b15532160e" />
7. If everything worked, you should see your account details in the result:
   > <img width="838" height="316" alt="image" src="https://github.com/user-attachments/assets/ed024639-1527-434b-a478-8ef6204c9f6e" />

## Verify the Atlassian connection works

Before starting, you might need to disconnect the current connection:

> <img width="830" height="277" alt="image" src="https://github.com/user-attachments/assets/28dc72e8-b809-4e67-94fb-955e2346a2a1" />

Then complete the following steps:

1. Go to [https://cascade.bitovi.com/](https://cascade.bitovi.com/)
2. Click `Connect`:
   > <img width="900" height="388" alt="CascadeMCP_Client" src="https://github.com/user-attachments/assets/0a0a3865-3757-4806-bee2-4268ef82ad66" />
3. Click `Connect Atlassian`
   > <img width="653" height="568" alt="Connect_Services_-_MCP_Bridge" src="https://github.com/user-attachments/assets/221e7a18-6735-4822-85a2-ce4573d0f483" />
4. Authorize Cascade MCP to access your Atlassian account.
5. Click `Done - Create Session`
   > <img width="640" height="527" alt="image" src="https://github.com/user-attachments/assets/4052035a-dee9-486e-81f7-327b0b9c98ca" />
6. Select the `atlassian-get-sites` tool and click `Execute`:
   > <img width="854" height="474" alt="image" src="https://github.com/user-attachments/assets/e0faf8ef-9f7e-4987-85f9-b830839eeaad" />
7. If everything worked, you should see your available sites in the result:
   > <img width="849" height="323" alt="image" src="https://github.com/user-attachments/assets/6995d9a3-09fb-4657-b697-7b3be8bc4bd8" />

## Analyze the Scope of an Epic

