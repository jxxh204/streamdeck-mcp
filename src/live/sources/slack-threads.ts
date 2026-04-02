/**
 * Slack active threads/channels data source.
 * Uses Slack MCP or workspace URL patterns.
 */

export interface SlackLink {
  name: string;
  url: string;
  type: "channel" | "thread" | "dm";
}

/**
 * Returns commonly used Slack channels as quick-access links.
 * In the future, this can be enhanced with Slack API to fetch
 * recent active threads and DMs.
 */
export function getSlackLinks(): SlackLink[] {
  // These are static quick-access links
  // TODO: Use Slack MCP tools to fetch recent threads dynamically
  return [
    { name: "dev", url: "slack://channel?team=T0&id=C0", type: "channel" },
  ];
}
