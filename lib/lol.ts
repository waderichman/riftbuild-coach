import championProfilesData from "@/data/championProfiles.json";
import type { BuildRecommendation, EnemyFeatureSnapshot, EnemyRole, RankTierFilter, RecommendResponse, RoleFilter } from "@/lib/types";
import { buildWhyLines } from "@/lib/buildExplain";

type ChampionProfile = {
  roleClass: "marksman" | "mage" | "fighter" | "tank" | "assassin" | "support";
  apThreat: boolean;
  adThreat: boolean;
  heavyCc: boolean;
  heavyHealing: boolean;
  tanky: boolean;
};

const fallbackProfile: ChampionProfile = {
  roleClass: "fighter",
  apThreat: false,
  adThreat: true,
  heavyCc: false,
  heavyHealing: false,
  tanky: false
};

const profiles = ((championProfilesData as { profiles?: Record<string, ChampionProfile> }).profiles || {}) as Record<string, ChampionProfile>;
export const championProfiles: Record<string, ChampionProfile> = profiles;

const classCoreItems: Record<ChampionProfile["roleClass"], string[]> = {
  marksman: ["Berserker's Greaves", "Infinity Edge", "Phantom Dancer"],
  mage: ["Sorcerer's Shoes", "Luden's Companion", "Shadowflame"],
  fighter: ["Plated Steelcaps", "Sundered Sky", "Sterak's Gage"],
  tank: ["Mercury's Treads", "Sunfire Aegis", "Unending Despair"],
  assassin: ["Ionian Boots of Lucidity", "Youmuu's Ghostblade", "Edge of Night"],
  support: ["Ionian Boots of Lucidity", "Shurelya's Battlesong", "Redemption"]
};

const classCoreRunes: Record<ChampionProfile["roleClass"], string[]> = {
  marksman: ["Precision", "Lethal Tempo", "Coup de Grace"],
  mage: ["Sorcery", "Arcane Comet", "Scorch"],
  fighter: ["Precision", "Conqueror", "Last Stand"],
  tank: ["Resolve", "Aftershock", "Overgrowth"],
  assassin: ["Domination", "Electrocute", "Treasure Hunter"],
  support: ["Resolve", "Guardian", "Revitalize"]
};

export const championOptions = Object.keys(championProfiles).sort((a, b) => a.localeCompare(b));

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

export function deriveEnemyFeatures(enemyChampions: string[]): EnemyFeatureSnapshot {
  return enemyChampions
    .map((name) => name.trim())
    .filter(Boolean)
    .reduce(
      (acc, champ) => {
        const p = championProfiles[champ] || fallbackProfile;
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

export function toFeatureBucket(features: EnemyFeatureSnapshot): string {
  return `ap${features.ap}-ad${features.ad}-cc${features.cc}-heal${features.healing}-tank${features.tanks}`;
}

function buildVariant(
  title: string,
  roleClass: ChampionProfile["roleClass"],
  enemyAp: number,
  enemyAd: number,
  enemyCc: number,
  enemyHealing: number,
  enemyTanks: number
): BuildRecommendation {
  const items = [...classCoreItems[roleClass]];
  const runes = [...classCoreRunes[roleClass]];
  const reasons: string[] = [];

  if (enemyAp >= 3) {
    addUnique(items, roleClass === "marksman" ? "Maw of Malmortius" : "Force of Nature");
    reasons.push("Covers heavy AP threat.");
  }

  if (enemyAd >= 3) {
    addUnique(items, roleClass === "mage" ? "Zhonya's Hourglass" : "Randuin's Omen");
    reasons.push("Adds armor against high AD pressure.");
  }

  if (enemyCc >= 3) {
    addUnique(items, "Mercurial Scimitar");
    addUnique(runes, "Legend: Tenacity");
    reasons.push("Improves anti-CC reliability.");
  }

  if (enemyHealing >= 1) {
    addUnique(items, roleClass === "mage" ? "Morellonomicon" : "Mortal Reminder");
    reasons.push("Includes anti-heal for sustain matchups.");
  }

  if (enemyTanks >= 2) {
    addUnique(items, roleClass === "mage" ? "Void Staff" : "Lord Dominik's Regards");
    reasons.push("Adds tank-shred/penetration value.");
  }

  const rec: BuildRecommendation = {
    title,
    items: items.slice(0, 6),
    runes,
    reasoning: reasons.length > 0 ? reasons.join(" ") : "Balanced enemy draft, default high-performance setup.",
    confidence: Math.min(0.9, 0.61 + enemyTanks * 0.04 + enemyCc * 0.03 + enemyHealing * 0.02),
    sampleSize: 850 + enemyAp * 120 + enemyAd * 90 + enemyCc * 70 + enemyTanks * 80
  };

  rec.why = buildWhyLines(rec, { ap: enemyAp, ad: enemyAd, cc: enemyCc, healing: enemyHealing, tanks: enemyTanks });
  return rec;
}

function scoreVariant(rec: BuildRecommendation, enemy: EnemyFeatureSnapshot): number {
  const itemSet = new Set(rec.items);
  let score = rec.confidence * 100 + rec.sampleSize / 120;

  if (enemy.ap >= 3 && (itemSet.has("Force of Nature") || itemSet.has("Maw of Malmortius"))) score += 7;
  if (enemy.ad >= 3 && (itemSet.has("Randuin's Omen") || itemSet.has("Zhonya's Hourglass") || itemSet.has("Plated Steelcaps"))) score += 7;
  if (enemy.healing >= 1 && (itemSet.has("Mortal Reminder") || itemSet.has("Morellonomicon"))) score += 6;
  if (enemy.tanks >= 2 && (itemSet.has("Lord Dominik's Regards") || itemSet.has("Void Staff"))) score += 6;
  if (enemy.cc >= 3 && (itemSet.has("Mercurial Scimitar") || rec.runes.includes("Legend: Tenacity"))) score += 5;

  return score;
}

export function recommendBuilds(
  playerChampion: string,
  enemyChampions: string[],
  patch = process.env.PATCH_VERSION || "latest",
  role: RoleFilter = "ANY",
  rankTier: RankTierFilter = "ANY",
  enemyRoles: EnemyRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
): RecommendResponse {
  const profile = championProfiles[playerChampion] || fallbackProfile;
  const normalizedEnemies = enemyChampions.map((name) => name.trim()).filter(Boolean);
  const enemyStats = deriveEnemyFeatures(normalizedEnemies);

  const candidates: BuildRecommendation[] = [
    buildVariant("Balanced Core", profile.roleClass, enemyStats.ap, enemyStats.ad, enemyStats.cc, enemyStats.healing, enemyStats.tanks),
    buildVariant("Anti-Burst Setup", profile.roleClass, enemyStats.ap + 1, enemyStats.ad + 1, enemyStats.cc + 1, enemyStats.healing, enemyStats.tanks),
    buildVariant("Anti-Frontline Setup", profile.roleClass, enemyStats.ap, enemyStats.ad, enemyStats.cc, enemyStats.healing, enemyStats.tanks + 2),
    buildVariant("Anti-Sustain Setup", profile.roleClass, enemyStats.ap, enemyStats.ad, enemyStats.cc, enemyStats.healing + 2, enemyStats.tanks)
  ];

  const recommendations = [...candidates]
    .sort((a, b) => scoreVariant(b, enemyStats) - scoreVariant(a, enemyStats))
    .slice(0, 3)
    .map((rec, idx) => ({
      ...rec,
      title: idx === 0 ? "Best Available Fallback" : `Fallback Alternative ${idx}`
    }));

  return {
    playerChampion,
    enemyChampions: normalizedEnemies,
    enemyRoles,
    patch,
    role,
    rankTier,
    recommendations,
    notes: [
      "This response used rule-based fallback logic.",
      "No exact statistical composition was available, so this is the strongest available counter build estimate.",
      "Run the Riot ingest script to serve higher-confidence statistical recommendations."
    ]
  };
}
