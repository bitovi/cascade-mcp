# figma-get-user

Quick prompt:

> ```
> MCP who am I in Figma?
> ```

## Purpose

The `figma-get-user` tool retrieves information about the currently authenticated Figma user. This is primarily a test tool to verify that Figma OAuth authentication is working correctly.

**Primary use cases:**
- Verify Figma authentication is active
- Check which Figma account is currently authenticated
- Troubleshoot OAuth connection issues
- Get user ID for logging or debugging

**What problem it solves:**
- **Auth verification**: Quickly confirm Figma OAuth is working
- **Account identification**: Know which Figma account you're using
- **Debug tool**: Validate token validity before complex operations

## API Reference

### Parameters

This tool takes no parameters.

### Returns

The tool returns Figma user information:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON object with user info
    }
  ]
}
```

**Success response format:**
```json
{
  "id": "1234567890",
  "email": "jane@example.com",
  "handle": "Jane Developer",
  "img_url": "https://..."
}
```

**Response includes:**
- **id**: Figma user ID
- **email**: User's email address
- **handle**: Display name in Figma
- **img_url**: Profile image URL

**Error response includes:**
- Authentication errors (no valid token)
- Figma API errors

### Dependencies

**Required:**
- Figma OAuth authentication

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `figma-get-user` tool:

1. **"Who am I in Figma?"**
2. **"Show my Figma user info"**
3. **"What Figma account am I using?"**

### Walkthrough: Core Use Case

**Scenario**: You want to verify Figma authentication is working.

#### Step 1: Call the tool

Ask the AI agent:
```
"Who am I in Figma?"
```

#### Step 2: Review the results

The tool returns your Figma user information:
```json
{
  "id": "1234567890",
  "email": "jane@example.com",
  "handle": "Jane Developer",
  "img_url": "https://figma.com/..."
}
```

This confirms:
- ✅ Authentication is active
- ✅ You're logged in as the correct user
- ✅ Your token has valid permissions

#### Step 3: Continue with Figma operations

Now you can use other Figma tools confidently:
```
"Download images from https://figma.com/design/ABC123/..."
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Figma (OAuth)

### Related Tools

Tools commonly used with `figma-get-user`:

- **`figma-get-image-download`** - Download Figma design images
- **`figma-get-layers-for-page`** - List layers in Figma pages
- **`figma-get-metadata-for-layer`** - Get layer details
- **`write-shell-stories`** - Uses Figma authentication to fetch designs

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No Figma access token found in authentication context"`

**Explanation**: You're not authenticated with Figma.

**Solution**: Authenticate with Figma through the MCP client. The client will prompt you to authorize access to your Figma account.

---

#### Figma API Error

**Error**: `"Error: Figma API request failed: 401 Unauthorized"`

**Explanation**: Your Figma token has expired or is invalid.

**Solution**:
- Log out and log back in to refresh your Figma session
- Re-authenticate through the MCP client
- Check that your Figma account is active

---

### Known Limitations

#### 1. Test Tool Only

**Limitation**: This tool only returns basic user information. It does not provide access to teams, files, or projects.

**Workaround**: Use other Figma tools for accessing design content.

---

#### 2. No Team Information

**Limitation**: Does not show which Figma teams you're a member of.

**Workaround**: View teams directly in the Figma web interface.

---

### Troubleshooting Tips

#### Tip 1: First-Time Setup

When setting up Figma authentication:
1. Run this tool first to verify authentication
2. If it fails, follow the OAuth prompts to authenticate
3. Run again to confirm success

#### Tip 2: Multi-Account Users

If you have multiple Figma accounts:
- This tool shows which account is currently authenticated
- Log out and log back in to switch accounts
- MCP clients typically support one Figma account at a time
