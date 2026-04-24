# 053-unattached-comments.md

## Status
Implemented

## What it proposes
Fix incorrect frame association of Figma comments with `Vector: (0, 0)` position, which were being matched to frames positioned at the canvas origin. Unattached/file-level comments should be identified, separated, and surfaced in prompts with appropriate guidance rather than silently attached to the wrong frame.

## Architectural decisions made
- A comment is **unattached** when it has no `node_id` (Vector type) AND position is exactly `(0, 0)`
- Add `'unattached-comments'` as a new `source` value in the `ScreenAnnotation` union type
- Return unattached comments separately from attached comments in `formatCommentsForContext()`
- Include unattached comments in prompts in a distinct "File-Level Comments" section with guidance (not filtered out)
- Update debug `comments.md` output to show unattached comments in a separate labeled section
- Update notification messages to show matched vs. unattached breakdown

## What still needs implementing
Fully implemented.
