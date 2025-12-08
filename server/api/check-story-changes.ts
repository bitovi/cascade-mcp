import type { Request, Response } from 'express';
import { validateApiHeaders } from './api-error-helpers.js';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { getJiraIssue } from '../providers/atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown } from '../providers/atlassian/markdown-converter.js';
import { createLLMClient } from '../llm-client/provider-factory.js';

interface JiraIssueResponse {
  fields?: {
    parent?: { key?: string };
    description?: string | any;
  };
}

function convertDescriptionToText(description: any): string {
  if (!description) return '';

  if (typeof description === 'string') {
    return description;
  }

  if (typeof description === 'object') {
    try {
      return convertAdfToMarkdown(description);
    } catch (error) {
      console.error('Failed to convert ADF:', error);
      return JSON.stringify(description);
    }
  }

  return '';
}

export async function handleCheckStoryChanges(req: Request, res: Response) {
  try {
    const { epicKey, cloudId } = req.body;

    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return;

    const { atlassianToken } = tokens;

    const atlassianClient = createAtlassianClientWithPAT(atlassianToken);
    const generateText = createLLMClient();

    // Fetch child story
    const childResponse = await getJiraIssue(atlassianClient, cloudId, epicKey, undefined);
    if (!childResponse.ok) {
      throw new Error(`Error fetching issue ${epicKey}: ${childResponse.status} ${childResponse.statusText}`);
    }

    const childData = (await childResponse.json()) as JiraIssueResponse;
    const childDescription = convertDescriptionToText(childData.fields?.description);
    const parentKey = childData.fields?.parent?.key || '';

    // Fetch parent epic
    const parentResponse = await getJiraIssue(atlassianClient, cloudId, parentKey, undefined);
    if (!parentResponse.ok) {
      throw new Error(`Error fetching issue ${parentKey}: ${parentResponse.status} ${parentResponse.statusText}`);
    }

    const parentData = (await parentResponse.json()) as JiraIssueResponse;
    const parentDescription = convertDescriptionToText(parentData.fields?.description);

    // Compare descriptions with LLM
    const comparisonRequest = {
      parentKey,
      parentDescription,
      childKey: epicKey,
      childDescription,
      instructions: `Analyze these two Jira issue descriptions and identify any diverging points where the child story deviates from or adds information not present in the parent epic. Focus on:
1. Conflicting requirements or specifications
2. Additional features or details in the child not mentioned in the parent
3. Different interpretations or implementations
4. Missing context that should be aligned

Return your analysis in a structured JSON format:
{
  "hasDivergences": boolean,
  "divergences": [
    {
      "category": "conflict" | "addition" | "missing" | "interpretation",
      "description": "Clear description of the divergence",
      "childContext": "Relevant excerpt from child story",
      "parentContext": "Relevant excerpt from parent epic (or null if not applicable)"
    }
  ],
  "summary": "Brief summary of alignment status"
}`,
    };

    const llmResponse = await generateText({
      messages: [
        { role: 'system', content: JSON.stringify(comparisonRequest, null, 2) },
        {
          role: 'user',
          content:
            'You are a technical project analyst specializing in software requirements analysis. You will receive a JSON object with parent and child descriptions. Provide precise, actionable insights about requirement divergences. Return ONLY valid JSON without markdown code blocks.',
        },
      ],
      maxTokens: 4000,
    });

    let divergenceAnalysis;
    try {
      divergenceAnalysis = JSON.parse(llmResponse.text.trim());
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      divergenceAnalysis = {
        hasDivergences: null,
        divergences: [],
        summary: llmResponse.text,
        rawResponse: llmResponse.text,
      };
    }

    res.json({
      success: true,
      analysis: divergenceAnalysis,
      metadata: {
        parentKey,
        childKey: epicKey,
        tokensUsed: llmResponse.metadata?.usage?.totalTokens,
      },
    });
  } catch (error: any) {
    console.error('REST API: check-story-changes failed:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
