import { NextResponse } from "next/server";
import { deriveEnemyFeatures, recommendBuilds, toFeatureBucket } from "@/lib/lol";
import { findStoredRecommendations } from "@/lib/recommendStore";
import { buildCompKey } from "@/lib/compKey";
import { buildWhyLines } from "@/lib/buildExplain";
import type { EnemyRole, RankTierFilter, RecommendRequest, RoleFilter } from "@/lib/types";

const roleSet = new Set<RoleFilter>(["ANY", "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
const enemyRoleSet = new Set<EnemyRole>(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
const rankSet = new Set<RankTierFilter>(["ANY", "CHALLENGER", "GRANDMASTER", "MASTER"]);
const defaultEnemyRoles: EnemyRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function normalizeRole(value: unknown): RoleFilter {
  const raw = String(value || "ANY").trim().toUpperCase();
  const candidate = (raw === "SUPPORT" ? "UTILITY" : raw) as RoleFilter;
  return roleSet.has(candidate) ? candidate : "ANY";
}

function normalizeRank(value: unknown): RankTierFilter {
  const candidate = String(value || "ANY").trim().toUpperCase() as RankTierFilter;
  return rankSet.has(candidate) ? candidate : "ANY";
}

function normalizeEnemyRoles(value: unknown): EnemyRole[] {
  if (!Array.isArray(value)) return defaultEnemyRoles;
  const normalized = value
    .map((r) => String(r || "").trim().toUpperCase())
    .map((r) => (r === "SUPPORT" ? "UTILITY" : r))
    .filter((r) => enemyRoleSet.has(r as EnemyRole)) as EnemyRole[];
  if (normalized.length !== 5) return defaultEnemyRoles;
  return normalized;
}

function displayRole(role: string): string {
  return role === "UTILITY" ? "SUPPORT" : role;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RecommendRequest;
    const playerChampion = String(body.playerChampion || "").trim();
    const enemyChampions = Array.isArray(body.enemyChampions)
      ? body.enemyChampions.map((name) => String(name || "").trim()).filter(Boolean)
      : [];
    const enemyRoles = normalizeEnemyRoles(body.enemyRoles);
    const patch = String(body.patch || process.env.PATCH_VERSION || "latest").trim() || "latest";
    const role = normalizeRole(body.role);
    const rankTier = normalizeRank(body.rankTier);

    if (!playerChampion) {
      return NextResponse.json({ error: "playerChampion is required" }, { status: 400 });
    }

    if (enemyChampions.length !== 5) {
      return NextResponse.json({ error: "Provide exactly 5 enemy champions" }, { status: 400 });
    }

    const enemyFeatures = deriveEnemyFeatures(enemyChampions);
    const featureBucket = toFeatureBucket(enemyFeatures);
    const compKey = buildCompKey(enemyChampions, enemyRoles);
    const stored = await findStoredRecommendations(playerChampion, featureBucket, compKey, patch, role, rankTier);

    if (stored) {
      const filterNotes: string[] = [];
      if (stored.usedRole !== role) {
        filterNotes.push(`Role filter relaxed from ${displayRole(role)} to ${displayRole(stored.usedRole)}`);
      }
      if (stored.usedRankTier !== rankTier) {
        filterNotes.push(`Rank filter relaxed from ${rankTier} to ${stored.usedRankTier}`);
      }

      const sourceNote = stored.isExactComp
        ? "Exact enemy composition match found from ingested Riot match data."
        : "Using statistical recommendations from ingested Riot match data.";

      const matchNote = stored.isExactComp
        ? `Exact composition key matched: ${stored.matchedCompKey}`
        : stored.isNearestBucket
          ? `No exact feature bucket match. Using nearest bucket: ${stored.matchedBucket}`
          : `Feature bucket matched: ${featureBucket}`;

      const recommendations = stored.recommendations.map((rec) => ({
        ...rec,
        why: rec.why && rec.why.length > 0 ? rec.why : buildWhyLines(rec, enemyFeatures)
      }));

      return NextResponse.json({
        playerChampion,
        enemyChampions,
        enemyRoles,
        patch: stored.patch,
        role,
        rankTier,
        recommendations,
        notes: [sourceNote, matchNote, ...filterNotes, `Enemy roles: ${enemyRoles.map(displayRole).join(", ")}`]
      });
    }

    const fallback = recommendBuilds(playerChampion, enemyChampions, patch, role, rankTier, enemyRoles);
    return NextResponse.json({
      ...fallback,
      notes: [...fallback.notes, "No matching statistical dataset found yet; fallback was used.", `Enemy roles: ${enemyRoles.map(displayRole).join(", ")}`]
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
