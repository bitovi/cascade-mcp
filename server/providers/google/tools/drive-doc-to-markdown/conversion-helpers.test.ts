/**
 * Tests for HTML to Markdown conversion with linkedom
 */

import { describe, test, expect } from '@jest/globals';
import { htmlToMarkdown } from './conversion-helpers.js';

describe('htmlToMarkdown with linkedom', () => {
  test('should remove style tags', () => {
    const html = `
      <style>body { color: red; }</style>
      <p>Hello World</p>
    `;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).not.toContain('color: red');
    expect(markdown).toContain('Hello World');
  });

  test('should remove script tags', () => {
    const html = `
      <script>alert('test');</script>
      <p>Content here</p>
    `;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).not.toContain('alert');
    expect(markdown).toContain('Content here');
  });

  test('should remove meta and link tags', () => {
    const html = `
      <head>
        <meta charset="utf-8">
        <link rel="stylesheet" href="style.css">
      </head>
      <body>
        <p>Test content</p>
      </body>
    `;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).not.toContain('charset');
    expect(markdown).not.toContain('stylesheet');
    expect(markdown).toContain('Test content');
  });

  test('should convert bold formatting', () => {
    const html = `<p><b>Bold text</b></p>`;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('**Bold text**');
  });

  test('should convert italic formatting', () => {
    const html = `<p><i>Italic text</i></p>`;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('*Italic text*');
  });

  test('should handle links correctly', () => {
    const html = `
      <p>Visit <a href="https://example.com">this link</a></p>
    `;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('[this link](https://example.com)');
  });

  test('should detect images', () => {
    const html = `
      <p>Some text</p>
      <img src="image.jpg" alt="Test">
      <img src="image2.jpg" alt="Test2">
    `;
    const { warnings } = htmlToMarkdown(html);
    expect(warnings).toContain('Document contains 2 image(s) which are not supported');
  });

  test('should detect tables', () => {
    const html = `
      <table>
        <tr><td>Cell 1</td><td>Cell 2</td></tr>
      </table>
      <p>After table</p>
    `;
    const { warnings } = htmlToMarkdown(html);
    expect(warnings).toContain('Document contains 1 table(s) which are not supported');
  });

  test('should handle lists', () => {
    const html = `
      <ul>
        <li>First item</li>
        <li>Second item</li>
      </ul>
    `;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('First item');
    expect(markdown).toContain('Second item');
    // Should have list markers
    expect(markdown).toMatch(/[-*]\s+First item/);
  });

  test('should clean up excessive newlines', () => {
    const html = `
      <p>Paragraph 1</p>
      
      
      
      <p>Paragraph 2</p>
    `;
    const { markdown } = htmlToMarkdown(html);
    // Should not have more than 2 consecutive newlines
    expect(markdown).not.toMatch(/\n{3,}/);
  });

  test('should handle empty content', () => {
    const html = `<p>   </p><p></p>`;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown.trim()).toBe('');
  });

  test('should handle malformed HTML gracefully', () => {
    const html = `<p>Unclosed paragraph<div>Some content`;
    // Should not throw an error
    expect(() => htmlToMarkdown(html)).not.toThrow();
    const { markdown } = htmlToMarkdown(html);
    expect(markdown.length).toBeGreaterThan(0);
  });

  test('should process basic paragraph', () => {
    const html = `<p>Simple paragraph</p>`;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toBe('Simple paragraph');
  });

  test('should handle multiple paragraphs', () => {
    const html = `<p>First paragraph</p><p>Second paragraph</p>`;
    const { markdown } = htmlToMarkdown(html);
    expect(markdown).toContain('First paragraph');
    expect(markdown).toContain('Second paragraph');
  });

  test('should not throw on valid HTML', () => {
    const html = `
      <html>
        <body>
          <h1>Title</h1>
          <p>Content</p>
        </body>
      </html>
    `;
    expect(() => htmlToMarkdown(html)).not.toThrow();
  });
});
