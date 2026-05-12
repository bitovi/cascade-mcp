/**
 * REST API Route Registration
 * 
 * Registers all REST API endpoints for PAT-authenticated access.
 * These endpoints provide an alternative to MCP OAuth for server-to-server integrations.
 */

import { Express } from 'express';
import { handleWriteShellStories } from './write-shell-stories.js';
import { handleWriteNextStory } from './write-next-story.js';
import { handleWriteStory } from './write-story.js';
import { handleIdentifyFeatures } from './identify-features.js';
import { handleAnalyzeFeatureScope } from './analyze-feature-scope.js';
import { handleFigmaReviewDesign } from './figma-review-design.js';
import { handleReviewWorkItem } from './review-work-item.js';
import { handleFigmaBatchZip } from './figma-batch-load.js';
import { handleFigmaBatchCache } from './figma-batch-cache.js';
import { handleFigmaFrameData } from './figma-frame-data.js';
import { handleFigmaPostComment } from './figma-post-comment.js';
import { handleFigmaGetComments } from './figma-get-comments.js';
import { handleAtlassianAddComment } from './atlassian-add-comment.js';
import { handleAtlassianUpdateComment } from './atlassian-update-comment.js';
import { handleExtractLinkedResources } from './extract-linked-resources.js';
import { handleSheetsCreateSpreadsheet } from './sheets-create-spreadsheet.js';
import { handleSheetsCreateSheet } from './sheets-create-sheet.js';
import { handleSheetsRenameSheet } from './sheets-rename-sheet.js';
import { handleSheetsAddRows } from './sheets-add-rows.js';
import { handleSheetsAddColumns } from './sheets-add-columns.js';
import { handleSheetsBatchUpdateCells } from './sheets-batch-update-cells.js';
import { handleSheetsGetFormulas } from './sheets-get-formulas.js';
import { handleSheetsCreateChart } from './sheets-create-chart.js';
import { handleSheetsCopySheet } from './sheets-copy-sheet.js';
import { handleSheetsShare } from './sheets-share.js';
import { handleSheetsGetMultipleData } from './sheets-get-multiple-data.js';
import { handleSheetsAppendRows } from './sheets-append-rows.js';
import { handleSheetsFind } from './sheets-find.js';
import { handleSheetsFormatRange } from './sheets-format-range.js';
import { handleSheetsAddChart } from './sheets-add-chart.js';
import { handleSheetsManageConditionalFormatting } from './sheets-manage-conditional-formatting.js';
import { handleSheetsMoveRows } from './sheets-move-rows.js';
import { debounce } from './debounce-middleware.js';
import { encryptionManager } from '../utils/encryption-manager.js';

/**
 * Register all REST API routes with the Express app
 * 
 * @param app - Express application instance
 */
export function registerRestApiRoutes(app: Express): void {
  console.log('Registering REST API routes...');
  
  // Config endpoint for frontend to get runtime configuration
  app.get('/api/config', (req, res) => {
    res.json({
      baseUrl: process.env.VITE_AUTH_SERVER_URL || `${req.protocol}://${req.get('host')}`
    });
  });
  console.log('  ✓ GET /api/config');
  
  // Get public key for manual encryption (safe to expose)
  app.get('/api/public-key', (req, res) => {
    const publicKey = encryptionManager.getPublicKey();
    if (!publicKey) {
      res.status(503).json({ 
        error: 'Public key not available. Encryption is not enabled.' 
      });
      return;
    }
    res.json({ publicKey });
  });
  console.log('  ✓ GET /api/public-key');
  
  // Generate shell stories from Figma designs in a Jira epic
  app.post('/api/write-shell-stories',
    debounce(req => `write-shell-stories:${req.body.siteName}:${req.body.epicKey}`),
    (req, res) => handleWriteShellStories(req, res)
  );
  console.log('  ✓ POST /api/write-shell-stories (with debounce)');
  
  // Write the next Jira story from shell stories in an epic
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/write-next-story', (req, res) => handleWriteNextStory(req, res));
  console.log('  ✓ POST /api/write-next-story');
  
  // Generate or refine a Jira story's description with scope analysis and questions
  app.post('/api/write-story', (req, res) => handleWriteStory(req, res));
  console.log('  ✓ POST /api/write-story');
  
  // Analyze feature scope from Figma designs (new endpoint)
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/analyze-feature-scope', (req, res) => handleAnalyzeFeatureScope(req, res));
  console.log('  ✓ POST /api/analyze-feature-scope');
  
  // Analyze Figma designs directly and post questions as comments
  app.post('/api/figma-review-design', (req, res) => handleFigmaReviewDesign(req, res));
  console.log('  ✓ POST /api/figma-review-design');
  
  // Legacy endpoint for backward compatibility (redirects to analyze-feature-scope)
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/identify-features', (req, res) => handleAnalyzeFeatureScope(req, res));
  console.log('  ✓ POST /api/identify-features (legacy - redirects to analyze-feature-scope)');
  
  // Review work item completeness and post questions as comments
  app.post('/api/review-work-item', (req, res) => handleReviewWorkItem(req, res));
  console.log('  ✓ POST /api/review-work-item');
  
  // Batch load Figma frames to zip (spec 068/069 — plugin skills)
  app.post('/api/figma-batch-zip', (req, res) => handleFigmaBatchZip(req, res));
  console.log('  ✓ POST /api/figma-batch-zip');
  
  // Legacy endpoint for backward compatibility
  app.post('/api/figma-batch-load', (req, res) => handleFigmaBatchZip(req, res));
  console.log('  ✓ POST /api/figma-batch-load (legacy → figma-batch-zip)');
  
  // Batch cache Figma frames for MCP retrieval (spec 069)
  app.post('/api/figma-batch-cache', (req, res) => handleFigmaBatchCache(req, res));
  console.log('  ✓ POST /api/figma-batch-cache');
  
  // Get single frame data (spec 069)
  app.post('/api/figma-frame-data', (req, res) => handleFigmaFrameData(req, res));
  console.log('  ✓ POST /api/figma-frame-data');
  
  // Post a comment to a Figma file
  app.post('/api/figma-post-comment', (req, res) => handleFigmaPostComment(req, res));
  console.log('  ✓ POST /api/figma-post-comment');
  
  // Get comments from a Figma file
  app.get('/api/figma-get-comments', (req, res) => handleFigmaGetComments(req, res));
  console.log('  ✓ GET /api/figma-get-comments');
  
  // Add a comment to a Jira issue
  app.post('/api/atlassian-add-comment', (req, res) => handleAtlassianAddComment(req, res));
  console.log('  ✓ POST /api/atlassian-add-comment');

  app.put('/api/atlassian-update-comment', (req, res) => handleAtlassianUpdateComment(req, res));
  console.log('  ✓ PUT /api/atlassian-update-comment');
  
  // Extract content + discovered links from any URL (Jira, Confluence, Google Docs)
  app.post('/api/extract-linked-resources', (req, res) => handleExtractLinkedResources(req, res));
  console.log('  ✓ POST /api/extract-linked-resources');

  // Google Sheets endpoints
  app.post('/api/sheets-create-spreadsheet', (req, res) => handleSheetsCreateSpreadsheet(req, res));
  console.log('  ✓ POST /api/sheets-create-spreadsheet');

  app.post('/api/sheets-create-sheet', (req, res) => handleSheetsCreateSheet(req, res));
  console.log('  ✓ POST /api/sheets-create-sheet');

  app.post('/api/sheets-rename-sheet', (req, res) => handleSheetsRenameSheet(req, res));
  console.log('  ✓ POST /api/sheets-rename-sheet');

  app.post('/api/sheets-add-rows', (req, res) => handleSheetsAddRows(req, res));
  console.log('  ✓ POST /api/sheets-add-rows');

  app.post('/api/sheets-add-columns', (req, res) => handleSheetsAddColumns(req, res));
  console.log('  ✓ POST /api/sheets-add-columns');

  app.post('/api/sheets-batch-update-cells', (req, res) => handleSheetsBatchUpdateCells(req, res));
  console.log('  ✓ POST /api/sheets-batch-update-cells');

  app.post('/api/sheets-get-formulas', (req, res) => handleSheetsGetFormulas(req, res));
  console.log('  ✓ POST /api/sheets-get-formulas');

  app.post('/api/sheets-copy-sheet', (req, res) => handleSheetsCopySheet(req, res));
  console.log('  ✓ POST /api/sheets-copy-sheet');

  app.post('/api/sheets-share', (req, res) => handleSheetsShare(req, res));
  console.log('  ✓ POST /api/sheets-share');

  app.post('/api/sheets-get-multiple-data', (req, res) => handleSheetsGetMultipleData(req, res));
  console.log('  ✓ POST /api/sheets-get-multiple-data');

  app.post('/api/sheets-append-rows', (req, res) => handleSheetsAppendRows(req, res));
  console.log('  ✓ POST /api/sheets-append-rows');

  app.post('/api/sheets-find', (req, res) => handleSheetsFind(req, res));
  console.log('  ✓ POST /api/sheets-find');

  app.post('/api/sheets-format-range', (req, res) => handleSheetsFormatRange(req, res));
  console.log('  ✓ POST /api/sheets-format-range');

  app.post('/api/sheets-add-chart', (req, res) => handleSheetsAddChart(req, res));
  console.log('  ✓ POST /api/sheets-add-chart');

  app.post('/api/sheets-manage-conditional-formatting', (req, res) => handleSheetsManageConditionalFormatting(req, res));
  console.log('  ✓ POST /api/sheets-manage-conditional-formatting');

  app.post('/api/sheets-move-rows', (req, res) => handleSheetsMoveRows(req, res));
  console.log('  ✓ POST /api/sheets-move-rows');

  app.post('/api/sheets-create-chart', (req, res) => handleSheetsCreateChart(req, res));
  console.log('  ✓ POST /api/sheets-create-chart');
  
  console.log('REST API routes registered successfully');
}
