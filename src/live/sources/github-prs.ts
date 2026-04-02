/**
 * GitHub PR data source.
 * Uses gh CLI to fetch PRs related to current work.
 */

import { execSync } from "node:child_process";

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  type: "mine" | "review";
}

export function fetchPRs(repoPath: string): PullRequest[] {
  const results: PullRequest[] = [];

  // My open PRs
  try {
    const myPRs = execSync(
      'gh pr list --author @me --state open --limit 5 --json number,title,url,headRefName',
      { cwd: repoPath, stdio: "pipe" }
    ).toString().trim();
    const parsed = JSON.parse(myPRs) as Omit<PullRequest, "type">[];
    for (const pr of parsed) {
      results.push({ ...pr, type: "mine" });
    }
  } catch {}

  // Review requested
  try {
    const reviewPRs = execSync(
      'gh pr list --search "review-requested:@me" --state open --limit 5 --json number,title,url,headRefName',
      { cwd: repoPath, stdio: "pipe" }
    ).toString().trim();
    const parsed = JSON.parse(reviewPRs) as Omit<PullRequest, "type">[];
    for (const pr of parsed) {
      results.push({ ...pr, type: "review" });
    }
  } catch {}

  return results;
}

/**
 * Find PR matching the current git branch.
 */
export function findPRForBranch(prs: PullRequest[], branch: string): PullRequest | undefined {
  return prs.find((pr) => pr.headRefName === branch);
}
