/**
 * Unit tests for semantic XML generator
 */

import {
  generateSemanticXml,
  nodeToSemanticXML,
  shouldSkipNode,
  isLikelyDecorativeNode,
  isGenericWrapper,
  isIconComponent,
  getSemanticTagName,
  getSemanticAttributes,
  isInteractive,
  toXmlTagName,
  toXmlAttrName,
  escapeXml,
} from './semantic-xml-generator';

describe('semantic-xml-generator', () => {
  describe('escapeXml', () => {
    it('should escape XML special characters', () => {
      expect(escapeXml('Hello & "World" <test>')).toBe('Hello &amp; &quot;World&quot; &lt;test&gt;');
      expect(escapeXml("It's a test")).toBe('It&apos;s a test');
    });
  });

  describe('toXmlTagName', () => {
    it('should convert strings to valid XML tag names', () => {
      expect(toXmlTagName('My Component')).toBe('My-Component');
      expect(toXmlTagName('Button 123')).toBe('Button-123');
      expect(toXmlTagName('1-Start')).toBe('_1-Start');
      expect(toXmlTagName('Test@#$')).toBe('Test');
      expect(toXmlTagName('')).toBe('Element');
    });
  });

  describe('toXmlAttrName', () => {
    it('should convert strings to valid XML attribute names', () => {
      expect(toXmlAttrName('Property1')).toBe('Property1');
      expect(toXmlAttrName('1Property')).toBe('_1Property');
      expect(toXmlAttrName('test@attr')).toBe('testattr');
      expect(toXmlAttrName('')).toBe('attr');
    });
  });

  describe('shouldSkipNode', () => {
    it('should skip VECTOR nodes', () => {
      expect(shouldSkipNode({ type: 'VECTOR', name: 'Arrow' })).toBe(true);
    });

    it('should skip decorative nodes based on characteristics', () => {
      expect(shouldSkipNode({ type: 'FRAME', name: 'Background' })).toBe(true);
      expect(shouldSkipNode({ type: 'FRAME', name: 'Pixel' })).toBe(true);
      expect(shouldSkipNode({ type: 'FRAME', name: 'Icon-wrapper' })).toBe(true);
      expect(shouldSkipNode({ type: 'FRAME', name: 'Divider' })).toBe(true);
    });

    it('should not skip semantic nodes', () => {
      expect(shouldSkipNode({ type: 'INSTANCE', name: 'Button' })).toBe(false);
      expect(shouldSkipNode({ type: 'TEXT', name: 'Label' })).toBe(false);
    });
  });

  describe('isLikelyDecorativeNode', () => {
    it('should identify nodes with low opacity', () => {
      expect(isLikelyDecorativeNode({ name: 'Overlay', opacity: 0.05 })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'Overlay', opacity: 0.5 })).toBe(false);
    });

    it('should identify very small nodes (spacers)', () => {
      expect(isLikelyDecorativeNode({ 
        name: 'Spacer', 
        absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } 
      })).toBe(true);
      expect(isLikelyDecorativeNode({ 
        name: 'Content', 
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 } 
      })).toBe(false);
    });

    it('should identify wrapper nodes by suffix', () => {
      expect(isLikelyDecorativeNode({ name: 'Icon-wrapper' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'Left-icon-wrapper' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'Content-Container' })).toBe(false);
    });

    it('should identify common decorative node names', () => {
      expect(isLikelyDecorativeNode({ name: 'Background' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'background' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'Pixel' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'Divider' })).toBe(true);
      expect(isLikelyDecorativeNode({ name: 'MainContent' })).toBe(false);
    });
  });

  describe('isGenericWrapper', () => {
    it('should identify generic Frame nodes', () => {
      expect(isGenericWrapper({ type: 'FRAME', name: 'Frame 123' })).toBe(true);
      expect(isGenericWrapper({ type: 'GROUP', name: 'Group 456' })).toBe(true);
      expect(isGenericWrapper({ type: 'FRAME', name: 'Text' })).toBe(true);
    });

    it('should not identify named semantic frames', () => {
      expect(isGenericWrapper({ type: 'FRAME', name: 'Header' })).toBe(false);
      expect(isGenericWrapper({ type: 'FRAME', name: 'Content-Container' })).toBe(false);
    });
  });

  describe('isIconComponent', () => {
    it('should identify icon components by name prefix', () => {
      expect(isIconComponent({ type: 'INSTANCE', name: 'Icon-thumbs-up' })).toBe(true);
      expect(isIconComponent({ type: 'INSTANCE', name: 'icon-close' })).toBe(true);
      expect(isIconComponent({ type: 'INSTANCE', name: 'Button Icon' })).toBe(true);
    });

    it('should identify small vector-heavy nodes as icons', () => {
      const iconNode = {
        type: 'INSTANCE',
        name: 'CheckMark',
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        children: [
          { type: 'VECTOR', name: 'Path' },
          { type: 'VECTOR', name: 'Path2' }
        ]
      };
      expect(isIconComponent(iconNode)).toBe(true);
    });

    it('should not identify large components as icons', () => {
      const largeNode = {
        type: 'INSTANCE',
        name: 'Card',
        absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 150 },
        children: [
          { type: 'VECTOR', name: 'Path' }
        ]
      };
      expect(isIconComponent(largeNode)).toBe(false);
    });

    it('should not identify non-icon components', () => {
      expect(isIconComponent({ type: 'INSTANCE', name: 'Button' })).toBe(false);
      expect(isIconComponent({ type: 'TEXT', name: 'Label' })).toBe(false);
    });
  });

  describe('isInteractive', () => {
    it('should identify interactive nodes by name', () => {
      expect(isInteractive({ name: 'Submit-Button' })).toBe(true);
      expect(isInteractive({ name: 'Click-Action' })).toBe(true);
    });

    it('should identify interactive nodes with reactions', () => {
      expect(isInteractive({ name: 'Component', reactions: [{ action: 'NAVIGATE' }] })).toBe(true);
    });

    it('should not identify non-interactive nodes', () => {
      expect(isInteractive({ name: 'Label' })).toBe(false);
      expect(isInteractive({ name: 'Text', reactions: [] })).toBe(false);
    });
  });

  describe('getSemanticTagName', () => {
    it('should use component name for instances', () => {
      expect(getSemanticTagName({ type: 'INSTANCE', name: 'My-Button' })).toBe('My-Button');
      expect(getSemanticTagName({ type: 'COMPONENT', name: 'Header' })).toBe('Header');
    });

    it('should use semantic type mapping for basic nodes', () => {
      expect(getSemanticTagName({ type: 'FRAME', name: 'Frame 1' })).toBe('Frame');
      expect(getSemanticTagName({ type: 'TEXT', name: 'Text 123' })).toBe('Text-123');
    });

    it('should use meaningful names', () => {
      expect(getSemanticTagName({ type: 'FRAME', name: 'Content-Area' })).toBe('Content-Area');
    });
  });

  describe('getSemanticAttributes', () => {
    it('should include type for instances', () => {
      const attrs = getSemanticAttributes({ type: 'INSTANCE', name: 'Button' });
      expect(attrs).toContain('type="instance"');
    });

    it('should include interactive flag', () => {
      const attrs = getSemanticAttributes({ 
        name: 'Submit-Button',
        type: 'INSTANCE'
      });
      expect(attrs).toContain('interactive="true"');
    });

    it('should include component properties', () => {
      const node = {
        type: 'INSTANCE',
        name: 'Button',
        componentProperties: {
          State: { value: 'Hover' },
          Property1: { value: 'Original' },
        }
      };
      const attrs = getSemanticAttributes(node);
      expect(attrs).toContain('State="Hover"');
      expect(attrs).toContain('Property1="Original"');
    });
  });

  describe('nodeToSemanticXML', () => {
    it('should skip invisible nodes', () => {
      const result = nodeToSemanticXML({ type: 'FRAME', name: 'Hidden', visible: false });
      expect(result).toBeNull();
    });

    it('should skip vector nodes', () => {
      const result = nodeToSemanticXML({ type: 'VECTOR', name: 'Arrow' });
      expect(result).toBeNull();
    });

    it('should generate self-closing tags for leaf nodes', () => {
      const result = nodeToSemanticXML({ type: 'RECTANGLE', name: 'Box' }, 0);
      expect(result).toBe('<Box />');
    });

    it('should extract text content', () => {
      const result = nodeToSemanticXML({ 
        type: 'TEXT', 
        name: 'Label',
        characters: 'Hello World'
      }, 0);
      expect(result).toBe('<Label>Hello World</Label>');
    });

    it('should skip wrapper tags for generic text', () => {
      const result = nodeToSemanticXML({ 
        type: 'TEXT', 
        name: '_1',
        characters: '5'
      }, 0);
      expect(result).toBe('5');
    });

    it('should handle nested components', () => {
      const node = {
        type: 'INSTANCE',
        name: 'Comment',
        children: [
          { type: 'TEXT', name: 'Author', characters: 'John Doe' },
          { type: 'TEXT', name: 'Message', characters: 'Great work!' }
        ]
      };
      const result = nodeToSemanticXML(node, 0);
      expect(result).toContain('<Comment type="instance">');
      expect(result).toContain('<Author>John Doe</Author>');
      expect(result).toContain('<Message>Great work!</Message>');
      expect(result).toContain('</Comment>');
    });

    it('should self-close icon components', () => {
      const result = nodeToSemanticXML({ 
        type: 'INSTANCE', 
        name: 'Icon-thumbs-up',
        children: [
          { type: 'VECTOR', name: 'Path' }
        ]
      }, 0);
      expect(result).toBe('<Icon-thumbs-up type="instance" />');
    });

    it('should hoist children of generic wrappers', () => {
      const node = {
        type: 'FRAME',
        name: 'Frame 1',
        children: [
          { type: 'TEXT', name: 'Label', characters: 'Text' }
        ]
      };
      const result = nodeToSemanticXML(node, 0);
      expect(result).toBe('<Label>Text</Label>');
    });

    it('should inline single text child when text has no tag wrapper', () => {
      const node = {
        type: 'INSTANCE',
        name: 'Badge',
        children: [
          { type: 'TEXT', name: '_1', characters: '3' }
        ]
      };
      const result = nodeToSemanticXML(node, 0);
      expect(result).toBe('<Badge type="instance">3</Badge>');
    });

    it('should handle component states', () => {
      const node = {
        type: 'INSTANCE',
        name: 'Reaction-Statistics',
        componentProperties: {
          State: { value: 'Hover' }
        },
        children: [
          { type: 'INSTANCE', name: 'Icon-thumbs-up' },
          { type: 'TEXT', name: '_1', characters: '1' }
        ]
      };
      const result = nodeToSemanticXML(node, 0);
      expect(result).toContain('State="Hover"');
      expect(result).toContain('<Icon-thumbs-up');
    });
  });

  describe('generateSemanticXml', () => {
    it('should generate valid XML with header', () => {
      const nodeData = {
        type: 'FRAME',
        name: 'Test Screen',
        children: [
          { type: 'TEXT', name: 'Title', characters: 'Welcome' }
        ]
      };
      const result = generateSemanticXml(nodeData);
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<!-- Semantic structure for Figma screen: Test Screen -->');
      expect(result).toContain('<Screen name="Test Screen" type="FRAME">');
      expect(result).toContain('<Title>Welcome</Title>');
      expect(result).toContain('</Screen>');
    });

    it('should handle empty children', () => {
      const nodeData = {
        type: 'FRAME',
        name: 'Empty Screen',
        children: []
      };
      const result = generateSemanticXml(nodeData);
      expect(result).toContain('<Screen name="Empty Screen" type="FRAME">');
      expect(result).toContain('</Screen>');
    });

    it('should throw error for invalid input', () => {
      expect(() => generateSemanticXml(null)).toThrow('Invalid node data');
      expect(() => generateSemanticXml(undefined)).toThrow('Invalid node data');
      expect(() => generateSemanticXml('not an object')).toThrow('Invalid node data');
    });

    it('should escape XML special characters in node names', () => {
      const nodeData = {
        type: 'FRAME',
        name: 'Test & "Screen" <with> special chars',
        children: []
      };
      const result = generateSemanticXml(nodeData);
      expect(result).toContain('Test &amp; &quot;Screen&quot; &lt;with&gt; special chars');
    });
  });

  describe('integration: complex component hierarchy', () => {
    it('should handle Comment with Reaction-Statistics and Hover-Card', () => {
      const node = {
        type: 'INSTANCE',
        name: 'Comment-1',
        componentProperties: {
          Property1: { value: 'Original' }
        },
        children: [
          {
            type: 'INSTANCE',
            name: 'User',
            children: [
              { type: 'TEXT', name: 'Name', characters: 'Alex Morgan' }
            ]
          },
          {
            type: 'INSTANCE',
            name: 'Reaction-Statistics',
            componentProperties: {
              State: { value: 'Hover' }
            },
            reactions: [{ action: 'OPEN' }],
            children: [
              { type: 'INSTANCE', name: 'Icon-thumbs-up' },
              { type: 'TEXT', name: '_1', characters: '1' },
              { type: 'INSTANCE', name: 'Icon-thumbs-down' },
              { type: 'TEXT', name: '_2', characters: '1' },
              {
                type: 'INSTANCE',
                name: 'Hover-Card',
                children: [
                  {
                    type: 'FRAME',
                    name: 'Slot',
                    children: [
                      {
                        type: 'INSTANCE',
                        name: 'Text-Listing',
                        children: [
                          { type: 'TEXT', name: 'Text', characters: 'Alex Morgan' }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = nodeToSemanticXML(node, 0);
      
      // Verify component hierarchy
      expect(result).toContain('<Comment-1');
      expect(result).toContain('Property1="Original"');
      expect(result).toContain('<User');
      expect(result).toContain('<Name>Alex Morgan</Name>');
      expect(result).toContain('<Reaction-Statistics');
      expect(result).toContain('State="Hover"');
      expect(result).toContain('interactive="true"');
      expect(result).toContain('<Icon-thumbs-up');
      expect(result).toContain('<Hover-Card');
      expect(result).toContain('<Text-Listing');
      expect(result).toContain('Alex Morgan');
    });
  });

  describe('size reduction validation', () => {
    it('should achieve significant size reduction', () => {
      // Simulate a realistic node with lots of Figma metadata
      const largeNode = {
        type: 'FRAME',
        name: 'Screen',
        id: '1199:79138',
        absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
        constraints: { vertical: 'TOP', horizontal: 'LEFT' },
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
        children: Array(10).fill(null).map((_, i) => ({
          type: 'INSTANCE',
          name: `Component-${i}`,
          id: `comp-${i}`,
          absoluteBoundingBox: { x: 0, y: i * 50, width: 375, height: 50 },
          children: [
            { type: 'TEXT', name: 'Label', characters: `Item ${i}`, id: `text-${i}` }
          ]
        }))
      };

      const jsonSize = JSON.stringify(largeNode).length;
      const xmlSize = generateSemanticXml(largeNode).length;
      const reduction = (1 - xmlSize / jsonSize) * 100;

      // Should achieve at least 50% reduction (realistic with small sample)
      expect(reduction).toBeGreaterThan(50);
    });
  });
});
