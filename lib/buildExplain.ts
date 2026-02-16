import type { BuildRecommendation, EnemyFeatureSnapshot } from "@/lib/types";

const mrItems = new Set(["Force of Nature", "Maw of Malmortius", "Mercury's Treads", "Wit's End", "Spirit Visage"]);
const armorItems = new Set(["Randuin's Omen", "Plated Steelcaps", "Frozen Heart", "Thornmail", "Zhonya's Hourglass"]);
const antiHealItems = new Set(["Mortal Reminder", "Morellonomicon", "Chempunk Chainsword", "Thornmail"]);
const penItems = new Set(["Lord Dominik's Regards", "Void Staff", "Serylda's Grudge", "Black Cleaver"]);

export function buildWhyLines(rec: BuildRecommendation, enemy: EnemyFeatureSnapshot): string[] {
  const why: string[] = [];
  const items = rec.items || [];
  const runes = rec.runes || [];

  if (enemy.ap >= 3 && items.some((i) => mrItems.has(i))) {
    why.push("Heavy enemy AP: this setup includes magic resistance to reduce burst damage.");
  }

  if (enemy.ad >= 3 && items.some((i) => armorItems.has(i))) {
    why.push("High enemy AD pressure: armor-focused items improve survivability in skirmishes.");
  }

  if (enemy.healing >= 1 && items.some((i) => antiHealItems.has(i))) {
    why.push("Enemy sustain detected: anti-heal itemization helps cut healing in fights.");
  }

  if (enemy.tanks >= 2 && items.some((i) => penItems.has(i))) {
    why.push("Multiple frontline targets: penetration stats increase damage against tanks.");
  }

  if (enemy.cc >= 3 && (runes.includes("Legend: Tenacity") || items.includes("Mercurial Scimitar") || items.includes("Mercury's Treads"))) {
    why.push("High crowd-control comp: tenacity/cleanse tools reduce lock-down risk.");
  }

  if (runes.length > 0) {
    why.push(`Primary rune direction: ${runes[0]} supports this build's fight pattern.`);
  }

  if (why.length === 0) {
    why.push("Selected as the strongest available option by current matchup and confidence data.");
  }

  return why.slice(0, 4);
}
