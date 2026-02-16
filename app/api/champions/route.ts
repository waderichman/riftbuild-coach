import { NextResponse } from "next/server";
import { championOptions } from "@/lib/lol";

type DDragonChampionData = {
  data?: Record<string, { name?: string }>;
};

async function fetchDDragonChampionNames(): Promise<string[]> {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
    next: { revalidate: 86400 }
  });

  if (!versionsRes.ok) {
    throw new Error(`Failed to fetch Data Dragon versions (${versionsRes.status})`);
  }

  const versions = (await versionsRes.json()) as string[];
  const version = versions[0];

  const champsRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    { next: { revalidate: 86400 } }
  );

  if (!champsRes.ok) {
    throw new Error(`Failed to fetch champion catalog (${champsRes.status})`);
  }

  const payload = (await champsRes.json()) as DDragonChampionData;
  const names = Object.values(payload.data || {})
    .map((entry) => String(entry.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    throw new Error("Champion catalog was empty");
  }

  return names;
}

export async function GET(): Promise<NextResponse> {
  try {
    const champions = await fetchDDragonChampionNames();
    return NextResponse.json({ champions, source: "ddragon" });
  } catch {
    return NextResponse.json({
      champions: championOptions,
      source: "fallback"
    });
  }
}