#!/usr/bin/env node
/**
 * Context Hub — Standalone Live Dashboard Daemon
 *
 * Updates Stream Deck only on meaningful changes:
 *   - Git branch switch → refresh PR links, context
 *   - Claude session start/end
 *   - Dev server on/off
 * Ignores: file count changes, cost updates, minor diffs.
 *
 * Usage:
 *   node dist/live/standalone.js [--interval 15] [--profile 공비서] [--page Live]
 *   node dist/live/standalone.js --install
 *   node dist/live/standalone.js --uninstall
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { ProfileManager } from "../core/profile-manager.js";
import { renderIcon } from "../core/icon-renderer.js";
import { fetchClaudeSessions, type ClaudeSession } from "./sources/claude-monitor.js";
import { fetchGitStatus, type GitInfo } from "./sources/git-status.js";
import { detectProcesses, type ProcessInfo } from "./sources/process-detector.js";
import { fetchPRs, findPRForBranch, type PullRequest } from "./sources/github-prs.js";

// ── Config ─────────────────────────────────────────────────────────────

interface Config {
  interval: number;
  profileName: string;
  pageName: string;
  gitRepos: string[];
}

function parseArgs(): Config | { action: "install" | "uninstall" } {
  const args = process.argv.slice(2);
  if (args.includes("--install")) return { action: "install" };
  if (args.includes("--uninstall")) return { action: "uninstall" };

  return {
    interval: 15,
    profileName: "공비서",
    pageName: "Live",
    gitRepos: ["/Users/gimjaehwan/project/gongbiz/gongbiz-crm-b2b-web"],
  };
}

// ── Launchd ────────────────────────────────────────────────────────────

const PLIST_LABEL = "com.streamdeck.live-dashboard";
const PLIST_PATH = path.join(os.homedir(), "Library/LaunchAgents", `${PLIST_LABEL}.plist`);
const LOG_DIR = path.join(os.homedir(), ".streamdeck-mcp", "logs");
const NODE_PATH = (() => { try { return execSync("which node", { stdio: "pipe" }).toString().trim(); } catch { return "node"; } })();
const SCRIPT_PATH = path.resolve(path.join(import.meta.dirname, "standalone.js"));

function installLaunchd() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${NODE_PATH}</string><string>${SCRIPT_PATH}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:${path.dirname(NODE_PATH)}</string></dict>
</dict>
</plist>`;

  fs.writeFileSync(PLIST_PATH, plist);
  try { execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: "pipe" }); } catch {}
  execSync(`launchctl load "${PLIST_PATH}"`, { stdio: "pipe" });
  console.log(`✅ Context Hub 데몬 설치 완료\n   logs: ${LOG_DIR}/`);
}

function uninstallLaunchd() {
  try { execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: "pipe" }); } catch {}
  if (fs.existsSync(PLIST_PATH)) fs.unlinkSync(PLIST_PATH);
  console.log("✅ Context Hub 데몬 제거 완료");
}

// ── Meaningful change detection ────────────────────────────────────────

interface ContextState {
  branch: string;
  sessionIds: string[];
  procsRunning: string[]; // names of running processes
}

let lastState: ContextState | null = null;

function hasSignificantChange(current: ContextState): boolean {
  if (!lastState) return true;

  // Branch changed → always update (new PR links, new context)
  if (current.branch !== lastState.branch) return true;

  // Claude session started or ended
  const prevSessions = new Set(lastState.sessionIds);
  const currSessions = new Set(current.sessionIds);
  if (prevSessions.size !== currSessions.size) return true;
  for (const id of currSessions) {
    if (!prevSessions.has(id)) return true;
  }

  // Process on/off toggle
  const prevProcs = new Set(lastState.procsRunning);
  const currProcs = new Set(current.procsRunning);
  if (prevProcs.size !== currProcs.size) return true;
  for (const p of currProcs) {
    if (!prevProcs.has(p)) return true;
  }

  return false;
}

// ── Button layout builder ──────────────────────────────────────────────

function buildContextButtons(opts: {
  sessions: ClaudeSession[];
  git: GitInfo;
  procs: ProcessInfo[];
  myPR: PullRequest | undefined;
  reviewPRs: PullRequest[];
  repoPath: string;
}): Record<string, any>[] {
  const buttons: Record<string, any>[] = [];
  let key = 0;

  // ── Row 1: Context Links (PR, Reviews, localhost) ──

  // Current branch PR
  if (opts.myPR) {
    const prLabel = `#${opts.myPR.number}`;
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "git-pull-request", text: prLabel,
        subtitle: "My PR",
        bg_color: "linear-gradient(#238636, #1a7f37)",
        filename: "ctx-my-pr",
      }).path,
      path: createOpenUrlScript("open-my-pr", opts.myPR.url),
      show_title: false,
    });
  } else {
    // Git branch (no PR yet)
    const bl = opts.git.branch.length > 12 ? opts.git.branch.slice(0, 12) + ".." : opts.git.branch;
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "git-branch", text: bl,
        bg_color: "linear-gradient(#F05032, #D63E1F)",
        filename: "ctx-branch",
      }).path,
      show_title: false,
    });
  }

  // Review PRs (up to 2)
  for (let i = 0; i < Math.min(opts.reviewPRs.length, 2); i++) {
    const pr = opts.reviewPRs[i]!;
    const title = pr.title.length > 14 ? pr.title.slice(0, 14) + ".." : pr.title;
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "eye", text: `#${pr.number}`,
        subtitle: "Review",
        bg_color: "linear-gradient(#9333EA, #7C3AED)",
        filename: `ctx-review-${i}`,
      }).path,
      path: createOpenUrlScript(`open-review-${i}`, pr.url),
      show_title: false,
    });
  }

  // localhost (if dev server running)
  const devRunning = opts.procs.find((p) => p.name === "Dev Server" && p.running);
  if (devRunning) {
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "globe", text: "localhost",
        subtitle: ":3000",
        bg_color: "linear-gradient(#16A34A, #15803D)",
        filename: "ctx-localhost",
      }).path,
      path: createOpenUrlScript("open-localhost", "http://localhost:3000"),
      show_title: false,
    });
  }

  // Review count badge (if more reviews)
  if (opts.reviewPRs.length > 2) {
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "external-link",
        text: "Reviews",
        badge: String(opts.reviewPRs.length),
        badge_color: "#9333EA",
        bg_color: "linear-gradient(#1E293B, #0F172A)",
        filename: "ctx-reviews-more",
      }).path,
      path: createOpenUrlScript("open-reviews", `https://github.com/pulls/review-requested`),
      show_title: false,
    });
  }

  while (key < 5) key++;

  // ── Row 2: Claude + Git actions ──

  // Claude sessions
  const sessionCount = opts.sessions.length;
  if (sessionCount > 0) {
    const totalCost = opts.sessions.reduce((s, c) => s + c.cost, 0);
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "terminal", text: "Claude",
        badge: String(sessionCount),
        badge_color: "#16A34A",
        bg_color: "linear-gradient(#D97706, #B45309)",
        subtitle: `$${totalCost.toFixed(0)}`,
        filename: "ctx-claude",
      }).path,
      show_title: false,
    });
  } else {
    buttons.push({
      key: key++,
      icon_path: renderIcon({
        lucide: "terminal", text: "Claude",
        bg_color: "linear-gradient(#6B7280, #4B5563)",
        filename: "ctx-claude-off",
      }).path,
      show_title: false,
    });
  }

  // Git quick actions
  buttons.push({ key: key++, icon_path: renderIcon({ lucide: "eye", text: "Status", bg_color: "linear-gradient(#F05032, #D63E1F)", filename: "ctx-gs" }).path, path: "/Users/gimjaehwan/StreamDeckScripts/git-status.sh", show_title: false });
  buttons.push({ key: key++, icon_path: renderIcon({ lucide: "upload", text: "Push", bg_color: "linear-gradient(#F05032, #D63E1F)", filename: "ctx-gp" }).path, path: "/Users/gimjaehwan/StreamDeckScripts/git-push.sh", show_title: false });
  buttons.push({ key: key++, icon_path: renderIcon({ lucide: "download", text: "Pull", bg_color: "linear-gradient(#F05032, #D63E1F)", filename: "ctx-gl" }).path, path: "/Users/gimjaehwan/StreamDeckScripts/git-pull.sh", show_title: false });

  while (key < 10) key++;

  // ── Row 3: Apps & Processes ──

  for (const p of opts.procs) {
    const lucide = p.name === "Dev Server" ? "play" : p.name === "Storybook" ? "layout" : "box";
    const bg = p.running ? "linear-gradient(#16A34A, #15803D)" : "linear-gradient(#6B7280, #4B5563)";
    buttons.push({
      key: key++,
      icon_path: renderIcon({ lucide, text: p.name, bg_color: bg, filename: `ctx-${p.name.toLowerCase().replace(/ /g, "-")}` }).path,
      show_title: false,
    });
  }

  // Cursor
  buttons.push({
    key: key++,
    icon_path: renderIcon({
      app_icon: "Cursor", subtitle: "Cursor",
      bg_color: "linear-gradient(#2A2A3E, #1A1A2E)",
      filename: "ctx-cursor",
    }).path,
    path: createOpenUrlScript("open-cursor-project", `cursor "${opts.repoPath}"`),
    show_title: false,
  });

  return buttons;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const SCRIPTS_DIR = path.join(os.homedir(), "StreamDeckScripts");

function createOpenUrlScript(name: string, urlOrCommand: string): string {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  const scriptPath = path.join(SCRIPTS_DIR, `${name}.sh`);
  const isUrl = urlOrCommand.startsWith("http") || urlOrCommand.startsWith("slack://");
  const command = isUrl ? `open "${urlOrCommand}"` : urlOrCommand;
  fs.writeFileSync(scriptPath, `#!/bin/bash\nset -e\n${command}\n`);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

// ── Tick ────────────────────────────────────────────────────────────────

async function tick(config: Config) {
  const repoPath = config.gitRepos[0]!;

  // Collect state
  const sessions = await fetchClaudeSessions();
  const gitInfos = fetchGitStatus(config.gitRepos);
  const git = gitInfos[0];
  const procs = detectProcesses();

  if (!git) return;

  // Check for meaningful change
  const current: ContextState = {
    branch: git.branch,
    sessionIds: sessions.map((s) => s.id),
    procsRunning: procs.filter((p) => p.running).map((p) => p.name),
  };

  if (!hasSignificantChange(current)) return;

  const ts = new Date().toLocaleTimeString("ko-KR");
  const reason = !lastState ? "initial"
    : current.branch !== lastState.branch ? `branch → ${current.branch}`
    : current.sessionIds.length !== lastState.sessionIds.length ? `claude sessions: ${current.sessionIds.length}`
    : `process change`;

  console.log(`[${ts}] Update: ${reason}`);

  lastState = current;

  // Fetch PRs (only when context changes — this is the expensive call)
  const allPRs = fetchPRs(repoPath);
  const myPR = findPRForBranch(allPRs.filter((p) => p.type === "mine"), git.branch);
  const reviewPRs = allPRs.filter((p) => p.type === "review");

  console.log(`[${ts}]   Branch: ${git.branch} | My PR: ${myPR ? '#' + myPR.number : 'none'} | Reviews: ${reviewPRs.length} | Claude: ${sessions.length} | Procs: ${current.procsRunning.join(',') || 'none'}`);

  // Build buttons
  const buttons = buildContextButtons({
    sessions, git, procs, myPR, reviewPRs, repoPath,
  });

  // Write to Stream Deck
  const manager = new ProfileManager();
  const profiles = manager.listProfiles();
  const profile = profiles.find((p) => p.name.toLowerCase() === config.profileName.toLowerCase());
  if (!profile) { console.error(`Profile not found: ${config.profileName}`); return; }

  const livePage = (profile.pages as any[]).find((p: any) => p.name === config.pageName);
  if (livePage) {
    manager.writePage({ profile_name: config.profileName, directory_id: livePage.directory_id, page_name: config.pageName, buttons, clear_existing: true });
  } else {
    manager.writePage({ profile_name: config.profileName, page_name: config.pageName, buttons, clear_existing: true, create_new: true, make_current: true });
  }

  try {
    manager.restartApp();
    console.log(`[${ts}]   Stream Deck updated`);
  } catch (err) {
    console.error(`[${ts}]   Restart failed:`, (err as Error).message);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const parsed = parseArgs();
  if ("action" in parsed) {
    if (parsed.action === "install") installLaunchd();
    else uninstallLaunchd();
    return;
  }

  const config = parsed;
  console.log(`🟢 Context Hub started`);
  console.log(`   Profile: ${config.profileName} | Page: ${config.pageName}`);
  console.log(`   Interval: ${config.interval}s`);
  console.log(`   Triggers: branch switch, session start/end, process on/off`);
  console.log(`   Press Ctrl+C to stop\n`);

  await tick(config);
  setInterval(() => tick(config), config.interval * 1000);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
