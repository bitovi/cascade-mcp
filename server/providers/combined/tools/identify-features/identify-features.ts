/**
 * MCP Tool Handler for Identify Features
 * 
 * Analyzes Figma screen designs to identify in-scope features, out-of-scope features,
 * and questions, grouped by feature areas.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createProgressNotifier } from '../writing-shell-stories/progress-notifier.js';
import { executeIdentifyFeatures } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface IdentifyFeaturesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the identify-features tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerIdentifyFeaturesTool(mcp: McpServer): void {
  mcp.registerTool(
    'identify-features',
    {
      title: 'Identify Features from Figma',
      description: 'Analyze Figma screens in a Jira epic to identify in-scope features, out-of-scope features, and questions, grouped by feature areas with workflow-based organization. Creates a Scope Analysis section in the epic.',
      inputSchema: {
        epicKey: z.string()
          .describe('Jira epic key (e.g., "PROJ-123"). Epic description must contain Figma design URLs.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('Jira site subdomain (e.g., "bitovi" from https://bitovi.atlassian.net). Alternative to cloudId.'),
      },
    },
    async ({ epicKey, cloudId, siteName }: IdentifyFeaturesParams, context) => {
      console.log('identify-features called', { epicKey, cloudId, siteName });

      // Get auth info for both Atlassian and Figma
      const authInfo = getAuthInfoSafe(context, 'identify-features');
      
      // Extract tokens
      const atlassianToken = authInfo?.atlassian?.access_token;
      const figmaToken = authInfo?.figma?.access_token;
      
      console.log('  Extracted tokens:', {
        hasAtlassianToken: !!atlassianToken,
        hasFigmaToken: !!figmaToken,
      });
      
      // Debug Figma token details
      if (figmaToken) {
        console.log('  Figma token details:', {
          length: figmaToken.length,
          prefix: figmaToken.substring(0, 10),
          type: figmaToken.startsWith('figu_') ? 'OAuth' : figmaToken.startsWith('figd_') ? 'PAT' : 'Unknown',
          scope: authInfo?.figma?.scope,
          expiresAt: authInfo?.figma?.expires_at 
            ? new Date(authInfo.figma.expires_at * 1000).toISOString() 
            : 'no expiry',
        });
      }
      
      if (!atlassianToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found. Please authenticate with Atlassian first.',
            },
          ],
        };
      }
      
      if (!figmaToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Figma access token found. Please authenticate with Figma first.',
            },
          ],
        };
      }

      try {
        // Create API clients with tokens
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = createFigmaClient(figmaToken);
        const generateText = createMcpLLMClient(context);
        const notify = createProgressNotifier(context, 6); // 6 phases total
        
        // Get sessionId from auth context (used for deterministic directory naming)
        const sessionId = authInfo.sessionId || 'default';
        
        // Execute core logic
        const result = await executeIdentifyFeatures(
          {
            epicKey,
            cloudId,
            siteName,
            sessionId
          },
          {
            atlassianClient,
            figmaClient,
            generateText,
            notify
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: `# Feature Identification Complete ✅

**Epic**: ${epicKey}
**Feature Areas**: ${result.featureAreasCount}
**Questions**: ${result.questionsCount}
**Screens Analyzed**: ${result.screensAnalyzed}

## Scope Analysis

${result.scopeAnalysisContent}

---

**Debug Artifacts**: ${result.tempDirPath}
- \`scope-analysis.md\` - Generated scope analysis
- \`scope-analysis-prompt.md\` - Prompt sent to AI
- \`screens.yaml\` - Screen ordering
- \`*.analysis.md\` - Individual screen analyses

**Next Steps**:
1. Review the scope analysis in the Jira epic
2. Answer any questions listed
3. Update epic description with clarifications if needed
4. Use \`write-shell-stories\` tool to generate detailed stories based on finalized scope
`
            }
          ]
        };
      } catch (error: any) {
        console.error('identify-features failed:', error);
        return {
          content: [
            {
              type: 'text',
              text: `# Feature Identification Failed ❌\n\n**Error**: ${error.message}\n\n**Details**: ${error.stack || 'No stack trace available'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
