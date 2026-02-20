# MCP Reconnection Test Script (Playwright)

This test validates that MCP session reconnection works across page refreshes and that progress notifications continue streaming after reconnection.

## Prerequisites

- Dev server running on `http://localhost:5173/`
- Playwright MCP server configured in `.vscode/mcp.json`
- `ANTHROPIC_API_KEY` set in `.env` file

## Test Steps

### 1. Initial Setup

Navigate to the application, clear any existing session data, and enter API key:

```
# Navigate to application (need page context first)
playwright.navigate(url="http://localhost:5173/", headless=false)

# Clear localStorage to ensure fresh start
playwright.evaluate(script="localStorage.clear()")

# Reload to apply clean state
playwright.navigate(url="http://localhost:5173/", headless=false)

# Enter API key
playwright.fill(selector="#anthropic-key", value=<ANTHROPIC_API_KEY from .env>)
```

### 2. Establish Connection

Connect to the MCP server and complete OAuth flow:

```
playwright.click(selector="button:has-text('Connect')")
# OAuth flow happens automatically
# Wait for redirect back to app
# Click Done to complete connection
playwright.click(selector="button:has-text('Done')")
```

### 3. Select Tool and Start Execution

Select the utility-notifications tool to test streaming notifications:

```
playwright.select(selector="select", value="utility-notifications")
playwright.click(selector="button:has-text('Execute')")
```

**Expected:** Tool begins executing, notifications start appearing in the Progress Log panel

### 4. Wait and Capture Initial Logs

Wait 5 seconds to allow notifications to be sent:

```
# Wait 5 seconds (tool sends 1 notification/second)
playwright.evaluate(script="new Promise(resolve => setTimeout(resolve, 5000))")

# Capture console logs showing notifications were received
playwright.console_logs(type="all", search="Received notification", limit=10)
```

**Expected:** Console logs show messages like:
```
[BrowserMcpClient] 📬 Received notification: notifications/message {level: 'info', data: 'Test notification 1/60...'}
[BrowserMcpClient] 📬 Received notification: notifications/message {level: 'info', data: 'Test notification 2/60...'}
```

### 5. Refresh Page (Test Reconnection)

Simulate page refresh mid-execution:

```
playwright.navigate(url="http://localhost:5173/", headless=false)
```

**Expected:** 
- Page reloads
- Auto-reconnection happens using stored session ID
- Status shows "Reconnected" instead of "Connected"

### 6. Verify Reconnection Success

Check that session was restored:

```
playwright.console_logs(type="all", search="Reconnected to existing session", limit=5)
```

**Expected:** Console log shows:
```
[useMcpClient] 🔄 Reconnected to existing session!
```

### 7. Verify Progress Logs Resume

Check that notifications continue after reconnection:

```
# Wait 3 more seconds for additional notifications
playwright.evaluate(script="new Promise(resolve => setTimeout(resolve, 3000))")

# Check for new notifications received after reconnection
playwright.console_logs(type="all", search="Received notification", limit=10)
```

**Expected:** Console logs show notifications 6-8 (or later) arriving after reconnection

### 8. Verify UI State

Check that the UI shows the reconnected state and logs:

```
playwright.get_visible_text()
```

**Expected:**
- Status indicator shows "Reconnected"
- Tool selection preserved (utility-notifications still selected)
- Progress Log panel shows newly arrived notifications (not old ones)
- Result panel shows tool is still executing

## Success Criteria

✅ **Session Persistence:** Session ID stored and reused after refresh  
✅ **Auto-Reconnection:** Client automatically reconnects without user action  
✅ **Status Indicator:** UI shows "Reconnected" status  
✅ **Tool Selection:** Selected tool preserved across refresh  
✅ **Notification Streaming:** New notifications continue arriving after reconnection  
✅ **Fresh Logs:** Only new logs appear (old logs not restored)  

## Known Issues to Watch For

⚠️ **Dead SSE Connection:** If notifications sent before GET /mcp establishes SSE stream, they're lost  
⚠️ **Transport Reuse:** Old transport must be replaced with new one on reconnection  
⚠️ **Handler Registration:** Notification handlers must survive client recreation  

## Debugging Commands

View all recent console logs:
```
playwright.console_logs(type="all", limit=100)
```

Check for errors:
```
playwright.console_logs(type="error", limit=20)
```

Get current page HTML:
```
playwright.get_visible_html(selector="#root")
```

Take screenshot:
```
playwright.screenshot(name="reconnect-test", savePng=true)
```

## Related Specifications

- **Phase 1 Reconnection:** `specs/778-reconnection-support.md`
- **Progress Notifications:** `specs/040-improved-progress.md`
- **Session Management:** `server/mcp-service.ts` (handleSessionRequest)
