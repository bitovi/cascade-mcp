# figma-get-image-download

Quick prompt:

> ```
> MCP download Figma image from https://www.figma.com/design/ABC123/Project?node-id=60-55
> ```

## Purpose

The `figma-get-image-download` tool downloads images from Figma design files and returns them as base64-encoded content. This enables AI agents to access and analyze Figma designs programmatically.

**Primary use cases:**
- Download design mockups for AI visual analysis
- Extract UI screens for documentation
- Get design assets for comparison or review
- Access Figma designs in automated workflows

**What problem it solves:**
- **Programmatic access**: Download Figma images without manual exporting
- **AI visual analysis**: Enables AI to "see" and analyze designs
- **Workflow automation**: Fetch designs for processing in larger workflows
- **Design-to-code pipelines**: Extract visual assets for implementation

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ Yes | Figma file URL (supports both `/design/` and `/file/` formats). Example: `https://www.figma.com/design/ABC123/Project-Name` |
| `nodeId` | string | ✅ Yes | Specific node ID to download (from `node-id` parameter in URL, e.g., "60-55"). Use hyphen format as shown in URLs. |
| `format` | string | ❌ Optional | Image format: "png", "jpg", "svg", "pdf" (default: "png") |
| `scale` | number | ❌ Optional | Scale factor for the image: 0.1 to 4.0 (default: 1). Higher values = larger images. |

### Returns

The tool returns base64-encoded image data:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON object with image data and metadata
    }
  ]
}
```

**Success response format:**
```json
{
  "nodeId": "60:55",
  "format": "png",
  "scale": 1,
  "encoded": "iVBORw0KGgoAAAANSUhEUgA...",
  "sizeBytes": 45678,
  "mimeType": "image/png"
}
```

**Response includes:**
- **nodeId**: Figma node ID (colon format)
- **format**: Image format (png, jpg, svg, pdf)
- **scale**: Scale factor used
- **encoded**: Base64-encoded image content
- **sizeBytes**: Size of encoded image in bytes
- **mimeType**: MIME type (e.g., "image/png")

**Error response includes:**
- Authentication errors
- Invalid URL or node ID
- Figma API errors
- Timeout errors (60-second limit)

### Dependencies

**Required:**
- Figma OAuth authentication
- Read access to the Figma file

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `figma-get-image-download` tool:

1. **"Download the image from https://figma.com/design/ABC123/Project?node-id=60-55"**
2. **"Get the Figma design at node 60-55 from file ABC123"**
3. **"Show me the design in https://figma.com/design/ABC123/..."**

### Walkthrough: Core Use Case

**Scenario**: You want to download a Figma screen design for AI analysis.

#### Step 1: Get the Figma URL

In Figma:
1. Open the design file
2. Select the frame/layer you want
3. Copy the URL from your browser (includes `node-id` parameter)

Example URL:
```
https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project?node-id=60-55
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Download the image from https://figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project?node-id=60-55"
```

Or provide parameters separately:
```
"Download Figma image from file yRyWXdNtJ8KwS1GVqRBL1O, node 60-55, as PNG at 2x scale"
```

#### Step 3: Use the image

The tool returns base64-encoded image data that can be:
- Analyzed by AI vision models: "What UI elements are in this design?"
- Saved to disk for documentation
- Compared with other designs
- Used in automated testing workflows

#### Advanced: Custom formats and scales

Download as SVG for vector graphics:
```
format: "svg"
```

Download at 2x resolution for retina displays:
```
scale: 2
```

Download as JPEG for smaller file size:
```
format: "jpg"
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Figma
2. **You have read access** to the Figma file
3. **The node ID exists** in the file
4. **The URL is correctly formatted** (includes file key)

### Related Tools

Tools commonly used with `figma-get-image-download`:

- **`figma-get-layers-for-page`** - First list layers to find node IDs
- **`figma-get-metadata-for-layer`** - Get layer details before downloading
- **`write-shell-stories`** - Uses this tool internally to download designs
- **`atlassian-get-attachments`** - Similar tool for Jira attachments

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No Figma access token found in authentication context. Please authenticate with Figma."`

**Explanation**: You're not authenticated with Figma.

**Solution**: Authenticate with Figma through the MCP client. The client will prompt you to authorize access.

---

#### Invalid URL Format

**Error**: `"Error: Invalid Figma URL format. Expected format: https://www.figma.com/design/FILEID or https://www.figma.com/file/FILEID"`

**Explanation**: The URL doesn't match the expected Figma format.

**Solution**:
- Use URLs directly from Figma (copy from browser address bar)
- Ensure URL includes `/design/` or `/file/` path
- Verify file key is present (alphanumeric string after `/design/` or `/file/`)

---

#### Node Not Found

**Error**: `"Error: Node not found"` or `"Figma API error: 404"`

**Explanation**: The specified node ID doesn't exist in the file.

**Solution**:
- Verify the node ID is correct (check URL parameter)
- Use `figma-get-layers-for-page` to list available layers
- Ensure the node hasn't been deleted from the file
- Check that you're using the hyphen format ("60-55" not "60:55")

---

#### Permission Denied

**Error**: `"Figma API error: 403 Forbidden"`

**Explanation**: Your Figma account doesn't have access to this file.

**Solution**:
- Request access to the Figma file from the owner
- Verify you're logged into the correct Figma account
- Check if the file has been made private or moved

---

#### Timeout Error

**Error**: `"Request timeout"` or `"AbortError"`

**Explanation**: The image download took longer than 60 seconds.

**Solution**:
- Try a smaller scale factor (e.g., scale: 0.5 instead of 2)
- Use a more efficient format (PNG instead of PDF)
- Download smaller nodes/frames
- Check your internet connection

---

### Known Limitations

#### 1. Large Images

**Limitation**: Very large images or complex vectors may:
- Take a long time to download
- Exceed the 60-second timeout
- Use significant memory when base64-encoded

**Workaround**:
- Use smaller scale factors (0.5 or 1 instead of 2-4)
- Download individual components instead of entire pages
- Use JPG format for smaller file sizes

---

#### 2. Protected Files

**Limitation**: Cannot download from Figma files you don't have access to, even if they're "view-only" links.

**Workaround**: Request proper access from the file owner.

---

#### 3. Node ID Format

**Limitation**: Figma uses colon format internally ("60:55") but URLs use hyphen format ("60-55"). The tool automatically converts, but you must provide the hyphen format.

**Workaround**: Always copy node IDs from Figma URLs (they use the correct hyphen format).

---

#### 4. Format Support

**Limitation**: Format support depends on the node type:
- **PNG/JPG**: All node types
- **SVG**: Vector-compatible nodes only (not images or effects)
- **PDF**: Page-level exports only

**Workaround**: Use PNG as default for universal compatibility.

---

### Troubleshooting Tips

#### Tip 1: Get Node IDs from URLs

The easiest way to get node IDs:
1. Click on a frame/layer in Figma
2. Copy URL from browser: `...?node-id=60-55`
3. Use the `60-55` part directly

Or use `figma-get-layers-for-page` to list all available nodes.

#### Tip 2: Test with Small Nodes First

Before downloading large designs:
- Test with a simple component or small frame
- Verify authentication and permissions work
- Then scale up to larger images

#### Tip 3: Choose Appropriate Scales

- **scale: 1** - Standard resolution (default)
- **scale: 2** - Retina/high-DPI displays
- **scale: 0.5** - Thumbnails or previews
- **scale: 4** - Maximum quality (very large files)

#### Tip 4: Format Selection

- **PNG**: Best for UI designs with transparency
- **JPG**: Best for photos, smaller file size
- **SVG**: Best for vector graphics, infinite scaling
- **PDF**: Best for print or multi-page exports
