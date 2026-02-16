export type BuildRecommendation = {
  title: string;
  items: string[];
  runes: string[];
  reasoning: string;
  why?: string[];
  confidence: number;
  sampleSize: number;
};

export type EnemyFeatureSnapshot = {
  ap: number;
  ad: number;
  cc: number;
  healing: number;
  tanks: number;
};

export type RoleFilter = "ANY" | "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export type EnemyRole = Exclude<RoleFilter, "ANY">;
export type RankTierFilter = "ANY" | "CHALLENGER" | "GRANDMASTER" | "MASTER";

export type RecommendRequest = {
  playerChampion: string;
  enemyChampions: string[];
  enemyRoles?: EnemyRole[];
  patch?: string;
  role?: RoleFilter;
  rankTier?: RankTierFilter;
};

export type RecommendResponse = {
  playerChampion: string;
  enemyChampions: string[];
  enemyRoles: EnemyRole[];
  patch: string;
  role: RoleFilter;
  rankTier: RankTierFilter;
  recommendations: BuildRecommendation[];
  notes: string[];
};

export type StoredBuildRecommendation = BuildRecommendation & {
  patch: string;
  champion: string;
  featureBucket: string;
  compKey?: string;
  role?: Exclude<RoleFilter, "ANY"> | "UNKNOWN";
  rankTier?: Exclude<RankTierFilter, "ANY">;
};
