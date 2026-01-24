# Figma Annotations Support Research

## Executive Summary

**CONFIRMED: Annotations are NOT accessible via the Figma REST API.**

While Figma has a native **Annotations** feature in Dev Mode that would be far superior to using "Note" component instances, our research confirms that:

1. ✅ The `annotations` property exists in Figma's internal data model (visible in `overriddenFields` arrays)
2. ❌ The `annotations` property is **NOT exposed** via the REST API
3. ❌ The OpenAPI spec shows `AnnotationsTrait` with `properties: {}` (empty) - intentionally not defined
4. ❌ No amount of API scopes enables access to annotations data
5. ⚠️ **Figma's own MCP Server** also cannot reliably access annotations

**Conclusion**: Continue with the existing "Note" component approach. Monitor for future API updates.

---

## Research Findings (Confirmed July 2025)

## Current Implementation (Note Components)

Currently, we detect "notes" by looking for `INSTANCE` nodes with `name === "Note"`:

```typescript
// From figma-helpers.ts line ~631
else if (child.type === 'INSTANCE' && child.name === 'Note') {
  const metadata = extractNodeMetadata(child);
  results.push(metadata);
}
```

**Limitations:**
- Relies on a specific component naming convention
- Not all Figma users use a "Note" component
- Spatial association is based on proximity (within 500px max distance)
- Notes are separate objects that need to be manually placed near frames

## Figma Annotations Feature

### What Are Annotations?

Annotations are a **native Figma Dev Mode feature** that allows designers to attach notes and pinned properties directly to nodes. They appear in the Figma API as a property on nodes.

### API Documentation

From the Figma REST API documentation:

#### `Annotation` Type
```typescript
interface Annotation {
  label: string;                    // The note text
  properties: AnnotationProperty[]; // Pinned properties
}
```

#### `AnnotationProperty` Type  
```typescript
interface AnnotationProperty {
  type: AnnotationPropertyType;  // The type of pinned property
}

type AnnotationPropertyType = 
  | 'width'
  | 'height'
  | 'maxWidth'
  | 'minWidth'
  | 'maxHeight'
  | 'minHeight'
  | 'fills'
  | 'strokes'
  | 'effects'
  | 'strokeWeight'
  | 'cornerRadius'
  | 'textStyleId'
  | 'textAlignHorizontal'
  | 'fontFamily'
  | 'fontStyle'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'itemSpacing'
  | 'padding'
  | 'layoutMode'
  | 'alignItems'
  | 'opacity'
  | 'mainComponent';
```

### Which Node Types Support Annotations?

Based on the OpenAPI spec, the `AnnotationsTrait` is included in these node type traits:

| Node Type | Has Annotations |
|-----------|-----------------|
| FRAME | ✅ (via FrameTraits) |
| GROUP | ✅ (via FrameTraits) |
| COMPONENT | ✅ (via FrameTraits) |
| COMPONENT_SET | ✅ (via FrameTraits) |
| INSTANCE | ✅ (via FrameTraits) |
| VECTOR | ✅ |
| STAR | ✅ |
| LINE | ✅ |
| ELLIPSE | ✅ |
| REGULAR_POLYGON | ✅ |
| RECTANGLE | ✅ (via RectangularShapeTraits) |
| TEXT | ✅ |

**Note:** The current OpenAPI spec shows `AnnotationsTrait` as having an empty `properties: {}` object, which suggests the actual `annotations` property might be returned differently or only in Dev Mode contexts. Further testing needed.

## API Testing Results

### Test 1: Direct Node Request
```bash
curl -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/files/7QW0kJ07DcM36mgQUJ5Dtj/nodes?ids=1043-2073"
```

**Result**: Response does NOT include an `annotations` property, even on nodes that have annotations in the Figma UI.

### Test 2: All Scopes Token
Created a new PAT with ALL available Figma scopes. Same result - no `annotations` property.

### Test 3: Page-Level Node
Tested page-level node (1-24). No annotations property.

### Test 4: Node with Annotations Override
Found node `9:827` that has `"annotations"` in its `overriddenFields` array:
```json
{
  "overriddenFields": ["fills", "annotations", "textStyleId"]
}
```

**This proves annotations exist in the data model but are NOT returned in the API response.**

### Test 5: Document-Level Keys
```bash
curl -s -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/files/7QW0kJ07DcM36mgQUJ5Dtj/nodes?ids=9:827" \
  | jq '.nodes["9:827"].document | keys'
```
**Result**: Keys include `absoluteBoundingBox`, `children`, `fills`, etc., but NOT `annotations`.

## Community Validation

### Forum Post: "Figma MCP Server not displaying annotations from nested component instances"
Multiple users experiencing same issue (5 months of discussion):

> "still no. bad. no get_annotations on figma mcp call tools." — VickyChing (1 month ago)

> "This looks like a case of poor or lacking documentation. In both the official docs and Figma's latest MCP video guide, they imply that annotations should work easily over MCP; That's not quite true." — Alex C (28 days ago)

**Workaround discovered by Alex C**: Annotations may appear as `data-development-annotations` and `data-content-annotations` attributes in the `get_design_context` MCP tool response, but this requires:
- Using Figma's official MCP Server (not REST API)
- Recursively fetching each nested component
- The data format is inconsistent

### Forum Post: "Figma MCP - Unable to extract annotation values from the design url"
User reports: "No matter which ever prompt I try, I'm not getting the annotated values."

### Forum Post: "Access to measurements on Edit mode via API"
User confirms annotations ARE accessible via **Plugin API** (`node.annotations`), but NOT via REST API:

> "When I want to access annotations via API on edit mode, I just need to check the node.annotations object."

**Key Insight**: The Plugin API (runs inside Figma) has access to annotations. The REST API (external access) does not.

---

## Theoretical Benefits (IF Annotations Were Accessible)

1. **Direct Association**: Annotations are properties ON the node, not separate objects requiring spatial proximity matching
2. **Designer Intent**: Designers explicitly attach annotations to specific elements - no guessing
3. **Richer Context**: Includes both free-text notes (`label`) AND pinned properties showing specific design decisions
4. **Standard Workflow**: Aligns with how designers actually document designs in Dev Mode

## Archived Implementation Approach (NOT IMPLEMENTED)

> ⚠️ **The following implementation approach is archived.** Annotations are not accessible via REST API, so this code cannot be implemented. Kept for reference if Figma exposes annotations in the future.

### Phase 1: Extend FigmaNodeMetadata Interface

```typescript
// In figma-helpers.ts

interface AnnotationProperty {
  type: string;  // AnnotationPropertyType
}

interface Annotation {
  label: string;
  properties: AnnotationProperty[];
}

interface FigmaNodeMetadata {
  // ... existing fields ...
  annotations?: Annotation[];  // NEW
}
```

### Phase 2: Extract Annotations in extractNodeMetadata()

```typescript
function extractNodeMetadata(node: any): FigmaNodeMetadata {
  // ... existing extraction ...
  
  // Extract annotations if present
  const annotations = node.annotations;
  
  return {
    // ... existing fields ...
    ...(annotations && { annotations }),
  };
}
```

### Phase 3: Update Note Detection Logic

Instead of (or in addition to) looking for "Note" INSTANCE components, check for `annotations` property:

```typescript
// New approach: Check for annotations on any frame
function hasAnnotations(node: FigmaNodeMetadata): boolean {
  return node.annotations && node.annotations.length > 0;
}

function getAnnotationText(node: FigmaNodeMetadata): string {
  if (!node.annotations) return '';
  return node.annotations.map(a => a.label).filter(Boolean).join('\n\n');
}
```

### Phase 4: Update Screen Setup Flow

In `figma-screen-setup.ts`, when processing frames:

```typescript
// Current: Associate separate note objects with frames by proximity
// New: Read annotations directly from the frame itself

const screenWithAnnotations = {
  ...screen,
  annotations: frame.annotations || [],
  annotationLabels: (frame.annotations || [])
    .map(a => a.label)
    .filter(Boolean)
    .join('\n\n'),
};
```

### Phase 5: Update Analysis Prompts

When generating screen analysis, include annotation labels as direct context:

```typescript
// In screen-analysis-regenerator.ts
const notesContent = screen.annotationLabels || existingNotesContent;
```

## Testing Considerations

1. **Create test Figma file** with:
   - Frames with annotations attached
   - Frames with pinned properties only
   - Frames with both annotations and "Note" components (for comparison)

2. **Verify API returns annotations** - The OpenAPI spec shows the trait but not the property definition, so we need to verify the actual API response format

3. **Backward compatibility** - Continue supporting "Note" components as fallback for files that don't use annotations

---

## Confirmed Findings & Path Forward

### Original Questions - ANSWERED

~~1. **API Response Format**: The OpenAPI spec shows `AnnotationsTrait` with empty properties. Need to verify:~~
   - ~~Is `annotations` a top-level property on nodes?~~
   - ~~What is the exact JSON structure returned?~~
   - ~~Are there any scope/permission requirements?~~

**ANSWERED**: Annotations are NOT returned via REST API. Only accessible via Plugin API.

~~2. **Dev Mode Requirement**: Are annotations only available when the file is in Dev Mode, or always present?~~

**ANSWERED**: Annotations are a Dev Mode feature. Even in Dev Mode, they are not exposed via REST API.

~~3. **Enterprise Features**: Are annotations available on all Figma plans or only Enterprise/Organization?~~

**ANSWERED**: The feature exists across plans, but API access is the limitation.

## Recommended Path Forward

### Option 1: Continue with "Note" Component Approach ✅ RECOMMENDED
- **Pros**: Works today, gives designers explicit way to add notes
- **Cons**: Requires specific component naming, spatial proximity matching
- **Action**: Keep current implementation, document "Note" component usage for designers

### Option 2: Monitor for API Updates
- Figma may expose annotations in a future REST API version
- Watch Figma changelog and developer blog
- Consider periodically re-testing API responses

### Option 3: Figma Plugin Integration (Complex)
- Build a Figma plugin that exports annotations to JSON
- Plugin would need to be run by designers before analysis
- Adds friction to workflow - not recommended unless annotations are critical

### Option 4: Use Figma MCP Server's `get_design_context` (Limited)
- Figma's official MCP exposes some annotation data via `data-development-annotations` attributes
- Inconsistent and undocumented
- Requires MCP protocol, not REST API
- May be worth investigating if MCP becomes primary interface

## Final Conclusion

**The "Note" component approach remains the best option for now.**

While Figma's native annotations would be superior, they are intentionally not exposed via REST API. This appears to be a product decision by Figma, likely to:
- Keep Dev Mode features within the Figma ecosystem
- Encourage use of their MCP Server / Code Connect features
- Avoid exposing potentially incomplete data externally

## References

- [Figma REST API - Property Types](https://developers.figma.com/docs/rest-api/file-property-types/) - Documents `Annotation` and `AnnotationProperty` types
- [Figma REST API - Node Types](https://developers.figma.com/docs/rest-api/file-node-types/) - Shows which nodes include `AnnotationsTrait`
- [Figma REST API OpenAPI Spec](https://github.com/figma/rest-api-spec) - Source of truth for API structure
- [Figma Forum: MCP Server not displaying annotations](https://forum.figma.com/report-a-problem-6/figma-mcp-server-not-displaying-annotations-from-nested-component-instances-42958) - Community validation of API limitation
- [Figma Forum: Unable to extract annotation values](https://forum.figma.com/ask-the-community-7/figma-mcp-unable-to-extract-annotation-values-from-the-design-url-46406) - More community reports

## Appendix: Implementation Code (ARCHIVED - Not Implemented)

The following implementation approach was researched but will NOT be implemented since annotations are not accessible via REST API. Kept for reference if API access becomes available.
