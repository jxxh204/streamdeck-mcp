#!/usr/bin/env node
/**
 * Custom Stream Deck MCP Server
 * High-quality icons (SVG→PNG 144x144) + full profile management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ProfileManager } from "./core/profile-manager.js";
import { renderIcon, listAvailableIcons } from "./core/icon-renderer.js";
import { startDaemon, stopDaemon, getDaemonStatus, type DaemonConfig } from "./live/daemon.js";

const manager = new ProfileManager();
const server = new McpServer({
  name: "streamdeck-custom-mcp",
  version: "1.0.0",
});

// ── Tool: streamdeck_read_profiles ─────────────────────────────────────

server.tool(
  "streamdeck_read_profiles",
  "List all Stream Deck desktop profiles with pages, device info, and metadata.",
  {},
  async () => {
    try {
      const profiles = manager.listProfiles();
      return { content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_read_page ─────────────────────────────────────────

server.tool(
  "streamdeck_read_page",
  "Read a profile page by profile name/ID and page index or directory ID. Returns buttons, layout, and raw manifest.",
  {
    profile_name: z.string().optional().describe("Exact profile name as shown in the Elgato app."),
    profile_id: z.string().optional().describe("Directory-based profile ID (.sdProfile folder name without suffix)."),
    page_index: z.number().int().optional().describe("Zero-based page index."),
    directory_id: z.string().optional().describe("Page directory ID — safest target for updates."),
  },
  async (args) => {
    try {
      const result = manager.readPage(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_write_page ────────────────────────────────────────

const buttonSchema = z.object({
  key: z.number().int().optional().describe("Linear button index (0-based, left-to-right, top-to-bottom)."),
  position: z.string().optional().describe("Native position 'col,row'."),
  title: z.string().optional().describe("Button title."),
  icon_path: z.string().optional().describe("Path to icon file (PNG preferred)."),
  path: z.string().optional().describe("Script path for Open action (from streamdeck_create_action)."),
  action_type: z.string().optional().describe("'next_page' or 'previous_page'."),
  action: z.record(z.unknown()).optional().describe("Full native Stream Deck action object."),
  plugin_uuid: z.string().optional(),
  plugin_name: z.string().optional(),
  plugin_version: z.string().optional(),
  action_uuid: z.string().optional(),
  action_name: z.string().optional(),
  action_id: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  state: z.number().int().optional(),
  font_size: z.number().int().optional(),
  title_color: z.string().optional().describe("Hex color like #ffffff."),
  title_alignment: z.string().optional().describe("'top' or 'bottom'."),
  show_title: z.boolean().optional(),
});

server.tool(
  "streamdeck_write_page",
  "Create a new page or replace/update an existing Stream Deck page.",
  {
    profile_name: z.string().optional(),
    profile_id: z.string().optional(),
    page_index: z.number().int().optional(),
    directory_id: z.string().optional(),
    page_name: z.string().optional().describe("Page name stored in manifest."),
    buttons: z.array(buttonSchema).optional().describe("Buttons to write."),
    clear_existing: z.boolean().optional().describe("Replace page contents (default: true)."),
    create_new: z.boolean().optional().describe("Create a new page."),
    make_current: z.boolean().optional().describe("Make this the active page."),
  },
  async (args) => {
    try {
      const result = manager.writePage({
        ...args,
        buttons: args.buttons as any,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_create_icon ───────────────────────────────────────

server.tool(
  "streamdeck_create_icon",
  "Generate a high-quality 144x144 PNG icon. Supports: text, Lucide icons, app icons, emoji, gradients, badges. Returns the file path.",
  {
    text: z.string().optional().describe("Main text on the icon."),
    bg_color: z.string().optional().describe("Background: hex '#1a1a2e' or gradient 'linear-gradient(#FF6B6B, #C44569)'."),
    text_color: z.string().optional().describe("Text/icon color (hex)."),
    lucide: z.string().optional().describe("Lucide icon name: 'git-branch', 'terminal', 'slack', 'database', etc."),
    emoji: z.string().optional().describe("Emoji character: '🚀', '🔥'."),
    app_icon: z.string().optional().describe("macOS app name to extract icon: 'Cursor', 'Docker', 'Slack'."),
    svg: z.string().optional().describe("Custom SVG markup (24x24 viewBox)."),
    image_path: z.string().optional().describe("Path to a local image file."),
    badge: z.string().optional().describe("Badge text (top-right corner): '3', '!'."),
    badge_color: z.string().optional().describe("Badge background color (hex)."),
    subtitle: z.string().optional().describe("Subtitle text below the main content."),
    font_size: z.number().int().optional().describe("Font size for main text."),
    icon_size: z.number().int().optional().describe("Icon size in pixels (default 64)."),
    filename: z.string().optional().describe("Output filename (without extension)."),
  },
  async (args) => {
    try {
      const result = renderIcon(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_create_action ─────────────────────────────────────

server.tool(
  "streamdeck_create_action",
  "Create an executable shell script in ~/StreamDeckScripts and return a native Open action block.",
  {
    name: z.string().describe("Human-readable action name (used for filename and label)."),
    command: z.string().describe("Shell command to execute on button press."),
    working_directory: z.string().optional().describe("cd into this directory before running."),
    filename: z.string().optional().describe("Override script filename."),
  },
  async (args) => {
    try {
      const result = manager.createAction(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_manage_profile ─────────────────────────────────────

server.tool(
  "streamdeck_manage_profile",
  "Manage Stream Deck profiles: create, rename, delete, or duplicate.",
  {
    action: z.enum(["create", "rename", "delete", "duplicate"]).describe("Action to perform."),
    profile_name: z.string().optional().describe("Target profile name (for rename/delete/duplicate)."),
    profile_id: z.string().optional().describe("Target profile ID (for rename/delete/duplicate)."),
    new_name: z.string().optional().describe("New name (for create/rename/duplicate)."),
    device_model: z.string().optional().describe("Device model override (for create)."),
  },
  async (args) => {
    try {
      let result: Record<string, any>;
      switch (args.action) {
        case "create":
          if (!args.new_name) return { content: [{ type: "text", text: "❌ new_name is required for create." }] };
          result = manager.createProfile({ name: args.new_name, device_model: args.device_model });
          break;
        case "rename":
          if (!args.new_name) return { content: [{ type: "text", text: "❌ new_name is required for rename." }] };
          result = manager.renameProfile({ profile_name: args.profile_name, profile_id: args.profile_id, new_name: args.new_name });
          break;
        case "delete":
          result = manager.deleteProfile({ profile_name: args.profile_name, profile_id: args.profile_id });
          break;
        case "duplicate":
          if (!args.new_name) return { content: [{ type: "text", text: "❌ new_name is required for duplicate." }] };
          result = manager.duplicateProfile({ profile_name: args.profile_name, profile_id: args.profile_id, new_name: args.new_name });
          break;
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_delete_page ───────────────────────────────────────

server.tool(
  "streamdeck_delete_page",
  "Delete a page from a Stream Deck profile.",
  {
    profile_name: z.string().optional(),
    profile_id: z.string().optional(),
    page_index: z.number().int().optional(),
    directory_id: z.string().optional(),
  },
  async (args) => {
    try {
      const result = manager.deletePage(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_restart_app ───────────────────────────────────────

server.tool(
  "streamdeck_restart_app",
  "Restart the macOS Stream Deck desktop app to apply profile changes.",
  {},
  async () => {
    try {
      const result = manager.restartApp();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Tool: streamdeck_list_icons ────────────────────────────────────────

server.tool(
  "streamdeck_list_icons",
  "List all available built-in Lucide icon names for use with streamdeck_create_icon.",
  {},
  async () => {
    const icons = listAvailableIcons();
    return {
      content: [{ type: "text", text: JSON.stringify({ count: icons.length, icons }, null, 2) }],
    };
  }
);

// ── Tool: streamdeck_live_dashboard ─────────────────────────────────────

server.tool(
  "streamdeck_live_dashboard",
  "Start/stop a live dashboard that auto-updates Stream Deck buttons based on active Claude sessions, Git status, and running processes.",
  {
    action: z.enum(["start", "stop", "status"]).describe("start/stop/status"),
    profile_name: z.string().describe("Target Stream Deck profile name."),
    page_name: z.string().optional().describe("Page name for live dashboard (default: Live)."),
    refresh_interval: z.number().int().optional().describe("Refresh interval in seconds (default: 15)."),
    sources: z.array(z.string()).optional().describe("Data sources: claude, git, processes (default: all)."),
    git_repos: z.array(z.string()).optional().describe("Git repo paths to monitor."),
  },
  async (args) => {
    try {
      if (args.action === "status") {
        return { content: [{ type: "text", text: JSON.stringify(getDaemonStatus(), null, 2) }] };
      }

      if (args.action === "stop") {
        const result = stopDaemon();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // start
      const config: DaemonConfig = {
        profile_name: args.profile_name,
        page_name: args.page_name || "Live",
        refresh_interval: args.refresh_interval || 15,
        sources: args.sources || ["claude", "git", "processes"],
        git_repos: args.git_repos,
      };
      const result = startDaemon(config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `❌ ${e.message}` }] };
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[streamdeck-custom-mcp] Server started");
}

main().catch((err) => {
  console.error("[streamdeck-custom-mcp] Fatal error:", err);
  process.exit(1);
});
