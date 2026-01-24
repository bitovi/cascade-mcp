/**
 * Test script to verify Figma annotations API response
 * 
 * Usage: npx tsx scripts/test-figma-annotations.ts
 * 
 * Fetches nodes, comments, and dev resources - saves raw JSON responses to temp folder.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const FIGMA_PAT = process.env.FIGMA_TEST_PAT;

if (!FIGMA_PAT) {
  console.error('❌ FIGMA_TEST_PAT not found in .env');
  process.exit(1);
}

// File and nodes to test
const FILE_KEY = '7QW0kJ07DcM36mgQUJ5Dtj';
const NODES_TO_FETCH = [
  { id: '1-24', name: 'page' },       // Page level
  { id: '1043-2073', name: 'screen' }, // Screen level
];

// Output directory
const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'figma-api-responses');

async function fetchFigmaEndpoint(endpoint: string, name: string) {
  const url = `https://api.figma.com/v1/${endpoint}`;
  
  console.log(`  Fetching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': FIGMA_PAT!,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`  ⚠️  ${response.status}: ${errorText.slice(0, 100)}`);
    return null;
  }

  return response.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('Figma API Response Exporter');
  console.log('='.repeat(60));
  console.log(`\nFile Key: ${FILE_KEY}`);
  console.log(`Output Dir: ${OUTPUT_DIR}`);
  
  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Fetch nodes
  for (const node of NODES_TO_FETCH) {
    console.log(`\n📦 Fetching node: ${node.name} (${node.id})...`);
    const apiNodeId = node.id.replace('-', ':');
    
    const data = await fetchFigmaEndpoint(
      `files/${FILE_KEY}/nodes?ids=${encodeURIComponent(apiNodeId)}`,
      node.name
    );
    
    if (data) {
      const filename = `node-${node.name}-${node.id.replace(':', '-')}.json`;
      const filepath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✅ Saved: ${filename}`);
      
      const nodeData = data.nodes?.[apiNodeId]?.document;
      if (nodeData) {
        console.log(`  Type: ${nodeData.type}, Name: "${nodeData.name}"`);
        console.log(`  Has annotations: ${nodeData.annotations !== undefined}`);
      }
    }
  }

  // 2. Fetch comments for the file
  console.log(`\n💬 Fetching comments...`);
  const comments = await fetchFigmaEndpoint(`files/${FILE_KEY}/comments`, 'comments');
  if (comments) {
    const filepath = path.join(OUTPUT_DIR, 'comments.json');
    fs.writeFileSync(filepath, JSON.stringify(comments, null, 2));
    console.log(`  ✅ Saved: comments.json`);
    console.log(`  Comment count: ${comments.comments?.length || 0}`);
  }

  // 3. Fetch dev resources for the file
  console.log(`\n🔗 Fetching dev resources...`);
  const devResources = await fetchFigmaEndpoint(`files/${FILE_KEY}/dev_resources`, 'dev_resources');
  if (devResources) {
    const filepath = path.join(OUTPUT_DIR, 'dev-resources.json');
    fs.writeFileSync(filepath, JSON.stringify(devResources, null, 2));
    console.log(`  ✅ Saved: dev-resources.json`);
    console.log(`  Dev resource count: ${devResources.dev_resources?.length || 0}`);
  }

  // 4. Fetch file metadata (top-level file info)
  console.log(`\n📄 Fetching file metadata...`);
  const fileData = await fetchFigmaEndpoint(`files/${FILE_KEY}?depth=1`, 'file-metadata');
  if (fileData) {
    const filepath = path.join(OUTPUT_DIR, 'file-metadata.json');
    fs.writeFileSync(filepath, JSON.stringify(fileData, null, 2));
    console.log(`  ✅ Saved: file-metadata.json`);
    console.log(`  File name: "${fileData.name}"`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Done! JSON files saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
}

main();
