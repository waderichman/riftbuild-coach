import { NextResponse } from "next/server";
import { dbHealthCheck, isDbEnabled } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const dbEnabled = isDbEnabled();
  const dbOk = dbEnabled ? await dbHealthCheck() : false;

  return NextResponse.json({
    ok: true,
    service: "riftbuild-coach-next",
    dbEnabled,
    dbOk
  });
}
