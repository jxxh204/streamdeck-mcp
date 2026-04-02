# streamdeck-mcp

Custom MCP server for Elgato Stream Deck — high-quality SVG icons, profile management, and task context integration for Claude Code.

## Features

- **144x144 Retina Icons** — SVG rendering via `@resvg/resvg-js`. Supports Lucide icons, macOS app icon extraction, gradients, badges, emoji
- **Profile Management** — Create, rename, delete, duplicate profiles and pages
- **Task Context** — `/task` skill collects links from Notion, Slack, GitHub and sets up Stream Deck buttons
- **10 MCP Tools** — Full control over Stream Deck profiles from Claude Code

## Quick Start

### 1. Install

```bash
git clone https://github.com/jxxh204/streamdeck-mcp.git
cd streamdeck-mcp
npm install
npm run build
```

### 2. Configure Claude Code

Add to your project's `.mcp.json`:

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

### 3. Use

```
# Create an icon with Lucide + gradient
streamdeck_create_icon({ lucide: "git-branch", text: "main", bg_color: "linear-gradient(#667eea, #764ba2)" })

# Write a page
streamdeck_write_page({ profile_name: "My Profile", page_name: "Dev Tools", buttons: [...] })

# Extract macOS app icon
streamdeck_create_icon({ app_icon: "Cursor", subtitle: "Editor" })
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `streamdeck_read_profiles` | List all profiles with pages and metadata |
| `streamdeck_read_page` | Read page details with button layout |
| `streamdeck_write_page` | Create or update pages with buttons |
| `streamdeck_create_icon` | Generate 144x144 PNG icons (Lucide, app icons, gradients, badges) |
| `streamdeck_create_action` | Create shell script actions for buttons |
| `streamdeck_restart_app` | Restart Stream Deck app to apply changes |
| `streamdeck_list_icons` | List available built-in Lucide icon names |
| `streamdeck_manage_profile` | Create, rename, delete, or duplicate profiles |
| `streamdeck_delete_page` | Delete a page from a profile |
| `streamdeck_live_dashboard` | Start/stop live dashboard daemon |

## Icon Examples

```
# Lucide icon + gradient background
{ lucide: "terminal", text: "Claude", bg_color: "linear-gradient(#D97706, #B45309)" }

# macOS app icon extraction
{ app_icon: "Docker", subtitle: "Docker", bg_color: "linear-gradient(#2496ED, #1D7AC4)" }

# Badge notification
{ lucide: "eye", text: "Reviews", badge: "5", badge_color: "#9333EA" }

# Text-only with large font
{ text: "Push", bg_color: "#F05032", font_size: 24 }
```

## `/task` Skill

A Claude Code slash command that collects task context and sets up Stream Deck buttons.

### Usage

```
/task GBIZ-25425                    # Search Notion → extract PR/Slack/Figma links
/task https://slack.com/archives/...  # Read Slack thread → extract all URLs
/task PR review cleanup              # Create a simple task folder
/task                                # Auto-detect from current Git branch
```

### Setup

Copy `commands/task.md` to `~/.claude/commands/task.md`:

```bash
cp commands/task.md ~/.claude/commands/task.md
```

## Requirements

- Node.js 18+
- macOS (for app icon extraction and Stream Deck app control)
- Elgato Stream Deck with desktop app installed

## Architecture

```
src/
├── index.ts                 # MCP server entry point
├── core/
│   ├── profile-manager.ts   # ProfilesV3 manifest read/write
│   └── icon-renderer.ts     # SVG → PNG rendering pipeline
└── live/
    ├── standalone.ts         # Optional background daemon
    └── sources/              # Data sources (Claude Monitor, Git, processes, GitHub PRs)
```

## License

MIT
