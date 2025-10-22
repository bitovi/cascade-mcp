/**
 * Test script for markdown to ADF conversion
 * Run with: node --loader ./loader.mjs server/providers/atlassian/markdown-converter.test.ts
 */

import { convertMarkdownToAdf } from './markdown-converter.js';

/**
 * Helper to calculate max nesting depth of bullet lists in ADF content
 */
function getMaxListDepth(content: any[], currentDepth: number = 0): number {
  let maxDepth = currentDepth;
  
  for (const node of content) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const childDepth = getMaxListDepth(node.content || [], currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    } else if (node.content) {
      const childDepth = getMaxListDepth(node.content, currentDepth);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  
  return maxDepth;
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('MARKDOWN TO ADF CONVERSION TESTS');
  console.log('='.repeat(80));

  // Test 1: Simple two-level nested bullets
  console.log('\n\n📝 TEST 1: Simple two-level nested bullets');
  console.log('-'.repeat(80));
  const markdown1 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * Display header/navigation bar
  * Show main heading "Applications"`;

  const adf1 = await convertMarkdownToAdf(markdown1);
  console.log('Markdown:', markdown1);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf1, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf1.content));

  // Test 2: Three-level nested bullets (current format)
  console.log('\n\n📝 TEST 2: Three-level nested bullets (current format with * +)');
  console.log('-'.repeat(80));
  const markdown2 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * + Display header/navigation bar
  * - Status filter interactivity (defer)
  * ¿ What happens when search is used?`;

  const adf2 = await convertMarkdownToAdf(markdown2);
  console.log('Markdown:', markdown2);
  console.log('\nADF Output (first 2 content blocks):');
  console.log(JSON.stringify(adf2.content.slice(0, 2), null, 2));
  console.log('\n❌ Max nesting depth:', getMaxListDepth(adf2.content), '(Jira limit is 2)');

  // Test 3: Bold text markers
  console.log('\n\n📝 TEST 3: Bold text markers instead of nesting');
  console.log('-'.repeat(80));
  const markdown3 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * **+** Display header/navigation bar
  * **-** Status filter interactivity (defer)
  * **¿** What happens when search is used?`;

  const adf3 = await convertMarkdownToAdf(markdown3);
  console.log('Markdown:', markdown3);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf3, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf3.content));

  // Test 4: Emoji markers
  console.log('\n\n📝 TEST 4: Emoji markers instead of symbols');
  console.log('-'.repeat(80));
  const markdown4 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * ✅ Display header/navigation bar
  * ❌ Status filter interactivity (defer)
  * ❓ What happens when search is used?`;

  const adf4 = await convertMarkdownToAdf(markdown4);
  console.log('Markdown:', markdown4);
  console.log('\nADF Output (nested list portion):');
  console.log(JSON.stringify(adf4.content[1], null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf4.content));

  // Test 5: Plain text symbols at same level
  console.log('\n\n📝 TEST 5: Plain text symbols (+ - ¿) without extra indent');
  console.log('-'.repeat(80));
  const markdown5 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * + Display header (included)
  * - Status filter (deferred)
  * ¿ What happens with search?`;

  const adf5 = await convertMarkdownToAdf(markdown5);
  console.log('Markdown:', markdown5);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf5, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf5.content));

  // Test 6: Using HTML entities or escape characters
  console.log('\n\n📝 TEST 6: Escaped characters (\\+ \\- etc)');
  console.log('-'.repeat(80));
  const markdown6 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * \\+ Display header (included)
  * \\- Status filter (deferred)
  * \\¿ What happens with search?`;

  const adf6 = await convertMarkdownToAdf(markdown6);
  console.log('Markdown:', markdown6);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf6, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf6.content));

  // Test 7: Using inline code for symbols
  console.log('\n\n📝 TEST 7: Inline code markers (`+` `-` `¿`)');
  console.log('-'.repeat(80));
  const markdown7 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * \`+\` Display header (included)
  * \`-\` Status filter (deferred)
  * \`¿\` What happens with search?`;

  const adf7 = await convertMarkdownToAdf(markdown7);
  console.log('Markdown:', markdown7);
  console.log('\nADF Output (nested list):');
  console.log(JSON.stringify(adf7.content[1], null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf7.content));

  // Test 8: Using dash-based lists instead of asterisk
  console.log('\n\n📝 TEST 8: Dash-based nested lists (- and  - -)');
  console.log('-'.repeat(80));
  const markdown8 = `## Shell Stories

- st001 Display Basic Applicant List
  - ANALYSIS: applicants-new.analysis.md
  - DEPENDENCIES: none
  - + Display header (included)
  - - Status filter (deferred)
  - ¿ What happens with search?`;

  const adf8 = await convertMarkdownToAdf(markdown8);
  console.log('Markdown:', markdown8);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf8, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf8.content));

  // Test 9: Using blockquote-style indentation
  console.log('\n\n📝 TEST 9: Mixed list with > blockquote prefix');
  console.log('-'.repeat(80));
  const markdown9 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * > + Display header (included)
  * > - Status filter (deferred)`;

  const adf9 = await convertMarkdownToAdf(markdown9);
  console.log('Markdown:', markdown9);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf9, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf9.content));

  // Test 10: Plain text with symbols, no asterisk prefix
  console.log('\n\n📝 TEST 10: Symbols as part of text content (no special bullet)');
  console.log('-'.repeat(80));
  const markdown10 = `## Shell Stories

- st001 Display Basic Applicant List
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * + Display header (included)
  * - Status filter (deferred)
  * ? What happens with search?`;

  const adf10 = await convertMarkdownToAdf(markdown10);
  console.log('Markdown:', markdown10);
  console.log('\nADF Output:');
  console.log(JSON.stringify(adf10, null, 2));
  console.log('\n✅ Max nesting depth:', getMaxListDepth(adf10.content));

  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('Test 1 (simple 2-level):        Depth =', getMaxListDepth(adf1.content));
  console.log('Test 2 (current * + format):    Depth =', getMaxListDepth(adf2.content), '❌ TOO DEEP');
  console.log('Test 3 (bold **+** markers):    Depth =', getMaxListDepth(adf3.content));
  console.log('Test 4 (emoji ✅ markers):       Depth =', getMaxListDepth(adf4.content));
  console.log('Test 5 (plain + at level 2):    Depth =', getMaxListDepth(adf5.content), '❌ TOO DEEP');
  console.log('Test 6 (escaped \\+):             Depth =', getMaxListDepth(adf6.content));
  console.log('Test 7 (inline code `+`):       Depth =', getMaxListDepth(adf7.content));
  console.log('Test 8 (dash lists - -):        Depth =', getMaxListDepth(adf8.content));
  console.log('Test 9 (blockquote > +):        Depth =', getMaxListDepth(adf9.content));
  console.log('Test 10 (symbols as text):      Depth =', getMaxListDepth(adf10.content));
  console.log('='.repeat(80));
}

// Run the tests
runTests().catch(console.error);
