/**
 * HTML to Markdown Conversion Helpers
 * Converts HTML exported from Google Docs to Markdown format using Turndown
 */

import TurndownService from 'turndown';
import { parseHTML } from 'linkedom';

/**
 * Result of HTML preprocessing
 */
interface PreprocessResult {
  cleanedHtml: string;
  warnings: string[];
}

/**
 * Preprocess HTML to remove non-content elements and detect unsupported features
 * Uses linkedom to parse and clean the HTML properly
 * 
 * @param html - Raw HTML from Google Docs export
 * @returns Cleaned HTML and warnings about unsupported elements
 */
function preprocessHtml(html: string): PreprocessResult {
  try {
    const { document } = parseHTML(html);
    
    // Detect unsupported elements before removal
    const warnings: string[] = [];
    const images = document.querySelectorAll('img');
    if (images.length > 0) {
      warnings.push(`Document contains ${images.length} image(s) which are not supported`);
    }
    
    const tables = document.querySelectorAll('table');
    if (tables.length > 0) {
      warnings.push(`Document contains ${tables.length} table(s) which are not supported`);
    }
    
    // Remove non-content elements
    const elementsToRemove = [
      'style',
      'script',
      'head',
      'meta',
      'link',
    ];
    
    elementsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Return the cleaned HTML
    // Try body first (for complete HTML documents), then use document.toString() for fragments
    const body = document.querySelector('body');
    if (body) {
      return { cleanedHtml: body.innerHTML, warnings };
    }
    
    // For HTML fragments, use document.toString() which includes all elements
    return { cleanedHtml: document.toString(), warnings };
  } catch (error) {
    // Fallback to regex-based cleaning if linkedom parsing fails
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to parse HTML with linkedom, using regex fallback: ${errorMessage}`);
    
    // Regex-based fallback
    let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/@import[^;]+;/gi, '');
    cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    cleaned = cleaned.replace(/<meta[^>]*>/gi, '');
    cleaned = cleaned.replace(/<link[^>]*>/gi, '');
    
    // Detect unsupported elements with regex
    const warnings: string[] = [];
    const imgMatches = cleaned.match(/<img[^>]*>/gi);
    if (imgMatches) {
      warnings.push(`Document contains ${imgMatches.length} image(s) which are not supported`);
    }
    const tableMatches = cleaned.match(/<table[^>]*>/gi);
    if (tableMatches) {
      warnings.push(`Document contains ${tableMatches.length} table(s) which are not supported`);
    }
    
    return { cleanedHtml: cleaned, warnings };
  }
}

/**
 * Convert HTML content to Markdown using Turndown library
 */
export function htmlToMarkdown(html: string): { markdown: string; warnings: string[] } {
  console.log('Converting HTML to Markdown');
  
  // Preprocess HTML to remove non-content elements and detect unsupported features
  const { cleanedHtml, warnings } = preprocessHtml(html);
  
  try {
    // Initialize Turndown with GitHub-flavored markdown options
    const turndownService = new TurndownService({
      headingStyle: 'atx',           // Use # for headings
      hr: '---',                      // Horizontal rule style
      bulletListMarker: '-',          // Use - for unordered lists
      codeBlockStyle: 'fenced',       // Use ``` for code blocks
      fence: '```',                   // Code fence marker
      emDelimiter: '*',               // Use * for emphasis
      strongDelimiter: '**',          // Use ** for strong
      linkStyle: 'inlined',           // Use [text](url) style
      linkReferenceStyle: 'full',     // Full reference style for links
    });
  
  // Add GitHub Flavored Markdown extensions
  // IMPORTANT: Rules are applied in order, most specific first
  
  // Google Docs uses inline styles instead of semantic tags
  // Add rules to handle CSS-based formatting
  
  // Handle Google Docs title (large font size, class="title")
  // Converts to H1 heading in markdown
  turndownService.addRule('googleDocsTitle', {
    filter: function (node: any) {
      if (node.nodeName === 'P' && node.getAttribute) {
        const className = node.getAttribute('class') || '';
        const style = node.getAttribute('style') || '';
        // Google Docs titles have class="title" or large font-size (20pt+)
        return className === 'title' || /font-size:\s*([2-9]\d|[1-9]\d{2,})pt/i.test(style);
      }
      return false;
    },
    replacement: function (content: string, node: any) {
      // Determine heading level based on font size
      const style = node.getAttribute('style') || '';
      const fontSizeMatch = style.match(/font-size:\s*(\d+)pt/i);
      const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 0;
      
      // Map font sizes to heading levels
      // Google Docs default: Title=26pt, Heading1=20pt, Heading2=16pt, Heading3=14pt
      let level = 1;
      if (fontSize >= 24) level = 1;
      else if (fontSize >= 18) level = 2;
      else if (fontSize >= 14) level = 3;
      else level = 4;
      
      return '\n' + '#'.repeat(level) + ' ' + content.trim() + '\n';
    }
  });
  
  // Handle bold via font-weight
  turndownService.addRule('googleDocsBold', {
    filter: function (node: any) {
      if (node.nodeName === 'SPAN' && node.getAttribute) {
        const style = node.getAttribute('style') || '';
        return /font-weight:\s*(?:bold|700|[89]\d{2})/i.test(style);
      }
      return false;
    },
    replacement: function (content: string) {
      return `**${content}**`;
    }
  });
  
  // Handle italic via font-style
  turndownService.addRule('googleDocsItalic', {
    filter: function (node: any) {
      if (node.nodeName === 'SPAN' && node.getAttribute) {
        const style = node.getAttribute('style') || '';
        return /font-style:\s*italic/i.test(style);
      }
      return false;
    },
    replacement: function (content: string) {
      return `*${content}*`;
    }
  });
  
  // Handle underline via text-decoration (but not links)
  // Note: Google Docs may style text to look like links (blue + underline) without actual href
  // Real hyperlinks with <a> tags are handled automatically by Turndown
  turndownService.addRule('googleDocsUnderline', {
    filter: function (node: any) {
      if (node.nodeName === 'SPAN' && node.getAttribute) {
        const style = node.getAttribute('style') || '';
        const hasUnderline = /text-decoration:\s*underline/i.test(style);
        const isLink = /color:\s*#1155cc/i.test(style);
        return hasUnderline && !isLink;
      }
      return false;
    },
    replacement: function (content: string) {
      return `_${content}_`;
    }
  });
  
  // Handle strikethrough
  turndownService.addRule('googleDocsStrikethrough', {
    filter: function (node: any) {
      if (node.nodeName === 'SPAN' && node.getAttribute) {
        const style = node.getAttribute('style') || '';
        return /text-decoration:\s*line-through/i.test(style);
      }
      return false;
    },
    replacement: function (content: string) {
      return `~~${content}~~`;
    }
  });
  
  // Remove tables (not supported)
  turndownService.addRule('removeTables', {
    filter: 'table',
    replacement: function () {
      return '\n[Table removed - not supported]\n';
    }
  });
  
  // Remove images (not supported - converts to huge base64 data URIs)
  turndownService.addRule('removeImages', {
    filter: 'img',
    replacement: function () {
      return '[Image removed - not supported]';
    }
  });
  
  // Convert HTML to Markdown (use cleaned HTML)
  const markdown = turndownService.turndown(cleanedHtml);
  
  // Normalize special characters (smart quotes, em-dashes, etc.)
  const normalized = normalizeSpecialCharacters(markdown);
  
  // Clean up excessive newlines (max 2 consecutive)
  const cleaned = normalized.replace(/\n{3,}/g, '\n\n').trim();
  
  console.log(`  Conversion complete: ${cleaned.length} characters`);
  if (warnings.length > 0) {
    console.log(`  Warnings: ${warnings.join(', ')}`);
  }
  return { markdown: cleaned, warnings };
  } catch (error: any) {
    console.error('  HTML to Markdown conversion failed:', error.message);
    throw new Error(
      `Failed to convert HTML to Markdown: ${error.message}\\n` +
      `This may indicate invalid HTML structure or unsupported formatting.`
    );
  }
}

/**
 * Normalize special characters to markdown-safe equivalents
 * Converts smart quotes, em-dashes, ellipses, etc. to standard ASCII
 */
function normalizeSpecialCharacters(text: string): string {
  return text
    // Smart quotes to straight quotes
    .replace(/[\u2018\u2019]/g, "'")  // ' ' → '
    .replace(/[\u201C\u201D]/g, '"')  // " " → "
    // Em-dash and en-dash to hyphens
    .replace(/\u2014/g, ' -- ')       // — → --
    .replace(/\u2013/g, '-')          // – → -
    // Ellipsis
    .replace(/\u2026/g, '...')        // … → ...
    // Non-breaking spaces
    .replace(/\u00A0/g, ' ')          //   → (space)
    // Multiplication sign
    .replace(/\u00D7/g, 'x')          // × → x
    // Fraction slashes
    .replace(/\u2044/g, '/')          // ⁄ → /
    // Bullet points outside lists
    .replace(/\u2022/g, '*')          // • → *
    // Other common symbols
    .replace(/\u00A9/g, '(c)')        // © → (c)
    .replace(/\u00AE/g, '(r)')        // ® → (r)
    .replace(/\u2122/g, '(tm)');      // ™ → (tm)
}
