/**
 * Git status data source.
 * Polls git repos for branch, changes, push status.
 */

import { execSync } from "node:child_process";

export interface GitInfo {
  repo: string;
  branch: string;
  changes: number;
  ahead: number;
}

export function fetchGitStatus(repoPaths: string[]): GitInfo[] {
  const results: GitInfo[] = [];

  for (const repoPath of repoPaths) {
    try {
      const branch = execSync("git branch --show-current", { cwd: repoPath, stdio: "pipe" })
        .toString()
        .trim();

      const porcelain = execSync("git status --porcelain", { cwd: repoPath, stdio: "pipe" })
        .toString()
        .trim();
      const changes = porcelain ? porcelain.split("\n").length : 0;

      let ahead = 0;
      try {
        const log = execSync("git log @{u}..HEAD --oneline 2>/dev/null", { cwd: repoPath, stdio: "pipe" })
          .toString()
          .trim();
        ahead = log ? log.split("\n").length : 0;
      } catch {}

      const repoName = repoPath.split("/").pop() || repoPath;
      results.push({ repo: repoName, branch, changes, ahead });
    } catch {}
  }

  return results;
}
