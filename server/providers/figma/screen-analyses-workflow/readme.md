# Frame Analysis Workflow

The `Frame Analysis Workflow` helps tools like [writing-shell-stories](../../combined/tools/writing-shell-stories/README.md) and [figma-review-design](../tools/figma-review-design/README.md) understand your Figma designs. This documentation explains how the analysis process works to help you understand how to prepare your designs for useful analysis. 

We'll go over:

- What the analysis is trying to identify.
- What context the analysis is using (Figma images, Figma nodes, comments and notes).
- How to best prepare the context.

## What the Analysis Identifies

The `Frame Analysis Workflow` is trying to _see_ everything a human would see. It generates comprehensive documentation for each Figma frame that explains:

- **What the UI shows:** Layout structure, visual hierarchy, and component organization
- **What users can do:** Interactive elements, buttons, forms, and navigation patterns
- **What data is displayed:** Content types, sample data patterns, and information architecture
- **Visual states:** Loading states, error states, empty states, hover effects, and component variants
- **Scope:** Which features are in-scope for the current work, already implemented, or need clarification

This documentation helps AI agents (and humans) understand your designs without needing to interpret raw Figma files.

## What Context the Analysis Uses

To generate accurate documentation, the workflow analyzes multiple sources:

1. **Frame screenshots (PNG images):** Visual representation of the design
2. **Figma Node structure:** Component hierarchy with names, types, and properties extracted from Figma nodes
3. **Figma comments:** Discussions and feedback placed near frames (within 500px)
4. **Sticky notes:** Designer annotations explaining decisions or context
5. **Frame names:** Descriptive titles that identify what each screen represents
6. **Section context:** Grouping information when frames are organized in Figma sections
7. **Additional context:** Other notes on requirements and scope typically linked from linked Jira issues or documentation

The combination of visual + structural + annotation data provides the AI with enough context to generate meaningful documentation. 

The following goes through how to prepare the context for analysis.

## Preparing the content

### Finding frames from the URLs

When you provide a Figma URL, the workflow automatically expands container nodes to find all analyzable frames:

**Container Types:**
- **CANVAS (pages)** → Returns all first-level FRAME children
- **SECTION (groups)** → Returns FRAME children with section context attached
- **FRAME (screens)** → Returns as-is (single frame)
- **Note INSTANCE** → Identified as sticky notes for annotations

**Example:**
```
URL points to CANVAS → Analyzes 5 frames on that page
URL points to SECTION → Analyzes 3 frames in that section (with section name attached)
URL points to FRAME → Analyzes just that single frame
```

**How to prepare your designs:**
- **Organize by page:** Group related frames on the same CANVAS page for batch analysis
- **Use sections:** Place frames in SECTIONs to add context (e.g., "User Authentication" section)
- **Name your frames descriptively:** Frame names appear in documentation and help identify what's being analyzed
- **Single frame analysis:** Link directly to a specific FRAME URL when you want just one screen analyzed

### Note Identification - Designer Annotations

**What are "Notes"?**
- Figma INSTANCE nodes with `name === "Note"` 
- Typically Figma's sticky note components
- Contain text extracted from child TEXT nodes

**How to use notes effectively:**
- Place notes within 500px of the frame they describe (closer is better)
- Use notes to explain design decisions, edge cases, or important context
- Notes complement Figma comments—use both for comprehensive context

### Annotation Association - Providing Context

The workflow associates two types of annotations with frames:

**Figma Comments:**
- Place comments near (within 500px of) the frames they describe
- Use comment threads to have discussions about specific design decisions
- Comments are included in the AI analysis to provide context

**Sticky Notes:**
- Position notes close to relevant frames (within 500px)
- Closer notes are matched first if multiple frames are nearby

**Best Practices:**
- **Be specific:** "This button should disable when form is invalid" is more helpful than "needs validation"
- **Explain why:** Document the reasoning behind design decisions
- **Mark open questions:** Use comments to flag uncertainties that need clarification
- **Proximity matters:** Keep comments/notes within 500px of their related frame

### Component Naming - Making Your Design Readable

The AI receives a structured representation of your nodes and components based on their names and properties:

**How naming affects analysis:**
- Component/instance names become structural elements (e.g., `Input-Field`, `Button`, `Navigation-Bar`)
- Component properties (like `State`, `variant`) provide additional context
- Clear names help the AI understand what each element does

**Example of good naming:**
```xml
<Screen name="Login Form" type="FRAME">
  <Input-Field label="Email" placeholder="Enter email" interactive="true" />
  <Input-Field label="Password" type="password" interactive="true" />
  <Button variant="primary" interactive="true">Sign In</Button>
  <Link>Forgot password?</Link>
</Screen>
```

**Component naming best practices:**
- **Use descriptive component names:** `Submit-Button` is better than `Button1` or `Frame 234`
- **Be consistent:** Use the same naming pattern across your design system
- **Include component variants:** Use Figma component properties to distinguish states (primary/secondary, enabled/disabled)
- **Name instances meaningfully:** "Email Input" or "Password Field" helps identify the purpose

## Best Practices Summary

| Design Aspect | Best Practice |
|---------------|---------------|
| **Organization** | Group related frames on same page or within sections |
| **Frame Naming** | Use descriptive names: "User Profile - Edit Mode" not "Screen 7" |
| **Component Naming** | Name components by purpose: `Submit-Button`, `Email-Input` |
| **Comments** | Place within 500px of frames; explain why, not just what |
| **Sticky Notes** | Use for design decisions, edge cases, context |
| **Sections** | Group related frames ("Checkout Flow") for better context |

## Getting Better Results

**Before running analysis:**
1. ✅ Name your frames descriptively
2. ✅ Name components by their purpose
3. ✅ Add comments explaining complex interactions
4. ✅ Use sticky notes for design context
5. ✅ Organize frames into logical pages/sections
6. ✅ Position annotations near their related frames

**Common issues:**
- **Generic names** ("Frame 1", "Component") → Use descriptive names
- **Distant comments** (>500px away) → Move comments closer to frames
- **Missing context** → Add notes explaining design decisions
- **Flat structure** → Use sections to group related frames
