# figma-console-mcp — Tool Reference

> Quick reference for all 57 MCP tools exposed by [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp) v1.11.2

## Legend

| Symbol | Meaning |
|--------|---------|
| **R** | Read-only |
| **W** | Write operation |
| **WS** | Requires WebSocket Desktop Bridge (local mode only) |
| **REST** | Uses Figma REST API |
| **Both** | Uses REST with WebSocket fallback |

---

## Console & Connection (8 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 1 | `figma_get_console_logs` | R | WS | Retrieve buffered console logs |
| 2 | `figma_watch_console` | R | WS | Stream console logs real-time |
| 3 | `figma_clear_console` | W | WS | Clear console log buffer |
| 4 | `figma_take_screenshot` | R | REST | Export node/file as image via REST API |
| 5 | `figma_reload_plugin` | W | WS | Reload Figma page/plugin |
| 6 | `figma_navigate` | W | WS | Navigate to a Figma URL |
| 7 | `figma_get_status` | R | WS | Check connection status |
| 8 | `figma_reconnect` | W | WS | Force reconnection to Figma |

## Selection & Document (3 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 9 | `figma_get_selection` | R | WS | Get currently selected nodes |
| 10 | `figma_get_design_changes` | R | WS | Get buffered document change events |
| 11 | `figma_list_open_files` | R | WS | List all WebSocket-connected Figma files |

## Code Execution (1 tool)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 12 | `figma_execute` | W | WS | Execute arbitrary JavaScript in plugin context |

## Variable CRUD (8 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 13 | `figma_update_variable` | W | WS | Update a single variable value in a specific mode |
| 14 | `figma_create_variable` | W | WS | Create a new variable |
| 15 | `figma_create_variable_collection` | W | WS | Create a new variable collection |
| 16 | `figma_delete_variable` | W | WS | Delete a variable |
| 17 | `figma_delete_variable_collection` | W | WS | Delete a variable collection |
| 18 | `figma_rename_variable` | W | WS | Rename a variable |
| 19 | `figma_add_mode` | W | WS | Add a mode to a collection |
| 20 | `figma_rename_mode` | W | WS | Rename a mode |

## Batch Variable Operations (3 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 21 | `figma_batch_create_variables` | W | WS | Create up to 100 variables at once |
| 22 | `figma_batch_update_variables` | W | WS | Update up to 100 variables at once |
| 23 | `figma_setup_design_tokens` | W | WS | Create a complete token system (collections + variables + values) |

## Design System Read (4 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 24 | `figma_get_design_system_summary` | R | WS | Compact overview of design system |
| 25 | `figma_search_components` | R | Both | Search components by name/category |
| 26 | `figma_get_component_details` | R | Both | Full component details (properties, variants, specs) |
| 27 | `figma_get_token_values` | R | WS | Get specific token values by name/type |

## Component Instance & Property (5 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 28 | `figma_instantiate_component` | W | WS | Create a component instance on canvas |
| 29 | `figma_set_description` | W | WS | Set description on a component/style node |
| 30 | `figma_add_component_property` | W | WS | Add a property to a component |
| 31 | `figma_edit_component_property` | W | WS | Edit an existing component property |
| 32 | `figma_delete_component_property` | W | WS | Delete a component property |

## Node Manipulation (10 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 33 | `figma_resize_node` | W | WS | Resize a node |
| 34 | `figma_move_node` | W | WS | Move a node to coordinates |
| 35 | `figma_set_fills` | W | WS | Set fill colors on a node |
| 36 | `figma_set_strokes` | W | WS | Set strokes/borders on a node |
| 37 | `figma_clone_node` | W | WS | Duplicate a node |
| 38 | `figma_delete_node` | W | WS | Delete a node |
| 39 | `figma_rename_node` | W | WS | Rename a node |
| 40 | `figma_set_text` | W | WS | Set text content with optional styling |
| 41 | `figma_create_child` | W | WS | Create a child node (RECTANGLE, ELLIPSE, FRAME, TEXT, etc.) |
| 42 | `figma_arrange_component_set` | W | WS | Organize variants in a component set layout |

## Figma API (9 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 43 | `figma_get_file_data` | R | REST | Full file structure/document tree |
| 44 | `figma_get_variables` | R | Both | Design tokens with multi-fallback chain |
| 45 | `figma_get_component` | R | Both | Single component metadata or reconstruction spec |
| 46 | `figma_get_styles` | R | REST | All styles (color, text, effects, grids) |
| 47 | `figma_get_component_image` | R | REST | Render component as image |
| 48 | `figma_get_component_for_development` | R | Both | Component data optimized for UI implementation |
| 49 | `figma_get_file_for_plugin` | R | REST | File data filtered for plugin development |
| 50 | `figma_capture_screenshot` | R | WS | Screenshot via plugin `exportAsync` |
| 51 | `figma_set_instance_properties` | W | WS | Update instance properties (TEXT, BOOLEAN, VARIANT, etc.) |

## Design-Code Parity (2 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 52 | `figma_check_design_parity` | R | — | Compare Figma design specs vs code (returns parity score 0–100) |
| 53 | `figma_generate_component_doc` | R | Both | Generate AI-complete component documentation |

## Comment Tools (3 tools)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 54 | `figma_get_comments` | R | REST | Get comments on a Figma file |
| 55 | `figma_post_comment` | W | REST | Post a comment (supports threading, pinning to nodes) |
| 56 | `figma_delete_comment` | W | REST | Delete a comment |

## Design System Kit (1 tool)

| # | Tool | R/W | Transport | Description |
|---|------|-----|-----------|-------------|
| 57 | `figma_get_design_system_kit` | R | Both | All-in-one design system extraction with adaptive compression |

---

## Summary

| Category | Count |
|----------|-------|
| **Total MCP Tools** | **57** |
| **Read-only** | 34 |
| **Write** | 23 |
| **WebSocket-only** | ~35 |
| **REST-only** | ~8 |
| **Both/fallback** | ~14 |
| **MCP Apps** | 2 (Token Browser, Design System Dashboard) |

## Key Insight for Our Project

All **23 write tools** require the WebSocket Desktop Bridge — they cannot work through the REST API alone. This is because Figma's Plugin API (which provides write access to the canvas) only runs inside Figma's sandboxed plugin environment. The WebSocket bridge relays commands from the MCP server to a Figma plugin that executes the actual `figma.*` API calls.
