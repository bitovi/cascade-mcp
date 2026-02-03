# Getting Started Writing Stories from Figma

> This is a work in progress. It should be done Feb 10th.

This guide will show how to take a Figma design and make Jira stories.

Specifically, we will show how to take these designs showing a `Like & Dislike` behavior on comments:

> <img width="1438" height="708" alt="image" src="https://github.com/user-attachments/assets/ec3caaa4-fca7-433c-a3ea-654d581d39ea" />

And show how to turn them into stories that look like:

> <img width="920" height="787" alt="image" src="https://github.com/user-attachments/assets/6186272c-c6cd-4762-8395-5bd7cec4bce3" />


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

To ensure the AI agent focuses on the right work, include a Note component named exactly Note (case-sensitive). Use it to clearly state what the story covers and what it excludes as follows:

> <img width="1756" height="1068" alt="image" src="https://github.com/user-attachments/assets/39de5041-ab45-40d3-baa4-1777960c7292" />

Additional Note components or comments can also be added to detail the behavior. Notes and comments will be associated with the Figma frame they are closest to.

> SHOW ADDING A COMMENT OR NOTE


## Step 2: Have the AI ask clarifying questions

Even the most detailed Figma design, full of notes and comments, will leave a few behaviors under-specified. 



