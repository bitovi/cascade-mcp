/**
 * REST API Route Registration
 * 
 * Registers all REST API endpoints for PAT-authenticated access.
 * These endpoints provide an alternative to MCP OAuth for server-to-server integrations.
 */

import { Express } from 'express';
import { handleWriteShellStories } from './write-shell-stories.js';
import { handleWriteNextStory } from './write-next-story.js';
import { handleIdentifyFeatures } from './identify-features.js';
import { handleAnalyzeFeatureScope } from './analyze-feature-scope.js';

/**
 * Register all REST API routes with the Express app
 * 
 * @param app - Express application instance
 */
export function registerRestApiRoutes(app: Express): void {
  console.log('Registering REST API routes...');
  
  // Generate shell stories from Figma designs in a Jira epic
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/write-shell-stories', (req, res) => handleWriteShellStories(req, res));
  console.log('  ✓ POST /api/write-shell-stories');
  
  // Write the next Jira story from shell stories in an epic
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/write-next-story', (req, res) => handleWriteNextStory(req, res));
  console.log('  ✓ POST /api/write-next-story');
  
  // Analyze feature scope from Figma designs (new endpoint)
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/analyze-feature-scope', (req, res) => handleAnalyzeFeatureScope(req, res));
  console.log('  ✓ POST /api/analyze-feature-scope');
  
  // Legacy endpoint for backward compatibility (redirects to analyze-feature-scope)
  // Wrap handler to match Express signature (req, res) => void
  app.post('/api/identify-features', (req, res) => handleAnalyzeFeatureScope(req, res));
  console.log('  ✓ POST /api/identify-features (legacy - redirects to analyze-feature-scope)');
  
  console.log('REST API routes registered successfully');
}
