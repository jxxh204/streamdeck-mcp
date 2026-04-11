---
description: Collect task context (Notion/Slack/GitHub) and set up a Stream Deck folder with related links.
---

# Task Context Setup

Collects context from Notion, Slack, and GitHub for a task and sets up a Stream Deck folder with quick-access links.

## Input

`$ARGUMENTS` — one of:

1. **Task ID** (e.g. `PROJ-123`) → Notion-centric search
2. **Slack thread URL** (e.g. `https://yourworkspace.slack.com/archives/...`) → extract context from thread
3. **Free text** (e.g. `PR review cleanup`) → simple task folder with text only
4. **`clear`** or **`clear N`** → clear all or specific slot
5. **Empty** → auto-detect task ID from current git branch

## Input type detection

- Matches `[A-Z]+-\d+` pattern → **Type 1: Notion search**
- Contains `slack.com` or `slackMessage://` → **Type 2: Slack thread**
- Matches `clear` or `clear N` → **Type 0: Clear folder**
- Otherwise → **Type 3: Free text**
- Empty → extract task ID from current git branch, then Type 1

## Prerequisites

You must pre-create folder slots in the Elgato Stream Deck app (programmatic folder creation is not supported by the Elgato app).

1. In the Elgato Stream Deck app, create empty folders on your target profile's task page
2. Call `streamdeck_read_page` to read that page and note each folder button's `action_id` and the `ProfileUUID` in its `Settings`
3. Store this mapping below — the skill will reuse it for every `/task` invocation

## Slot mapping (customize for your setup)

Replace the placeholders with your own values:

```
Profile name: YOUR_PROFILE_NAME
Task page directory_id: YOUR_PAGE_DIRECTORY_ID

Folder slots:
| Slot | Key | action_id        | ProfileUUID       |
|------|-----|------------------|-------------------|
|   1  |  0  | <action_id>      | <ProfileUUID>     |
|   2  |  1  | <action_id>      | <ProfileUUID>     |
|   3  |  2  | <action_id>      | <ProfileUUID>     |
|   4  |  3  | <action_id>      | <ProfileUUID>     |
```

Each folder's child page `directory_id` is the `ProfileUUID` in UPPERCASE.

## Type 0: clear — empty a folder

`/task clear` → empty all folders
`/task clear 1` → empty slot 1 only

Steps:
1. For each target slot, call `streamdeck_write_page` on the child `directory_id` with `clear_existing: true` and only a backtoparent button at key 0:
   ```json
   {"key": 0,
    "plugin_uuid": "com.elgato.streamdeck.profile.backtoparent",
    "action_uuid": "com.elgato.streamdeck.profile.backtoparent",
    "plugin_name": "Profiles",
    "action_name": "Back to parent"}
   ```
2. Replace the parent page folder icon with an empty placeholder icon
3. Call `streamdeck_restart_app`

## Type 1: Task ID → Notion-centric search

### 1. Notion search
Use `notion-search`:
- `query`: task ID
- `filters`: {}
- `page_size`: 3
- `max_highlight_length`: 100

Fetch the first matching document with `notion-fetch` to read its full content.

### 2. Extract links from the document
- **Slack**: `slackMessage://` or `slack.com` URLs
- **GitHub PR**: the document's `"GitHub PR"` property or `github.com/pull/` URLs in content
- **Figma**: `figma.com` URLs
- **Notion**: the document URL itself
- **Status**: the document's `"Status"` property

### 3. GitHub fallback search
If no PR found in Notion, search directly:
```bash
gh pr list --search "{task-id}" --state all --limit 3 --json number,title,url,state,headRefName
```

## Type 2: Slack URL → thread context

### 1. Read Slack thread
Use `slack_read_thread`:
- Extract `channel_id` from URL path (`/archives/CHANNEL/...`)
- Extract `message_ts` from the `p` prefix: `p1234567890123456` → `1234567890.123456`
- Scan replies for `github.com`, `figma.com`, `notion.so`, `docs.google.com` URLs
- Use thread title/first message as the task name

### 2. Compose buttons from extracted links

## Type 3: Free text → simple task folder

Create a folder containing just a single labeled button. No links.

## Stream Deck setup — folder layout

### Parent page folder icon

Call `streamdeck_write_page` on the parent page with `clear_existing: false`, updating only the target folder slot. You must preserve the existing `plugin_uuid`, `action_uuid`, `action_id`, and `settings` (with `ProfileUUID`) exactly — only change the `icon_path`:

Generate the icon via `streamdeck_create_icon`:
```json
{
  "lucide": "folder-open",
  "text": "<short task name>",
  "subtitle": "<context>",
  "bg_color": "linear-gradient(#3B82F6, #2563EB)",
  "font_size": 22,
  "filename": "task-folder-<id>"
}
```

### Child page (folder contents)

Call `streamdeck_write_page` on the child page `directory_id`:
- `clear_existing: true`
- Always include a `backtoparent` button at `key: 0`

### Folder layout — multiple issues in one folder

When a folder holds multiple related issues, use rows to separate them:

```
5×3 grid:
  key 0: ← Back (backtoparent)
  Row 1 (key 1~4): Issue 1 — [label] [Slack] [Notion] [Figma/other]
  Row 2 (key 5~9): Issue 2 — [empty] [label] [Slack] [Notion] [Figma/other]
  Row 3 (key 10~14): Issue 3 — [empty] [label] [Slack] [other]
```

### Label button colors (by issue type)

- Bug / urgent: `linear-gradient(#EF4444, #DC2626)` (red)
- Feature: `linear-gradient(#3B82F6, #2563EB)` (blue)
- Design: `linear-gradient(#F59E0B, #D97706)` (orange)
- Refactor: `linear-gradient(#8B5CF6, #7C3AED)` (purple)
- Other: `linear-gradient(#6B7280, #4B5563)` (gray)

### Link button styles

- Slack: `lucide: message-square`, bg: `linear-gradient(#611f69, #4A154B)`
- Notion: `lucide: folder-open`, bg: `linear-gradient(#2D2D2D, #191919)`
- GitHub PR: `lucide: git-pull-request`, bg: `linear-gradient(#238636, #1a7f37)`
- Figma: `lucide: layout`, bg: `linear-gradient(#F24E1E, #A259FF)`
- Google Sheets/Docs: `lucide: external-link`, bg: `linear-gradient(#16A34A, #15803D)`

### Single-issue folder layout

For a folder holding just one issue (a single task ID or Slack link), use Row 1 only:
- key 0: ← Back
- key 1: label (issue name)
- key 2~4: links (Notion, PR, Slack, Figma, etc.)

### Icon rules

- `font_size` 18~22, `show_title: false`
- All backgrounds use `linear-gradient`
- Skip buttons for resources that don't exist

### Apply changes

Call `streamdeck_restart_app` to apply all changes to the device.

## Final output

```
✅ Stream Deck task folder updated: <task-id-or-name>
   📄 Notion: <title>
   🔀 GitHub PR: #<number> (<state>)
   💬 Slack: <N> related thread(s)
   🎨 Figma: <N> link(s)

Open your target folder in the Stream Deck app to see the buttons.
```
