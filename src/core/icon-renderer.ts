/**
 * High-quality SVG → PNG icon renderer for Stream Deck.
 * Renders at 144x144 (2x retina) using @resvg/resvg-js.
 * Supports: text, Lucide icons, gradients, badges, app icons, emoji.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const SIZE = 144;
const ICONS_DIR = path.join(os.homedir(), ".streamdeck-mcp", "generated-icons");

export interface IconOptions {
  // Text
  text?: string;
  bg_color?: string;       // hex or "linear-gradient(#FF6B6B, #C44569)"
  text_color?: string;

  // Icon sources (pick one)
  lucide?: string;          // Lucide icon name: "git-branch", "terminal"
  emoji?: string;           // Emoji: "🚀"
  app_icon?: string;        // macOS app name: "Cursor", "Docker"
  svg?: string;             // Raw SVG string
  image_path?: string;      // Local image file path

  // Layout
  badge?: string;           // Badge text: "3", "!"
  badge_color?: string;     // Badge background color
  subtitle?: string;        // Bottom subtitle
  font_size?: number;
  icon_size?: number;       // Icon size in px (default 64)

  filename?: string;
}

// ── Lucide icon SVG paths (commonly used dev icons) ────────────────────

const LUCIDE_ICONS: Record<string, string> = {
  "git-branch": '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  "git-commit": '<circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>',
  "git-pull-request": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>',
  "git-merge": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>',
  "refresh-cw": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  upload: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  slack: '<path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z"/><path d="M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z"/><path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z"/>',
  docker: '<path d="M22 12.5c-.5-.3-1.6-.5-2.5-.3-.1-.6-.4-1.2-.8-1.7.8-.5 1.1-1.3 1.1-1.3s-1.2-.8-3-.2c-.2-.4-.5-.7-.8-1-.1-.1-.3-.2-.4-.3l-.5.9c-.1-.1-.3-.2-.5-.3l.4-.9c-.3-.1-.7-.2-1-.3l-.2 1c-.2 0-.4-.1-.6-.1V7.5c-.4 0-.7 0-1 .1l-.2-1c-.3.1-.7.2-1 .3l.4.9c-.2.1-.3.2-.5.3l-.5-.9c-.3.2-.6.4-.9.7L8.1 9c-.4.5-.8 1.1-.9 1.7-1-.2-2 0-2.5.3s0 .8 0 .8h.1C5 12.6 6 13 7 13h10c1 0 2-.4 2.3-1.2h.1s.5-.5.1-.8zM7 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  "alert-triangle": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  "external-link": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  "test-tube": '<path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V2"/><path d="M8.5 2h7"/><path d="M14.5 16h-5"/>',
};

// ── Background helper ──────────────────────────────────────────────────

function buildBackground(bgColor: string): string {
  const gradientMatch = bgColor.match(/^linear-gradient\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)$/i);
  if (gradientMatch) {
    return `
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${gradientMatch[1]}"/>
          <stop offset="100%" stop-color="${gradientMatch[2]}"/>
        </linearGradient>
      </defs>
      <rect width="${SIZE}" height="${SIZE}" rx="16" fill="url(#bg)"/>`;
  }
  return `<rect width="${SIZE}" height="${SIZE}" rx="16" fill="${bgColor}"/>`;
}

// ── App icon extraction (macOS) ────────────────────────────────────────

function extractAppIcon(appName: string): string | null {
  const appPaths = [
    `/Applications/${appName}.app`,
    `/System/Applications/${appName}.app`,
    `${os.homedir()}/Applications/${appName}.app`,
    `/Applications/Utilities/${appName}.app`,
  ];

  for (const appPath of appPaths) {
    if (!fs.existsSync(appPath)) continue;

    // Find .icns file
    const resourcesDir = path.join(appPath, "Contents", "Resources");
    if (!fs.existsSync(resourcesDir)) continue;

    const icnsFiles = fs.readdirSync(resourcesDir).filter((f) => f.endsWith(".icns"));
    if (!icnsFiles.length) continue;

    const icnsPath = path.join(resourcesDir, icnsFiles[0]!);
    const tmpPath = path.join(os.tmpdir(), `streamdeck-app-icon-${Date.now()}.png`);

    try {
      execSync(
        `sips -s format png "${icnsPath}" --resampleWidth ${SIZE} --out "${tmpPath}" 2>/dev/null`,
        { stdio: "pipe" }
      );
      return tmpPath;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Main render function ───────────────────────────────────────────────

export function renderIcon(options: IconOptions): { path: string; size: { width: number; height: number } } {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const bgColor = options.bg_color || "#1a1a2e";
  const textColor = options.text_color || "#ffffff";
  const fontSize = options.font_size || 18;
  const iconSize = options.icon_size || 64;
  const stem = slugify(options.filename || options.text || options.lucide || options.app_icon || options.emoji || "icon");
  const outputPath = path.join(ICONS_DIR, `${stem}.png`);

  // If app_icon, try to extract and use directly
  if (options.app_icon) {
    const appIconPath = extractAppIcon(options.app_icon);
    if (appIconPath) {
      // Compose SVG with the app icon as an embedded image
      const iconData = fs.readFileSync(appIconPath);
      const base64 = iconData.toString("base64");
      fs.unlinkSync(appIconPath);

      const hasSubtitle = options.subtitle || options.text;
      const imgY = hasSubtitle ? 10 : 20;
      const imgSize = hasSubtitle ? SIZE - 50 : SIZE - 32;

      let svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
      svg += buildBackground(bgColor);
      svg += `<image x="${(SIZE - imgSize) / 2}" y="${imgY}" width="${imgSize}" height="${imgSize}" href="data:image/png;base64,${base64}" preserveAspectRatio="xMidYMid meet"/>`;
      if (hasSubtitle) {
        svg += `<text x="${SIZE / 2}" y="${SIZE - 12}" text-anchor="middle" fill="${textColor}" font-size="16" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="500">${escapeXml(options.subtitle || options.text || "")}</text>`;
      }
      if (options.badge) svg += buildBadge(options.badge, options.badge_color);
      svg += `</svg>`;

      return rasterize(svg, outputPath);
    }
  }

  // If image_path, embed it
  if (options.image_path && fs.existsSync(options.image_path)) {
    const imgData = fs.readFileSync(options.image_path);
    const ext = path.extname(options.image_path).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const base64 = imgData.toString("base64");

    let svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
    svg += `<image width="${SIZE}" height="${SIZE}" href="data:${mime};base64,${base64}" preserveAspectRatio="xMidYMid slice"/>`;
    if (options.badge) svg += buildBadge(options.badge, options.badge_color);
    svg += `</svg>`;

    return rasterize(svg, outputPath);
  }

  // Build SVG composition
  let svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">`;
  svg += buildBackground(bgColor);

  const hasText = options.text || options.subtitle;
  const hasIcon = options.lucide || options.emoji || options.svg;

  if (options.lucide && LUCIDE_ICONS[options.lucide]) {
    // Render Lucide icon
    const scale = iconSize / 24;
    const iconY = hasText ? 14 : (SIZE - iconSize) / 2;
    const iconX = (SIZE - iconSize) / 2;
    svg += `<g transform="translate(${iconX},${iconY}) scale(${scale})" stroke="${textColor}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`;
    svg += LUCIDE_ICONS[options.lucide];
    svg += `</g>`;
  } else if (options.emoji) {
    // Render emoji as text
    const emojiY = hasText ? SIZE / 2 - 8 : SIZE / 2 + 16;
    svg += `<text x="${SIZE / 2}" y="${emojiY}" text-anchor="middle" font-size="${iconSize}" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji">${options.emoji}</text>`;
  } else if (options.svg) {
    // Embed custom SVG
    const customScale = iconSize / 24;
    const iconY = hasText ? 14 : (SIZE - iconSize) / 2;
    const iconX = (SIZE - iconSize) / 2;
    svg += `<g transform="translate(${iconX},${iconY}) scale(${customScale})">${options.svg}</g>`;
  }

  // Main text
  if (options.text && !hasIcon) {
    // Text-only mode: centered
    const lines = options.text.split("\\n");
    const lineHeight = fontSize + 4;
    const totalHeight = lines.length * lineHeight;
    const startY = (SIZE - totalHeight) / 2 + fontSize;
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="${SIZE / 2}" y="${startY + i * lineHeight}" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600">${escapeXml(lines[i]!)}</text>`;
    }
  } else if (options.text && hasIcon) {
    // Text below icon
    svg += `<text x="${SIZE / 2}" y="${SIZE - 16}" text-anchor="middle" fill="${textColor}" font-size="${Math.min(fontSize, 18)}" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="500">${escapeXml(options.text)}</text>`;
  }

  // Subtitle
  if (options.subtitle && options.text) {
    svg += `<text x="${SIZE / 2}" y="${SIZE - 4}" text-anchor="middle" fill="${textColor}" font-size="12" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif" opacity="0.7">${escapeXml(options.subtitle)}</text>`;
  } else if (options.subtitle && !options.text) {
    svg += `<text x="${SIZE / 2}" y="${SIZE - 12}" text-anchor="middle" fill="${textColor}" font-size="16" font-family="SF Pro Display, Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="500">${escapeXml(options.subtitle)}</text>`;
  }

  // Badge
  if (options.badge) svg += buildBadge(options.badge, options.badge_color);

  svg += `</svg>`;

  return rasterize(svg, outputPath);
}

function buildBadge(text: string, color?: string): string {
  const badgeColor = color || "#EF4444";
  const badgeR = text.length > 1 ? 18 : 14;
  const cx = SIZE - badgeR - 4;
  const cy = badgeR + 4;
  return `
    <circle cx="${cx}" cy="${cy}" r="${badgeR}" fill="${badgeColor}"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="white" font-size="${text.length > 2 ? 12 : 14}" font-weight="bold" font-family="SF Pro Display, Helvetica, Arial, sans-serif">${escapeXml(text)}</text>`;
}

function rasterize(svg: string, outputPath: string): { path: string; size: { width: number; height: number } } {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: SIZE },
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(outputPath, pngBuffer);

  return { path: outputPath, size: { width: SIZE, height: SIZE } };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "icon";
}

export function listAvailableIcons(): string[] {
  return Object.keys(LUCIDE_ICONS).sort();
}
