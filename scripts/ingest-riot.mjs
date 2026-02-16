import fs from "node:fs/promises";
import path from "node:path";

const fallbackRegion = process.env.RIOT_REGION || "americas";
const queue = Number(process.env.RIOT_QUEUE || 420);
const matchCount = Number(process.env.RIOT_MATCH_COUNT || 20);
const patchOverride = process.env.PATCH_VERSION || "latest";
const maxSeeds = Number(process.env.RIOT_MAX_SEEDS || 0);
const requestDelayMs = Number(process.env.RIOT_REQUEST_DELAY_MS || 140);
const maxRetries = Number(process.env.RIOT_MAX_RETRIES || 6);
const minGames = Number(process.env.RIOT_MIN_GAMES || 3);
const defaultRankTier = (process.env.RIOT_DEFAULT_RANK_TIER || "CHALLENGER").toUpperCase();

const puuids = String(process.env.RIOT_SEED_PUUIDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

if (!process.env.RIOT_API_KEY) {
  throw new Error("RIOT_API_KEY is required");
}

if (puuids.length === 0) {
  throw new Error("RIOT_SEED_PUUIDS is required (comma-separated puuid list)");
}

function platformToMatchRegion(platform) {
  const normalized = String(platform || "").toLowerCase();
  if (["na1", "br1", "la1", "la2", "oc1"].includes(normalized)) return "americas";
  if (["euw1", "eun1", "tr1", "ru"].includes(normalized)) return "europe";
  if (["kr", "jp1"].includes(normalized)) return "asia";
  if (["ph2", "sg2", "th2", "tw2", "vn2"].includes(normalized)) return "sea";
  return fallbackRegion;
}

async function readSeedRows() {
  const jsonPath = path.resolve(process.cwd(), "data/seed-puuids.json");
  try {
    const raw = await fs.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed.seeds) ? parsed.seeds : [];
    const normalized = rows
      .filter((r) => r && r.puuid)
      .map((r) => {
        const platform = String(r.platform || process.env.RIOT_PLATFORM || "na1").toLowerCase();
        return {
          puuid: String(r.puuid),
          rankTier: String(r.rankTier || defaultRankTier).toUpperCase(),
          platform,
          matchRegion: String(r.matchRegion || platformToMatchRegion(platform)).toLowerCase()
        };
      });

    if (normalized.length > 0) {
      return normalized;
    }
  } catch {
    // ignore and fallback below
  }

  const platform = String(process.env.RIOT_PLATFORM || "na1").toLowerCase();
  const matchRegion = platformToMatchRegion(platform);
  return puuids.map((puuid) => ({ puuid, rankTier: defaultRankTier, platform, matchRegion }));
}

async function readChampionProfiles() {
  const profilePath = path.resolve(process.cwd(), "data/championProfiles.json");
  const raw = await fs.readFile(profilePath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed?.profiles || {};
}

function pickBalancedSeeds(rows, cap) {
  if (cap <= 0 || rows.length <= cap) return rows;

  const tiers = ["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD", "PLATINUM", "GOLD", "SILVER", "BRONZE", "IRON"];
  const buckets = new Map(tiers.map((tier) => [tier, []]));

  for (const row of rows) {
    const tier = tiers.includes(row.rankTier) ? row.rankTier : "GOLD";
    buckets.get(tier).push(row);
  }

  const picked = [];
  let idx = 0;
  while (picked.length < cap) {
    let progressed = false;
    for (const tier of tiers) {
      const bucket = buckets.get(tier);
      if (idx < bucket.length && picked.length < cap) {
        picked.push(bucket[idx]);
        progressed = true;
      }
    }
    if (!progressed) break;
    idx += 1;
  }

  return picked;
}

function normalizeRole(participant) {
  const raw = String(participant?.teamPosition || participant?.individualPosition || participant?.lane || "").toUpperCase();
  if (raw === "TOP") return "TOP";
  if (raw === "JUNGLE") return "JUNGLE";
  if (raw === "MIDDLE" || raw === "MID") return "MIDDLE";
  if (raw === "BOTTOM" || raw === "BOT") return "BOTTOM";
  if (raw === "UTILITY" || raw === "SUPPORT") return "UTILITY";
  return "UTILITY";
}

function normalizeChampion(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.'"]/g, "");
}

function buildCompKey(enemyParticipants) {
  const orderedRoles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const rows = enemyParticipants.map((p) => ({
    champion: normalizeChampion(p.championName),
    role: normalizeRole(p)
  }));

  rows.sort((a, b) => {
    const roleDelta = orderedRoles.indexOf(a.role) - orderedRoles.indexOf(b.role);
    if (roleDelta !== 0) return roleDelta;
    return a.champion.localeCompare(b.champion);
  });

  return rows.map((row) => `${row.role}:${row.champion}`).join("|");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBucket(features) {
  return `ap${features.ap}-ad${features.ad}-cc${features.cc}-heal${features.heal}-tank${features.tank}`;
}

function parsePatch(gameVersion) {
  const parts = String(gameVersion || "").split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return patchOverride;
}

async function riotFetch(url, attempt = 0) {
  if (requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  const res = await fetch(url, {
    headers: { "X-Riot-Token": process.env.RIOT_API_KEY },
    cache: "no-store"
  });

  if (res.status === 429 && attempt < maxRetries) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    const waitMs = Math.max(1000, retryAfter * 1000 * Math.pow(1.6, attempt));
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

async function loadDDragonMaps() {
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json());
  const version = patchOverride !== "latest" ? patchOverride : versions[0];

  const itemData = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`).then((r) => r.json());
  const runeData = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`).then((r) => r.json());

  const items = {};
  for (const [id, obj] of Object.entries(itemData.data || {})) {
    items[id] = obj.name;
  }

  const runes = {};
  for (const tree of runeData || []) {
    runes[String(tree.id)] = tree.name;
    for (const slot of tree.slots || []) {
      for (const rune of slot.runes || []) {
        runes[String(rune.id)] = rune.name;
      }
    }
  }

  return { version, items, runes };
}

function canonicalBuild(participant, itemsById, runesById) {
  const rawItems = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5]
    .filter((x) => Number(x) > 0)
    .map((id) => itemsById[String(id)] || `Item#${id}`);

  const itemCounts = new Map();
  for (const item of rawItems) itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
  const itemList = [...itemCounts.keys()].sort((a, b) => (itemCounts.get(b) - itemCounts.get(a)) || a.localeCompare(b)).slice(0, 6);

  const styles = participant.perks?.styles || [];
  const primaryStyle = styles[0]?.style ? runesById[String(styles[0].style)] : undefined;
  const keystoneId = styles[0]?.selections?.[0]?.perk;
  const keystone = keystoneId ? runesById[String(keystoneId)] : undefined;
  const subStyle = styles[1]?.style ? runesById[String(styles[1].style)] : undefined;

  const runeList = [primaryStyle, keystone, subStyle].filter(Boolean);

  return {
    items: itemList,
    runes: runeList.length > 0 ? runeList : ["Unknown Rune Page"]
  };
}

const allSeedRows = await readSeedRows();
const selectedSeeds = pickBalancedSeeds(allSeedRows, maxSeeds);
const championProfiles = await readChampionProfiles();
const fallbackProfile = { apThreat: false, adThreat: true, heavyCc: false, heavyHealing: false, tanky: false };

const aggregate = new Map();
let processedMatches = 0;
let skippedMatches = 0;

const { version, items, runes } = await loadDDragonMaps();
console.log(`Seeds: ${selectedSeeds.length}, matchCountPerSeed: ${matchCount}, minGames: ${minGames}`);

for (const [seedIdx, seed] of selectedSeeds.entries()) {
  console.log(`Seed ${seedIdx + 1}/${selectedSeeds.length} (${seed.platform}, ${seed.rankTier})`);

  let ids = [];
  try {
    ids = await riotFetch(
      `https://${seed.matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(seed.puuid)}/ids?start=0&count=${matchCount}&queue=${queue}`
    );
  } catch (error) {
    console.log(`Skipping seed due to fetch error: ${String(error)}`);
    continue;
  }

  for (const matchId of ids) {
    let match;
    try {
      match = await riotFetch(`https://${seed.matchRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    } catch (error) {
      skippedMatches += 1;
      console.log(`Skipping match ${matchId}: ${String(error)}`);
      continue;
    }

    processedMatches += 1;
    const patch = parsePatch(match.info?.gameVersion || version);
    const participants = match.info?.participants || [];

    for (const p of participants) {
      const enemy = participants.filter((other) => other.teamId !== p.teamId);
      const features = enemy.reduce(
        (acc, cur) => {
          const profile = championProfiles[cur.championName] || fallbackProfile;
          if (profile.apThreat) acc.ap += 1;
          if (profile.adThreat) acc.ad += 1;
          if (profile.heavyCc) acc.cc += 1;
          if (profile.heavyHealing) acc.heal += 1;
          if (profile.tanky) acc.tank += 1;
          return acc;
        },
        { ap: 0, ad: 0, cc: 0, heal: 0, tank: 0 }
      );

      const bucket = toBucket(features);
      const compKey = buildCompKey(enemy);
      const build = canonicalBuild(p, items, runes);
      const role = normalizeRole(p);
      const rankTier = seed.rankTier || defaultRankTier;
      const buildKey = `${patch}|${rankTier}|${role}|${p.championName}|${bucket}|${compKey}|${build.items.join(",")}|${build.runes.join(",")}`;

      const prior = aggregate.get(buildKey) || {
        patch,
        rankTier,
        role,
        champion: p.championName,
        featureBucket: bucket,
        compKey,
        items: build.items,
        runes: build.runes,
        games: 0,
        wins: 0
      };

      prior.games += 1;
      prior.wins += p.win ? 1 : 0;
      aggregate.set(buildKey, prior);
    }
  }
}

const grouped = new Map();
for (const row of aggregate.values()) {
  const key = `${row.patch}|${row.rankTier}|${row.role}|${row.champion}|${row.featureBucket}|${row.compKey}`;
  const list = grouped.get(key) || [];
  list.push(row);
  grouped.set(key, list);
}

const recommendations = [];
for (const rows of grouped.values()) {
  const ranked = rows
    .filter((r) => r.games >= minGames)
    .sort((a, b) => {
      const wrA = a.wins / a.games;
      const wrB = b.wins / b.games;
      const scoreA = wrA + Math.log10(a.games + 1) * 0.04;
      const scoreB = wrB + Math.log10(b.games + 1) * 0.04;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.games - a.games;
    })
    .slice(0, 3);

  ranked.forEach((r, idx) => {
    const winRate = r.wins / r.games;
    const confidence = Math.min(0.96, 0.44 + Math.min(0.4, r.games / 500) + Math.max(0, (winRate - 0.5) * 0.22));

    recommendations.push({
      patch: r.patch,
      champion: r.champion,
      featureBucket: r.featureBucket,
      compKey: r.compKey,
      role: r.role,
      rankTier: r.rankTier,
      title: `Data Build ${idx + 1}`,
      items: r.items,
      runes: r.runes,
      reasoning: `Derived from ${r.games} historical ${r.rankTier} matches in patch ${r.patch} (${r.role}, win rate ${(winRate * 100).toFixed(1)}%).`,
      confidence: Number(confidence.toFixed(3)),
      sampleSize: r.games
    });
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  patch: patchOverride === "latest" ? version : patchOverride,
  recommendations
};

const outPath = path.resolve(process.cwd(), "data/buildRecommendations.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`Processed matches: ${processedMatches}`);
console.log(`Skipped matches: ${skippedMatches}`);
console.log(`Generated recommendations: ${recommendations.length}`);
console.log(`Wrote: ${outPath}`);
