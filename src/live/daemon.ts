/**
 * Live Dashboard Daemon
 * Polls data sources, renders icons, updates Stream Deck page with smart debouncing.
 */

import * as crypto from "node:crypto";
import { ProfileManager } from "../core/profile-manager.js";
import { renderIcon } from "../core/icon-renderer.js";
import { fetchClaudeSessions, type ClaudeSession } from "./sources/claude-monitor.js";
import { fetchGitStatus, type GitInfo } from "./sources/git-status.js";
import { detectProcesses, type ProcessInfo } from "./sources/process-detector.js";

const DEFAULT_GIT_REPOS = ["/Users/gimjaehwan/project/gongbiz/gongbiz-crm-b2b-web"];

export interface DaemonConfig {
  profile_name: string;
  page_name: string;
  refresh_interval: number; // seconds
  sources: string[];        // ["claude", "git", "processes"]
  git_repos?: string[];
}

interface DashboardState {
  claudeSessions: ClaudeSession[];
  gitInfos: GitInfo[];
  processes: ProcessInfo[];
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastStateHash = "";
let currentConfig: DaemonConfig | null = null;

export function isDaemonRunning(): boolean {
  return timer !== null;
}

export function getDaemonStatus(): { running: boolean; config: DaemonConfig | null } {
  return { running: isDaemonRunning(), config: currentConfig };
}

export function stopDaemon(): { stopped: boolean } {
  if (timer) {
    clearInterval(timer);
    timer = null;
    currentConfig = null;
    lastStateHash = "";
    return { stopped: true };
  }
  return { stopped: false };
}

export function startDaemon(config: DaemonConfig): { started: boolean; message: string } {
  if (timer) {
    stopDaemon();
  }

  currentConfig = config;

  // Run immediately, then on interval
  tick(config);
  timer = setInterval(() => tick(config), config.refresh_interval * 1000);

  return {
    started: true,
    message: `Live dashboard started. Refreshing every ${config.refresh_interval}s. Sources: ${config.sources.join(", ")}`,
  };
}

async function tick(config: DaemonConfig) {
  try {
    const state = await collectState(config);
    const stateHash = hashState(state);

    // Smart debounce: only update if state actually changed
    if (stateHash === lastStateHash) return;
    lastStateHash = stateHash;

    // Generate icons and build buttons
    const buttons = buildButtons(state, config);

    // Write to Stream Deck — find existing "Live" page or create new
    const manager = new ProfileManager();
    const profiles = manager.listProfiles();
    const profile = profiles.find(
      (p) => p.name.toLowerCase() === config.profile_name.toLowerCase()
    );

    if (!profile) {
      console.error(`[live-daemon] Profile not found: ${config.profile_name}`);
      return;
    }

    // Find existing live page by name
    const livePage = (profile.pages as any[]).find(
      (p: any) => p.name === config.page_name
    );

    if (livePage) {
      manager.writePage({
        profile_name: config.profile_name,
        directory_id: livePage.directory_id,
        page_name: config.page_name,
        buttons,
        clear_existing: true,
      });
    } else {
      manager.writePage({
        profile_name: config.profile_name,
        page_name: config.page_name,
        buttons,
        clear_existing: true,
        create_new: true,
      });
    }

    // Restart app to apply changes
    manager.restartApp();
  } catch (err) {
    // Silently continue - don't crash the daemon
    console.error("[live-daemon] tick error:", err);
  }
}

async function collectState(config: DaemonConfig): Promise<DashboardState> {
  const state: DashboardState = {
    claudeSessions: [],
    gitInfos: [],
    processes: [],
  };

  if (config.sources.includes("claude")) {
    state.claudeSessions = await fetchClaudeSessions();
  }
  if (config.sources.includes("git")) {
    state.gitInfos = fetchGitStatus(config.git_repos || DEFAULT_GIT_REPOS);
  }
  if (config.sources.includes("processes")) {
    state.processes = detectProcesses();
  }

  return state;
}

function hashState(state: DashboardState): string {
  const simplified = {
    claude: state.claudeSessions.map((s) => `${s.id}:${s.status}:${s.agent_count}`),
    git: state.gitInfos.map((g) => `${g.branch}:${g.changes}:${g.ahead}`),
    proc: state.processes.map((p) => `${p.name}:${p.running}`),
  };
  return crypto.createHash("md5").update(JSON.stringify(simplified)).digest("hex");
}

function buildButtons(state: DashboardState, config: DaemonConfig): Record<string, any>[] {
  const buttons: Record<string, any>[] = [];
  let key = 0;

  // ── Row 1: Claude Sessions ───────────────────────────────────
  if (config.sources.includes("claude")) {
    const activeSessions = state.claudeSessions;
    const totalCost = activeSessions.reduce((sum, s) => sum + (s.cost || 0), 0);

    // Claude summary button
    const claudeIcon = renderIcon({
      lucide: "terminal",
      text: "Claude",
      badge: activeSessions.length > 0 ? String(activeSessions.length) : undefined,
      badge_color: "#16A34A",
      bg_color: "linear-gradient(#D97706, #B45309)",
      filename: "live-claude-summary",
    });
    buttons.push({ key: key++, icon_path: claudeIcon.path, show_title: false });

    // Individual sessions (up to 3)
    for (const session of activeSessions.slice(0, 3)) {
      const projectName = session.cwd.split("/").pop() || "unknown";
      const costStr = `$${session.cost.toFixed(1)}`;
      const sessionIcon = renderIcon({
        lucide: "zap",
        text: projectName.length > 12 ? projectName.slice(0, 12) : projectName,
        subtitle: costStr,
        bg_color: "linear-gradient(#1E293B, #0F172A)",
        badge: session.agent_count > 1 ? String(session.agent_count) : undefined,
        badge_color: "#8B5CF6",
        filename: `live-session-${key}`,
      });
      buttons.push({ key: key++, icon_path: sessionIcon.path, show_title: false });
    }

    // Pad remaining slots in row 1
    while (key < 5) {
      key++;
    }
  }

  // ── Row 2: Git Status ────────────────────────────────────────
  if (config.sources.includes("git")) {
    for (const git of state.gitInfos.slice(0, 3)) {
      const branchLabel = git.branch.length > 14
        ? git.branch.slice(0, 14)
        : git.branch;
      const gitIcon = renderIcon({
        lucide: "git-branch",
        text: branchLabel,
        badge: git.changes > 0 ? String(git.changes) : undefined,
        badge_color: git.changes > 0 ? "#EF4444" : undefined,
        bg_color: "linear-gradient(#F05032, #D63E1F)",
        filename: `live-git-${key}`,
      });
      buttons.push({ key: key++, icon_path: gitIcon.path, show_title: false });

      // Push status
      if (git.ahead > 0) {
        const pushIcon = renderIcon({
          lucide: "upload",
          text: "Push",
          badge: String(git.ahead),
          badge_color: "#F59E0B",
          bg_color: "linear-gradient(#F05032, #D63E1F)",
          filename: `live-push-${key}`,
        });
        buttons.push({ key: key++, icon_path: pushIcon.path, show_title: false });
      }
    }

    // Pad remaining slots in row 2
    while (key < 10) {
      key++;
    }
  }

  // ── Row 3: Running Processes ─────────────────────────────────
  if (config.sources.includes("processes")) {
    for (const proc of state.processes) {
      const lucideIcon = proc.name === "Dev Server" ? "play" :
                         proc.name === "Storybook" ? "layout" :
                         proc.name === "Docker" ? "box" : "activity";
      const bgColor = proc.running
        ? "linear-gradient(#16A34A, #15803D)"
        : "linear-gradient(#6B7280, #4B5563)";

      const procIcon = renderIcon({
        lucide: lucideIcon,
        text: proc.name,
        bg_color: bgColor,
        filename: `live-proc-${key}`,
      });
      buttons.push({ key: key++, icon_path: procIcon.path, show_title: false });
    }
  }

  return buttons;
}
