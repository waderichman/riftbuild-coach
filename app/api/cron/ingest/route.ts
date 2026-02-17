import { NextResponse } from "next/server";
import { buildWhyLines } from "@/lib/buildExplain";
import { buildCompKey } from "@/lib/compKey";
import { acquireJobLock, dbQuery, getCronState, releaseJobLock, setCronState } from "@/lib/db";
import { championProfiles } from "@/lib/lol";
import { fetchMatch, fetchMatchIdsByPuuid, parsePatch, type RiotRegion } from "@/lib/riotClient";
import type { EnemyFeatureSnapshot } from "@/lib/types";

type SeedTarget = { puuid: string; region: RiotRegion };

const VALID_REGIONS = new Set<RiotRegion>(["americas", "europe", "asia"]);

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

function normalizeRole(raw: string | undefined): "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "UNKNOWN" {
  const val = String(raw || "").toUpperCase();
  if (val === "TOP") return "TOP";
  if (val === "JUNGLE") return "JUNGLE";
  if (val === "MIDDLE" || val === "MID") return "MIDDLE";
  if (val === "BOTTOM" || val === "BOT") return "BOTTOM";
  if (val === "UTILITY" || val === "SUPPORT") return "UTILITY";
  return "UNKNOWN";
}

function deriveFeatures(enemyChampions: string[]): EnemyFeatureSnapshot {
  return enemyChampions.reduce(
    (acc, champ) => {
      const p = championProfiles[champ] || { apThreat: false, adThreat: true, heavyCc: false, heavyHealing: false, tanky: false };
      if (p.apThreat) acc.ap += 1;
      if (p.adThreat) acc.ad += 1;
      if (p.heavyCc) acc.cc += 1;
      if (p.heavyHealing) acc.healing += 1;
      if (p.tanky) acc.tanks += 1;
      return acc;
    },
    { ap: 0, ad: 0, cc: 0, healing: 0, tanks: 0 }
  );
}

function toFeatureBucket(f: EnemyFeatureSnapshot): string {
  return `ap${f.ap}-ad${f.ad}-cc${f.cc}-heal${f.healing}-tank${f.tanks}`;
}

function parseSeedTarget(raw: string, defaultRegion: RiotRegion): SeedTarget | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  const regionPrefixMatch = value.match(/^(americas|europe|asia)[:|](.+)$/i);
  if (regionPrefixMatch) {
    const region = regionPrefixMatch[1].toLowerCase() as RiotRegion;
    const puuid = regionPrefixMatch[2].trim();
    if (!puuid) return null;
    return { puuid, region };
  }

  return { puuid: value, region: defaultRegion };
}

async function loadDDragonMaps() {
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" }).then((r) => r.json() as Promise<string[]>);
  const version = versions[0];
  const [itemData, runeData] = await Promise.all([
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`, { cache: "no-store" }).then((r) => r.json() as Promise<{ data: Record<string, { name: string }> }>),
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, { cache: "no-store" }).then((r) => r.json() as Promise<Array<{ id: number; name: string; slots: Array<{ runes: Array<{ id: number; name: string }> }> }>>)
  ]);

  const itemsById: Record<string, string> = {};
  for (const [id, item] of Object.entries(itemData.data || {})) itemsById[id] = item.name;

  const runesById: Record<string, string> = {};
  for (const tree of runeData || []) {
    runesById[String(tree.id)] = tree.name;
    for (const slot of tree.slots || []) {
      for (const rune of slot.runes || []) runesById[String(rune.id)] = rune.name;
    }
  }

  return { itemsById, runesById };
}

function canonicalBuild(participant: Record<string, unknown>, itemsById: Record<string, string>, runesById: Record<string, string>) {
  const itemIds = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5]
    .map((x) => Number(x || 0))
    .filter((x) => x > 0);

  const items = itemIds.map((id) => itemsById[String(id)] || `Item#${id}`);
  const uniqueItems = [...new Set(items)].slice(0, 6);

  const perks = (participant.perks as { styles?: Array<{ style?: number; selections?: Array<{ perk?: number }> }> }) || {};
  const styles = perks.styles || [];
  const primary = styles[0]?.style ? runesById[String(styles[0].style)] : undefined;
  const keystone = styles[0]?.selections?.[0]?.perk ? runesById[String(styles[0].selections[0].perk)] : undefined;
  const secondary = styles[1]?.style ? runesById[String(styles[1].style)] : undefined;
  const runes = [primary, keystone, secondary].filter(Boolean) as string[];

  return {
    items: uniqueItems,
    runes: runes.length > 0 ? runes : ["Unknown Rune Page"]
  };
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
    const defaultRegion = (process.env.RIOT_REGION || "americas").toLowerCase() as RiotRegion;
    const region = VALID_REGIONS.has(defaultRegion) ? defaultRegion : "americas";
    const queueRaw = Number(process.env.RIOT_QUEUE || 420);
    const queue = Number.isFinite(queueRaw) && queueRaw > 0 ? queueRaw : undefined;
    const allowQueueFallback = String(process.env.RIOT_CRON_ALLOW_QUEUE_FALLBACK || "true").toLowerCase() !== "false";
    const seedsPerRun = Number(process.env.RIOT_CRON_SEEDS_PER_RUN || 16);
    const matchesPerSeed = Number(process.env.RIOT_CRON_MATCHES_PER_SEED || 12);
    const minGames = Number(process.env.RIOT_MIN_GAMES || 2);

    const seeds = String(process.env.RIOT_SEED_PUUIDS || "")
      .split(",")
      .map((s) => parseSeedTarget(s, region))
      .filter((s): s is SeedTarget => Boolean(s));

    if (seeds.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "RIOT_SEED_PUUIDS is empty" });
    }

    const cursorRaw = await getCronState("riot_seed_cursor", "0");
    const cursor = Number(cursorRaw) || 0;

    const selectedSeeds: SeedTarget[] = [];
    for (let i = 0; i < Math.min(seedsPerRun, seeds.length); i += 1) {
      selectedSeeds.push(seeds[(cursor + i) % seeds.length]);
    }
    await setCronState("riot_seed_cursor", String((cursor + selectedSeeds.length) % seeds.length));

    const { itemsById, runesById } = await loadDDragonMaps();

    const agg = new Map<string, {
      patch: string;
      champion: string;
      featureBucket: string;
      compKey: string;
      role: string;
      items: string[];
      runes: string[];
      wins: number;
      games: number;
      why: string[];
      reasoning: string;
    }>();

    let processedMatches = 0;
    let seedsWithoutMatches = 0;
    let queueFallbackHits = 0;

    for (const seed of selectedSeeds) {
      let matchIds = await fetchMatchIdsByPuuid(seed.puuid, seed.region, matchesPerSeed, queue).catch(() => [] as string[]);

      if (matchIds.length === 0 && allowQueueFallback && typeof queue === "number") {
        const fallbackIds = await fetchMatchIdsByPuuid(seed.puuid, seed.region, matchesPerSeed).catch(() => [] as string[]);
        if (fallbackIds.length > 0) {
          queueFallbackHits += 1;
          matchIds = fallbackIds;
        }
      }

      const uniqueMatchIds = [...new Set(matchIds)];
      if (uniqueMatchIds.length === 0) {
        seedsWithoutMatches += 1;
        continue;
      }

      for (const matchId of uniqueMatchIds) {
        const match = await fetchMatch(matchId, seed.region).catch(() => null);
        if (!match) continue;
        processedMatches += 1;

        const patch = parsePatch(match.info?.gameVersion || "latest");
        const participants = match.info?.participants || [];

        for (const p of participants) {
          const enemy = participants.filter((other) => other.teamId !== p.teamId);
          const enemyChamps = enemy.map((x) => String(x.championName || "")).filter(Boolean);
          const enemyRoles = enemy.map((x) => normalizeRole(String((x as Record<string, unknown>).teamPosition || (x as Record<string, unknown>).individualPosition || "")));

          const features = deriveFeatures(enemyChamps);
          const featureBucket = toFeatureBucket(features);
          const compKey = buildCompKey(enemyChamps, enemyRoles);
          const role = normalizeRole(String((p as Record<string, unknown>).teamPosition || (p as Record<string, unknown>).individualPosition || ""));
          const build = canonicalBuild(p as unknown as Record<string, unknown>, itemsById, runesById);

          const key = [patch, p.championName, featureBucket, compKey, role, build.items.join(","), build.runes.join(",")].join("|");
          const prior = agg.get(key) || {
            patch,
            champion: String(p.championName || ""),
            featureBucket,
            compKey,
            role,
            items: build.items,
            runes: build.runes,
            wins: 0,
            games: 0,
            why: [] as string[],
            reasoning: ""
          };

          prior.games += 1;
          prior.wins += p.win ? 1 : 0;
          prior.why = buildWhyLines(
            {
              title: "",
              items: build.items,
              runes: build.runes,
              reasoning: "",
              confidence: 0,
              sampleSize: prior.games
            },
            features
          );
          prior.reasoning = `Derived from rolling cron ingestion (${prior.games} games, win rate ${((prior.wins / prior.games) * 100).toFixed(1)}%).`;
          agg.set(key, prior);
        }
      }
    }

    const grouped = new Map<string, Array<(typeof agg extends Map<string, infer V> ? V : never)>>();
    for (const row of agg.values()) {
      const key = `${row.patch}|${row.champion}|${row.featureBucket}|${row.compKey}|${row.role}`;
      const list = grouped.get(key) || [];
      list.push(row);
      grouped.set(key, list);
    }

    let upserted = 0;
    for (const rows of grouped.values()) {
      const ranked = rows
        .filter((r) => r.games >= minGames)
        .sort((a, b) => {
          const scoreA = a.wins / a.games + Math.log10(a.games + 1) * 0.04;
          const scoreB = b.wins / b.games + Math.log10(b.games + 1) * 0.04;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return b.games - a.games;
        })
        .slice(0, 3);

      for (let idx = 0; idx < ranked.length; idx += 1) {
        const r = ranked[idx];
        const wr = r.wins / r.games;
        const confidence = Math.min(0.96, 0.44 + Math.min(0.4, r.games / 500) + Math.max(0, (wr - 0.5) * 0.22));

        await dbQuery(
          `
          INSERT INTO recommendation_agg (
            patch, champion, feature_bucket, comp_key, role, rank_tier,
            title, items, runes, reasoning, why, confidence, sample_size, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12,$13,NOW()
          )
          ON CONFLICT (patch, champion, feature_bucket, comp_key, role, rank_tier, title)
          DO UPDATE SET
            items = EXCLUDED.items,
            runes = EXCLUDED.runes,
            reasoning = EXCLUDED.reasoning,
            why = EXCLUDED.why,
            confidence = GREATEST(recommendation_agg.confidence, EXCLUDED.confidence),
            sample_size = recommendation_agg.sample_size + EXCLUDED.sample_size,
            updated_at = NOW()
          `,
          [
            r.patch,
            r.champion,
            r.featureBucket,
            r.compKey,
            r.role,
            "ANY",
            `Cron Build ${idx + 1}`,
            JSON.stringify(r.items),
            JSON.stringify(r.runes),
            r.reasoning,
            JSON.stringify(r.why || []),
            Number(confidence.toFixed(3)),
            r.games
          ]
        );
        upserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "vercel-batched",
      processedSeeds: selectedSeeds.length,
      processedMatches,
      upserted,
      seedsWithoutMatches,
      queueFallbackHits,
      nextCursor: (cursor + selectedSeeds.length) % seeds.length,
      queue: queue ?? null,
      fallbackEnabled: allowQueueFallback
    });
  } finally {
    await releaseJobLock(lockName);
  }
}
