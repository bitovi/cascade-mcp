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
import { handleDriveAboutUser } from './drive-about-user.js';
import { handleDriveDocToMarkdown } from './drive-doc-to-markdown.js';

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
  
  // Generate shell stories from Figma designs in a Jira epic
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/write-shell-stories', (req, res) => handleWriteShellStories(req, res));
  console.log('  ✓ POST /api/write-shell-stories');
  
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
  
  // Get Google Drive user info using service account
  app.post('/api/drive-about-user', (req, res) => handleDriveAboutUser(req, res));
  console.log('  ✓ POST /api/drive-about-user');
  
  // Convert Google Docs to Markdown using service account
  app.post('/api/drive-doc-to-markdown', (req, res) => handleDriveDocToMarkdown(req, res));
  console.log('  ✓ POST /api/drive-doc-to-markdown');
  
  console.log('REST API routes registered successfully');
}
