# Example: Shell Stories Output

This is an example of the `## Shell Stories` section as it would appear in a Jira epic description after running `write-shell-stories`.

Use this as a reference for structure, story format, scope markers, SCREENS, DEPENDENCIES, and completion markers.

---

## Shell Stories

- `st001` **[Display Comment List on Case](https://myco.atlassian.net/browse/PROJ-101)** ⟩ Render the activity feed with existing comments in chronological order _(2025-02-10T14:23:00Z)_
  * SCREENS: [Case Details Desktop](https://www.figma.com/design/abc123?node-id=10-1), [Case Details Mobile](https://www.figma.com/design/abc123?node-id=10-2)
  * DEPENDENCIES: none
  * ☐  Comment list renders with author avatar, name, timestamp, and body
  * ☐  Chronological ordering (oldest first)
  * ✅  Case detail page shell already exists
  * ❌  Threaded reply support (out of scope for this epic)

- `st002` **Add Comment Voting UI** ⟩ Display upvote/downvote buttons on each comment with live vote counts
  * SCREENS: [Case Details Desktop](https://www.figma.com/design/abc123?node-id=10-1), [Case Details Mobile](https://www.figma.com/design/abc123?node-id=10-2)
  * DEPENDENCIES: st001
  * ☐  Thumbs-up and thumbs-down icons rendered per comment
  * ☐  Vote count displayed next to each button (hidden when 0)
  * ☐  Active/inactive visual states (teal for upvote, red-orange for downvote)
  * ❓  Should vote buttons appear on system-generated comments (e.g., status changes)?

- `st003` **Submit and Toggle Votes** ⟩ Allow agents to upvote or downvote a comment, toggle their vote, and switch direction in one action
  * SCREENS: [Case Details Desktop](https://www.figma.com/design/abc123?node-id=10-1), [Case Details Mobile](https://www.figma.com/design/abc123?node-id=10-2)
  * DEPENDENCIES: st002
  * ☐  Clicking the active vote button removes the vote (toggle off)
  * ☐  Clicking the opposite button removes the current vote and applies the new one atomically
  * ☐  Authors cannot vote on their own comments (buttons disabled/hidden for comment author)
  * ☐  Optimistic UI update with rollback on API error
  * ❓  Should there be a rate limit on vote changes per comment?

- `st004` **Sort Comments by Vote Score** ⟩ Add a "Top" sort mode that surfaces the highest-scored comments first
  * SCREENS: [Case Details Desktop](https://www.figma.com/design/abc123?node-id=10-3)
  * DEPENDENCIES: st003
  * ☐  Sort selector with "Newest" and "Top" options
  * ☐  Default sort remains "Newest"
  * ☐  "Top" mode orders comments by (upvotes − downvotes) descending
  * ⏬  Persist chosen sort preference per user across sessions (implement in st006)
  * ❌  Real-time re-sorting as votes change (too expensive, not in scope)

- `st005` **Vote Summary on Case List** ⟩ Show a net vote score badge on cases in the case list view to surface most-engaged cases
  * SCREENS: [Case List Desktop](https://www.figma.com/design/abc123?node-id=11-1)
  * DEPENDENCIES: st003
  * ☐  Net score badge (upvotes − downvotes across all comments) on each case card
  * ☐  Badge hidden when score is 0
  * ⏬  Breakdown tooltip showing separate upvote/downvote counts on hover (implement in st006)
  * ❓  Should the score reflect all comments or only agent comments?

- `st006` **Voting Polish and Persistence** ⟩ Persist sort preference per user and add breakdown tooltip on case list badges
  * SCREENS: [Case Details Desktop](https://www.figma.com/design/abc123?node-id=10-3), [Case List Desktop](https://www.figma.com/design/abc123?node-id=11-1)
  * DEPENDENCIES: st004, st005
  * ☐  Save chosen sort preference (Newest / Top) per user in localStorage
  * ☐  Breakdown tooltip on case list badge showing upvote/downvote counts separately
  * ❌  Vote audit log or history view (out of scope for this epic)
