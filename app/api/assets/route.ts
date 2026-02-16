import { NextResponse } from "next/server";

type RuneTree = {
  id: number;
  name: string;
  icon: string;
  slots: Array<{ runes: Array<{ id: number; name: string; icon: string }> }>;
};

type ItemData = {
  data?: Record<string, { name?: string; image?: { full?: string } }>;
};

export async function GET(): Promise<NextResponse> {
  try {
    const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      next: { revalidate: 86400 }
    });
    const versions = (await versionsRes.json()) as string[];
    const version = versions[0];

    const [itemsRes, runesRes] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`, {
        next: { revalidate: 86400 }
      }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
        next: { revalidate: 86400 }
      })
    ]);

    const itemJson = (await itemsRes.json()) as ItemData;
    const runeJson = (await runesRes.json()) as RuneTree[];

    const itemIcons: Record<string, string> = {};
    for (const item of Object.values(itemJson.data || {})) {
      const name = String(item.name || "").trim();
      const icon = String(item.image?.full || "").trim();
      if (name && icon) {
        itemIcons[name] = `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${icon}`;
      }
    }

    const runeIcons: Record<string, string> = {};
    for (const tree of runeJson || []) {
      if (tree.name && tree.icon) {
        runeIcons[tree.name] = `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`;
      }
      for (const slot of tree.slots || []) {
        for (const rune of slot.runes || []) {
          if (rune.name && rune.icon) {
            runeIcons[rune.name] = `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;
          }
        }
      }
    }

    return NextResponse.json({ version, itemIcons, runeIcons });
  } catch {
    return NextResponse.json({ version: "", itemIcons: {}, runeIcons: {} });
  }
}
