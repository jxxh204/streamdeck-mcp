"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

interface PR {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName: string;
}

interface TaskResult {
  taskId: string;
  github: PR[];
  slack: null;
  notion: null;
}

function stateColor(state: string) {
  if (state === "MERGED") return "text-purple-400";
  if (state === "OPEN") return "text-green-400";
  if (state === "CLOSED") return "text-red-400";
  return "text-gray-400";
}

function stateBadge(state: string) {
  const color =
    state === "MERGED"
      ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
      : state === "OPEN"
        ? "bg-green-500/20 text-green-300 border-green-500/30"
        : "bg-red-500/20 text-red-300 border-red-500/30";
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${color} font-medium`}
    >
      {state}
    </span>
  );
}

function TaskHubContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [taskId, setTaskId] = useState(searchParams.get("task") || "");
  const [result, setResult] = useState<TaskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (id: string) => {
      if (!id.trim()) return;
      setLoading(true);
      setError(null);
      setResult(null);

      const encoded = encodeURIComponent(id.trim());
      router.replace(`?task=${encoded}`, { scroll: false });

      try {
        const res = await fetch(`/api/task/${encoded}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setResult(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const param = searchParams.get("task");
    if (param) {
      setTaskId(param);
      search(param);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(taskId);
  };

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 tracking-tight">Task Hub</h1>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="Task ID (e.g. GBIZ-25425)"
            className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 mb-6">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* GitHub PRs */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              GitHub PRs
            </h2>
            {result.github.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm">
                No PRs found for {result.taskId}
              </p>
            ) : (
              <div className="space-y-2">
                {result.github.map((pr) => (
                  <a
                    key={pr.number}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)] hover:border-[var(--accent)]/40 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium group-hover:text-[var(--accent)] transition-colors">
                          #{pr.number} {pr.title}
                        </p>
                        <p className="text-sm text-[var(--text-muted)] mt-1 font-mono truncate">
                          {pr.headRefName}
                        </p>
                      </div>
                      {stateBadge(pr.state)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Slack - placeholder */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Slack Threads
            </h2>
            <p className="text-[var(--text-muted)] text-sm italic">
              Coming soon
            </p>
          </section>

          {/* Notion - placeholder */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Notion Docs
            </h2>
            <p className="text-[var(--text-muted)] text-sm italic">
              Coming soon
            </p>
          </section>
        </div>
      )}

      {!result && !loading && !error && (
        <p className="text-center text-[var(--text-muted)] mt-20">
          Enter a task ID to search across GitHub, Slack, and Notion.
        </p>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-6 max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 tracking-tight">Task Hub</h1>
          <p className="text-[var(--text-muted)]">Loading...</p>
        </main>
      }
    >
      <TaskHubContent />
    </Suspense>
  );
}
