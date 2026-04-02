/**
 * Stream Deck ProfilesV3/V2 manifest reader/writer.
 * Ported from Python streamdeck-mcp with improvements.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";

// ── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_BG_COLOR = "#000000";
export const DEFAULT_TEXT_COLOR = "#FFFFFF";
export const DEFAULT_FONT_SIZE = 12;
export const DEFAULT_TITLE_ALIGNMENT = "bottom";
export const ICON_SIZE = 144; // 2x retina (was 72 in original)

const DEFAULT_PAGE_MANIFEST = {
  Controllers: [{ Actions: null as Record<string, unknown> | null, Type: "Keypad" }],
  Icon: "",
  Name: "",
};

const MODEL_LAYOUTS: Record<string, [number, number]> = {
  "20GBA9901": [5, 3],
  "UI Stream Deck": [4, 2],
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const POSITION_RE = /^\d+,\d+$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /[^a-z0-9]+/g;

// ── Errors ─────────────────────────────────────────────────────────────

export class ProfileManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileManagerError";
  }
}
export class ProfileNotFoundError extends ProfileManagerError {
  constructor(message: string) {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}
export class PageNotFoundError extends ProfileManagerError {
  constructor(message: string) {
    super(message);
    this.name = "PageNotFoundError";
  }
}
export class ProfileValidationError extends ProfileManagerError {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export interface PageRef {
  page_index: number;
  directory_id: string;
  page_uuid: string | null;
  manifest_path: string;
  version: string;
  mapping: string;
  is_default: boolean;
  is_current: boolean;
  name: string;
  button_count: number;
  icon_count: number;
}

export interface ButtonInput {
  key?: number;
  position?: string;
  title?: string;
  icon_path?: string;
  path?: string;
  action_type?: string;
  action?: Record<string, unknown> | string;
  plugin_uuid?: string;
  plugin_name?: string;
  plugin_version?: string;
  action_uuid?: string;
  action_name?: string;
  action_id?: string;
  settings?: Record<string, unknown>;
  state?: number;
  states?: Record<string, unknown>[];
  font_size?: number;
  title_color?: string;
  title_alignment?: string;
  show_title?: boolean;
  linked_title?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function loadJson(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e: any) {
    if (e.code === "ENOENT") throw new ProfileManagerError(`Missing file: ${filePath}`);
    throw new ProfileManagerError(`Invalid JSON in ${filePath}: ${e.message}`);
  }
}

function writeJsonAtomic(filePath: string, data: Record<string, any>): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(SLUG_RE, "-").replace(/^-|-$/g, "") || "streamdeck-action";
}

function quoteOpenPath(p: string): string {
  const escaped = p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function ensureHexColor(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!HEX_COLOR_RE.test(normalized)) {
    throw new ProfileValidationError(`${fieldName} must be a hex color like '#112233', got '${value}'.`);
  }
  return normalized.toLowerCase();
}

function generateDirectoryId(length = 27): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

function countIcons(pageDir: string): number {
  const imagesDir = path.join(pageDir, "Images");
  if (!fs.existsSync(imagesDir)) return 0;
  return fs.readdirSync(imagesDir).filter((f) => fs.statSync(path.join(imagesDir, f)).isFile()).length;
}

function controllerActions(pageManifest: Record<string, any>): Record<string, any> {
  const controllers = pageManifest.Controllers || [];
  if (!controllers.length) return {};
  return controllers[0].Actions || {};
}

function getProfilesDir(): string {
  const home = os.homedir();
  const base = path.join(home, "Library/Application Support/com.elgato.StreamDeck");
  const v3 = path.join(base, "ProfilesV3");
  const v2 = path.join(base, "ProfilesV2");
  if (fs.existsSync(v3)) return v3;
  if (fs.existsSync(v2)) return v2;
  return v3; // default
}

// ── ProfileManager ─────────────────────────────────────────────────────

export class ProfileManager {
  readonly profilesDir: string;
  readonly scriptsDir: string;
  readonly generatedIconsDir: string;

  constructor(options?: { profilesDir?: string; scriptsDir?: string; generatedIconsDir?: string }) {
    this.profilesDir = options?.profilesDir || getProfilesDir();
    this.scriptsDir = options?.scriptsDir || path.join(os.homedir(), "StreamDeckScripts");
    this.generatedIconsDir =
      options?.generatedIconsDir || path.join(os.homedir(), ".streamdeck-mcp", "generated-icons");
  }

  listProfiles(): Record<string, any>[] {
    if (!fs.existsSync(this.profilesDir)) return [];

    const profiles: Record<string, any>[] = [];
    const entries = fs.readdirSync(this.profilesDir).filter((e) => e.endsWith(".sdProfile")).sort();

    for (const entry of entries) {
      const profileDir = path.join(this.profilesDir, entry);
      const manifestPath = path.join(profileDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = loadJson(manifestPath);
      const pageRefs = this.pageRefs(profileDir, manifest);

      profiles.push({
        profile_id: path.basename(profileDir, ".sdProfile"),
        name: manifest.Name || path.basename(profileDir, ".sdProfile"),
        version: manifest.Version || "unknown",
        profiles_dir: this.profilesDir,
        profiles_root: path.basename(this.profilesDir),
        profile_path: profileDir,
        device: manifest.Device || {},
        current_page_uuid: manifest.Pages?.Current,
        default_page_uuid: manifest.Pages?.Default,
        page_count: pageRefs.length,
        pages: pageRefs,
      });
    }
    return profiles;
  }

  readPage(opts: {
    profile_name?: string;
    profile_id?: string;
    page_index?: number;
    directory_id?: string;
  }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const pageRef = this.resolvePageRef(profileDir, profileManifest, opts.page_index, opts.directory_id);
    const pageManifest = loadJson(pageRef.manifest_path);
    const [columns, rows] = this.resolveLayout(profileManifest, pageManifest);

    const buttons: Record<string, any>[] = [];
    const actions = controllerActions(pageManifest);
    const sortedPositions = Object.keys(actions).sort((a, b) => {
      const [ac, ar] = a.split(",").map(Number);
      const [bc, br] = b.split(",").map(Number);
      return ar! !== br! ? ar! - br! : ac! - bc!;
    });

    for (const position of sortedPositions) {
      const action = actions[position];
      const [col, row] = position.split(",").map(Number);
      const key = row! * columns + col!;
      const stateIndex = Math.min(
        Math.max(Number(action.State || 0), 0),
        Math.max((action.States || [{}]).length - 1, 0)
      );
      const states = action.States || [{}];
      const activeState = states[stateIndex] || {};

      buttons.push({
        key,
        position,
        action_id: action.ActionID,
        action_uuid: action.UUID,
        plugin_uuid: action.Plugin?.UUID,
        plugin_name: action.Plugin?.Name,
        name: action.Name,
        state: action.State || 0,
        title: activeState.Title,
        image: activeState.Image,
        settings: action.Settings || {},
        show_title: activeState.ShowTitle,
        raw: action,
      });
    }

    return {
      profiles_root: path.basename(this.profilesDir),
      profile: {
        profile_id: path.basename(profileDir, ".sdProfile"),
        name: profileManifest.Name || path.basename(profileDir, ".sdProfile"),
        version: profileManifest.Version || "unknown",
        device: profileManifest.Device || {},
        current_page_uuid: profileManifest.Pages?.Current,
        default_page_uuid: profileManifest.Pages?.Default,
      },
      page: pageRef,
      layout: { columns, rows },
      buttons,
      raw_manifest: pageManifest,
    };
  }

  writePage(opts: {
    profile_name?: string;
    profile_id?: string;
    page_index?: number;
    directory_id?: string;
    page_name?: string;
    buttons?: ButtonInput[];
    clear_existing?: boolean;
    create_new?: boolean;
    make_current?: boolean;
  }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const buttons = opts.buttons || [];
    const clearExisting = opts.clear_existing !== false;
    const version = String(profileManifest.Version || "2.0");
    let pageUuid: string | null;
    let pageDir: string;
    let pageManifest: Record<string, any>;

    if (opts.create_new) {
      pageUuid = crypto.randomUUID();
      const dirName = version.startsWith("3") ? pageUuid.toUpperCase() : generateDirectoryId();
      pageDir = path.join(profileDir, "Profiles", dirName);
      fs.mkdirSync(path.join(pageDir, "Images"), { recursive: true });
      pageManifest = JSON.parse(JSON.stringify(DEFAULT_PAGE_MANIFEST));
    } else {
      const pageRef = this.resolvePageRef(profileDir, profileManifest, opts.page_index, opts.directory_id);
      pageUuid = pageRef.page_uuid;
      pageDir = path.dirname(pageRef.manifest_path);
      pageManifest = loadJson(pageRef.manifest_path);
    }

    if (opts.page_name !== undefined) {
      pageManifest.Name = opts.page_name;
    }

    const [columns, rows] = this.resolveLayout(profileManifest, pageManifest);
    const actions: Record<string, any> = clearExisting
      ? {}
      : JSON.parse(JSON.stringify(controllerActions(pageManifest)));

    for (const button of buttons) {
      const position = this.resolveButtonPosition(button, columns, rows);
      actions[position] = this.materializeAction(button, pageDir);
    }

    const controllers = pageManifest.Controllers || [{ Type: "Keypad" }];
    if (!controllers.length) controllers.push({ Type: "Keypad" });
    controllers[0].Type = controllers[0].Type || "Keypad";
    controllers[0].Actions = Object.keys(actions).length ? actions : null;
    pageManifest.Controllers = controllers;

    if (opts.create_new) {
      const pages = profileManifest.Pages || {};
      pages.Pages = pages.Pages || [];
      pages.Pages.push(pageUuid);
      pages.Current = opts.make_current || !pages.Current ? pageUuid : pages.Current;
      if (!pages.Default) pages.Default = pageUuid;
      profileManifest.Pages = pages;
    } else if (opts.make_current) {
      if (!pageUuid) throw new ProfileValidationError("Cannot mark an existing ProfilesV2 page current without a stable page UUID.");
      profileManifest.Pages = profileManifest.Pages || {};
      profileManifest.Pages.Current = pageUuid;
    }

    writeJsonAtomic(path.join(pageDir, "manifest.json"), pageManifest);
    if (opts.create_new || opts.make_current) {
      writeJsonAtomic(path.join(profileDir, "manifest.json"), profileManifest);
    }

    return {
      created: !!opts.create_new,
      profiles_root: path.basename(this.profilesDir),
      profile_id: path.basename(profileDir, ".sdProfile"),
      page_index: opts.create_new ? null : opts.page_index,
      directory_id: path.basename(pageDir),
      page_uuid: pageUuid,
      layout: { columns, rows },
      button_count: Object.keys(actions).length,
      page_name: pageManifest.Name || "",
      manifest_path: path.join(pageDir, "manifest.json"),
    };
  }

  createAction(opts: {
    name: string;
    command: string;
    working_directory?: string;
    filename?: string;
  }): Record<string, any> {
    if (!opts.command.trim()) throw new ProfileValidationError("command cannot be empty.");

    fs.mkdirSync(this.scriptsDir, { recursive: true });
    const stem = slugify(opts.filename || opts.name);
    const scriptPath = path.join(this.scriptsDir, `${stem}.sh`);

    const lines = ["#!/bin/bash", "set -e"];
    if (opts.working_directory) {
      lines.push(`cd ${shellQuote(opts.working_directory)}`);
    }
    lines.push(opts.command);
    fs.writeFileSync(scriptPath, lines.join("\n") + "\n");
    fs.chmodSync(scriptPath, 0o755);

    const action = this.buildOpenAction(scriptPath, opts.name);
    return { script_path: scriptPath, action };
  }

  // ── Profile Management ──────────────────────────────────────────────

  createProfile(opts: { name: string; device_model?: string }): Record<string, any> {
    // Get device info from existing profiles BEFORE creating new directory
    let device: Record<string, any> = {};
    const existing = this.listProfiles();
    if (existing.length > 0) {
      device = existing[0]!.device;
    }
    if (opts.device_model) {
      device = { ...device, Model: opts.device_model };
    }

    const profileId = crypto.randomUUID().toUpperCase();
    const profileDir = path.join(this.profilesDir, `${profileId}.sdProfile`);
    fs.mkdirSync(path.join(profileDir, "Images"), { recursive: true });
    fs.mkdirSync(path.join(profileDir, "Profiles"), { recursive: true });

    // Create default page
    const pageUuid = crypto.randomUUID();
    const pageDir = path.join(profileDir, "Profiles", pageUuid.toUpperCase());
    fs.mkdirSync(path.join(pageDir, "Images"), { recursive: true });

    const pageManifest = { Controllers: [{ Actions: null, Type: "Keypad" }], Icon: "", Name: "" };
    writeJsonAtomic(path.join(pageDir, "manifest.json"), pageManifest);

    const profileManifest = {
      AppIdentifier: "*",
      Device: device,
      Name: opts.name,
      Pages: { Current: pageUuid, Default: pageUuid, Pages: [] as string[] },
      Version: "3.0",
    };
    writeJsonAtomic(path.join(profileDir, "manifest.json"), profileManifest);

    return {
      profile_id: profileId,
      name: opts.name,
      profile_path: profileDir,
      default_page_uuid: pageUuid,
    };
  }

  renameProfile(opts: { profile_name?: string; profile_id?: string; new_name: string }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const oldName = profileManifest.Name;
    profileManifest.Name = opts.new_name;
    writeJsonAtomic(path.join(profileDir, "manifest.json"), profileManifest);
    return { profile_id: path.basename(profileDir, ".sdProfile"), old_name: oldName, new_name: opts.new_name };
  }

  deleteProfile(opts: { profile_name?: string; profile_id?: string }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const name = profileManifest.Name;
    fs.rmSync(profileDir, { recursive: true, force: true });
    return { deleted: true, name, profile_path: profileDir };
  }

  duplicateProfile(opts: { profile_name?: string; profile_id?: string; new_name: string }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const newId = crypto.randomUUID().toUpperCase();
    const newDir = path.join(this.profilesDir, `${newId}.sdProfile`);

    // Deep copy the directory
    fs.cpSync(profileDir, newDir, { recursive: true });

    // Update name in new profile
    const newManifest = loadJson(path.join(newDir, "manifest.json"));
    newManifest.Name = opts.new_name;
    writeJsonAtomic(path.join(newDir, "manifest.json"), newManifest);

    return {
      profile_id: newId,
      name: opts.new_name,
      source_name: profileManifest.Name,
      profile_path: newDir,
    };
  }

  deletePage(opts: {
    profile_name?: string;
    profile_id?: string;
    page_index?: number;
    directory_id?: string;
  }): Record<string, any> {
    const [profileDir, profileManifest] = this.resolveProfile(opts.profile_name, opts.profile_id);
    const pageRef = this.resolvePageRef(profileDir, profileManifest, opts.page_index, opts.directory_id);

    // Remove page directory
    fs.rmSync(path.dirname(pageRef.manifest_path), { recursive: true, force: true });

    // Remove from profile manifest Pages array
    const pages = profileManifest.Pages || {};
    if (pageRef.page_uuid) {
      pages.Pages = (pages.Pages || []).filter((u: string) => u.toLowerCase() !== pageRef.page_uuid!.toLowerCase());
      if (pages.Current?.toLowerCase() === pageRef.page_uuid.toLowerCase()) {
        pages.Current = pages.Default || (pages.Pages.length ? pages.Pages[0] : null);
      }
    }
    profileManifest.Pages = pages;
    writeJsonAtomic(path.join(profileDir, "manifest.json"), profileManifest);

    return {
      deleted: true,
      directory_id: pageRef.directory_id,
      page_uuid: pageRef.page_uuid,
      page_name: pageRef.name,
    };
  }

  restartApp(): Record<string, any> {
    const killed: string[] = [];

    for (const appName of ["Elgato Stream Deck", "Stream Deck"]) {
      try {
        execSync(`killall "${appName}"`, { stdio: "pipe" });
        killed.push(appName);
      } catch {}
    }

    // Brief pause to let the app fully terminate before relaunching
    if (killed.length) {
      execSync("sleep 1", { stdio: "pipe" });
    }

    // Try multiple methods to launch (open -a can fail from launchd)
    const launchMethods = [
      'open -a "Elgato Stream Deck"',
      'open -a "Stream Deck"',
      'open "/Applications/Elgato Stream Deck.app"',
      'osascript -e \'tell application "Elgato Stream Deck" to activate\'',
    ];
    let launched = false;
    for (const cmd of launchMethods) {
      try {
        execSync(cmd, { stdio: "pipe" });
        launched = true;
        break;
      } catch {}
    }

    if (!launched) {
      throw new ProfileManagerError("Failed to relaunch Stream Deck app.");
    }

    return { killed, restarted: true };
  }

  // ── Private ────────────────────────────────────────────────────────

  private resolveProfile(
    profileName?: string,
    profileId?: string
  ): [string, Record<string, any>] {
    if (!fs.existsSync(this.profilesDir)) {
      throw new ProfileNotFoundError(`Profiles directory does not exist: ${this.profilesDir}`);
    }

    const matches: [string, Record<string, any>][] = [];
    const entries = fs.readdirSync(this.profilesDir).filter((e) => e.endsWith(".sdProfile")).sort();

    for (const entry of entries) {
      const profileDir = path.join(this.profilesDir, entry);
      const manifest = loadJson(path.join(profileDir, "manifest.json"));

      if (profileId && path.basename(profileDir, ".sdProfile").toLowerCase() === profileId.toLowerCase()) {
        return [profileDir, manifest];
      }
      if (profileName && String(manifest.Name || "").toLowerCase() === profileName.toLowerCase()) {
        matches.push([profileDir, manifest]);
      }
    }

    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new ProfileValidationError(`Multiple profiles match '${profileName}'. Use profile_id instead.`);
    }

    throw new ProfileNotFoundError(`Profile not found: ${profileId || profileName || "<unspecified>"}`);
  }

  private pageRefs(profileDir: string, profileManifest: Record<string, any>): PageRef[] {
    const profilesPath = path.join(profileDir, "Profiles");
    if (!fs.existsSync(profilesPath)) return [];

    const version = String(profileManifest.Version || "2.0");
    if (version.startsWith("3")) return this.pageRefsV3(profilesPath, profileManifest);
    return this.pageRefsV2(profilesPath, profileManifest);
  }

  private pageRefsV3(profilesPath: string, profileManifest: Record<string, any>): PageRef[] {
    const refs: PageRef[] = [];
    const pages = profileManifest.Pages || {};
    const defaultUuid = pages.Default;
    const currentUuid = String(pages.Current || "").toLowerCase();

    const orderedPages: Array<{ uuid: string; isDefault: boolean }> = [];
    if (defaultUuid) orderedPages.push({ uuid: defaultUuid, isDefault: true });
    for (const pageUuid of pages.Pages || []) {
      orderedPages.push({ uuid: pageUuid, isDefault: false });
    }

    const used = new Set<string>();
    for (let i = 0; i < orderedPages.length; i++) {
      const { uuid: pageUuid, isDefault } = orderedPages[i]!;
      const directoryId = String(pageUuid).toUpperCase();
      const manifestPath = path.join(profilesPath, directoryId, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      used.add(directoryId);
      refs.push(
        this.buildPageRef({
          page_index: i,
          directory_id: directoryId,
          page_uuid: String(pageUuid).toLowerCase(),
          manifest_path: manifestPath,
          version: String(profileManifest.Version || "unknown"),
          mapping: "page-uuid",
          is_default: isDefault,
          is_current: String(pageUuid).toLowerCase() === currentUuid,
        })
      );
    }

    // Unreferenced pages
    const dirs = fs.readdirSync(profilesPath).sort();
    for (const dir of dirs) {
      const dirUpper = dir.toUpperCase();
      if (used.has(dirUpper)) continue;
      const manifestPath = path.join(profilesPath, dir, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      refs.push(
        this.buildPageRef({
          page_index: refs.length,
          directory_id: dirUpper,
          page_uuid: UUID_RE.test(dirUpper) ? dirUpper.toLowerCase() : null,
          manifest_path: manifestPath,
          version: String(profileManifest.Version || "unknown"),
          mapping: "unreferenced",
          is_default: false,
          is_current: false,
        })
      );
    }

    return refs;
  }

  private pageRefsV2(profilesPath: string, profileManifest: Record<string, any>): PageRef[] {
    const refs: PageRef[] = [];
    const dirs = fs
      .readdirSync(profilesPath)
      .filter((d) => fs.statSync(path.join(profilesPath, d)).isDirectory())
      .sort();

    for (let i = 0; i < dirs.length; i++) {
      const manifestPath = path.join(profilesPath, dirs[i]!, "manifest.json");
      refs.push(
        this.buildPageRef({
          page_index: i,
          directory_id: dirs[i]!,
          page_uuid: null,
          manifest_path: manifestPath,
          version: String(profileManifest.Version || "unknown"),
          mapping: "directory-order",
          is_default: false,
          is_current: false,
        })
      );
    }
    return refs;
  }

  private buildPageRef(opts: Omit<PageRef, "name" | "button_count" | "icon_count">): PageRef {
    const pageManifest = loadJson(opts.manifest_path);
    const actions = controllerActions(pageManifest);
    return {
      ...opts,
      name: String(pageManifest.Name || ""),
      button_count: Object.keys(actions).length,
      icon_count: countIcons(path.dirname(opts.manifest_path)),
    };
  }

  private resolvePageRef(
    profileDir: string,
    profileManifest: Record<string, any>,
    pageIndex?: number,
    directoryId?: string
  ): PageRef {
    const refs = this.pageRefs(profileDir, profileManifest);

    if (directoryId) {
      const found = refs.find((r) => r.directory_id.toLowerCase() === directoryId.toLowerCase());
      if (found) return found;
      throw new PageNotFoundError(`Page directory not found: ${directoryId}`);
    }

    if (pageIndex === undefined || pageIndex === null) {
      throw new ProfileValidationError("Provide either page_index or directory_id.");
    }

    const found = refs.find((r) => r.page_index === pageIndex);
    if (found) return found;
    throw new PageNotFoundError(`Page index not found: ${pageIndex}`);
  }

  private resolveLayout(
    profileManifest: Record<string, any>,
    pageManifest?: Record<string, any>
  ): [number, number] {
    const model = String(profileManifest.Device?.Model || "");
    if (MODEL_LAYOUTS[model]) return MODEL_LAYOUTS[model]!;

    if (pageManifest) {
      const actions = controllerActions(pageManifest);
      const positions = Object.keys(actions);
      if (positions.length) {
        const cols = Math.max(...positions.map((p) => Number(p.split(",")[0]))) + 1;
        const rows = Math.max(...positions.map((p) => Number(p.split(",")[1]))) + 1;
        if (cols > 0 && rows > 0) return [cols, rows];
      }
    }

    return [5, 3];
  }

  private resolveButtonPosition(button: ButtonInput, columns: number, rows: number): string {
    let col: number, row: number;

    if (button.position) {
      if (!POSITION_RE.test(button.position)) {
        throw new ProfileValidationError(`Invalid button position '${button.position}'. Use 'col,row'.`);
      }
      [col, row] = button.position.split(",").map(Number) as [number, number];
    } else if (button.key !== undefined) {
      if (button.key < 0) throw new ProfileValidationError(`Invalid button key '${button.key}'.`);
      col = button.key % columns;
      row = Math.floor(button.key / columns);
    } else {
      throw new ProfileValidationError("Each button needs either 'key' or 'position'.");
    }

    if (col >= columns || row >= rows) {
      throw new ProfileValidationError(
        `Button position ${col},${row} exceeds the inferred deck layout ${columns}x${rows}.`
      );
    }

    return `${col},${row}`;
  }

  private materializeAction(button: ButtonInput, pageDir: string): Record<string, any> {
    let action: Record<string, any>;

    if (button.action === undefined || button.action === null) {
      action = this.buildActionFromFields(button);
    } else if (typeof button.action === "string") {
      try {
        action = JSON.parse(button.action);
      } catch (e: any) {
        throw new ProfileValidationError(`Button action is not valid JSON: ${e.message}`);
      }
    } else {
      action = JSON.parse(JSON.stringify(button.action));
    }

    const states: Record<string, any>[] = JSON.parse(JSON.stringify(action.States || [{}]));
    const stateIndex = Math.min(Math.max(Number(action.State || 0), 0), Math.max(states.length - 1, 0));
    const stateData: Record<string, any> = JSON.parse(JSON.stringify(states[stateIndex] || {}));

    if (button.title !== undefined) stateData.Title = button.title;
    if (button.font_size !== undefined) stateData.FontSize = button.font_size;
    else if ("Title" in stateData && !("FontSize" in stateData)) stateData.FontSize = DEFAULT_FONT_SIZE;
    if (button.title_color !== undefined) stateData.TitleColor = ensureHexColor(button.title_color, "title_color");
    else if ("Title" in stateData && !("TitleColor" in stateData)) stateData.TitleColor = DEFAULT_TEXT_COLOR.toLowerCase();
    if (button.title_alignment !== undefined) stateData.TitleAlignment = button.title_alignment;
    else if ("Title" in stateData && !("TitleAlignment" in stateData)) stateData.TitleAlignment = DEFAULT_TITLE_ALIGNMENT;
    if (button.show_title !== undefined) stateData.ShowTitle = button.show_title;
    else if ("Title" in stateData && !("ShowTitle" in stateData)) stateData.ShowTitle = true;

    stateData.FontFamily ??= "";
    stateData.FontStyle ??= "";
    stateData.FontUnderline ??= false;
    stateData.OutlineThickness ??= 2;

    if (button.icon_path) {
      stateData.Image = this.copyIconToPage(button.icon_path, pageDir);
    }

    states[stateIndex] = stateData;
    action.States = states;
    return action;
  }

  private buildActionFromFields(button: ButtonInput): Record<string, any> {
    if (button.action_type === "next_page") return this.buildNavigationAction("next");
    if (button.action_type === "previous_page") return this.buildNavigationAction("previous");

    if (button.path) {
      return this.buildOpenAction(button.path, button.title);
    }

    // Display-only button (icon only, no action)
    if (button.icon_path && !button.plugin_uuid && !button.action_uuid) {
      return {
        ActionID: crypto.randomUUID(),
        LinkedTitle: true,
        Name: button.title || "",
        Plugin: { Name: "Open", UUID: "com.elgato.streamdeck.system.open", Version: "1.0" },
        Settings: {},
        State: 0,
        States: [{}],
        UUID: "com.elgato.streamdeck.system.open",
      };
    }

    if (button.plugin_uuid && button.action_uuid) {
      return {
        ActionID: button.action_id || crypto.randomUUID(),
        LinkedTitle: !!button.linked_title,
        Name: button.action_name || button.title || "",
        Plugin: {
          Name: button.plugin_name || button.plugin_uuid,
          UUID: button.plugin_uuid,
          Version: button.plugin_version || "1.0",
        },
        Settings: JSON.parse(JSON.stringify(button.settings || {})),
        State: button.state || 0,
        States: JSON.parse(JSON.stringify(button.states || [{}])),
        UUID: button.action_uuid,
      };
    }

    throw new ProfileValidationError(
      "Button needs either 'action', 'path', 'action_type', or explicit plugin/action UUID fields."
    );
  }

  private buildNavigationAction(direction: "next" | "previous"): Record<string, any> {
    return {
      ActionID: crypto.randomUUID(),
      LinkedTitle: true,
      Name: direction === "next" ? "Next Page" : "Previous Page",
      Plugin: { Name: "Pages", UUID: "com.elgato.streamdeck.page", Version: "1.0" },
      Settings: {},
      State: 0,
      States: [{}],
      UUID: `com.elgato.streamdeck.page.${direction}`,
    };
  }

  private buildOpenAction(scriptPath: string, title?: string): Record<string, any> {
    return {
      ActionID: crypto.randomUUID(),
      LinkedTitle: !title,
      Name: "Open",
      Plugin: { Name: "Open", UUID: "com.elgato.streamdeck.system.open", Version: "1.0" },
      Settings: { path: quoteOpenPath(scriptPath) },
      State: 0,
      States: [
        {
          Title: title || "",
          FontSize: DEFAULT_FONT_SIZE,
          FontFamily: "",
          FontStyle: "",
          FontUnderline: false,
          OutlineThickness: 2,
          TitleAlignment: DEFAULT_TITLE_ALIGNMENT,
          TitleColor: DEFAULT_TEXT_COLOR.toLowerCase(),
          ShowTitle: !!title,
        },
      ],
      UUID: "com.elgato.streamdeck.system.open",
    };
  }

  private copyIconToPage(sourcePath: string, pageDir: string): string {
    const resolved = sourcePath.startsWith("~")
      ? path.join(os.homedir(), sourcePath.slice(1))
      : sourcePath;
    if (!fs.existsSync(resolved)) {
      throw new ProfileValidationError(`Icon file not found: ${resolved}`);
    }

    const imagesDir = path.join(pageDir, "Images");
    fs.mkdirSync(imagesDir, { recursive: true });
    const targetName = `${generateDirectoryId(27)}.png`;
    const targetPath = path.join(imagesDir, targetName);
    fs.copyFileSync(resolved, targetPath);

    return `Images/${targetName}`;
  }
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
