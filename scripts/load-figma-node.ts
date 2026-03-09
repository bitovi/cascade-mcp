#!/usr/bin/env node
/**
 * Load Figma Node Data Script
 *
 * Fetches the full node tree for a Figma frame/component at a given URL
 * and saves it as a JSON file. Useful for creating test fixtures from
 * real Figma designs.
 *
 * Usage:
 *   node --import ./loader.mjs scripts/load-figma-node.ts <figma-url> [--output <path>]
 *
 * Examples:
 *   node --import ./loader.mjs scripts/load-figma-node.ts "https://www.figma.com/design/ABC123?node-id=1106-9259"
 *   node --import ./loader.mjs scripts/load-figma-node.ts "https://www.figma.com/design/ABC123?node-id=1106-9259" --output test/fixtures/figma/my-frame.json
 *
 * Environment:
 *   FIGMA_TEST_PAT - Figma Personal Access Token (figd_...)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createFigmaClient } from '../server/providers/figma/figma-api-client.js';
import { parseFigmaUrl, convertNodeIdToApiFormat, fetchFigmaNode } from '../server/providers/figma/figma-helpers.js';

// Load environment variables
dotenv.config();

const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"/g, '');

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse --output flag
  let outputPath: string | undefined;
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1) {
    outputPath = args[outputIdx + 1];
    if (!outputPath) {
      console.error('❌ --output flag requires a file path');
      process.exit(1);
    }
    args.splice(outputIdx, 2);
  }

  const figmaUrl = args[0];
  if (!figmaUrl) {
    console.error('❌ Please provide a Figma URL');
    console.error('');
    console.error('Usage:');
    console.error('  node --import ./loader.mjs scripts/load-figma-node.ts <figma-url> [--output <path>]');
    console.error('');
    console.error('Example:');
    console.error('  node --import ./loader.mjs scripts/load-figma-node.ts "https://www.figma.com/design/ABC123?node-id=1106-9259"');
    process.exit(1);
  }

  if (!FIGMA_PAT) {
    console.error('❌ FIGMA_TEST_PAT not set in .env');
    process.exit(1);
  }

  // Parse the Figma URL
  const urlInfo = parseFigmaUrl(figmaUrl);
  if (!urlInfo) {
    console.error('❌ Invalid Figma URL:', figmaUrl);
    process.exit(1);
  }

  const { fileKey, nodeId } = urlInfo;
  if (!nodeId) {
    console.error('❌ No node-id found in URL. Add ?node-id=XXX-YYY to the URL.');
    process.exit(1);
  }

  const apiNodeId = convertNodeIdToApiFormat(nodeId);

  console.log(`📦 Fetching Figma node data...`);
  console.log(`  File key: ${fileKey}`);
  console.log(`  Node ID:  ${nodeId} (API: ${apiNodeId})`);

  // Fetch the node data
  const client = createFigmaClient(FIGMA_PAT);
  const nodeData = await fetchFigmaNode(client, fileKey, apiNodeId);

  // Determine output path
  if (!outputPath) {
    const fixtureDir = path.join('test', 'fixtures', 'figma');
    fs.mkdirSync(fixtureDir, { recursive: true });
    outputPath = path.join(fixtureDir, `${fileKey}_${nodeId}.json`);
  } else {
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  // Write the JSON
  const json = JSON.stringify(nodeData, null, 2);
  fs.writeFileSync(outputPath, json, 'utf-8');

  const stats = fs.statSync(outputPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  const sizeKb = (stats.size / 1024).toFixed(1);

  console.log('');
  console.log(`✅ Node data saved!`);
  console.log(`  Name:   ${nodeData.name || 'Unknown'}`);
  console.log(`  Type:   ${nodeData.type || 'Unknown'}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Size:   ${stats.size > 1024 * 1024 ? sizeMb + ' MB' : sizeKb + ' KB'}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error.message || error);
  process.exit(1);
});
