# streamdeck-mcp

> The Stream Deck MCP server that finally treats your developer workflow seriously.

Control your Elgato Stream Deck from Claude Code with high-quality icons, full profile management, and task context aggregation from Slack, Notion, and GitHub.

## Why this over other Stream Deck MCPs?

- **Icons that don't look like programmer art** — SVG rendered at 144×144 retina with Lucide icons, macOS app icon extraction, gradients, and badges. No more Pillow text on solid colors.
- **Task context aggregation** — One command pulls your current task's Slack thread, Notion doc, GitHub PR, and Figma files into a single folder on your Stream Deck. No more hunting across five tools.
- **Folder-based navigation** — Sub-pages you can actually create programmatically, with a working `/task` skill that handles the whole flow.
- **Claude Code native** — Built as a first-class MCP server, not a port of someone's USB control library.

## Install

```bash
npm install -g streamdeck-mcp
```

Or clone and build:

```bash
git clone https://github.com/jxxh204/streamdeck-mcp.git
cd streamdeck-mcp
npm install
npm run build
```

## Configure

Add to your project's `.mcp.json` (or Claude Code settings):

```json
{
  "mcpServers": {
    "streamdeck": {
      "command": "streamdeck-mcp"
    }
  }
}
```

If you installed from source, point to the built file instead:

```json
{
  "mcpServers": {
    "streamdeck": {
      "command": "node",
      "args": ["/path/to/streamdeck-mcp/dist/index.js"]
    }
  }
}
```

## Quick start

After restarting Claude Code, try these in a conversation:

```
List my Stream Deck profiles
```

```
Create a 144x144 icon with the git-branch Lucide icon on a purple gradient,
text "main", and save it as branch-icon
```

```
Extract the Cursor app icon and make it a Stream Deck button
```

## MCP tools

| Tool | Description |
|------|-------------|
| `streamdeck_read_profiles` | List all profiles with pages and metadata |
| `streamdeck_read_page` | Read page details with button layout |
| `streamdeck_write_page` | Create or update pages with buttons |
| `streamdeck_create_icon` | Generate 144×144 PNG icons (Lucide, app icons, gradients, badges, emoji) |
| `streamdeck_create_action` | Create shell script actions for buttons |
| `streamdeck_restart_app` | Restart Stream Deck to apply changes |
| `streamdeck_list_icons` | List built-in Lucide icon names |
| `streamdeck_manage_profile` | Create, rename, delete, or duplicate profiles |
| `streamdeck_delete_page` | Delete a page from a profile |
| `streamdeck_live_dashboard` | Start/stop a live dashboard daemon |

## Icon examples

```typescript
// Lucide icon with gradient background
{ lucide: "terminal", text: "Claude",
  bg_color: "linear-gradient(#D97706, #B45309)" }

// macOS app icon extraction (uses sips under the hood)
{ app_icon: "Docker", subtitle: "Docker",
  bg_color: "linear-gradient(#2496ED, #1D7AC4)" }

// Notification badge
{ lucide: "eye", text: "Reviews",
  badge: "5", badge_color: "#9333EA" }

// Text with custom font size
{ text: "Push", bg_color: "#F05032", font_size: 24 }

// Emoji
{ emoji: "🚀", text: "Deploy",
  bg_color: "linear-gradient(#16A34A, #15803D)" }
```

## `/task` skill — the killer feature

Claude Code slash command that aggregates your current task's context and sets up a Stream Deck folder.

### Install

```bash
mkdir -p ~/.claude/commands
cp node_modules/streamdeck-mcp/commands/task.md ~/.claude/commands/
```

Or if installed from source:

```bash
cp commands/task.md ~/.claude/commands/
```

### Usage

```bash
# Search Notion → extract PR/Slack/Figma links automatically
/task PROJ-123

# Read Slack thread → extract all URLs (Notion, GitHub, Figma, Sheets)
/task https://slack.com/archives/...

# Create a plain task folder
/task PR review cleanup

# Auto-detect from current Git branch
/task

# Clear slot 3
/task clear 3
```

The skill supports up to 7 task folders (Row 1 + Row 2) and row-based issue layout for folders containing multiple related issues.

## Requirements

- **Node.js** 18 or newer
- **macOS** — the ProfilesV3 path, app icon extraction (`sips`), and `Elgato Stream Deck.app` control are all macOS-specific
- **Elgato Stream Deck** with the desktop app installed

Windows and Linux support is planned but not yet implemented.

## Architecture

```
src/
├── index.ts                  # MCP server entry
├── core/
│   ├── profile-manager.ts    # ProfilesV3 manifest read/write
│   └── icon-renderer.ts      # SVG → PNG pipeline (@resvg/resvg-js)
└── live/                     # Optional background daemon
    ├── standalone.ts
    └── sources/              # Claude Monitor, Git, processes, GitHub PRs
```

## Known limitations

- **Folder creation** — Stream Deck folders (child profiles) cannot be created purely from manifest files. The Elgato app validates folder references against its internal state. Workaround: create empty folders in the app UI once, then use `/task` to fill them.
- **Live dashboard restart flicker** — Applying live updates requires restarting the Stream Deck app, which causes a brief blackout. A native Elgato SDK plugin (Phase 5) would eliminate this.

## License

MIT © jxxh204
