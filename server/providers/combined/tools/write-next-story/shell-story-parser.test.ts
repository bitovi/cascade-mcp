/**
 * Shell Story Parser Tests
 * 
 * Tests for parsing shell stories from markdown format
 */

import { describe, it, expect } from '@jest/globals';
import { parseShellStories, type ParsedShellStory } from './shell-story-parser.js';

describe('parseShellStories', () => {
  describe('basic shell story parsing', () => {
    it('should parse a shell story with bold title and ⟩ separator', () => {
      const input = `
- \`st001\` **Add Promotion to Cart** ⟩ Allow users to apply a promotion code to their shopping cart
  * SCREENS: [promo-add-form](https://www.figma.com/design/abc/Project?node-id=123-456)
  * DEPENDENCIES: none
  * ☐ User can enter a valid promotion code
  * ⏬ Support for stacking multiple promotions (low priority - implement in st015)
  * ❌ Promotion auto-suggestions (out of scope)
  * ❓ What error messages should display?
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'st001',
        title: 'Add Promotion to Cart',
        description: 'Allow users to apply a promotion code to their shopping cart',
        jiraUrl: undefined,
        timestamp: undefined,
        screens: ['https://www.figma.com/design/abc/Project?node-id=123-456'],
        dependencies: [],
        included: ['User can enter a valid promotion code'],
        lowPriority: ['Support for stacking multiple promotions (low priority - implement in st015)'],
        excluded: ['Promotion auto-suggestions (out of scope)'],
        questions: ['What error messages should display?'],
      });
    });

    it('should parse a shell story without bold formatting', () => {
      const input = `
- \`st002\` Display Cart Total ⟩ Show the current cart total with tax
  * SCREENS: [cart-view](https://www.figma.com/design/xyz/Project?node-id=789-012)
  * DEPENDENCIES: st001
  * ☐ Display total amount
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'st002',
        title: 'Display Cart Total',
        description: 'Show the current cart total with tax',
        dependencies: ['st001'],
      });
    });
  });

  describe('completed shell stories with Jira URLs', () => {
    it('should parse a completed story with bold link and timestamp', () => {
      const input = `
- \`st001\` **[Add Promotion to Cart](https://jira.company.com/browse/PROJ-123)** ⟩ Allow users to apply a promotion code _(2025-01-15T10:30:00Z)_
  * SCREENS: [promo-form](https://www.figma.com/design/abc/Project?node-id=123-456)
  * DEPENDENCIES: none
  * ☐ Promotion code input field
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'st001',
        title: 'Add Promotion to Cart',
        description: 'Allow users to apply a promotion code',
        jiraUrl: 'https://jira.company.com/browse/PROJ-123',
        timestamp: '2025-01-15T10:30:00Z',
      });
    });

    it('should parse a completed story with plain link (no bold)', () => {
      const input = `
- \`st002\` [Display Cart](https://jira.company.com/browse/PROJ-124) ⟩ Show cart contents _(2025-01-15T11:00:00Z)_
  * SCREENS: [cart](https://www.figma.com/design/xyz/Project?node-id=789-012)
  * DEPENDENCIES: st001
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'st002',
        title: 'Display Cart',
        description: 'Show cart contents',
        jiraUrl: 'https://jira.company.com/browse/PROJ-124',
        timestamp: '2025-01-15T11:00:00Z',
      });
    });
  });

  describe('multiple dependencies', () => {
    it('should parse multiple dependencies correctly', () => {
      const input = `
- \`st005\` **Checkout Flow** ⟩ Complete the checkout process
  * SCREENS: [checkout](https://www.figma.com/design/abc/Project?node-id=999-000)
  * DEPENDENCIES: st001, st002, st003
  * ☐ Payment processing
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].dependencies).toEqual(['st001', 'st002', 'st003']);
    });

    it('should handle "none" dependencies', () => {
      const input = `
- \`st001\` **First Story** ⟩ The initial story
  * SCREENS: [screen1](https://www.figma.com/design/abc/Project?node-id=123-456)
  * DEPENDENCIES: none
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].dependencies).toEqual([]);
    });
  });

  describe('multiple shell stories', () => {
    it('should parse multiple stories in sequence', () => {
      const input = `
- \`st001\` **First Story** ⟩ The first story description
  * SCREENS: [screen1](https://figma.com/1)
  * DEPENDENCIES: none
  * ☐ First feature

- \`st002\` **Second Story** ⟩ The second story description
  * SCREENS: [screen2](https://figma.com/2)
  * DEPENDENCIES: st001
  * ☐ Second feature

- \`st003\` **Third Story** ⟩ The third story description
  * SCREENS: [screen3](https://figma.com/3)
  * DEPENDENCIES: st001, st002
  * ☐ Third feature
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('st001');
      expect(result[1].id).toBe('st002');
      expect(result[2].id).toBe('st003');
      expect(result[2].dependencies).toEqual(['st001', 'st002']);
    });
  });

  describe('multiple screens', () => {
    it('should parse multiple Figma screen URLs', () => {
      const input = `
- \`st001\` **Multi-Screen Flow** ⟩ A flow spanning multiple screens
  * SCREENS: [add-form](https://figma.com/1), [success](https://figma.com/2), [error](https://figma.com/3)
  * DEPENDENCIES: none
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].screens).toEqual([
        'https://figma.com/1',
        'https://figma.com/2',
        'https://figma.com/3',
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parseShellStories('');
      expect(result).toEqual([]);
    });

    it('should skip malformed stories without story ID', () => {
      const input = `
- **No ID Story** ⟩ This should be skipped
  * SCREENS: [screen](https://figma.com/1)

- \`st001\` **Valid Story** ⟩ This should be parsed
  * SCREENS: [screen](https://figma.com/2)
  * DEPENDENCIES: none
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('st001');
    });

    it('should skip stories without ⟩ separator', () => {
      const input = `
- \`st001\` **Bad Format** - Missing separator
  * SCREENS: [screen](https://figma.com/1)

- \`st002\` **Good Format** ⟩ Has separator
  * SCREENS: [screen](https://figma.com/2)
  * DEPENDENCIES: none
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('st002');
    });

    it('should handle descriptions with special characters', () => {
      const input = `
- \`st001\` **Complex Title (With Parentheses)** ⟩ Description with "quotes" and 'apostrophes'
  * SCREENS: [screen](https://figma.com/1)
  * DEPENDENCIES: none
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Complex Title (With Parentheses)');
      expect(result[0].description).toBe('Description with "quotes" and \'apostrophes\'');
    });

    it('should preserve raw content', () => {
      const input = `
- \`st001\` **Test Story** ⟩ Test description
  * SCREENS: [screen](https://figma.com/1)
  * DEPENDENCIES: none
  * ☐ Feature one
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].rawContent).toContain('`st001`');
      expect(result[0].rawContent).toContain('SCREENS:');
      expect(result[0].rawContent).toContain('☐ Feature one');
    });
  });

  describe('bullet formatting variations', () => {
    it('should handle both * and - bullet styles', () => {
      const input = `
- \`st001\` **Mixed Bullets** ⟩ Testing different bullet styles
  - SCREENS: [screen1](https://figma.com/1)
  - DEPENDENCIES: none
  - ☐ Feature with dash
  * ❌ Exclusion with asterisk
  * ❓ Question with asterisk
`;

      const result = parseShellStories(input);

      expect(result).toHaveLength(1);
      expect(result[0].included).toContain('Feature with dash');
      expect(result[0].excluded).toContain('Exclusion with asterisk');
      expect(result[0].questions).toContain('Question with asterisk');
    });
  });
});
