/**
 * Process detector data source.
 * Detects running dev servers, Docker, etc.
 */

import { execSync } from "node:child_process";

export interface ProcessInfo {
  name: string;
  running: boolean;
  detail?: string;
}

export function detectProcesses(): ProcessInfo[] {
  const results: ProcessInfo[] = [];

  // Dev server (next/yarn dev)
  const devServer = checkProcess("next-server|yarn.*dev|npm.*dev|vite");
  results.push({ name: "Dev Server", running: devServer.running, detail: devServer.detail });

  // Storybook
  const storybook = checkProcess("storybook|start-storybook");
  results.push({ name: "Storybook", running: storybook.running, detail: storybook.detail });

  // Docker
  const docker = checkProcess("com.docker.backend|Docker Desktop");
  results.push({ name: "Docker", running: docker.running, detail: docker.detail });

  return results;
}

function checkProcess(pattern: string): { running: boolean; detail?: string } {
  try {
    const output = execSync(`pgrep -fl '${pattern}' 2>/dev/null || true`, { stdio: "pipe" })
      .toString()
      .trim();
    const lines = output.split("\n").filter((l) => l && !l.includes("pgrep"));
    return { running: lines.length > 0, detail: lines[0]?.slice(0, 80) };
  } catch {
    return { running: false };
  }
}
