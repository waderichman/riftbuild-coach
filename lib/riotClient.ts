const RIOT_API_BASE = "https://api.riotgames.com";

export type RiotRegion = "americas" | "asia" | "europe";

type MatchParticipant = {
  puuid: string;
  championName: string;
  teamId: number;
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  perkPrimaryStyle?: number;
  perkSubStyle?: number;
  perks?: {
    styles?: Array<{
      style: number;
      descriptions?: string;
      selections?: Array<{ perk: number; var1: number; var2: number; var3: number }>;
    }>;
  };
};

export type RiotMatch = {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameVersion: string;
    queueId: number;
    participants: MatchParticipant[];
  };
};

function getApiKey(): string {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    throw new Error("RIOT_API_KEY is missing");
  }
  return key;
}

async function riotFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": getApiKey()
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Riot API request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchMatchIdsByPuuid(
  puuid: string,
  region: RiotRegion,
  count = 20,
  queue?: number
): Promise<string[]> {
  const params = new URLSearchParams({
    start: "0",
    count: String(count)
  });
  if (typeof queue === "number" && Number.isFinite(queue) && queue > 0) {
    params.set("queue", String(queue));
  }
  const url = `${RIOT_API_BASE}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
  return riotFetch<string[]>(url.replace("api.riotgames.com", `${region}.api.riotgames.com`));
}

export async function fetchMatch(matchId: string, region: RiotRegion): Promise<RiotMatch> {
  const url = `${RIOT_API_BASE}/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return riotFetch<RiotMatch>(url.replace("api.riotgames.com", `${region}.api.riotgames.com`));
}

export function parsePatch(gameVersion: string): string {
  const parts = gameVersion.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return gameVersion || process.env.PATCH_VERSION || "latest";
}
