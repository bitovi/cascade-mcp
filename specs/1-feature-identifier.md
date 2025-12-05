# Identify Features Tool - Implementation Plan

## Overview

The **identify-features** tool analyzes Figma screen designs to generate a scope analysis document. It identifies which features are in-scope (✅), out-of-scope (❌), and surfaces questions (❓) about ambiguities, grouped by feature areas with relevant Figma links.

**Core Purpose**: Create a scope analysis document before generating shell stories to establish clear boundaries and identify questions early in the development process.

## Problem Statement

Before creating detailed shell stories, teams need:

1. **Clear Scope Definition**: What's included vs. excluded from the current work
2. **Feature Grouping**: Logical organization of functionality by feature area
3. **Early Question Surfacing**: Identify ambiguities and unknowns before detailed planning
4. **Traceability**: Link features back to specific Figma screens

Currently, scope questions and out-of-scope features are mixed into shell stories, making it harder to have focused scope discussions.

## Solution Architecture

### Tool Flow

```
Epic with Figma Links
         ↓
[Phase 1-3: Setup & Figma Screen Extraction]
         ↓
[Phase 4: Screen Analysis with AI]
         ↓
[Phase 5: Feature Identification & Grouping]
         ↓
Scope Analysis Document
         ↓
[Phase 6: Update Jira Epic]
```

### Output Format

```markdown
## Scope Analysis

### {Feature Area Name}

[Login Screen](https://figma.com/...) [Profile Screen](https://figma.com/...)

- ✅ Email/password authentication
- ✅ Login button with validation
- ❌ OAuth providers (Google, GitHub)
- ❌ Multi-factor authentication
- ❓ Should "Remember Me" persist across browser sessions?
- ❓ What is the password reset flow?

### User Profile Management

[Profile Settings](https://figma.com/...)

- ✅ Display user name and email
- ✅ Edit profile form
- ✅ Avatar upload
- ❌ Password change functionality
- ❓ What image formats are supported for avatars?
- ❓ Maximum file size for uploads?

### Remaining Questions

- ❓ What is the overall error handling strategy?
- ❓ Are there any accessibility requirements?
- ❓ What browsers need to be supported?
```

## Implementation Plan

### Step 1: Create Tool Structure

**Goal**: Set up the basic file structure following the write-shell-stories pattern.

**Files to Create**:
- `server/providers/combined/tools/identify-features/`
  - `index.ts` - Tool registration export
  - `identify-features.ts` - MCP tool handler
  - `core-logic.ts` - Business logic (similar to write-shell-stories)
  - `prompt-feature-identification.ts` - AI prompt for feature identification

**Files to Modify**:
- `server/providers/combined/combined-provider.ts` - Register new tool

**Core Structure** (in `identify-features.ts`):
```typescript
export function registerIdentifyFeaturesTool(server: Server, provider: CombinedProvider) {
  server.addTool({
    name: 'identify-features',
    description: 'Analyze Figma screens to identify in-scope and out-of-scope features grouped by feature areas',
    inputSchema: {
      type: 'object',
      properties: {
        epicKey: {
          type: 'string',
          description: 'The Jira epic key (e.g., "PROJ-123")'
        }
      },
      required: ['epicKey']
    }
  }, async (args, context) => {
    // Handler implementation
  });
}
```

**Validation**:
- [ ] Tool appears in MCP tool list
- [ ] Tool can be invoked (even if it returns placeholder response)
- [ ] Tool handler receives correct parameters
- [ ] Console logging shows tool execution

---

### Step 2: Reuse Phases 1-4 from Write-Shell-Stories

**Goal**: Leverage existing screen analysis infrastructure to get analyzed screen data.

**Strategy**: Extract reusable functions from write-shell-stories and share them.

**Files to Create/Modify**:
- `server/providers/combined/tools/shared/`
  - `screen-analysis-pipeline.ts` - Shared functions for phases 1-4

**Shared Functions to Extract**:
```typescript
/**
 * Execute phases 1-4: Setup, Figma extraction, and screen analysis
 * 
 * @returns Analysis results with screens, analyses, epic context, etc.
 */
export interface ScreenAnalysisResult {
  screens: Array<{ name: string; url: string; notes: string[] }>;
  tempDirPath: string;
  yamlPath: string;
  epicContext: string;
  contentWithoutScopeAnalysis: ADFNode[];
  cloudId: string;
  siteName: string;
  analyzedScreens: number;
}

export async function executeScreenAnalysisPipeline(
  params: {
    epicKey: string;
    cloudId?: string;
    siteName?: string;
    sessionId?: string;
    sectionName?: string; // e.g., "Shell Stories" or "Scope Analysis"
  },
  deps: ToolDependencies
): Promise<ScreenAnalysisResult>;
```

**Refactoring Approach**:
1. Create shared module with phases 1-4 logic
2. Update `write-shell-stories/core-logic.ts` to use shared function
3. Update `identify-features/core-logic.ts` to use shared function
4. Both tools now reuse the same screen analysis pipeline

**Validation**:
- [ ] Write-shell-stories still works exactly as before (no regressions)
- [ ] Identify-features can execute phases 1-4 successfully
- [ ] Both tools produce identical temp directory artifacts (screens.yaml, *.analysis.md)
- [ ] Both tools extract same epic context
- [ ] Console logs show phases 1-4 executing

---

### Step 3: Create Feature Identification Prompt

**Goal**: Design AI prompt that groups features by area and categorizes them as in-scope, out-of-scope, or questions.

**Files to Create**:
- `server/providers/combined/tools/identify-features/prompt-feature-identification.ts`

**Prompt Structure**:
```typescript
export const FEATURE_IDENTIFICATION_SYSTEM_PROMPT = `You are an expert product analyst identifying and categorizing features from Figma screen analyses.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every feature (✅ ✓ ❌ ❓) MUST reference actual UI elements or functionality explicitly described in screen analyses
- Do NOT infer, assume, or speculate about features not shown in the screens
- If a UI element is visible but its purpose/behavior is unclear, list it as a ❓ question

CATEGORIZATION RULES:
- ✅ In-Scope: Features with complete UI and clear implementation path based on analyses
- ❌ Out-of-Scope: Features mentioned in epic context as deferred, or UI elements marked as future/optional
- ❓ Questions: Ambiguous behaviors, unclear requirements, or missing information

GROUPING RULES:
- Group features into logical feature areas (e.g., "Authentication", "User Profile", "Data Management")
- Each feature area must list relevant Figma screen links
- A screen may appear in multiple feature areas if it contains multiple types of functionality
- Create "Remaining Questions" section for cross-cutting or general questions

OUTPUT REQUIREMENT:
- Output ONLY the markdown scope analysis in the specified format
- Do NOT include explanations, prefaces, or process notes`;

export const FEATURE_IDENTIFICATION_MAX_TOKENS = 8000;

export function generateFeatureIdentificationPrompt(
  screensYaml: string,
  analysisFiles: Array<{ screenName: string; content: string; url: string }>,
  epicContext?: string
): string {
  // Build epic context section
  const epicContextSection = epicContext?.trim()
    ? `## EPIC CONTEXT

${epicContext}

Use epic context to understand:
- Project goals and priorities
- Features explicitly marked as out-of-scope or deferred
- Business constraints and requirements
`
    : '';

  // Build analysis section with URLs
  const analysisSection = analysisFiles
    .map(({ screenName, content, url }) => {
      return `### ${screenName}

**Figma URL**: ${url}

${content}`;
    })
    .join('\n\n---\n\n');

  return `You are analyzing Figma screen designs to identify and categorize features.

## GOAL

Produce a scope analysis document that:
- Groups features into logical feature areas
- Categorizes each feature as in-scope (✅), out-of-scope (❌), or a question (❓)
- Links each feature area to relevant Figma screens
- Surfaces all ambiguities and questions

## INPUTS

${epicContextSection}
## SCREEN ORDERING

\`\`\`yaml
${screensYaml}
\`\`\`

## SCREEN ANALYSES

${analysisSection}

## INSTRUCTIONS

**Step 1: Review all screen analyses**
- Read through each analysis file completely
- Note all UI elements, features, and behaviors described
- Pay attention to notes about deferred/future features

**Step 2: Identify feature areas**
- Group related functionality into logical areas (e.g., "Authentication", "Dashboard", "Settings")
- Aim for 3-8 feature areas (not too granular, not too broad)
- Each area should represent a cohesive set of related features

**Step 3: Categorize features within each area**
- ✅ In-Scope: UI is present, behavior is clear, ready to implement
- ❌ Out-of-Scope: Explicitly deferred in epic context, or marked as future in analyses
- ❓ Questions: Behavior unclear, requirements ambiguous, or information missing

**Step 4: Link screens to feature areas**
- For each feature area, list all Figma screen URLs that contain related UI
- Use markdown link format: [Screen Name](url)

**Step 5: Collect remaining questions**
- List any cross-cutting concerns or general questions not specific to one area
- Include questions about error handling, accessibility, browser support, etc.

## OUTPUT FORMAT

\`\`\`markdown
## Scope Analysis

### {Feature Area Name}

[Screen Name](figma-url) [Another Screen](figma-url)

- ✅ {In-scope feature description}
- ✅ {Another in-scope feature}
- ❌ {Out-of-scope feature description}
- ❌ {Another out-of-scope feature}
- ❓ {Question about this area}
- ❓ {Another question}

### {Second Feature Area Name}

[Screen Name](figma-url)

- ✅ {In-scope feature description}
- ❌ {Out-of-scope feature description}
- ❓ {Question about this area}

### Remaining Questions

- ❓ {General question not specific to one area}
- ❓ {Another general question}
\`\`\`

**CRITICAL**: Output ONLY the markdown above. No prefaces, explanations, or additional text.
`;
}
```

**Validation**:
- [ ] Prompt compiles without errors
- [ ] Prompt includes all necessary context (screens, analyses, epic context)
- [ ] Prompt clearly defines categorization rules
- [ ] Prompt specifies exact output format

---

### Step 4: Implement Core Feature Identification Logic

**Goal**: Create the business logic to generate scope analysis from screen analyses.

**Files to Create**:
- `server/providers/combined/tools/identify-features/core-logic.ts`

**Core Function**:
```typescript
export interface ExecuteIdentifyFeaturesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

export interface ExecuteIdentifyFeaturesResult {
  success: boolean;
  scopeAnalysisContent: string;
  featureAreasCount: number;
  questionsCount: number;
  screensAnalyzed: number;
  tempDirPath: string;
}

export async function executeIdentifyFeatures(
  params: ExecuteIdentifyFeaturesParams,
  deps: ToolDependencies
): Promise<ExecuteIdentifyFeaturesResult> {
  const { epicKey, cloudId, siteName, sessionId = 'default' } = params;
  const { atlassianClient, figmaClient, generateText, notify } = deps;
  
  console.log('executeIdentifyFeatures called', { epicKey });
  console.log('  Starting feature identification for epic:', epicKey);

  // ==========================================
  // PHASE 1-4: Reuse screen analysis pipeline
  // ==========================================
  const analysisResult = await executeScreenAnalysisPipeline(
    { epicKey, cloudId, siteName, sessionId, sectionName: 'Scope Analysis' },
    deps
  );
  
  const {
    screens,
    tempDirPath,
    yamlPath,
    epicContext,
    contentWithoutScopeAnalysis,
    cloudId: resolvedCloudId,
    siteName: resolvedSiteName,
    analyzedScreens
  } = analysisResult;

  // ==========================================
  // PHASE 5: Generate feature identification
  // ==========================================
  console.log('  Phase 5: Generating scope analysis...');
  await notify('📝 Feature Identification: Analyzing features and scope...');
  
  const scopeAnalysisResult = await generateScopeAnalysis({
    generateText,
    screens,
    tempDirPath,
    yamlPath,
    notify,
    epicContext
  });

  // ==========================================
  // PHASE 6: Update Jira epic with scope analysis
  // ==========================================
  await updateEpicWithScopeAnalysis({
    epicKey,
    cloudId: resolvedCloudId,
    atlassianClient,
    scopeAnalysisMarkdown: scopeAnalysisResult.scopeAnalysisContent,
    contentWithoutScopeAnalysis,
    notify
  });

  return {
    success: true,
    scopeAnalysisContent: scopeAnalysisResult.scopeAnalysisContent,
    featureAreasCount: scopeAnalysisResult.featureAreasCount,
    questionsCount: scopeAnalysisResult.questionsCount,
    screensAnalyzed: analyzedScreens,
    tempDirPath
  };
}
```

**Helper Function for Phase 5**:
```typescript
async function generateScopeAnalysis(params: {
  generateText: ToolDependencies['generateText'];
  screens: Array<{ name: string; url: string; notes: string[] }>;
  tempDirPath: string;
  yamlPath: string;
  notify: ToolDependencies['notify'];
  epicContext?: string;
}): Promise<{
  scopeAnalysisContent: string;
  featureAreasCount: number;
  questionsCount: number;
  scopeAnalysisPath: string;
}> {
  const { generateText, screens, tempDirPath, yamlPath, notify, epicContext } = params;
  
  // Read screens.yaml
  const screensYamlContent = await fs.readFile(yamlPath, 'utf-8');
  
  // Read all analysis files with URLs
  const analysisFiles: Array<{ screenName: string; content: string; url: string }> = [];
  for (const screen of screens) {
    const analysisPath = path.join(tempDirPath, `${screen.name}.analysis.md`);
    const content = await fs.readFile(analysisPath, 'utf-8');
    analysisFiles.push({ 
      screenName: screen.name, 
      content,
      url: screen.url 
    });
  }
  
  // Generate prompt
  const prompt = generateFeatureIdentificationPrompt(
    screensYamlContent,
    analysisFiles,
    epicContext
  );
  
  // Save prompt for debugging
  const promptPath = path.join(tempDirPath, 'scope-analysis-prompt.md');
  await fs.writeFile(promptPath, prompt, 'utf-8');
  
  // Call AI
  console.log('    🤖 Requesting scope analysis from AI...');
  const response = await generateText({
    systemPrompt: FEATURE_IDENTIFICATION_SYSTEM_PROMPT,
    prompt,
    maxTokens: FEATURE_IDENTIFICATION_MAX_TOKENS
  });
  
  const scopeAnalysisText = response.text;
  
  if (!scopeAnalysisText) {
    throw new Error('No scope analysis content received from AI');
  }
  
  console.log(`    ✅ Scope analysis generated (${scopeAnalysisText.length} characters)`);
  
  // Save scope analysis
  const scopeAnalysisPath = path.join(tempDirPath, 'scope-analysis.md');
  await fs.writeFile(scopeAnalysisPath, scopeAnalysisText, 'utf-8');
  
  // Count feature areas and questions
  const featureAreaMatches = scopeAnalysisText.match(/^### .+$/gm);
  const featureAreasCount = featureAreaMatches 
    ? featureAreaMatches.filter(m => !m.includes('Remaining Questions')).length 
    : 0;
  
  const questionMatches = scopeAnalysisText.match(/^- ❓/gm);
  const questionsCount = questionMatches ? questionMatches.length : 0;
  
  await notify(`✅ Feature Identification Complete: ${featureAreasCount} areas, ${questionsCount} questions`);
  
  return {
    scopeAnalysisContent: scopeAnalysisText,
    featureAreasCount,
    questionsCount,
    scopeAnalysisPath
  };
}
```

**Validation**:
- [ ] Function reads all analysis files successfully
- [ ] Function generates prompt with correct structure
- [ ] AI returns scope analysis in expected format
- [ ] Feature areas and questions are counted correctly
- [ ] Temp directory contains `scope-analysis.md` and `scope-analysis-prompt.md`
- [ ] Console logs show progress through phases

---

### Step 5: Implement Jira Epic Update

**Goal**: Update the Jira epic description with the generated scope analysis.

**Implementation** (in `core-logic.ts`):
```typescript
async function updateEpicWithScopeAnalysis({
  epicKey,
  cloudId,
  atlassianClient,
  scopeAnalysisMarkdown,
  contentWithoutScopeAnalysis,
  notify
}: {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  scopeAnalysisMarkdown: string;
  contentWithoutScopeAnalysis: ADFNode[];
  notify: ToolDependencies['notify'];
}): Promise<void> {
  console.log('  Phase 6: Updating epic with scope analysis...');

  try {
    // Prepare scope analysis section
    const scopeAnalysisSection = `## Scope Analysis\n\n${scopeAnalysisMarkdown}`;
    
    // Convert to ADF
    console.log('    Converting scope analysis to ADF...');
    const scopeAnalysisAdf = await convertMarkdownToAdf(scopeAnalysisSection);
    
    if (!validateAdf(scopeAnalysisAdf)) {
      console.log('    ⚠️ Failed to convert scope analysis to valid ADF');
      await notify('⚠️ Failed to convert scope analysis to ADF');
      return;
    }
    
    console.log('    ✅ Scope analysis converted to ADF');
    
    // Combine with existing content
    const updatedDescription: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        ...contentWithoutScopeAnalysis,
        ...scopeAnalysisAdf.content
      ]
    };
    
    // Update the epic
    console.log('    Updating epic description...');
    const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
    
    const updateResponse = await atlassianClient.fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          description: updatedDescription
        }
      }),
    });
    
    handleJiraAuthError(updateResponse, `Update epic ${epicKey} description`);
    
    console.log('    ✅ Epic description updated successfully');
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`);
  }
}
```

**Key Consideration**: The function must strip any existing "Scope Analysis" section from the epic description before adding the new one (similar to how write-shell-stories handles "Shell Stories" section).

**Validation**:
- [ ] Epic description is updated successfully
- [ ] Old "Scope Analysis" section is removed if it exists
- [ ] New section is properly formatted in Jira
- [ ] Figma links in scope analysis are clickable
- [ ] Emoji icons (✅ ❌ ❓) render correctly in Jira
- [ ] Error handling works for 404/403 responses

---

### Step 6: Wire Up MCP Tool Handler

**Goal**: Connect the core logic to the MCP tool interface.

**Files to Modify**:
- `server/providers/combined/tools/identify-features/identify-features.ts`

**Implementation**:
```typescript
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CombinedProvider } from '../../combined-provider.js';
import { executeIdentifyFeatures } from './core-logic.js';
import { withAuthContext } from '../../../mcp-core/auth-helpers.js';

export function registerIdentifyFeaturesTool(server: Server, provider: CombinedProvider) {
  server.addTool(
    {
      name: 'identify-features',
      description: 'Analyze Figma screens in a Jira epic to identify in-scope features, out-of-scope features, and questions, grouped by feature areas',
      inputSchema: {
        type: 'object',
        properties: {
          epicKey: {
            type: 'string',
            description: 'The Jira epic key (e.g., "PROJ-123")'
          },
          cloudId: {
            type: 'string',
            description: 'Optional: Specific Atlassian cloud ID to use. If not provided, uses accessible-sites to find it.'
          },
          siteName: {
            type: 'string',
            description: 'Optional: Friendly site name for lookup (e.g., "bitovi"). Alternative to cloudId.'
          }
        },
        required: ['epicKey']
      }
    },
    async (args, context) => {
      console.log('identify-features tool called', args);
      
      const { epicKey, cloudId, siteName } = args as {
        epicKey: string;
        cloudId?: string;
        siteName?: string;
      };

      return withAuthContext(context, 'identify-features', async (atlassianClient, figmaClient) => {
        const result = await executeIdentifyFeatures(
          { epicKey, cloudId, siteName },
          {
            atlassianClient,
            figmaClient,
            generateText: provider.generateText.bind(provider),
            notify: provider.createNotifier(context)
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
      });
    }
  );
}
```

**Files to Modify**:
- `server/providers/combined/combined-provider.ts` - Import and register tool

```typescript
// Add import
import { registerIdentifyFeaturesTool } from './tools/identify-features/index.js';

// In registerTools() method
registerIdentifyFeaturesTool(server, this);
```

**Validation**:
- [ ] Tool appears in `mcp list-tools` output
- [ ] Tool can be invoked via MCP client (VS Code Copilot)
- [ ] Tool returns formatted response with counts and analysis
- [ ] Tool handles errors gracefully (invalid epic key, missing Figma links, etc.)
- [ ] Progress notifications appear during execution

---

### Step 7: Create REST API Endpoint

**Goal**: Expose identify-features functionality via REST API for direct HTTP access.

**Files to Create**:
- `server/api/identify-features.ts`

**Implementation**:
```typescript
import type { Request, Response } from 'express';
import { executeIdentifyFeatures } from '../providers/combined/tools/identify-features/core-logic.js';
import { 
  createToolDependencies,
  handleApiError,
  validateRequiredFields 
} from './api-error-helpers.js';

export async function handleIdentifyFeatures(req: Request, res: Response): Promise<void> {
  console.log('POST /api/identify-features called');
  
  try {
    // Validate required fields
    const { epicKey } = req.body;
    validateRequiredFields({ epicKey }, ['epicKey']);
    
    const { cloudId, siteName } = req.body;
    
    // Create dependencies from request context
    const deps = createToolDependencies(req);
    
    // Execute core logic
    const result = await executeIdentifyFeatures(
      { epicKey, cloudId, siteName },
      deps
    );
    
    // Return result
    res.json({
      success: result.success,
      scopeAnalysis: result.scopeAnalysisContent,
      featureAreasCount: result.featureAreasCount,
      questionsCount: result.questionsCount,
      screensAnalyzed: result.screensAnalyzed,
      tempDirPath: result.tempDirPath
    });
    
  } catch (error: any) {
    handleApiError(res, error, 'identify-features');
  }
}
```

**Files to Modify**:
- `server/api/index.ts` - Register endpoint

```typescript
// Add import
import { handleIdentifyFeatures } from './identify-features.js';

// Add route
router.post('/identify-features', handleIdentifyFeatures);
```

**Validation**:
- [ ] Endpoint accessible at `POST /api/identify-features`
- [ ] Endpoint requires authentication (Atlassian + Figma tokens)
- [ ] Endpoint validates required fields
- [ ] Endpoint returns JSON with expected structure
- [ ] Endpoint handles errors with appropriate status codes
- [ ] Test with curl/Postman:
```bash
curl -X POST http://localhost:3000/api/identify-features \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: Bearer ..." \
  -H "X-Figma-Token: ..." \
  -d '{"epicKey": "PROJ-123"}'
```

---

### Step 8: Add Documentation

**Goal**: Document the new tool for users and developers.

**Files to Create/Modify**:
- `server/providers/combined/tools/identify-features/README.md` - Tool-specific docs
- `server/readme.md` - Add tool to main documentation
- `docs/rest-api.md` - Document REST endpoint

**README.md Content**:
```markdown
# Identify Features Tool

Analyzes Figma screen designs to generate a scope analysis document that categorizes features as in-scope (✅), out-of-scope (❌), or questions (❓), grouped by feature areas.

## Purpose

Use this tool **before** generating shell stories to:
- Establish clear scope boundaries
- Identify ambiguities and questions early
- Group features logically by area
- Link features to specific Figma screens

## Usage

### Via MCP (VS Code Copilot)

```
Please identify features for epic PROJ-123
```

### Via REST API

```bash
curl -X POST http://localhost:3000/api/identify-features \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: Bearer YOUR_TOKEN" \
  -H "X-Figma-Token: YOUR_TOKEN" \
  -d '{
    "epicKey": "PROJ-123",
    "cloudId": "abc123"
  }'
```

## Output

The tool generates a "Scope Analysis" section in the epic description:

```markdown
## Scope Analysis

### Authentication

[Login Screen](figma-url) [Signup Screen](figma-url)

- ✅ Email/password login
- ✅ Form validation
- ❌ OAuth providers (deferred)
- ❓ Should we support SSO?

### Remaining Questions

- ❓ What browsers are supported?
```

## Workflow

1. **Epic Setup**: Ensure epic description contains Figma design links
2. **Run Tool**: Execute `identify-features` on the epic
3. **Review Output**: Check scope analysis in epic description
4. **Answer Questions**: Update epic with clarifications
5. **Generate Stories**: Use `write-shell-stories` for detailed implementation stories

## Debug Artifacts

Temp directory contains:
- `scope-analysis.md` - Generated scope analysis
- `scope-analysis-prompt.md` - AI prompt used
- `screens.yaml` - Screen ordering
- `*.analysis.md` - Individual screen analyses
- `*.png` - Downloaded Figma images

## Comparison with Write-Shell-Stories

| Tool | Purpose | Output | When to Use |
|------|---------|--------|-------------|
| `identify-features` | Scope definition | Feature areas with ✅/❌/❓ | Beginning of project, scope questions |
| `write-shell-stories` | Implementation planning | Numbered shell stories with details | After scope is clear, ready for tickets |
```

**Validation**:
- [ ] README is clear and complete
- [ ] Examples work as documented
- [ ] Tool comparison table is helpful
- [ ] REST API documentation is accurate

---

### Step 9: End-to-End Testing

**Goal**: Validate the complete workflow with real epics.

**Test Cases**:

#### Test 1: Basic Feature Identification
**Setup**:
- Epic with 3-5 Figma screens
- Mix of clear features and ambiguous elements
- Epic context mentions some deferred features

**Expected Behavior**:
1. Tool analyzes all screens successfully
2. Features are grouped into 2-4 logical areas
3. Each area has correct Figma links
4. In-scope features (✅) have clear UI
5. Out-of-scope features (❌) match epic deferrals
6. Questions (❓) surface ambiguities
7. Jira epic is updated with "Scope Analysis" section

**Validation**:
- [ ] All screens analyzed
- [ ] Feature grouping makes sense
- [ ] Figma links are correct and clickable
- [ ] Categorization (✅/❌/❓) is accurate
- [ ] Epic updated successfully
- [ ] No errors in console

#### Test 2: Complex Multi-Screen Flow
**Setup**:
- Epic with 10+ screens
- Multi-step workflow (e.g., onboarding, checkout)
- Some screens share common features

**Expected Behavior**:
1. Common features appear in multiple areas (e.g., "Navigation" area references many screens)
2. Flow-specific features grouped together
3. Questions capture workflow ambiguities
4. Tool completes in reasonable time (<3 minutes)

**Validation**:
- [ ] All screens processed
- [ ] Feature areas cover all functionality
- [ ] No duplicate feature descriptions within same area
- [ ] Workflow questions are identified
- [ ] Performance is acceptable

#### Test 3: Edge Cases
**Test scenarios**:
- Epic with no Figma links → Should fail gracefully with clear error
- Epic with invalid Figma links → Should report which links failed
- Epic with only 1 screen → Should still generate analysis
- Epic with 20+ screens → Should handle large context

**Validation**:
- [ ] Error messages are helpful
- [ ] Partial failures don't crash tool
- [ ] Large epics complete successfully
- [ ] Small epics don't over-complicate

#### Test 4: Integration with Write-Shell-Stories
**Setup**:
1. Run `identify-features` on epic
2. Review and answer questions in epic description
3. Run `write-shell-stories` on same epic
4. Compare outputs

**Expected Behavior**:
- Shell stories align with scope analysis
- Features marked ✅ appear in shell stories
- Features marked ❌ are NOT in shell stories
- Questions (❓) are addressed or deferred in shell stories

**Validation**:
- [ ] Both tools use same screen analyses (cache working)
- [ ] Shell stories respect scope boundaries
- [ ] No features in shell stories that were marked ❌
- [ ] Deferred features have implementation stories at end

---

## Questions

### Question 1: Section Naming
Should the Jira epic section be called "Scope Analysis" or something else?

**Options**:
a) "Scope Analysis" (current proposal)
b) "Feature Scope"
c) "In Scope / Out of Scope"
d) "Features & Questions"

**Your Answer**: "Scope Analysis"


### Question 2: Feature Grouping Strategy
How should the AI group features into areas?

**Options**:
a) By UI/screen location (e.g., "Header", "Sidebar", "Main Content")
b) By user workflow (e.g., "Authentication", "Profile Management", "Data Entry")
c) By technical domain (e.g., "Frontend", "API Integration", "Data Persistence")
d) Let AI decide based on context

**Your Answer**: UI/screen location.


### Question 3: Epic Context Handling
What if the epic description already mentions scope (e.g., "In scope: X, Y, Z")?

**Options**:
a) Use epic scope statements as primary source of truth for ✅/❌ categorization
b) Use screen analyses as primary source, epic context as secondary
c) Flag conflicts between epic context and screen analyses as ❓ questions
d) Ignore epic scope statements, rely only on screen analyses

**Your Answer**: a) Epic scope statements are primary source of truth and should always win out.


### Question 4: Shared Infrastructure
Should we extract phases 1-4 into shared utilities now, or wait until both tools are stable?

**Options**:
a) Extract immediately (Step 2) - cleaner architecture from start
b) Keep duplicated for now, refactor after identify-features is proven
c) Extract only the most reusable parts (temp dir, Figma setup), keep rest separate
d) Never extract - keep tools fully independent for flexibility

**Your Answer**: Extract immediately. 


### Question 5: Question Deduplication
If the same question appears for multiple feature areas, should we deduplicate?

**Example**: "What is the password validation logic?" relevant to both "Login" and "Registration" areas

**Options**:
a) List question in each relevant feature area (shows context)
b) List question once in first area, omit from others
c) List question in each area, then consolidate in "Remaining Questions"
d) Only list cross-area questions in "Remaining Questions"

**Your Answer**: List question in first area, omit in others.


### Question 6: Integration with Shell Stories
Should `write-shell-stories` read and use the scope analysis if it exists?

**Benefits**: Stories automatically respect scope boundaries
**Risks**: Adds coupling between tools, scope analysis might be outdated

**Options**:
a) Yes - write-shell-stories should read scope analysis and use it as input
b) No - keep tools independent, user manages consistency
c) Optional - add flag `useExistingScope: boolean` to write-shell-stories
d) Automatic - detect if scope analysis exists, use if present

**Your Answer**: Yes, but we will make this modification later.


### Question 7: Output Verbosity
How detailed should feature descriptions be?

**Example**: 
- Concise: "✅ User login"
- Detailed: "✅ User login with email/password, including form validation, error states, and loading indicators"

**Options**:
a) Concise - just feature names (easier to scan)
b) Detailed - full descriptions (more informative)
c) Mixed - concise for obvious features, detailed for complex ones
d) Configurable - let user specify via parameter

**Your Answer**: Mixed. 


### Question 8: REST API Response Format
Should the REST API return the raw markdown or structured data?

**Options**:
a) Raw markdown (matches MCP tool output)
b) Structured JSON (easier for programmatic consumption):
```json
{
  "featureAreas": [
    {
      "name": "Authentication",
      "figmaLinks": ["url1", "url2"],
      "inScope": ["Email login", "Form validation"],
      "outOfScope": ["OAuth"],
      "questions": ["Should we support SSO?"]
    }
  ],
  "remainingQuestions": ["..."]
}
```
c) Both - include both `markdown` and `structured` fields
d) Configurable via `format` parameter

**Your Answer**: What do we do for other tools?  We should do the same.


### Question 9: Error Handling for Ambiguous Features
What if a feature could be interpreted as either in-scope or out-of-scope?

**Example**: A button labeled "Export" exists, but no export functionality is described

**Options**:
a) Mark as ❓ question (safest, but might generate too many questions)
b) Mark as ❌ out-of-scope (conservative, assume not implemented)
c) Mark as ✅ in-scope (optimistic, assume will implement)
d) Use epic context to decide

**Your Answer**: Mark as ❓


### Question 10: Caching Strategy
Should screen analyses be reused between `identify-features` and `write-shell-stories` calls?

**Current**: Both tools use `getTempDir()` which provides 24-hour cache

**Options**:
a) Keep current behavior (24-hour cache, automatic reuse)
b) Add `regenerate` parameter to force fresh analysis
c) Cache indefinitely until epic is updated
d) No caching - always regenerate (slower but always fresh)

**Your Answer**: Keep current behavior.
