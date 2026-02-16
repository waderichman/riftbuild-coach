import type { EnemyRole } from "@/lib/types";

const orderedRoles: EnemyRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

type EnemyInput = {
  champion: string;
  role: EnemyRole;
};

function normalizeChampion(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.'"]/g, "");
}

function normalizeRole(role: string): EnemyRole {
  const raw = String(role || "").trim().toUpperCase();
  if (raw === "SUPPORT") return "UTILITY";
  if (raw === "TOP" || raw === "JUNGLE" || raw === "MIDDLE" || raw === "BOTTOM" || raw === "UTILITY") {
    return raw;
  }
  return "UTILITY";
}

export function buildCompKey(enemyChampions: string[], enemyRoles: string[]): string {
  const rows: EnemyInput[] = enemyChampions.map((champion, idx) => ({
    champion: normalizeChampion(champion),
    role: normalizeRole(enemyRoles[idx] || "UTILITY")
  }));

  rows.sort((a, b) => {
    const roleDelta = orderedRoles.indexOf(a.role) - orderedRoles.indexOf(b.role);
    if (roleDelta !== 0) return roleDelta;
    return a.champion.localeCompare(b.champion);
  });

  return rows.map((row) => `${row.role}:${row.champion}`).join("|");
}
