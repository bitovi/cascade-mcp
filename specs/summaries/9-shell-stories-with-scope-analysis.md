# Shell Stories with Scope Analysis

**Status:** Implemented

## What it proposes
Update the shell story generation prompt to directly leverage scope analysis output, so that shell stories reference scope analysis categories (☐/⏬/❌/❓), feature areas, and Figma screen links. The key architectural decision (Q0) is that shell stories only need scope analysis as input—not individual screen analysis files.

## Architectural decisions made
- Shell stories only need scope analysis + screens.yaml (not per-screen analysis files)
- Scope analysis categories (☐/⏬/❌/❓) directly drive story inclusion and priority
- ❓ questions from scope analysis are inherited as story bullets
- Figma URLs from scope analysis feature areas are used for SCREENS bullets in stories
- Feature areas are hints for story titles, but stories are incremental (not area-complete)

## What still needs implementing
<!-- All implemented -->
