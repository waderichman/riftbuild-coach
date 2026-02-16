import { readRecommendationsFromDb } from "@/lib/recommendDb";
import type { BuildRecommendation, RankTierFilter, RoleFilter, StoredBuildRecommendation } from "@/lib/types";

function sortByQuality(items: StoredBuildRecommendation[]): StoredBuildRecommendation[] {
  return [...items].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.sampleSize - a.sampleSize;
  });
}

function matchesRole(rec: StoredBuildRecommendation, role: RoleFilter): boolean {
  if (role === "ANY") return true;
  const recRole = (rec.role || "UNKNOWN").toUpperCase();
  return recRole === role;
}

function matchesRank(rec: StoredBuildRecommendation, rankTier: RankTierFilter): boolean {
  if (rankTier === "ANY") return true;
  const recTier = String(rec.rankTier || "").toUpperCase();
  return recTier === rankTier;
}

function matchesPatch(rec: StoredBuildRecommendation, patch: string): boolean {
  return patch === "latest" || rec.patch === patch;
}

function parseBucket(bucket: string): [number, number, number, number, number] {
  const match = bucket.match(/^ap(\d+)-ad(\d+)-cc(\d+)-heal(\d+)-tank(\d+)$/);
  if (!match) return [0, 0, 0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])];
}

function bucketDistance(a: string, b: string): number {
  const av = parseBucket(a);
  const bv = parseBucket(b);
  let sum = 0;
  for (let i = 0; i < av.length; i += 1) {
    sum += Math.abs(av[i] - bv[i]);
  }
  return sum;
}

function bestNearestBucketRows(rows: StoredBuildRecommendation[], targetBucket: string): StoredBuildRecommendation[] {
  if (rows.length === 0) return [];

  const byBucket = new Map<string, StoredBuildRecommendation[]>();
  for (const row of rows) {
    const list = byBucket.get(row.featureBucket) || [];
    list.push(row);
    byBucket.set(row.featureBucket, list);
  }

  const rankedBuckets = [...byBucket.keys()].sort((a, b) => {
    const distA = bucketDistance(a, targetBucket);
    const distB = bucketDistance(b, targetBucket);
    if (distA !== distB) return distA - distB;

    const avgSampleA = (byBucket.get(a) || []).reduce((s, r) => s + r.sampleSize, 0) / (byBucket.get(a) || []).length;
    const avgSampleB = (byBucket.get(b) || []).reduce((s, r) => s + r.sampleSize, 0) / (byBucket.get(b) || []).length;
    return avgSampleB - avgSampleA;
  });

  const bestBucket = rankedBuckets[0];
  return sortByQuality(byBucket.get(bestBucket) || []);
}

export async function findStoredRecommendations(
  champion: string,
  featureBucket: string,
  compKey: string,
  patch: string,
  role: RoleFilter,
  rankTier: RankTierFilter
): Promise<{
  patch: string;
  recommendations: BuildRecommendation[];
  usedRole: RoleFilter;
  usedRankTier: RankTierFilter;
  matchedBucket: string;
  matchedCompKey: string;
  isExactComp: boolean;
  isNearestBucket: boolean;
} | null> {
  const minSample = Number(process.env.RECOMMEND_MIN_SAMPLE_SIZE || 2);
  const rows = await readRecommendationsFromDb(champion, minSample, patch).catch(() => null);

  if (!rows || rows.length === 0) {
    return null;
  }

  const exactCompFiltered = sortByQuality(rows.filter((rec) => rec.compKey === compKey && matchesPatch(rec, patch) && matchesRole(rec, role) && matchesRank(rec, rankTier)));
  const exactCompNoRank = sortByQuality(rows.filter((rec) => rec.compKey === compKey && matchesPatch(rec, patch) && matchesRole(rec, role)));
  const exactCompNoRoleNoRank = sortByQuality(rows.filter((rec) => rec.compKey === compKey && matchesPatch(rec, patch)));

  const exactFiltered = sortByQuality(rows.filter((rec) => rec.featureBucket === featureBucket && matchesPatch(rec, patch) && matchesRole(rec, role) && matchesRank(rec, rankTier)));
  const exactNoRank = sortByQuality(rows.filter((rec) => rec.featureBucket === featureBucket && matchesPatch(rec, patch) && matchesRole(rec, role)));
  const exactNoRoleNoRank = sortByQuality(rows.filter((rec) => rec.featureBucket === featureBucket && matchesPatch(rec, patch)));

  const championFiltered = sortByQuality(rows.filter((rec) => matchesPatch(rec, patch) && matchesRole(rec, role) && matchesRank(rec, rankTier)));
  const championNoRank = sortByQuality(rows.filter((rec) => matchesPatch(rec, patch) && matchesRole(rec, role)));
  const championNoRoleNoRank = sortByQuality(rows.filter((rec) => matchesPatch(rec, patch)));

  const maxBucketDistance = Number(process.env.RECOMMEND_MAX_BUCKET_DISTANCE || 2);
  const nearestFiltered = bestNearestBucketRows(championFiltered, featureBucket).filter((rec) => bucketDistance(rec.featureBucket, featureBucket) <= maxBucketDistance);
  const nearestNoRank = bestNearestBucketRows(championNoRank, featureBucket).filter((rec) => bucketDistance(rec.featureBucket, featureBucket) <= maxBucketDistance);
  const nearestNoRoleNoRank = bestNearestBucketRows(championNoRoleNoRank, featureBucket).filter((rec) => bucketDistance(rec.featureBucket, featureBucket) <= maxBucketDistance);

  const candidates = [
    { list: exactCompFiltered, usedRole: role, usedRankTier: rankTier, isNearestBucket: false, isExactComp: true },
    { list: exactCompNoRank, usedRole: role, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: true },
    { list: exactCompNoRoleNoRank, usedRole: "ANY" as RoleFilter, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: true },
    { list: exactFiltered, usedRole: role, usedRankTier: rankTier, isNearestBucket: false, isExactComp: false },
    { list: exactNoRank, usedRole: role, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: false },
    { list: exactNoRoleNoRank, usedRole: "ANY" as RoleFilter, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: false },
    { list: nearestFiltered, usedRole: role, usedRankTier: rankTier, isNearestBucket: true, isExactComp: false },
    { list: nearestNoRank, usedRole: role, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: true, isExactComp: false },
    { list: nearestNoRoleNoRank, usedRole: "ANY" as RoleFilter, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: true, isExactComp: false },
    { list: championFiltered, usedRole: role, usedRankTier: rankTier, isNearestBucket: false, isExactComp: false },
    { list: championNoRank, usedRole: role, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: false },
    { list: championNoRoleNoRank, usedRole: "ANY" as RoleFilter, usedRankTier: "ANY" as RankTierFilter, isNearestBucket: false, isExactComp: false }
  ];

  const winner = candidates.find((c) => c.list.length > 0);
  if (!winner) return null;

  const selected = winner.list.slice(0, 3);
  const selectedPatch = patch === "latest" ? selected[0].patch || "latest" : patch;

  return {
    patch: selectedPatch,
    usedRole: winner.usedRole,
    usedRankTier: winner.usedRankTier,
    matchedBucket: selected[0].featureBucket,
    matchedCompKey: String(selected[0].compKey || ""),
    isNearestBucket: winner.isNearestBucket,
    isExactComp: winner.isExactComp,
    recommendations: selected.map(({ title, items, runes, reasoning, why, confidence, sampleSize }) => ({
      title,
      items,
      runes,
      reasoning,
      why,
      confidence,
      sampleSize
    }))
  };
}
