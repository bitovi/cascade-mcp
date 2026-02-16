Problem: Joey clicked the Jira "write story" automation button twice because there was no immediate feedback, causing two identical jobs to run. He ended up with duplicate comments in Jira. This will definitely happen with training participants.

Action: Implement server-side throttling — reject duplicate requests within ~10 seconds of each other. Detect that a request is already in-flight for the same issue and block the second one.

Question: Can the Jira automation button itself be disabled/grayed out after clicking, or does that need to be handled entirely on the MCP server side?