import fs from "node:fs/promises";
import path from "node:path";

const queue = process.env.RIOT_SEED_QUEUE || "RANKED_SOLO_5x5";
const limitPerTier = Number(process.env.RIOT_SEED_LIMIT || 50);
const requestDelayMs = Number(process.env.RIOT_SEED_DELAY_MS || 90);
const maxRetries = Number(process.env.RIOT_SEED_MAX_RETRIES || 5);

const platforms = String(process.env.RIOT_SEED_PLATFORMS || process.env.RIOT_PLATFORM || "na1")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

const tiers = String(process.env.RIOT_SEED_TIERS || "CHALLENGER,GRANDMASTER,MASTER,DIAMOND,EMERALD,PLATINUM,GOLD")
  .split(",")
  .map((x) => x.trim().toUpperCase())
  .filter(Boolean);

if (!process.env.RIOT_API_KEY) {
  throw new Error("RIOT_API_KEY is required");
}

function platformToMatchRegion(platform) {
  const normalized = String(platform || "").toLowerCase();
  if (["na1", "br1", "la1", "la2", "oc1"].includes(normalized)) return "americas";
  if (["euw1", "eun1", "tr1", "ru"].includes(normalized)) return "europe";
  if (["kr", "jp1"].includes(normalized)) return "asia";
  if (["ph2", "sg2", "th2", "tw2", "vn2"].includes(normalized)) return "sea";
  return "americas";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function riotFetch(url, attempt = 0) {
  const res = await fetch(url, {
    headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
    cache: "no-store"
  });

  if (res.status === 429 && attempt < maxRetries) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    const waitMs = Math.max(1000, retryAfter * 1000 * Math.pow(1.5, attempt));
    console.log(`429 rate limit. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(waitMs);
    return riotFetch(url, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Riot API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function tierEndpoint(tier) {
  if (tier === "CHALLENGER") return "challengerleagues";
  if (tier === "GRANDMASTER") return "grandmasterleagues";
  if (tier === "MASTER") return "masterleagues";
  return "entries";
}

async function fetchTierEntries(platform, tier) {
  const endpoint = tierEndpoint(tier);

  if (endpoint !== "entries") {
    const league = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/${endpoint}/by-queue/${encodeURIComponent(queue)}`
    );
    const entries = (league.entries || []).slice(0, limitPerTier);
    return entries.map((entry) => ({ ...entry, rankTier: tier }));
  }

  const divisions = ["I", "II", "III", "IV"];
  const rows = [];

  for (const division of divisions) {
    let page = 1;
    while (rows.length < limitPerTier) {
      const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/${encodeURIComponent(queue)}/${tier}/${division}?page=${page}`;
      const pageRows = await riotFetch(url);
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;

      rows.push(...pageRows.map((entry) => ({ ...entry, rankTier: tier })));
      if (rows.length >= limitPerTier) break;

      page += 1;
      if (page > 4) break;
      await sleep(requestDelayMs);
    }

    if (rows.length >= limitPerTier) break;
  }

  return rows.slice(0, limitPerTier);
}

const seedRows = [];

for (const platform of platforms) {
  const matchRegion = platformToMatchRegion(platform);
  console.log(`Platform ${platform.toUpperCase()} (${matchRegion})`);

  for (const tier of tiers) {
    console.log(`  Tier ${tier}`);
    let entries = [];

    try {
      entries = await fetchTierEntries(platform, tier);
    } catch (error) {
      console.log(`  Skipping ${platform}/${tier}: ${String(error)}`);
      continue;
    }

    for (const [idx, entry] of entries.entries()) {
      if (entry.puuid) {
        seedRows.push({ puuid: entry.puuid, rankTier: tier, platform, matchRegion });
      } else if (entry.summonerId) {
        try {
          const summoner = await riotFetch(
            `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`
          );
          if (summoner.puuid) {
            seedRows.push({ puuid: summoner.puuid, rankTier: tier, platform, matchRegion });
          }
        } catch (error) {
          console.log(`    Summoner lookup failed: ${String(error)}`);
        }
      }

      if ((idx + 1) % 20 === 0) {
        console.log(`    Resolved ${idx + 1}/${entries.length}...`);
      }

      await sleep(requestDelayMs);
    }
  }
}

const seen = new Set();
const uniqueRows = [];
for (const row of seedRows) {
  const key = `${row.matchRegion}:${row.puuid}`;
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueRows.push(row);
}

const csv = uniqueRows.map((r) => r.puuid).join(",");
const txtPath = path.resolve(process.cwd(), "data/seed-puuids.txt");
const jsonPath = path.resolve(process.cwd(), "data/seed-puuids.json");

await fs.mkdir(path.dirname(txtPath), { recursive: true });
await fs.writeFile(txtPath, `${csv}\n`, "utf8");
await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), seeds: uniqueRows }, null, 2)}\n`, "utf8");

console.log(`PUUID count: ${uniqueRows.length}`);
console.log(`Saved: ${txtPath}`);
console.log(`Saved: ${jsonPath}`);
console.log("Set this in .env as RIOT_SEED_PUUIDS=<value>");
console.log(csv);
