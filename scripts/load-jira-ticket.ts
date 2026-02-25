#!/usr/bin/env ts-node
/**
 * Load Jira Ticket Script
 * 
 * Fetches and displays a Jira ticket using PAT authentication.
 * Useful for inspecting how Figma URLs and other content is represented in Jira issues.
 * 
 * Usage:
 *   npm run load-jira-ticket <issue-key> [site-name]
 *   
 * Examples:
 *   npm run load-jira-ticket DRIOT-8
 *   npm run load-jira-ticket DRIOT-8 bitovi-training
 *   npm run load-jira-ticket PLAY-123 bitovi
 * 
 * Environment:
 *   ATLASSIAN_TEST_PAT - Atlassian Personal Access Token (base64 encoded email:token)
 */

import dotenv from 'dotenv';
import { createAtlassianClientWithPAT } from '../server/providers/atlassian/atlassian-api-client.js';
import { resolveCloudId } from '../server/providers/atlassian/atlassian-helpers.js';

// Load environment variables
dotenv.config();

const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"/g, ''); // Pre-encoded base64(email:token)

/**
 * Parse issue key to extract site name and issue key
 * Examples:
 *   "DRIOT-8" -> { issueKey: "DRIOT-8", siteName: null }
 *   "https://bitovi-training.atlassian.net/browse/DRIOT-8" -> { issueKey: "DRIOT-8", siteName: "bitovi-training" }
 */
function parseIssueReference(input: string): { issueKey: string; siteName: string | null } {
  const urlMatch = input.match(/https?:\/\/([^.]+)\.atlassian\.net\/browse\/([A-Z]+-\d+)/);
  if (urlMatch) {
    return {
      siteName: urlMatch[1],
      issueKey: urlMatch[2]
    };
  }
  
  return {
    issueKey: input,
    siteName: null
  };
}

/**
 * Display issue details in a formatted way
 */
function displayIssue(issue: any, siteName: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(`🎫 ${issue.key}: ${issue.fields.summary}`);
  console.log('='.repeat(80));
  
  console.log(`\n📍 URL: https://${siteName}.atlassian.net/browse/${issue.key}`);
  console.log(`📊 Status: ${issue.fields.status?.name || 'Unknown'}`);
  console.log(`🏷️  Type: ${issue.fields.issuetype?.name || 'Unknown'}`);
  console.log(`👤 Assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}`);
  console.log(`📅 Created: ${issue.fields.created || 'Unknown'}`);
  console.log(`🔄 Updated: ${issue.fields.updated || 'Unknown'}`);
  
  if (issue.fields.labels && issue.fields.labels.length > 0) {
    console.log(`🏷️  Labels: ${issue.fields.labels.join(', ')}`);
  }
  
  console.log('\n' + '-'.repeat(80));
  console.log('📝 DESCRIPTION (ADF Format)');
  console.log('-'.repeat(80));
  
  if (issue.fields.description) {
    const descriptionJson = JSON.stringify(issue.fields.description, null, 2);
    console.log(descriptionJson);
    
    // Look for Figma URLs in the description
    const figmaUrls = extractFigmaUrls(descriptionJson);
    if (figmaUrls.length > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('🎨 FIGMA URLs FOUND');
      console.log('-'.repeat(80));
      figmaUrls.forEach((url, index) => {
        console.log(`${index + 1}. ${url}`);
      });
    }
  } else {
    console.log('(No description)');
  }
  
  // Check comments for Figma URLs
  if (issue.fields.comment?.comments && issue.fields.comment.comments.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log(`💬 COMMENTS (${issue.fields.comment.comments.length})`);
    console.log('-'.repeat(80));
    
    issue.fields.comment.comments.forEach((comment: any, index: number) => {
      console.log(`\nComment ${index + 1} by ${comment.author?.displayName || 'Unknown'}:`);
      const commentJson = JSON.stringify(comment.body, null, 2);
      console.log(commentJson);
      
      const figmaUrls = extractFigmaUrls(commentJson);
      if (figmaUrls.length > 0) {
        console.log('  🎨 Figma URLs in this comment:');
        figmaUrls.forEach((url) => {
          console.log(`    - ${url}`);
        });
      }
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Extract Figma URLs from text
 */
function extractFigmaUrls(text: string): string[] {
  const figmaRegex = /https?:\/\/(?:www\.)?figma\.com\/[^\s"'\]},]*/g;
  const matches = text.match(figmaRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: Issue key or URL required');
    console.log('\nUsage:');
    console.log('  npm run load-jira-ticket <issue-key-or-url> [site-name]');
    console.log('\nExamples:');
    console.log('  npm run load-jira-ticket DRIOT-8 bitovi-training');
    console.log('  npm run load-jira-ticket https://bitovi-training.atlassian.net/browse/DRIOT-8');
    console.log('  npm run load-jira-ticket PLAY-123 bitovi');
    process.exit(1);
  }
  
  if (!ATLASSIAN_PAT) {
    console.error('❌ Error: ATLASSIAN_TEST_PAT not found in environment variables');
    console.log('\nPlease set ATLASSIAN_TEST_PAT in your .env file');
    console.log('See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token');
    process.exit(1);
  }
  
  const { issueKey, siteName: parsedSiteName } = parseIssueReference(args[0]);
  const siteName = args[1] || parsedSiteName;
  
  if (!siteName) {
    console.error('❌ Error: Site name is required');
    console.log('\nProvide either:');
    console.log('  1. Full Jira URL: npm run load-jira-ticket https://sitename.atlassian.net/browse/ISSUE-123');
    console.log('  2. Issue key + site name: npm run load-jira-ticket ISSUE-123 sitename');
    process.exit(1);
  }
  
  console.log(`\n🔍 Loading Jira ticket: ${issueKey}`);
  console.log(`🌐 Site: ${siteName}.atlassian.net`);
  
  try {
    // Create Atlassian client with PAT
    const client = createAtlassianClientWithPAT(ATLASSIAN_PAT, siteName);
    
    // Resolve cloud ID
    console.log(`\n📡 Resolving cloud ID for site: ${siteName}...`);
    const { cloudId } = await resolveCloudId(client, undefined, siteName);
    console.log(`✅ Cloud ID: ${cloudId}`);
    
    // Fetch the issue with all fields including comments
    console.log(`\n📥 Fetching issue ${issueKey}...`);
    const issueUrl = `${client.getJiraBaseUrl(cloudId)}/issue/${issueKey}`;
    
    const response = await client.fetch(issueUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error: HTTP ${response.status} - ${response.statusText}`);
      console.error(errorText);
      process.exit(1);
    }
    
    const issue = await response.json();
    console.log(`✅ Issue loaded successfully`);
    
    // Debug: Log the structure to understand what we got
    console.log('\n📦 Raw response structure:');
    console.log('  Keys:', Object.keys(issue));
    console.log('  Has fields:', !!issue.fields);
    if (issue.fields) {
      console.log('  Field keys:', Object.keys(issue.fields).slice(0, 10).join(', '), '...');
    }
    
    // Display the issue
    displayIssue(issue, siteName);
    
  } catch (error) {
    console.error('\n❌ Error loading Jira ticket:', error);
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
