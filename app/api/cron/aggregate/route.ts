import { NextResponse } from "next/server";
import { acquireJobLock, dbQuery, isDbEnabled, releaseJobLock } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "DATABASE_URL is not configured" });
  }

  const lockName = "cron:aggregate";
  const acquired = await acquireJobLock(lockName, 20);
  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Job lock active" });
  }

  try {
    // Optional light cleanup policy: remove tiny-sample stale rows older than 30 days.
    await dbQuery(
      "DELETE FROM recommendation_agg WHERE sample_size < $1 AND updated_at < NOW() - INTERVAL '30 days'",
      [2]
    );

    const stats = await dbQuery<{ rows: number; champions: number; patches: number }>(
      `
      SELECT
        COUNT(*)::int AS rows,
        COUNT(DISTINCT champion)::int AS champions,
        COUNT(DISTINCT patch)::int AS patches
      FROM recommendation_agg
      `
    );

    return NextResponse.json({ ok: true, stats: stats[0] || { rows: 0, champions: 0, patches: 0 } });
  } finally {
    await releaseJobLock(lockName);
  }
}
