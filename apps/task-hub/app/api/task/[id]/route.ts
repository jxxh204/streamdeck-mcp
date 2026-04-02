import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

const GONGBIZ_DIR = "/Users/gimjaehwan/project/gongbiz/gongbiz-crm-b2b-web";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;

  if (!taskId || taskId.length > 50) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  let github: unknown[] = [];

  try {
    const cmd = `cd ${GONGBIZ_DIR} && gh pr list --search "${taskId}" --state all --limit 5 --json number,title,url,state,headRefName`;
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 15000,
    });
    github = JSON.parse(output);
  } catch (e: unknown) {
    console.error("GitHub search failed:", e instanceof Error ? e.message : e);
    github = [];
  }

  return NextResponse.json({
    taskId,
    github,
    slack: null,
    notion: null,
  });
}
