# figma-get-layers-for-page

Quick prompt:

> ```
> MCP list layers in https://www.figma.com/design/ABC123/Project?node-id=22-0
> ```

## Purpose

The `figma-get-layers-for-page` tool lists all top-level layers in a Figma page, providing their names, types, node IDs, and download URLs. This is a discovery tool that helps you understand what content is available before downloading specific layers.

**Primary use cases:**
- Discover available layers/frames in a Figma page
- Get node IDs for subsequent download operations
- Preview layer structure before processing
- Generate download URLs for batch operations

**What problem it solves:**
- **Content discovery**: See what's in a Figma file without manual inspection
- **Batch preparation**: Get all layer IDs for bulk downloads
- **Navigation aid**: Find specific layers by name in large files
- **Workflow automation**: List layers programmatically for processing

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ Yes | Figma file or page URL (supports both `/design/` and `/file/` formats). Can include `node-id` parameter to specify a page, or defaults to first page. |

### Returns

The tool returns a list of layers and metadata:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON object with page and layer information
    }
  ]
}
```

**Success response format:**
```json
{
  "fileKey": "yRyWXdNtJ8KwS1GVqRBL1O",
  "fileName": "User Onboarding Project",
  "pageId": "22:0",
  "pageName": "Designs",
  "layers": [
    {
      "id": "60:55",
      "name": "Login Screen",
      "type": "FRAME",
      "visible": true,
      "absoluteBoundingBox": {
        "x": 100,
        "y": 200,
        "width": 375,
        "height": 812
      },
      "downloadUrl": "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/...?node-id=60-55"
    }
  ],
  "totalLayers": 1,
  "downloadableUrl": "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/..."
}
```

**Response includes:**
- **fileKey**: Figma file ID
- **fileName**: File name from Figma
- **pageId**: ID of the page being listed
- **pageName**: Name of the page
- **layers**: Array of layer objects (see below)
- **totalLayers**: Count of visible top-level layers
- **downloadableUrl**: Sample download URL

**Each layer includes:**
- **id**: Figma node ID (colon format)
- **name**: Layer name
- **type**: Node type (FRAME, COMPONENT, etc.)
- **visible**: Visibility flag
- **absoluteBoundingBox**: Position and size (or null)
- **downloadUrl**: Ready-to-use URL for `figma-get-image-download`

**Error response includes:**
- Authentication errors
- Invalid URL format
- No pages found
- Figma API errors

### Dependencies

**Required:**
- Figma OAuth authentication
- Read access to the Figma file

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `figma-get-layers-for-page` tool:

1. **"List layers in Figma file ABC123"**
2. **"What layers are in https://figma.com/design/ABC123/Project?"**
3. **"Show me all frames in this Figma page"**

### Walkthrough: Core Use Case

**Scenario**: You want to download all screens from a Figma design page but don't know the layer names or IDs.

#### Step 1: Get the Figma URL

In Figma:
1. Open the file
2. Navigate to the page you want
3. Copy the URL from your browser

Example:
```
https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Onboarding?node-id=22-0
```

The `node-id=22-0` indicates page ID 22.

#### Step 2: List the layers

Ask the AI agent:
```
"List all layers in https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Onboarding?node-id=22-0"
```

#### Step 3: Review the results

The tool returns all visible layers:
```json
{
  "fileName": "User Onboarding",
  "pageName": "Designs",
  "totalLayers": 3,
  "layers": [
    {
      "id": "60:55",
      "name": "Login Screen",
      "type": "FRAME",
      "downloadUrl": "https://www.figma.com/design/.../node-id=60-55"
    },
    {
      "id": "61:100",
      "name": "Signup Screen",
      "type": "FRAME",
      "downloadUrl": "https://www.figma.com/design/.../node-id=61-100"
    },
    {
      "id": "62:150",
      "name": "Welcome Screen",
      "type": "FRAME",
      "downloadUrl": "https://www.figma.com/design/.../node-id=62-150"
    }
  ]
}
```

#### Step 4: Download specific layers

Now you can download any layer using its URL or node ID:
```
"Download the Login Screen"
```

Or batch download:
```
"Download all three screens from that Figma page"
```

The AI can use the `downloadUrl` values to call `figma-get-image-download` for each layer.

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Figma
2. **You have read access** to the Figma file
3. **The file contains pages with visible layers**

### Related Tools

Tools commonly used with `figma-get-layers-for-page`:

- **`figma-get-image-download`** - Download specific layers found by this tool
- **`figma-get-metadata-for-layer`** - Get detailed metadata for specific layers
- **`write-shell-stories`** - Uses this tool internally to discover Figma screens

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No Figma access token found in authentication context. Please authenticate with Figma."`

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

#### No Pages Found

**Error**: `"Error: No pages found in file"`

**Explanation**: The Figma file is empty or has no pages.

**Solution**:
- Verify you're accessing the correct file
- Check that the file isn't empty
- Ensure you have permissions to view the file's contents

---

#### Empty Page

**Error**: No error, but `layers: []` and `totalLayers: 0`

**Explanation**: The page has no visible top-level layers.

**Solution**:
- Check if layers are hidden (not visible) in Figma
- Try a different page in the file
- Verify the page actually contains content

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

#### 1. Top-Level Layers Only

**Limitation**: Returns only top-level layers in the page. Nested children are not included in the list.

**Workaround**: 
- Get metadata for parent layers to understand their children
- Download parent frames which include their nested content

---

#### 2. Hidden Layers Excluded

**Limitation**: Layers marked as invisible in Figma are automatically filtered out.

**Workaround**: Make layers visible in Figma before listing, or access the full Figma API for hidden layers.

---

#### 3. Page Selection

**Limitation**: If no `node-id` is provided in the URL, the tool defaults to the first page in the file.

**Workaround**: 
- Always include `node-id` parameter to specify the page
- Navigate to the desired page in Figma and copy the URL

---

#### 4. Large Pages

**Limitation**: Pages with hundreds of layers may return large responses and take longer to process.

**Workaround**: Organize Figma files with reasonable layer counts per page (< 50 layers recommended).

---

### Troubleshooting Tips

#### Tip 1: Find Page IDs

To get the correct page ID for the `node-id` parameter:
1. Go to Figma and click on the page name in the left sidebar
2. The URL updates with the page's `node-id` parameter
3. Copy the entire URL for accurate page selection

Example: `?node-id=22-0` means page ID is 22.

#### Tip 2: Filter Results

If you get many layers and only want specific ones:
- Ask the AI to filter: "Show me only FRAME types"
- Search by name: "Find the layer named 'Login Screen'"
- The AI can parse the JSON response programmatically

#### Tip 3: Use for Batch Operations

This tool is perfect for bulk downloads:
1. List all layers in a page
2. Extract all `downloadUrl` values
3. Download each layer in sequence
4. Process all designs in one workflow

#### Tip 4: Understand Node Types

Common node types you'll see:
- **FRAME**: Artboards or screens (most common for downloads)
- **COMPONENT**: Design system components
- **INSTANCE**: Component instances
- **GROUP**: Grouped layers
- **TEXT**: Text layers

FRAMEs and COMPONENTs are usually what you want to download as images.
