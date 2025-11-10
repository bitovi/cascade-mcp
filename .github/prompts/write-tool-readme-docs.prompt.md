I'd like you to write documentation for the provided tool call.


Documentation for a tool call should exist next to the tool call.

If the tool has its own folder, the documentation should be the `README.md` in that folder.

If the tool has its own module, the documentation should share the name of the tool with a `.md` suffix like (`atlassian-fetch.md`).


The documentation should be linked from the root project `README.md` in its `Supported tools` list.  Make sure the description is still relevant.

Documentation for a tool should include:

## Quick Prompt (immediately after h1 title)
- A concise, copy-paste ready example that shows the most common usage
- Should demonstrate parameter extraction from natural language (e.g., using a Jira URL instead of separate epicKey/siteName)
- Format as a code block with "MCP call {tool-name} on {example}" pattern
- Example:
  ```markdown
  # tool-name
  
  Quick prompt:
  
  > ```
  > MCP call write-shell-stories on https://bitovi.atlassian.net/browse/PLAY-38 
  > ```
  ```

## Purpose
- Clear, concise description of what the tool does
- Primary use cases and scenarios
- What problem it solves

## API Reference
- **Parameters**: Name, type, required/optional, description, and valid values
- **Returns**: Structure and format of the response
- **Dependencies**: Required tool capabilities (e.g., sampling) or prerequisites

## Usage Examples
- **Natural language prompts**: 2-3 unambiguous example prompts that will almost always trigger this tool
- **Walkthrough**: Step-by-step guide through the core use case showing what happens
- **Setup requirements**: Prerequisites that must be in place before using this tool (e.g., "create an epic with Figma links and context")
- **Related tools**: Other tools commonly used in conjunction with this one

## Debugging & Limitations
- **Common user-facing errors**: Error messages users might see, with explanations and solutions (auth failures, invalid parameters, etc.)
- **Known limitations**: Scenarios where the tool might not work as expected or is not supported
- **Troubleshooting tips**: Common gotchas and how to avoid them
  - ⚠️ **User-focused only**: Tips should be actionable by typical MCP users (product managers, designers, non-developers)
  - ❌ **Avoid**: File system debugging, log inspection, temp directory manipulation, code-level troubleshooting
  - ✅ **Include**: Better prompts, input preparation, retry strategies, permission checks, account verification
