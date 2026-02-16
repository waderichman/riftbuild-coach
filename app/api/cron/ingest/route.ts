import { NextResponse } from "next/server";
import { acquireJobLock, releaseJobLock } from "@/lib/db";

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

  const lockName = "cron:ingest";
  const acquired = await acquireJobLock(lockName, 30);
  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Job lock active" });
  }

  try {
    const workerUrl = process.env.INGEST_WORKER_URL;
    if (!workerUrl) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "INGEST_WORKER_URL is not configured. Use external worker for heavy Riot ingestion."
      });
    }

    const workerSecret = process.env.INGEST_WORKER_SECRET || "";
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {})
      },
      body: JSON.stringify({ trigger: "vercel-cron" }),
      cache: "no-store"
    });

    const text = await response.text();
    return NextResponse.json({ ok: response.ok, status: response.status, workerResponse: text.slice(0, 500) });
  } finally {
    await releaseJobLock(lockName);
  }
}
