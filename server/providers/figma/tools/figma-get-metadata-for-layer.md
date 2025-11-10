# figma-get-metadata-for-layer

Quick prompt:

> ```
> MCP get metadata for Figma layer https://www.figma.com/design/ABC123/Project?node-id=60-55
> ```

## Purpose

The `figma-get-metadata-for-layer` tool retrieves detailed metadata about a specific Figma layer including its position, size, type, and visual properties. This is useful for understanding layer structure before downloading or analyzing designs.

**Primary use cases:**
- Inspect layer properties (size, position, type)
- Verify layers exist before downloading
- Get bounding boxes for spatial analysis
- Understand layer structure and hierarchy

**What problem it solves:**
- **Layer discovery**: Find out what a layer contains without downloading the full image
- **Spatial analysis**: Get coordinates and dimensions for layout understanding
- **Type verification**: Check if a node is a frame, component, text, etc.
- **Validation**: Confirm layers exist before bulk operations

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ Yes | Figma file or page URL (supports both `/design/` and `/file/` formats). Example: `https://www.figma.com/design/ABC123/Project` |
| `nodeId` | string | ✅ Yes | Target layer node ID in URL format (e.g., "60-55"). This is the hyphen-separated format from Figma URLs. |

### Returns

The tool returns layer metadata:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON object with layer metadata
    }
  ]
}
```

**Success response format:**
```json
{
  "id": "60:55",
  "name": "Login Screen",
  "type": "FRAME",
  "visible": true,
  "locked": false,
  "absoluteBoundingBox": {
    "x": 100,
    "y": 200,
    "width": 375,
    "height": 812
  }
}
```

**Response includes:**
- **id**: Figma node ID (colon format)
- **name**: Layer name from Figma
- **type**: Node type (FRAME, COMPONENT, TEXT, GROUP, etc.)
- **visible**: Whether the layer is visible
- **locked**: Whether the layer is locked
- **absoluteBoundingBox**: Position and size (x, y, width, height) or null

**Error response includes:**
- Authentication errors
- Invalid URL format
- Node not found
- Figma API errors

### Dependencies

**Required:**
- Figma OAuth authentication
- Read access to the Figma file

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `figma-get-metadata-for-layer` tool:

1. **"Get metadata for Figma layer 60-55 in file ABC123"**
2. **"Show me details about https://figma.com/design/ABC123/Project?node-id=60-55"**
3. **"What are the properties of Figma layer 60-55?"**

### Walkthrough: Core Use Case

**Scenario**: You want to check a layer's size and type before downloading it.

#### Step 1: Get the Figma URL

In Figma:
1. Select the layer you want to inspect
2. Copy the URL from your browser

Example:
```
https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project?node-id=60-55
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Get metadata for https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project?node-id=60-55"
```

#### Step 3: Review the metadata

The tool returns layer properties:
```json
{
  "id": "60:55",
  "name": "Login Screen",
  "type": "FRAME",
  "visible": true,
  "locked": false,
  "absoluteBoundingBox": {
    "x": 100,
    "y": 200,
    "width": 375,
    "height": 812
  }
}
```

From this you can see:
- ✅ Layer exists and is named "Login Screen"
- ✅ It's a FRAME (suitable for downloading)
- ✅ It's visible and not locked
- ✅ Size is 375x812 (mobile screen dimensions)
- ✅ Position is at x:100, y:200

#### Step 4: Take action

Now you can confidently download the image:
```
"Download Figma image from that URL"
```

Or make decisions based on metadata:
```
"This is a mobile screen (375x812). Download it at 2x scale for retina displays."
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Figma
2. **You have read access** to the Figma file
3. **The node ID exists** in the file

### Related Tools

Tools commonly used with `figma-get-metadata-for-layer`:

- **`figma-get-layers-for-page`** - First list all layers, then get metadata for specific ones
- **`figma-get-image-download`** - After checking metadata, download the layer
- **`write-shell-stories`** - Uses metadata to analyze screen dimensions

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No Figma access token found in authentication context"`

**Explanation**: You're not authenticated with Figma.

**Solution**: Authenticate with Figma through the MCP client. The client will prompt you to authorize access.

---

#### Invalid URL Format

**Error**: `"Error: Invalid Figma URL format. Expected format: https://www.figma.com/design/FILEID or https://www.figma.com/file/FILEID"`

**Explanation**: The URL doesn't match expected Figma format.

**Solution**:
- Copy URLs directly from Figma (browser address bar)
- Ensure URL includes `/design/` or `/file/` path
- Verify file key is present

---

#### Node Not Found

**Error**: `"Error: Layer with ID 60:55 not found in file"`

**Explanation**: The specified node doesn't exist in the file.

**Solution**:
- Verify the node ID is correct
- Use `figma-get-layers-for-page` to see available layers
- Check that the layer hasn't been deleted
- Ensure you're looking in the correct Figma file

---

#### Permission Denied

**Error**: `"Figma API error: 403 Forbidden"`

**Explanation**: Your account doesn't have access to this file.

**Solution**:
- Request access from the file owner
- Verify you're logged into the correct Figma account
- Check if the file is private

---

### Known Limitations

#### 1. Metadata Scope

**Limitation**: Returns basic metadata only:
- ✅ **Included**: Name, type, position, size, visibility
- ❌ **Not included**: Styles, colors, fonts, effects, fills

**Workaround**: For detailed style information, download the image and use AI visual analysis, or access the full Figma API directly.

---

#### 2. Nested Children

**Limitation**: Only returns metadata for the specified node, not its children.

**Workaround**: Query child nodes individually if needed.

---

#### 3. Null Bounding Boxes

**Limitation**: Some node types (e.g., groups with no content) may have `null` bounding boxes.

**Workaround**: Check if `absoluteBoundingBox` is null before using coordinates.

---

### Troubleshooting Tips

#### Tip 1: List Layers First

Before getting metadata for specific layers:
1. Use `figma-get-layers-for-page` to list all layers
2. Identify the layer name and node ID you want
3. Then use this tool to get detailed metadata

#### Tip 2: Check Node Types

Different node types have different properties:
- **FRAME**: Full bounding box, usually downloadable
- **COMPONENT**: Design system components
- **INSTANCE**: Component instances
- **TEXT**: Text layers (may have null bounding box if empty)
- **GROUP**: Groupings (bounding box based on children)

#### Tip 3: Use Bounding Boxes for Spatial Analysis

The `absoluteBoundingBox` gives you:
- **x, y**: Top-left corner position
- **width, height**: Dimensions in pixels

This is useful for:
- Determining if screens fit mobile/desktop sizes
- Calculating aspect ratios
- Spatial relationships between layers
