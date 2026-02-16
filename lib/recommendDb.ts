import type { RankTierFilter, RoleFilter, StoredBuildRecommendation } from "@/lib/types";
import { dbQuery, isDbEnabled } from "@/lib/db";

type DbRecommendationRow = {
  patch: string;
  champion: string;
  feature_bucket: string;
  comp_key: string;
  role: string;
  rank_tier: string;
  title: string;
  items: string[];
  runes: string[];
  reasoning: string;
  why: string[];
  confidence: number;
  sample_size: number;
};

export async function readRecommendationsFromDb(champion: string, minSample: number, patch: string): Promise<StoredBuildRecommendation[] | null> {
  if (!isDbEnabled()) return null;

  const rows = await dbQuery<DbRecommendationRow>(
    `
    SELECT
      patch,
      champion,
      feature_bucket,
      COALESCE(comp_key, '') AS comp_key,
      COALESCE(role, 'UNKNOWN') AS role,
      COALESCE(rank_tier, 'ANY') AS rank_tier,
      title,
      items,
      runes,
      reasoning,
      COALESCE(why, '[]'::jsonb) AS why,
      confidence,
      sample_size
    FROM recommendation_agg
    WHERE champion = $1
      AND sample_size >= $2
      AND ($3 = 'latest' OR patch = $3)
    LIMIT 5000
    `,
    [champion, minSample, patch]
  );

  return rows.map((r) => ({
    patch: r.patch,
    champion: r.champion,
    featureBucket: r.feature_bucket,
    compKey: r.comp_key || undefined,
    role: (r.role || "UNKNOWN") as Exclude<RoleFilter, "ANY"> | "UNKNOWN",
    rankTier: r.rank_tier === "ANY" ? undefined : (r.rank_tier as Exclude<RankTierFilter, "ANY">),
    title: r.title,
    items: Array.isArray(r.items) ? r.items : [],
    runes: Array.isArray(r.runes) ? r.runes : [],
    reasoning: r.reasoning,
    why: Array.isArray(r.why) ? r.why : [],
    confidence: Number(r.confidence || 0),
    sampleSize: Number(r.sample_size || 0)
  }));
}
