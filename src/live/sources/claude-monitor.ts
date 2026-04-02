/**
 * Claude Code Agent Monitor data source.
 * Fetches active sessions from localhost:4820/api/sessions.
 */

export interface ClaudeSession {
  id: string;
  name: string;
  status: string;
  cwd: string;
  model: string | null;
  cost: number;
  agent_count: number;
  last_activity: string;
}

export async function fetchClaudeSessions(): Promise<ClaudeSession[]> {
  try {
    const res = await fetch("http://localhost:4820/api/sessions?limit=10");
    if (!res.ok) return [];
    const data = await res.json() as { sessions: ClaudeSession[] };
    return (data.sessions || []).filter((s) => s.status === "active");
  } catch {
    return [];
  }
}
